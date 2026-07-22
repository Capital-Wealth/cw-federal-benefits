import { NextRequest } from "next/server";

/**
 * POST /api/plan/generate-pdf — RETIRED
 *
 * This route previously proxied to an external report-builder service
 * (cw-federal-report-builder) to calculate and render the Federal Benefit
 * Comparison PDF. That external service has been sunsetted, so this endpoint
 * no longer makes any external calls and simply returns 410 Gone.
 */
export async function POST(_request: NextRequest) {
  return Response.json(
    { error: "The Federal Benefit Comparison PDF generator has been retired." },
    { status: 410 },
  );
}
