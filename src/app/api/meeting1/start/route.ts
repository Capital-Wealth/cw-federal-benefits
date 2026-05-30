import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

/**
 * POST /api/meeting1/start
 * Body: { passcode, firstName, lastName, email }
 *
 * Tokenless entry point for the generic Meeting 1 Intake link (e.g. the one
 * Ann uses — she has no Salesforce login). Flow:
 *
 *   1. Gate on a shared passcode (INTAKE_FORM_PASSCODE) — the link is public,
 *      so this stops drive-by visitors from enumerating CRM emails or creating
 *      records.
 *   2. Look the person up in Salesforce by email, then by name. Match an
 *      existing Lead first (the common case — "usually the lead will exist"),
 *      then an existing Contact/Account.
 *   3. If nothing matches, create a Lead (respecting CW's Company=name VR) so
 *      Ann is never blocked mid-meeting.
 *   4. Find-or-create the Meeting_1_Intake__c record linked to whatever we
 *      matched, and return its builder URL. The form then syncs ONE WAY into
 *      Salesforce via Meeting1IntakeService — nothing is prefilled back out.
 *
 * This mirrors /api/events/start-intake + /api/events/walkin, but driven by a
 * name/email lookup instead of a known Lead Id.
 */

/** Escape a value for safe inlining into a SOQL string literal. */
function soql(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

interface Matched {
  leadId?: string;
  accountId?: string;
  personAccountId?: string;
  /** Best name we have for prefilling Prospect_1_Name__c on a fresh intake. */
  name: string;
  /** How the person was resolved — surfaced for the entry screen + logs. */
  via: "lead-email" | "contact-email" | "lead-name" | "contact-name" | "created-lead";
}

export async function POST(request: NextRequest) {
  const { passcode, firstName, lastName, email } = await request
    .json()
    .catch(() => ({}));

  // ---- 1. passcode gate ----
  const expected = process.env.INTAKE_FORM_PASSCODE;
  if (!expected) {
    return Response.json(
      { error: "Intake form is not configured. Set INTAKE_FORM_PASSCODE." },
      { status: 503 }
    );
  }
  if (!passcode || String(passcode).trim() !== expected) {
    return Response.json({ error: "Incorrect passcode." }, { status: 401 });
  }

  // ---- validate inputs ----
  const fn = (firstName || "").trim();
  const ln = (lastName || "").trim();
  const em = (email || "").trim().toLowerCase();
  if (!ln) {
    return Response.json({ error: "Last name is required." }, { status: 400 });
  }
  const fullName = (fn ? fn + " " : "") + ln;

  try {
    const conn = await getSFConnection();
    const matched = await resolvePerson(conn, fn, ln, em, fullName);
    const intakeId = await findOrCreateIntake(conn, matched);

    return Response.json({
      success: true,
      intakeId,
      url: `/meeting1/${intakeId}`,
      matchedVia: matched.via,
      name: matched.name,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("meeting1/start error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

/** Match an existing Lead/Contact, else create a Lead. Lead-first per CW. */
async function resolvePerson(
  conn: Awaited<ReturnType<typeof getSFConnection>>,
  fn: string,
  ln: string,
  em: string,
  fullName: string
): Promise<Matched> {
  // --- by email (most reliable) ---
  if (em) {
    const lead = await conn.query<{ Id: string; FirstName?: string; LastName?: string }>(
      `SELECT Id, FirstName, LastName FROM Lead
       WHERE Email = '${soql(em)}' AND IsConverted = false
       ORDER BY CreatedDate DESC LIMIT 1`
    );
    if (lead.records.length) {
      const l = lead.records[0];
      return {
        leadId: l.Id,
        name: [l.FirstName, l.LastName].filter(Boolean).join(" ") || fullName,
        via: "lead-email",
      };
    }

    const contact = await conn.query<{
      Id: string;
      AccountId?: string;
      Name?: string;
      Account?: { IsPersonAccount?: boolean } | null;
    }>(
      `SELECT Id, AccountId, Name FROM Contact
       WHERE Email = '${soql(em)}' ORDER BY CreatedDate DESC LIMIT 1`
    );
    if (contact.records.length) {
      const c = contact.records[0];
      return { accountId: c.AccountId, name: c.Name || fullName, via: "contact-email" };
    }
  }

  // --- by name (fallback) ---
  if (fn || ln) {
    const nameWhere = fn
      ? `FirstName = '${soql(fn)}' AND LastName = '${soql(ln)}'`
      : `LastName = '${soql(ln)}'`;

    const lead = await conn.query<{ Id: string; FirstName?: string; LastName?: string }>(
      `SELECT Id, FirstName, LastName FROM Lead
       WHERE ${nameWhere} AND IsConverted = false
       ORDER BY CreatedDate DESC LIMIT 1`
    );
    if (lead.records.length) {
      const l = lead.records[0];
      return {
        leadId: l.Id,
        name: [l.FirstName, l.LastName].filter(Boolean).join(" ") || fullName,
        via: "lead-name",
      };
    }

    const contact = await conn.query<{ Id: string; AccountId?: string; Name?: string }>(
      `SELECT Id, AccountId, Name FROM Contact
       WHERE ${nameWhere} ORDER BY CreatedDate DESC LIMIT 1`
    );
    if (contact.records.length) {
      const c = contact.records[0];
      return { accountId: c.AccountId, name: c.Name || fullName, via: "contact-name" };
    }
  }

  // --- no match: create a Lead (walk-in style, respects CW VRs) ---
  const rec: Record<string, unknown> = {
    FirstName: fn || null,
    LastName: ln,
    Company: fullName, // CW VR: Company must equal lead name
    Status: "Nurturing",
    LeadSource: "Federal Benefits Intake",
  };
  if (em) rec.Email = em;
  const created = await conn.sobject("Lead").create(rec);
  if (!created.success) {
    throw new Error("Could not create a Lead for this person.");
  }
  return { leadId: created.id as string, name: fullName, via: "created-lead" };
}

/** Reuse an open intake for the matched person, else create one. */
async function findOrCreateIntake(
  conn: Awaited<ReturnType<typeof getSFConnection>>,
  m: Matched
): Promise<string> {
  const linkField = m.leadId ? "Lead__c" : "Account__c";
  const linkId = m.leadId || m.accountId;

  if (linkId) {
    // Reuse the most recent intake that hasn't been completed yet, so a
    // finished intake is never silently reopened/overwritten.
    const existing = await conn.query<{ Id: string }>(
      `SELECT Id FROM Meeting_1_Intake__c
       WHERE ${linkField} = '${soql(linkId)}' AND Status__c != 'Completed'
       ORDER BY CreatedDate DESC LIMIT 1`
    );
    if (existing.records.length) return existing.records[0].Id;
  }

  const rec: Record<string, unknown> = {
    Prospect_1_Name__c: m.name || "Prospect",
    Status__c: "In Progress",
    Intake_Date__c: new Date().toISOString().slice(0, 10),
  };
  if (m.leadId) rec.Lead__c = m.leadId;
  if (m.accountId) rec.Account__c = m.accountId;
  if (m.personAccountId) rec.Person_Account__c = m.personAccountId;

  const created = await conn.sobject("Meeting_1_Intake__c").create(rec);
  if (!created.success) throw new Error("Could not create the intake record.");
  return created.id as string;
}
