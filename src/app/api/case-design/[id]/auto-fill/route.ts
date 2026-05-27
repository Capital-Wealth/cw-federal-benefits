/**
 * Case Design — Auto-fill from Salesforce.
 *
 * POST creates Source positions on a Draft, empty Case Design using the
 * household's best-available data:
 *   1) Meeting 1 Intake assets (preferred when present)
 *   2) Complete Opportunities on the household (fallback so households
 *      without a Meeting 1 record still get a populated starting canvas)
 *
 * The route is idempotent: it refuses to run if the Case Design already has
 * positions or is not in Draft status, so re-firing is safe.
 *
 * GET returns the same suggestions WITHOUT creating anything — useful for a
 * dry-run preview in the UI.
 */
import type { NextRequest } from "next/server";
import {
  loadCaseDesign,
  loadAutoFillSources,
  bulkCreateSourcePositions,
} from "@/lib/case-design/sf-client";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const result = await loadAutoFillSources(id);
    return Response.json({
      origin: result.origin,
      count: result.sources.length,
      sources: result.sources,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Auto-fill lookup failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const bundle = await loadCaseDesign(id);
    if (!bundle) {
      return Response.json({ error: "Case Design not found" }, { status: 404 });
    }
    if (bundle.parent.Status__c !== "Draft") {
      return Response.json(
        { error: `Auto-fill only runs on Draft Case Designs (status: ${bundle.parent.Status__c})` },
        { status: 409 },
      );
    }
    if (bundle.positions.length > 0) {
      // Idempotency guard — don't double-fill.
      return Response.json({ origin: "skipped-existing", created: 0, count: 0 });
    }

    const result = await loadAutoFillSources(id);
    if (result.sources.length === 0) {
      return Response.json({ origin: result.origin, created: 0, count: 0 });
    }

    const newIds = await bulkCreateSourcePositions(id, result.sources);
    return Response.json({
      origin: result.origin,
      created: newIds.length,
      count: newIds.length,
      ids: newIds,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Auto-fill failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
