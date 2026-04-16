import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/rmm/session?token=xxx
 *
 * Calls the Apex REST service (RMMIntakeService) which bypasses
 * the REST API schema cache. Apex can always access custom fields.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return Response.json({ error: "token required" }, { status: 400 });
  if (!UUID_REGEX.test(token)) return Response.json({ error: "Invalid token format" }, { status: 400 });

  try {
    const conn = await getSFConnection();

    // Call the Apex REST service directly
    const result = await conn.request({
      method: "GET",
      url: `/services/apexrest/rmm-intake?token=${encodeURIComponent(token)}`,
      headers: { "Content-Type": "application/json" },
    }) as Record<string, unknown>;

    if (result.valid === false) {
      const status = result.error === "Session expired" ? 410
        : result.error === "Session not found" ? 404 : 400;
      return Response.json({ error: result.error }, { status });
    }

    return Response.json({
      intakeId: result.intakeId,
      intakeName: result.intakeName,
      status: result.status,
      prefill: {
        firstName: result.firstName,
        lastName: result.lastName,
        email: result.email,
        dateOfBirth: result.dateOfBirth,
        state: result.state,
      },
      nextMeeting: result.meetingDate
        ? { date: result.meetingDate, type: result.meetingType || "Appointment" }
        : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("RMM session error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
