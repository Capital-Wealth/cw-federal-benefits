import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const ID_RE = /^[a-zA-Z0-9]{15,18}$/;

/** GET /api/events/roster?campaignId=701... → leads on the campaign + check-in state */
export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  if (!campaignId || !ID_RE.test(campaignId)) {
    return Response.json({ error: "valid campaignId required" }, { status: 400 });
  }
  try {
    const conn = await getSFConnection();
    const soql = `
      SELECT Id, FirstName, LastName, Name, Phone, Email, Attendance__c, Workshop_Attended__c, Status
      FROM Lead
      WHERE Campaign__c = '${campaignId}' AND Status != 'Pre-Lead'
      ORDER BY LastName, FirstName
      LIMIT 1000`;
    const res = await conn.query(soql);
    return Response.json({ leads: res.records });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
