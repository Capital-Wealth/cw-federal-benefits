import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

/** Token = the Meeting_1_Intake__c record Id (15 or 18 char SF Id). */
const ID_REGEX = /^[a-zA-Z0-9]{15,18}$/;

/**
 * GET /api/meeting1/session?token=<intakeId>
 *
 * Loads the Meeting 1 Intake record + its asset rows via the Apex REST
 * service (Meeting1IntakeService), which bypasses the jsforce schema cache.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return Response.json({ error: "token required" }, { status: 400 });
  if (!ID_REGEX.test(token)) {
    return Response.json({ error: "Invalid token format" }, { status: 400 });
  }

  try {
    const conn = await getSFConnection();
    const result = (await conn.request({
      method: "GET",
      url: `/services/apexrest/meeting1-intake?id=${encodeURIComponent(token)}`,
      headers: { "Content-Type": "application/json" },
    })) as Record<string, unknown>;

    if (result.error) {
      const status = result.error === "Intake not found" ? 404 : 400;
      return Response.json({ error: result.error }, { status });
    }
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Meeting1 session error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
