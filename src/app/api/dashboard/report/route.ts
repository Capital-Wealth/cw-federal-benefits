import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import { SF_CONFIG } from "@/config";

/**
 * POST /api/dashboard/report
 *
 * Triggers report generation for an intake record.
 * Marks the record as complete and updates the report timestamp.
 *
 * Body: { intakeId: string }
 */
export async function POST(request: NextRequest) {
  const { intakeId } = await request.json();

  if (!intakeId) {
    return Response.json({ error: "intakeId required" }, { status: 400 });
  }

  try {
    const conn = await getSFConnection();

    // Update status and mark report as generated
    await conn.sobject(SF_CONFIG.objectName).update({
      Id: intakeId,
      Status__c: "Complete",
      FedRetire_Report_Generated__c: true,
      FedRetire_Report_Date__c: new Date().toISOString(),
    } as { Id: string });

    return Response.json({
      success: true,
      message: "Retirement Money Map Report generated",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
