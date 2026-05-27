/**
 * Case Design — Suggest destinations + consolidation edges.
 *
 * POST analyzes the existing Source positions and creates:
 *   - One consolidated Destination per (Owner, Tax Bucket): Retirement → FIA
 *     IRA, Roth → Roth IRA, NQ → NQ Brokerage. Annuities, Life, Cash, and
 *     "Other" are intentionally left standalone (they typically stay in
 *     place — no destination, no edge).
 *   - One Edge from each contributing Source to its consolidated Destination,
 *     with Method = Rollover (retirement / Roth) or TOA (NQ).
 *
 * The route is idempotent at two levels: refuses to run on non-Draft case
 * designs, and skips when ANY destinations OR edges already exist (so the
 * advisor's manual work is never overwritten).
 */
import type { NextRequest } from "next/server";
import { suggestDestinationsAndEdges } from "@/lib/case-design/sf-client";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const result = await suggestDestinationsAndEdges(id);
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Suggest failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
