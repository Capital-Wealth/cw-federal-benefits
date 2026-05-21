import { NextRequest } from "next/server";
import { getSessionByToken, getDocument, openDocument } from "@/lib/vault/store";

/**
 * GET /api/vault/download/[id]?token=... — decrypt and serve a document.
 *
 * Row-level authorization: getDocument only returns the document if it belongs
 * to this session (mirrors the Supabase RLS join in SECURE_PORTAL_SPEC.md §4.1).
 * The decrypt + serve is audited.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = request.nextUrl.searchParams.get("token");
  const ip = request.headers.get("x-forwarded-for") || "local";

  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  const session = getSessionByToken(token);
  if (!session) return Response.json({ error: "Invalid or expired session" }, { status: 401 });

  const doc = getDocument(session, id);
  if (!doc) return Response.json({ error: "Not found or not authorized" }, { status: 404 });

  const plain = openDocument(doc, session.clientEmail, ip);

  return new Response(new Uint8Array(plain), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
