import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const ID_RE = /^[a-zA-Z0-9]{15,18}$/;

/** POST /api/events/walkin body:{ campaignId, firstName, lastName, phone?, email? } → create attended Lead */
export async function POST(request: NextRequest) {
  const { campaignId, firstName, lastName, phone, email } = await request.json();
  if (!campaignId || !ID_RE.test(campaignId)) {
    return Response.json({ error: "valid campaignId required" }, { status: 400 });
  }
  if (!lastName || !String(lastName).trim()) {
    return Response.json({ error: "lastName required" }, { status: 400 });
  }
  const fn = (firstName || "").trim();
  const ln = String(lastName).trim();
  const fullName = (fn ? fn + " " : "") + ln;
  try {
    const conn = await getSFConnection();
    // Dedupe: if a lead with same phone OR same full name already on this campaign, reuse it
    const dupeWhere = phone
      ? `Phone = '${String(phone).replace(/'/g, "")}'`
      : `FirstName = '${fn.replace(/'/g, "")}' AND LastName = '${ln.replace(/'/g, "")}'`;
    const dupe = await conn.query<{ Id: string }>(
      `SELECT Id FROM Lead WHERE Campaign__c = '${campaignId}' AND ${dupeWhere} LIMIT 1`
    );
    if (dupe.records.length) {
      await conn.sobject("Lead").update({ Id: dupe.records[0].Id, Attendance__c: "Attended", Workshop_Attended__c: true });
      return Response.json({ success: true, id: dupe.records[0].Id, name: fullName, deduped: true });
    }
    const rec: Record<string, unknown> = {
      FirstName: fn || null,
      LastName: ln,
      Company: fullName,              // CW VR: Company must equal lead name
      Status: "Nurturing",
      Campaign__c: campaignId,
      LeadSource: "Federal Workshop",
      Attendance__c: "Attended",
      Workshop_Attended__c: true,
    };
    if (phone) rec.Phone = phone;
    if (email) rec.Email = email;
    const r = await conn.sobject("Lead").create(rec);
    if (!r.success) return Response.json({ error: "create failed" }, { status: 500 });
    return Response.json({ success: true, id: r.id, name: fullName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
