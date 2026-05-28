import { NextRequest } from "next/server";
import { verifyLivePlanToken } from "@/lib/plan/token";
import { listIntakeDocuments, downloadFromSalesforce } from "@/lib/salesforce/files";

/**
 * GET /api/plan/document/[id]?token=…
 *
 * Streams a single document (by ContentVersion id) for inline viewing in the
 * Live Plan. Auth = Live Plan HMAC token; the requested id MUST belong to the
 * token's intake record (no cross-record access).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  let session;
  try {
    session = verifyLivePlanToken(token);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "auth failed" },
      { status: 401 },
    );
  }

  // Authorize: the id must be one of this intake's attachments.
  const docs = await listIntakeDocuments(session.intakeId);
  if (!docs.some((d) => d.contentVersionId === id)) {
    return Response.json({ error: "not found on this record" }, { status: 404 });
  }

  const { buffer, fileName, mimeType } = await downloadFromSalesforce(id);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
