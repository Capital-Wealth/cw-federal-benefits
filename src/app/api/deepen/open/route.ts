import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const TOKEN_REGEX = /^[A-Za-z0-9_-]{8,64}$/;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token } = body;
  if (!token) return Response.json({ error: "token required" }, { status: 400 });
  if (!TOKEN_REGEX.test(token)) return Response.json({ error: "Invalid token format" }, { status: 400 });

  try {
    const conn = await getSFConnection();
    const result = (await conn.request({
      method: "POST",
      url: "/services/apexrest/deepen-intake/open",
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
    })) as Record<string, unknown>;
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Deepen open error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
