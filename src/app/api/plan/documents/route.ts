import { NextRequest } from "next/server";
import { verifyLivePlanToken } from "@/lib/plan/token";
import { listIntakeDocuments } from "@/lib/salesforce/files";

/**
 * GET /api/plan/documents?token=…
 *
 * Lists the documents attached to the FBI record so the advisor can view the
 * source files (LES, SF-50, TSP statement, etc.) alongside the Live Plan and
 * audit the numbers in real time. Auth = Live Plan HMAC token.
 */
export async function GET(request: NextRequest) {
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

  try {
    const docs = await listIntakeDocuments(session.intakeId);
    return Response.json({
      documents: docs.map((d) => ({
        id: d.contentVersionId,
        title: d.title.replace(/^(Other|LES|SF50|TSP_Statement|DD214|PSB|SS_Statement)\s+—\s+/, ""),
        fileType: d.fileType,
        sizeBytes: d.fileSize,
        createdDate: d.createdDate,
      })),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "failed to list documents" },
      { status: 500 },
    );
  }
}
