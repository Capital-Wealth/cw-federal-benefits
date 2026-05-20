import { getSFConnection } from "@/lib/salesforce/connector";

/** GET /api/events → active Federal Benefits campaigns (newest-named first) */
export async function GET() {
  try {
    const conn = await getSFConnection();
    const soql = `
      SELECT Id, Name, Type, NumberOfLeads
      FROM Campaign
      WHERE IsActive = true AND Type = 'Federal Benefits'
        AND (Name LIKE '%Workshop%' OR Name LIKE '%Webinar%' OR Name LIKE '%Seminar%' OR Name LIKE '%Event%')
      ORDER BY Name DESC
      LIMIT 100`;
    const res = await conn.query(soql);
    return Response.json({ campaigns: res.records });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
