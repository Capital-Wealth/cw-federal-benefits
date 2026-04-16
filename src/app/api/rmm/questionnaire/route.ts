import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/rmm/questionnaire
 *
 * Calls the Apex REST service to save questionnaire answers.
 * Bypasses REST API schema cache.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, ...answers } = body;

  if (!token) return Response.json({ error: "token required" }, { status: 400 });
  if (!UUID_REGEX.test(token)) return Response.json({ error: "Invalid token format" }, { status: 400 });

  try {
    const conn = await getSFConnection();

    const result = await conn.request({
      method: "POST",
      url: "/services/apexrest/rmm-intake",
      body: JSON.stringify({
        token,
        action: "questionnaire",
        ...answers,
      }),
      headers: { "Content-Type": "application/json" },
    }) as Record<string, unknown>;

    if (result.success) {
      return Response.json({ success: true });
    } else {
      return Response.json({ error: result.message }, { status: 500 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("RMM questionnaire error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
