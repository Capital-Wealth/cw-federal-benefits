import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import { getAppUrl, SF_CONFIG } from "@/config";
import { v4 as uuidv4 } from "uuid";

const ID_RE = /^[a-zA-Z0-9]{15,18}$/;

/** FBI statuses that mean an invite is still open (not yet acted on). */
const OPEN_STATUSES = ["Draft", "Link Sent"];

/**
 * POST /api/vault/invite
 * Body: { token }  — token is the Meeting_1_Intake__c record Id.
 *
 * "Invite to Federal Vault" button at the bottom of the Meeting 1 intake form.
 * The prospect is already resolved on the intake (Lead__c or Account__c), so
 * this:
 *   1. Resolves the person + email from the linked Lead/Contact.
 *   2. Reuses an open Federal_Benefits_Intake__c for that person, or creates one
 *      with a fresh secure-upload token.
 *   3. Emails the prospect the /portal/<token> link from vip@capitalwealth.com
 *      (if we have an address), and always returns the link for manual sharing.
 *
 * Everything is written into Salesforce — the FBI record IS the sync.
 */
export async function POST(request: NextRequest) {
  const { token } = await request.json().catch(() => ({}));
  if (!token || !ID_RE.test(token)) {
    return Response.json({ error: "valid intake token required" }, { status: 400 });
  }

  try {
    const conn = await getSFConnection();

    // --- 1. resolve the person from the Meeting 1 intake's links ---
    const intakeRes = await conn.query<{
      Id: string;
      Lead__c: string | null;
      Account__c: string | null;
      Prospect_1_Name__c: string | null;
    }>(
      `SELECT Id, Lead__c, Account__c, Prospect_1_Name__c
       FROM Meeting_1_Intake__c WHERE Id = '${token}' LIMIT 1`
    );
    if (!intakeRes.records.length) {
      return Response.json({ error: "Intake not found" }, { status: 404 });
    }
    const intake = intakeRes.records[0];

    let leadId: string | null = null;
    let contactId: string | null = null;
    let email: string | null = null;
    let name = intake.Prospect_1_Name__c || "there";

    if (intake.Lead__c) {
      leadId = intake.Lead__c;
      const lead = await conn.query<{ FirstName?: string; LastName?: string; Email?: string }>(
        `SELECT FirstName, LastName, Email FROM Lead WHERE Id = '${leadId}' LIMIT 1`
      );
      if (lead.records.length) {
        const l = lead.records[0];
        email = l.Email || null;
        name = [l.FirstName, l.LastName].filter(Boolean).join(" ") || name;
      }
    } else if (intake.Account__c) {
      // No Lead — pull the primary (oldest) Contact on the household Account.
      const contact = await conn.query<{
        Id: string;
        Name?: string;
        Email?: string;
      }>(
        `SELECT Id, Name, Email FROM Contact
         WHERE AccountId = '${intake.Account__c}'
         ORDER BY CreatedDate ASC LIMIT 1`
      );
      if (contact.records.length) {
        const c = contact.records[0];
        contactId = c.Id;
        email = c.Email || null;
        name = c.Name || name;
      }
    }

    if (!leadId && !contactId) {
      return Response.json(
        { error: "This intake isn't linked to a Lead or Contact yet, so there's no one to invite." },
        { status: 422 }
      );
    }

    // --- 2. reuse an open FBI for this person, else create one ---
    const linkField = contactId ? "Contact__c" : "Lead__c";
    const linkId = contactId || leadId!;
    const statusList = OPEN_STATUSES.map((s) => `'${s}'`).join(", ");

    let fbiId: string;
    let folderToken: string;
    let fbiName: string;
    let reused = false;

    const existing = await conn.query<{ Id: string; Name: string; Supabase_Folder_ID__c: string | null }>(
      `SELECT Id, Name, Supabase_Folder_ID__c FROM ${SF_CONFIG.objectName}
       WHERE ${linkField} = '${linkId}' AND Status__c IN (${statusList})
       AND Supabase_Folder_ID__c != null
       ORDER BY CreatedDate DESC LIMIT 1`
    );

    if (existing.records.length) {
      const e = existing.records[0];
      fbiId = e.Id;
      folderToken = e.Supabase_Folder_ID__c as string;
      fbiName = e.Name;
      reused = true;
    } else {
      folderToken = uuidv4();
      const portalUrl = `${getAppUrl()}/portal/${folderToken}`;
      const rec: Record<string, unknown> = {
        Status__c: "Link Sent",
        Intake_Date__c: new Date().toISOString().slice(0, 10),
        Supabase_Folder_ID__c: folderToken,
        Document_Upload_URL__c: portalUrl,
      };
      rec[linkField] = linkId;
      const created = await conn.sobject(SF_CONFIG.objectName).create(rec);
      if (!created.success) {
        return Response.json({ error: "Could not create the Vault record." }, { status: 500 });
      }
      fbiId = created.id as string;
      const fetched = await conn.sobject(SF_CONFIG.objectName).retrieve(fbiId);
      fbiName = (fetched.Name as string) || fbiId;
    }

    const portalUrl = `${getAppUrl()}/portal/${folderToken}`;

    // No email is sent — the Salesforce Federal_Benefits_Intake__c record IS the
    // sync. Ann copies the link below and shares it however she likes.
    return Response.json({
      success: true,
      fbiId,
      fbiName,
      portalUrl,
      name,
      reused,
      message: reused
        ? `Existing Vault found in Salesforce (${fbiName}) — copy the link to share.`
        : `Vault created in Salesforce (${fbiName}) — copy the link to share.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("vault/invite error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
