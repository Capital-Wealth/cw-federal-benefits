import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const ID_REGEX = /^[a-zA-Z0-9]{15,18}$/;

/**
 * POST /api/meeting1/complete
 * Body: { token, fields: {...}, assets?: [...] }
 *
 * Final submit: writes all fields + asset rows back to the Meeting 1 Intake
 * record, flips Status to Completed, and queues a follow-up Task for the owner.
 */
export async function POST(request: NextRequest) {
  const { token, fields, assets } = await request.json();
  if (!token) return Response.json({ error: "token required" }, { status: 400 });
  if (!ID_REGEX.test(token)) {
    return Response.json({ error: "Invalid token format" }, { status: 400 });
  }

  try {
    const conn = await getSFConnection();
    const result = (await conn.request({
      method: "POST",
      url: "/services/apexrest/meeting1-intake",
      body: JSON.stringify({ id: token, action: "complete", fields: fields ?? {}, assets }),
      headers: { "Content-Type": "application/json" },
    })) as Record<string, unknown>;

    if (result.success) return Response.json({ success: true, message: result.message });
    return Response.json({ error: result.error ?? "Complete failed" }, { status: 500 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Meeting1 complete error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
