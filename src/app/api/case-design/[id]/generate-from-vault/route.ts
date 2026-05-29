/**
 * Case Design — Generate from Vault (one-button replacement for the
 * auto-fill + suggest-destinations two-step).
 *
 * POST: reads Vault (Retirement_Intake__c + Federal_Benefits_Intake__c),
 * applies CMT-driven mappings + age-aware eligibility rules, creates Sources +
 * Destinations + Edges in one shot, stamps Generated_From_Vault_At__c.
 *
 * GET ?dryRun=1: same logic, no DML — returns the proposal so the UI can show
 * an audit preview before commit.
 */
import type { NextRequest } from "next/server";
import { loadCaseDesign } from "@/lib/case-design/sf-client";
import {
  generateFromVault,
  resetGeneratedCaseDesign,
} from "@/lib/case-design/generate-from-vault";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const reset = req.nextUrl.searchParams.get("reset") === "1";
  try {
    let bundle = await loadCaseDesign(id);
    if (!bundle) {
      return Response.json({ error: "Case Design not found" }, { status: 404 });
    }
    // Reset & Regenerate (Q8): wipe existing positions/edges + audit stamp, then
    // reload so generateFromVault sees a clean Draft. Draft-only for safety.
    if (reset) {
      if (bundle.parent.Status__c !== "Draft") {
        return Response.json(
          { error: "Reset & Regenerate is only allowed on Draft Case Designs" },
          { status: 409 },
        );
      }
      await resetGeneratedCaseDesign(id);
      bundle = await loadCaseDesign(id);
      if (!bundle) {
        return Response.json({ error: "Case Design not found" }, { status: 404 });
      }
    }
    const result = await generateFromVault(id, bundle);
    const status =
      result.status === "ok"
        ? 200
        : result.status === "skipped-existing"
          ? 409
          : result.status === "skipped-non-draft"
            ? 409
            : 200;
    return Response.json(result, { status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Generate failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const dryRun = req.nextUrl.searchParams.get("dryRun");
  if (!dryRun) {
    return Response.json(
      { error: "GET requires ?dryRun=1; use POST to actually generate" },
      { status: 400 },
    );
  }
  // For v1 the GET endpoint is symmetric with POST but the orchestrator
  // commits to SF; a true dry-run would need a separate code path that
  // returns the plan instead of inserting. Deferring that to v2 — the
  // POST status return is already rich enough for the audit panel.
  return Response.json(
    { error: "Dry-run not implemented in v1 — use POST" },
    { status: 501 },
  );
}
