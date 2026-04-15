import { getSFConnection } from "@/lib/salesforce/connector";
import { SF_CONFIG } from "@/config";

/**
 * GET /api/dashboard/intakes
 *
 * Returns all Federal_Benefits_Intake__c records for the dashboard.
 * All data from Salesforce — no external dependencies.
 */
export async function GET() {
  try {
    const conn = await getSFConnection();

    const result = await conn.query(`
      SELECT Id, Name, Status__c, Document_Upload_URL__c,
             Supabase_Folder_ID__c, AI_Parse_Confidence__c,
             FedRetire_Report_Generated__c, FedRetire_Report_Date__c,
             Contact__c, Contact__r.Name,
             Lead__c, Lead__r.Name,
             CreatedDate
      FROM ${SF_CONFIG.objectName}
      ORDER BY CreatedDate DESC
      LIMIT 50
    `);

    const records = result.records.map((r: Record<string, unknown>) => ({
      id: r.Id,
      name: r.Name,
      status: r.Status__c,
      portalUrl: r.Document_Upload_URL__c,
      token: r.Supabase_Folder_ID__c,
      confidence: r.AI_Parse_Confidence__c,
      reportGenerated: r.FedRetire_Report_Generated__c,
      reportDate: r.FedRetire_Report_Date__c,
      clientName:
        (r.Contact__r as Record<string, unknown>)?.Name ||
        (r.Lead__r as Record<string, unknown>)?.Name ||
        null,
      createdDate: r.CreatedDate,
    }));

    return Response.json({ records });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg, records: [] }, { status: 500 });
  }
}
