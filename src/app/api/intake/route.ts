import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import { listIntakeDocuments } from "@/lib/salesforce/files";
import { SF_CONFIG } from "@/config";

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
