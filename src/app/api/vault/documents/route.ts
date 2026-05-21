import { NextRequest } from "next/server";
import { getSessionByToken, listDocuments } from "@/lib/vault/store";

/** GET /api/vault/documents?token=... — list the session's own documents. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  const session = getSessionByToken(token);
  if (!session) return Response.json({ error: "Invalid or expired session" }, { status: 401 });

  const docs = listDocuments(session).map((d) => ({
    id: d.id,
    fileName: d.fileName,
    mime: d.mime,
    sizeBytes: d.sizeBytes,
    sha256: d.sha256,
    scanStatus: d.scanStatus,
    uploadedAt: d.uploadedAt,
  }));

  return Response.json({ client: { name: session.clientName, email: session.clientEmail }, documents: docs });
}
