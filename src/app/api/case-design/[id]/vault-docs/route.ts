/**
 * Case Design — household Vault documents (and optional Meeting 1 assets).
 * GET returns the ContentDocuments linked to the Opp's Account + Household.
 * When `?include=assets` is present, also returns Meeting_1_Intake_Asset__c rows
 * for the source-account autocomplete in the builder.
 */
import type { NextRequest } from "next/server";
import { loadHouseholdDocs, loadHouseholdAssets } from "@/lib/case-design/sf-client";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const include = req.nextUrl.searchParams.get("include");
  try {
    if (include === "assets") {
      const [documents, assets] = await Promise.all([
        loadHouseholdDocs(id),
        loadHouseholdAssets(id),
      ]);
      return Response.json({ documents, assets });
    }
    const documents = await loadHouseholdDocs(id);
    return Response.json({ documents });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load household docs";
    return Response.json({ error: msg }, { status: 500 });
  }
}
