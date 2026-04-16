import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/rmm/complete
 *
 * Marks the intake as docs uploaded / questionnaire complete.
 */
export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  if (!UUID_REGEX.test(token)) {
    return Response.json({ error: "Invalid token format" }, { status: 400 });
  }

  const conn = await getSFConnection();

  // Find the intake record — parameterized via jsforce .find() to prevent SOQL injection
  const records = await conn
    .sobject("Retirement_Intake__c")
    .find({ Upload_Token__c: token }, ["Id"])
    .limit(1)
    .execute();

  if (records.length === 0) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const intakeId = (records[0] as Record<string, unknown>).Id as string;

  try {
    await conn.sobject("Retirement_Intake__c").update({
      Id: intakeId,
      Status__c: "Docs Uploaded",
      Docs_Uploaded__c: true,
    } as { Id: string });

    return Response.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to mark intake complete:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
