import { NextRequest } from "next/server";
import { getSessionByToken, readAudit } from "@/lib/vault/store";

/**
 * GET /api/vault/audit?token=... — the append-only audit trail for this session.
 *
 * In production this stream lands in S3 Object Lock + Datadog SIEM and is
 * tamper-evident. Here it reads the local append-only JSONL.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  const session = getSessionByToken(token);
  if (!session) return Response.json({ error: "Invalid or expired session" }, { status: 401 });

  const events = readAudit(session.tokenHash).sort((a, b) => b.at.localeCompare(a.at));
  return Response.json({ events });
}
