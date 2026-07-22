/**
 * GET /api/salesforce/callback — RETIRED
 *
 * Previously completed the Salesforce OAuth flow for the external
 * cw-federal-report-builder service (now sunsetted) and returned Salesforce
 * access/refresh tokens. Retired to remove the orphaned token-minting surface.
 */
export function GET() {
  return Response.json({ error: "This endpoint has been retired." }, { status: 410 });
}
