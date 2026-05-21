import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const ID_RE = /^[a-zA-Z0-9]{15,18}$/;

/**
 * POST /api/events/start-intake  body:{ leadId }
 * Reuses an existing Lead-linked intake or creates one, returns the per-person form URL.
 */
export async function POST(request: NextRequest) {
  const { leadId } = await request.json();
  if (!leadId || !ID_RE.test(leadId)) {
    return Response.json({ error: "valid leadId required" }, { status: 400 });
  }
  try {
    const conn = await getSFConnection();
    // Reuse if an intake already exists for this lead
    const existing = await conn.query<{ Id: string }>(
      `SELECT Id FROM Meeting_1_Intake__c WHERE Lead__c = '${leadId}' ORDER BY CreatedDate DESC LIMIT 1`
    );
    let intakeId: string;
    if (existing.records.length) {
      intakeId = existing.records[0].Id;
    } else {
      const lead = await conn.query<{ FirstName?: string; LastName?: string; State?: string }>(
        `SELECT FirstName, LastName, State FROM Lead WHERE Id = '${leadId}' LIMIT 1`
      );
      const l = lead.records[0] || {};
      const name = [l.FirstName, l.LastName].filter(Boolean).join(" ");
      const rec: Record<string, unknown> = {
        Lead__c: leadId,
        Prospect_1_Name__c: name || "Workshop Attendee",
        Status__c: "In Progress",
      };
      if (l.State) rec.State__c = l.State;
      const created = await conn.sobject("Meeting_1_Intake__c").create(rec);
      if (!created.success) return Response.json({ error: "create failed" }, { status: 500 });
      intakeId = created.id as string;
    }
    return Response.json({ success: true, intakeId, url: `/meeting1/${intakeId}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
