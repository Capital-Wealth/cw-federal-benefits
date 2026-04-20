import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const TOKEN_REGEX = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * GET /api/deepen/session?token=xxx
 *
 * Proxies to Apex REST (DeepenIntakeRest) which validates the token
 * and returns the dynamic field list to render.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return Response.json({ error: "token required" }, { status: 400 });
  if (!TOKEN_REGEX.test(token)) return Response.json({ error: "Invalid token format" }, { status: 400 });

  try {
    const conn = await getSFConnection();
    const result = (await conn.request({
      method: "GET",
      url: `/services/apexrest/deepen-intake?token=${encodeURIComponent(token)}`,
      headers: { "Content-Type": "application/json" },
    })) as Record<string, unknown>;

    if (result.valid === false || result.error) {
      const err = (result.error as string) || "Session invalid";
      const status = err === "Session expired" ? 410 : err === "Session not found" ? 404 : 400;
      return Response.json({ error: err }, { status });
    }

    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Deepen session error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
