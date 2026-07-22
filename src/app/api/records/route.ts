import { NextRequest } from "next/server";

/**
 * GET /api/records — RETIRED
 *
 * Previously exposed Federal_Benefits_Intake__c data to the external
 * cw-federal-report-builder service (now sunsetted) via a shared API key.
 * Retired to remove the external data-sharing surface.
 */
export async function GET(_request: NextRequest) {
  return Response.json({ error: "This data API has been retired." }, { status: 410 });
}
