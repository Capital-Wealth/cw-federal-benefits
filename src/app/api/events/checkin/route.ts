import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const ID_RE = /^[a-zA-Z0-9]{15,18}$/;

/** POST /api/events/checkin  body:{ leadId, undo? } → flip attendance */
export async function POST(request: NextRequest) {
  const { leadId, undo } = await request.json();
  if (!leadId || !ID_RE.test(leadId)) {
    return Response.json({ error: "valid leadId required" }, { status: 400 });
  }
  try {
    const conn = await getSFConnection();
    const fields = undo
      ? { Id: leadId, Attendance__c: "Confirmed", Workshop_Attended__c: false }
      : { Id: leadId, Attendance__c: "Attended", Workshop_Attended__c: true };
    const r = await conn.sobject("Lead").update(fields);
    if (!r.success) return Response.json({ error: "update failed" }, { status: 500 });
    return Response.json({ success: true, attended: !undo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
