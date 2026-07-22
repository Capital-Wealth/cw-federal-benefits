/**
 * POST /api/plan/generate-pdf — RETIRED
 *
 * Previously proxied to the external cw-federal-report-builder service (now
 * sunsetted) to calculate and render the Federal Benefit Comparison PDF.
 * Retired so the app makes no external calls to that service.
 */
export async function POST() {
  return Response.json(
    { error: "The Federal Benefit Comparison PDF generator has been retired." },
    { status: 410 },
  );
}
