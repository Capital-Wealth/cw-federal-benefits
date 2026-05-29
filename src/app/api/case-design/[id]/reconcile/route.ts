/**
 * Case Design — Source Reconciliation endpoint.
 *
 * POST: aggregate all five household data sources → LLM-extract figures from
 *   notes + uploaded statements → reconcile against the money-map positions →
 *   persist the report on the parent (Reconciliation_Report__c JSON,
 *   Data_Confidence_Pct__c, Has_Unresolved_Conflicts__c, Last_Reconciled_At__c)
 *   and per-matched SOURCE position (Source_Confidence__c, Verified__c,
 *   Source_Vault_Document_Name__c). Returns the ReconciliationReport.
 *   This is a long-running serverless call (vision + LLM) — expected.
 *
 * GET: returns the persisted report parsed from Reconciliation_Report__c, or
 *   404 if none has been generated yet.
 */

import type { NextRequest } from "next/server";
import { runReconciliation, type ReconciliationReport } from "@/lib/case-design/reconcile";
import { updateCaseDesignParent, positions as positionApi, loadCaseDesign } from "@/lib/case-design/sf-client";
import type { CaseDesignParent } from "@/lib/case-design/types";

/** Mirror the safeId guard used across the case-design routes. */
function safeId(id: string): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9]{15,18}$/.test(id)) {
    throw new Error(`Invalid Salesforce Id: ${JSON.stringify(id)}`);
  }
  return id;
}

/** Reconciliation_Report__c is a LongText(131072). Truncate-guard the JSON. */
const REPORT_FIELD_MAX = 131072;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const cdId = safeId(id);
    const report = await runReconciliation(cdId);

    // Persist a compact report; if it overflows the field, drop the heaviest
    // arrays (figures, then findings.sourceValues) so the headline numbers and
    // messages always survive.
    const json = serializeReport(report);

    await updateCaseDesignParent(cdId, {
      Data_Confidence_Pct__c: report.coveragePct,
      Has_Unresolved_Conflicts__c: report.hasUnresolvedConflicts,
      Last_Reconciled_At__c: report.generatedAt,
      Reconciliation_Report__c: json,
    } as Partial<CaseDesignParent>);

    // Per-matched SOURCE position: stamp confidence + verified + provenance.
    // Only positions referenced by a Match/Conflict finding get touched.
    await Promise.all(
      report.findings
        .filter((f) => f.positionId && (f.type === "Match" || f.type === "Conflict"))
        .map((f) => {
          const verified = f.type === "Match";
          const conf = f.sourceValues.length > 0 ? Math.max(...f.sourceValues.map((s) => s.confidence)) : 0;
          const provenance = bestProvenanceLabel(f.sourceValues);
          const patch: Record<string, unknown> = {
            Source_Confidence__c: conf,
            Verified__c: verified,
          };
          if (provenance) patch.Source_Vault_Document_Name__c = provenance;
          return positionApi.update(f.positionId as string, patch).catch(() => {
            // Non-fatal: a single FLS/validation hiccup shouldn't sink the run.
          });
        }),
    );

    return Response.json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Reconciliation failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const bundle = await loadCaseDesign(safeId(id));
    if (!bundle) return Response.json({ error: "Case Design not found" }, { status: 404 });
    const raw = bundle.parent.Reconciliation_Report__c;
    if (!raw) return Response.json({ error: "No reconciliation report yet" }, { status: 404 });
    try {
      return Response.json(JSON.parse(raw) as ReconciliationReport);
    } catch {
      return Response.json({ error: "Stored report is not valid JSON" }, { status: 500 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load report";
    return Response.json({ error: msg }, { status: 500 });
  }
}

/** Best human-readable provenance for a position: highest-confidence source's doc/source name. */
function bestProvenanceLabel(sourceValues: { confidence: number; sourceDocumentName: string | null; sourceType: string }[]): string | null {
  if (sourceValues.length === 0) return null;
  const best = [...sourceValues].sort((a, b) => b.confidence - a.confidence)[0];
  return (best.sourceDocumentName || best.sourceType || "").slice(0, 255) || null;
}

/**
 * JSON-stringify the report, shedding the heaviest payloads if it would
 * overflow the LongText field. Order of sacrifice keeps the advisor-facing
 * content (findings + messages) intact the longest.
 */
function serializeReport(report: ReconciliationReport): string {
  let json = JSON.stringify(report);
  if (json.length <= REPORT_FIELD_MAX) return json;

  // 1) Drop verbatim quotes from figures + findings.
  const trim1: ReconciliationReport = {
    ...report,
    figures: report.figures.map((f) => ({ ...f, verbatimQuote: null })),
    findings: report.findings.map((fd) => ({
      ...fd,
      sourceValues: fd.sourceValues.map((s) => ({ ...s, verbatimQuote: null })),
    })),
  };
  json = JSON.stringify(trim1);
  if (json.length <= REPORT_FIELD_MAX) return json;

  // 2) Drop the top-level figures array (findings still carry their own).
  json = JSON.stringify({ ...trim1, figures: [] });
  if (json.length <= REPORT_FIELD_MAX) return json;

  // 3) Hard cap.
  return json.slice(0, REPORT_FIELD_MAX);
}
