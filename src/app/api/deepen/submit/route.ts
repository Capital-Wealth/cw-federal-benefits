import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const TOKEN_REGEX = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * POST /api/deepen/submit
 * Body: { token, values: { apiName: value, ... } }
 *
 * Proxies to Apex REST which applies values to the Person Account
 * and marks the intake as Submitted.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, values } = body;
  if (!token) return Response.json({ error: "token required" }, { status: 400 });
  if (!TOKEN_REGEX.test(token)) return Response.json({ error: "Invalid token format" }, { status: 400 });
  if (!values || typeof values !== "object") {
    return Response.json({ error: "values required" }, { status: 400 });
  }

  try {
    const conn = await getSFConnection();
    const result = (await conn.request({
      method: "POST",
      url: "/services/apexrest/deepen-intake",
      body: JSON.stringify({ token, values }),
      headers: { "Content-Type": "application/json" },
    })) as Record<string, unknown>;

    if (result.success === false) {
      return Response.json({ error: result.message || "Submit failed" }, { status: 500 });
    }
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Deepen submit error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
