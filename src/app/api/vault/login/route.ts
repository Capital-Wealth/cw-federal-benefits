import { NextRequest } from "next/server";
import { createSession } from "@/lib/vault/store";

/**
 * POST /api/vault/login — DEMO magic-link issuance.
 *
 * In production this would email a single-use magic link via Postmark and
 * NEVER return the token in the response. For the local demo we return the
 * magic-link path directly so you can click straight through.
 */
export async function POST(request: NextRequest) {
  const { clientName, clientEmail } = await request.json().catch(() => ({}));
  if (!clientEmail) {
    return Response.json({ error: "clientEmail is required" }, { status: 400 });
  }
  const session = createSession(clientName || "Demo Client", clientEmail);
  return Response.json({
    magicLinkPath: `/vault/${session.token}`,
    note: "DEMO ONLY — in production this link is emailed and never returned in an API response.",
    expiresAt: session.expiresAt,
  });
}
