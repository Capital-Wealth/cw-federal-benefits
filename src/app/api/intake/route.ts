import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import { listIntakeDocuments } from "@/lib/salesforce/files";
import { SF_CONFIG } from "@/config";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/intake?token=xxx — Get session status
 *
 * Returns the intake record status, uploaded documents,
 * and the next scheduled meeting (from SF Meeting__c or Event).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return Response.json({ error: "token is required" }, { status: 400 });
  }

  const conn = await getSFConnection();

  // Find the intake record by upload token
  const result = await conn.query(
    `SELECT Id, Name, Status__c, Intake_Date__c, Contact__c
     FROM ${SF_CONFIG.objectName}
     WHERE Supabase_Folder_ID__c = '${token}'
     LIMIT 1`
  );

  if (result.records.length === 0) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const record = result.records[0] as Record<string, unknown>;

  // Check expiration — 7 days from intake date
  const intakeDate = record.Intake_Date__c as string;
  if (intakeDate) {
    const expires = new Date(intakeDate);
    expires.setDate(expires.getDate() + 7);
    if (expires < new Date()) {
      return Response.json({ error: "Session expired" }, { status: 410 });
    }
  }

  // Get uploaded documents from SF Files
  const documents = await listIntakeDocuments(record.Id as string);

  // Look up the next meeting — try Meeting__c (CW custom object) first
  let nextMeeting: { date: string; type: string } | null = null;
  const contactId = record.Contact__c as string;

  if (contactId) {
    try {
      // CW uses Meeting__c custom object
      const meetingResult = await conn.query(
        `SELECT Id, Name, Meeting_Date__c, Meeting_Type__c
         FROM Meeting__c
         WHERE Contact__c = '${contactId}'
         AND Meeting_Date__c >= TODAY
         ORDER BY Meeting_Date__c ASC
         LIMIT 1`
      );
      if (meetingResult.records.length > 0) {
        const m = meetingResult.records[0] as Record<string, unknown>;
        nextMeeting = {
          date: m.Meeting_Date__c as string,
          type: (m.Meeting_Type__c as string) || "Appointment",
        };
      }
    } catch {
      // Meeting__c might not have these exact fields — try Events
      try {
        const eventResult = await conn.query(
          `SELECT Id, Subject, StartDateTime
           FROM Event
           WHERE WhoId = '${contactId}'
           AND StartDateTime >= TODAY
           ORDER BY StartDateTime ASC
           LIMIT 1`
        );
        if (eventResult.records.length > 0) {
          const e = eventResult.records[0] as Record<string, unknown>;
          nextMeeting = {
            date: e.StartDateTime as string,
            type: (e.Subject as string) || "Appointment",
          };
        }
      } catch {
        // No meetings found — that's OK
      }
    }
  }

  return Response.json({
    session: {
      id: record.Id,
      client_name: record.Name,
      status: record.Status__c,
    },
    documents: documents.map((d) => ({
      id: d.contentVersionId,
      file_name: d.fileName,
      document_type: d.documentType,
    })),
    nextMeeting,
  });
}

/**
 * POST /api/intake — Save federal questionnaire step
 *
 * The client-facing portal (src/app/portal/[token]/page.tsx) reuses its
 * questionnaire component for both federal and general flows. The general
 * flow has a dedicated Apex REST endpoint (/api/rmm/questionnaire) that
 * maps fields into Retirement_Intake__c. Federal has no equivalent Apex
 * mapping because Federal_Benefits_Intake__c stores federal-specific data
 * (TSP, FERS, LES) extracted from uploaded documents — not demographic
 * questionnaire answers.
 *
 * Fix: stash the questionnaire JSON on Fields_Needing_Review__c so advisors
 * see the client's answers when reviewing the intake, then advance the
 * portal to the document upload step.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, action, ...answers } = body;

  if (!token) return Response.json({ error: "token is required" }, { status: 400 });
  if (!UUID_REGEX.test(token)) return Response.json({ error: "Invalid token format" }, { status: 400 });

  try {
    const conn = await getSFConnection();

    const findResult = await conn.query(
      `SELECT Id, Status__c FROM ${SF_CONFIG.objectName} WHERE Supabase_Folder_ID__c = '${token}' LIMIT 1`
    );
    if (findResult.records.length === 0) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const record = findResult.records[0] as { Id: string; Status__c: string };

    // action='complete' — user finished the upload step and hit Submit.
    // Flip status to Docs Uploaded so advisor knows to review, then notify Household Account Owner.
    if (action === "complete") {
      // Only advance if status is earlier in the flow; never regress past AI Parsed.
      const advanceable = ["Draft", "Link Sent"];
      if (advanceable.includes(record.Status__c)) {
        await conn.sobject(SF_CONFIG.objectName).update({
          Id: record.Id,
          Status__c: "Docs Uploaded",
        });
      }
      await notifyOwnerOnSubmit(conn, record.Id);
      return Response.json({ success: true });
    }

    // Default — stash questionnaire answers for advisor review.
    const summary = formatQuestionnaireNotes(answers);
    await conn.sobject(SF_CONFIG.objectName).update({
      Id: record.Id,
      Fields_Needing_Review__c: summary.substring(0, 32000),
    });

    return Response.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Federal intake save error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

/**
 * Notify the Household Account Owner that a federal Vault was submitted.
 * Creates a Task assigned to Account.OwnerId; SF auto-emails on assignment
 * if the Owner has task-assigned notifications enabled. Non-fatal on error —
 * client flow must never be blocked by a notification failure.
 */
async function notifyOwnerOnSubmit(
  conn: Awaited<ReturnType<typeof getSFConnection>>,
  intakeId: string
): Promise<void> {
  try {
    const q = await conn.query(
      `SELECT Id, Name, Contact__c, Contact__r.Name, Contact__r.AccountId,
              Contact__r.Account.OwnerId, Contact__r.Account.Name
       FROM ${SF_CONFIG.objectName} WHERE Id = '${intakeId}' LIMIT 1`
    );
    if (q.records.length === 0) return;

    const r = q.records[0] as {
      Id: string;
      Name: string;
      Contact__c: string | null;
      Contact__r?: {
        Name: string;
        AccountId: string;
        Account?: { OwnerId: string; Name: string };
      };
    };

    const ownerId = r.Contact__r?.Account?.OwnerId;
    const contactId = r.Contact__c;
    const accountId = r.Contact__r?.AccountId;
    const clientName = r.Contact__r?.Name || r.Contact__r?.Account?.Name || "client";

    if (!ownerId || !contactId) return;

    const docCountResult = await conn.query(
      `SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId = '${intakeId}'`
    );
    const docCount = docCountResult.totalSize ?? 0;

    await conn.sobject("Task").create({
      Subject: `Capital Wealth Vault submitted — ${clientName}`,
      OwnerId: ownerId,
      WhoId: contactId,
      WhatId: accountId,
      Status: "Not Started",
      Priority: "High",
      ActivityDate: new Date().toISOString().slice(0, 10),
      Description:
        `Client has submitted their Capital Wealth Vault (Federal).\n\n` +
        `Intake: ${r.Name}\n` +
        `Documents uploaded: ${docCount}\n\n` +
        `Review the intake: /lightning/r/${SF_CONFIG.objectName}/${intakeId}/view`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("notifyOwnerOnSubmit failed:", msg);
  }
}

function formatQuestionnaireNotes(answers: Record<string, unknown>): string {
  const lines: string[] = ["=== Client Questionnaire ==="];
  const labelMap: Record<string, string> = {
    preferredName: "Preferred name",
    age: "Age",
    maritalStatus: "Marital status",
    spouseName: "Spouse name",
    spousePreferredName: "Spouse preferred name",
    employmentStatus: "Employment status",
    employerName: "Employer",
    hasAdvisor: "Has current advisor",
    advisorRepresentsEmployer: "Advisor represents employer",
    advisorRelationship: "Advisor relationship",
    totalInvestableAssets: "Total investable assets",
  };
  for (const [key, label] of Object.entries(labelMap)) {
    const val = answers[key];
    if (val !== undefined && val !== null && val !== "") {
      lines.push(`${label}: ${String(val)}`);
    }
  }
  const concerns = answers.concerns;
  if (Array.isArray(concerns) && concerns.length > 0) {
    lines.push(`Concerns: ${concerns.join(", ")}`);
  }
  lines.push("");
  lines.push(`Saved: ${new Date().toISOString()}`);
  return lines.join("\n");
}
