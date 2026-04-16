import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

/**
 * POST /api/rmm/complete
 *
 * Marks the intake as docs uploaded / questionnaire complete.
 */
export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  const conn = await getSFConnection();

  const result = await conn.query(
    `SELECT Id FROM Retirement_Intake__c WHERE Upload_Token__c = '${token}' LIMIT 1`
  );

  if (result.records.length === 0) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const intakeId = (result.records[0] as Record<string, unknown>).Id as string;

  await conn.sobject("Retirement_Intake__c").update({
    Id: intakeId,
    Status__c: "Docs Uploaded",
    Docs_Uploaded__c: true,
  } as { Id: string });

  return Response.json({ success: true });
}
