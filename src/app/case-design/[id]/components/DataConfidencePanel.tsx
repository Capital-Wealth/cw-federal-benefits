/**
 * DataConfidencePanel — slide-in panel surfacing the Source Reconciliation
 * report. Shows the Data_Confidence_Pct__c badge (green ≥90 / amber 60-89 /
 * red <60), a "Run reconciliation" button, and findings grouped by type.
 *
 * Conflicts list every competing value with its source + verbatim quote and a
 * "Use this value" action that sets the position's Amount__c to the chosen
 * figure (which re-runs reconciliation). Unsupported / Missing / Unparsed
 * findings render with their actionable message.
 */
"use client";

import { useState } from "react";
import type { CaseDesignParent } from "@/lib/case-design/types";
import type {
  ReconciliationReport,
  ReconciliationFinding,
  SourceFigure,
  FindingType,
} from "@/lib/case-design/reconcile";

interface DataConfidencePanelProps {
  parent: CaseDesignParent;
  reconciling: boolean;
  onClose: () => void;
  onRun: () => Promise<ReconciliationReport>;
  onResolveConflict: (positionId: string, amount: number) => Promise<void>;
}

function parseStoredReport(parent: CaseDesignParent): ReconciliationReport | null {
  if (!parent.Reconciliation_Report__c) return null;
  try {
    return JSON.parse(parent.Reconciliation_Report__c) as ReconciliationReport;
  } catch {
    return null;
  }
}

function confidenceTone(pct: number | null): { ring: string; text: string; bg: string; label: string } {
  if (pct == null) return { ring: "ring-zinc-300", text: "text-zinc-500", bg: "bg-zinc-100", label: "Not run" };
  if (pct >= 90) return { ring: "ring-emerald-300", text: "text-emerald-700", bg: "bg-emerald-50", label: "High" };
  if (pct >= 60) return { ring: "ring-amber-300", text: "text-amber-700", bg: "bg-amber-50", label: "Review" };
  return { ring: "ring-rose-300", text: "text-rose-700", bg: "bg-rose-50", label: "Low" };
}

const FINDING_ORDER: FindingType[] = ["Conflict", "Unsupported", "Missing", "Unparsed", "Match"];

const FINDING_META: Record<FindingType, { label: string; tone: string; icon: string }> = {
  Conflict: { label: "Conflicts", tone: "text-rose-700 bg-rose-50 border-rose-200", icon: "alert" },
  Unsupported: { label: "Unsupported", tone: "text-amber-700 bg-amber-50 border-amber-200", icon: "question" },
  Missing: { label: "Missing from map", tone: "text-amber-700 bg-amber-50 border-amber-200", icon: "plus" },
  Unparsed: { label: "Unparsed documents", tone: "text-zinc-700 bg-zinc-50 border-zinc-200", icon: "doc" },
  Match: { label: "Confirmed", tone: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: "check" },
};

export default function DataConfidencePanel({
  parent,
  reconciling,
  onClose,
  onRun,
  onResolveConflict,
}: DataConfidencePanelProps) {
  // A freshly-run report (from the Run button) overrides the persisted one
  // for this render cycle; otherwise we derive directly from the parent record
  // (kept current by the builder's refetch after a resolve). Deriving avoids a
  // setState-in-effect sync.
  const [freshReport, setFreshReport] = useState<ReconciliationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const report = freshReport ?? parseStoredReport(parent);

  const pct = parent.Data_Confidence_Pct__c;
  const tone = confidenceTone(pct);

  const run = async () => {
    setError(null);
    try {
      const r = await onRun();
      setFreshReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconciliation failed");
    }
  };

  // After resolving a conflict the builder re-reconciles + refetches the
  // parent, so drop the local freshReport and derive from the updated record.
  const resolve = async (positionId: string, amount: number) => {
    setError(null);
    try {
      await onResolveConflict(positionId, amount);
      setFreshReport(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve conflict");
    }
  };

  const grouped = groupFindings(report?.findings ?? []);
  const conflictCount = grouped.Conflict?.length ?? 0;
  const unsupportedCount = grouped.Unsupported?.length ?? 0;

  return (
    <div
      className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-[28rem] max-w-[92vw] bg-white border-l border-zinc-200 shadow-xl z-30 flex flex-col"
      role="dialog"
      aria-label="Data confidence and source reconciliation"
    >
      {/* Header */}
      <header className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between gap-2 bg-zinc-50">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Source Reconciliation</div>
          <h3 className="text-sm font-bold text-[#16253C]">Data Confidence</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close data confidence panel"
          className="w-8 h-8 inline-flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 motion-reduce:transition-none"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* Confidence badge + run */}
      <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-4">
        <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-full ring-4 ${tone.ring} ${tone.bg}`}>
          <span className={`text-2xl font-bold leading-none ${tone.text}`}>{pct == null ? "—" : `${pct}%`}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${tone.text}`}>{tone.label}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-zinc-600 leading-snug mb-2">
            {pct == null
              ? "Run reconciliation to trace every money-map number back to a parsed source."
              : `${pct}% of source dollars are confirmed by an underlying source.`}
          </p>
          <button
            type="button"
            onClick={() => void run()}
            disabled={reconciling}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold bg-[#16253C] text-white rounded-md hover:bg-[#1E3456] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 motion-reduce:transition-none"
          >
            {reconciling ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
                Reconciling…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
                </svg>
                {report ? "Re-run reconciliation" : "Run reconciliation"}
              </>
            )}
          </button>
        </div>
      </div>

      {parent.Has_Unresolved_Conflicts__c && (
        <div className="px-5 py-2 bg-rose-50 border-b border-rose-200 text-[12px] text-rose-800 flex items-center gap-2" role="status">
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Resolve {conflictCount + unsupportedCount} item{conflictCount + unsupportedCount === 1 ? "" : "s"} before presenting.
        </div>
      )}

      {error && (
        <div className="px-5 py-2 bg-rose-50 border-b border-rose-200 text-[12px] text-rose-800">{error}</div>
      )}

      {/* Findings */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {!report && (
          <p className="text-sm text-zinc-500 text-center py-8">No reconciliation report yet.</p>
        )}
        {report && report.findings.length === 0 && (
          <p className="text-sm text-emerald-700 text-center py-8">Every position is confirmed by a source. 🎉</p>
        )}
        {report &&
          FINDING_ORDER.map((type) => {
            const items = grouped[type];
            if (!items || items.length === 0) return null;
            const meta = FINDING_META[type];
            return (
              <section key={type}>
                <h4 className={`text-[11px] font-bold uppercase tracking-wider mb-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${meta.tone}`}>
                  {meta.label} ({items.length})
                </h4>
                <ul className="space-y-2">
                  {items.map((f, i) => (
                    <FindingCard
                      key={`${type}-${f.positionId ?? f.accountKey}-${i}`}
                      finding={f}
                      onResolveConflict={resolve}
                      disabled={reconciling}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        {report?.unparsedDocuments.length === 0 && report.figures.length > 0 && (
          <p className="text-[11px] text-zinc-400 pt-2">
            {report.figures.length} source figure{report.figures.length === 1 ? "" : "s"} aggregated · reconciled {new Date(report.generatedAt).toLocaleString()}.
          </p>
        )}
      </div>
    </div>
  );
}

function groupFindings(findings: ReconciliationFinding[]): Partial<Record<FindingType, ReconciliationFinding[]>> {
  const out: Partial<Record<FindingType, ReconciliationFinding[]>> = {};
  for (const f of findings) {
    (out[f.type] ??= []).push(f);
  }
  return out;
}

function FindingCard({
  finding,
  onResolveConflict,
  disabled,
}: {
  finding: ReconciliationFinding;
  onResolveConflict: (positionId: string, amount: number) => Promise<void>;
  disabled: boolean;
}) {
  return (
    <li className="border border-zinc-200 rounded-lg p-3 bg-white">
      <p className="text-[12px] text-zinc-800 leading-snug">{finding.message}</p>

      {finding.type === "Conflict" && finding.positionId && (
        <div className="mt-2.5 space-y-1.5">
          {dedupeFiguresByValue(finding.sourceValues).map((f, i) => (
            <div key={i} className="flex items-start justify-between gap-2 border border-zinc-100 rounded-md px-2.5 py-1.5 bg-zinc-50">
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-[#16253C]">{money(f.balance)}</div>
                <div className="text-[10px] text-zinc-500">
                  {f.sourceType}
                  {f.sourceDocumentName ? ` · ${f.sourceDocumentName}` : ""}
                  {typeof f.confidence === "number" ? ` · ${f.confidence}%` : ""}
                </div>
                {f.verbatimQuote && (
                  <div className="text-[10px] italic text-zinc-500 mt-0.5 line-clamp-2">“{f.verbatimQuote}”</div>
                )}
              </div>
              <button
                type="button"
                disabled={disabled || f.balance == null}
                onClick={() => f.balance != null && void onResolveConflict(finding.positionId as string, f.balance)}
                className="flex-shrink-0 px-2 py-1 text-[10px] font-semibold rounded-md bg-[#C7A356] text-[#16253C] hover:bg-[#D9B96E] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
              >
                Use this value
              </button>
            </div>
          ))}
        </div>
      )}

      {finding.type !== "Conflict" && finding.sourceValues.length > 0 && (
        <div className="mt-1.5 text-[10px] text-zinc-500">
          {finding.sourceValues.slice(0, 3).map((f, i) => (
            <span key={i} className="inline-block mr-2">
              {money(f.balance)} · {f.sourceType}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function dedupeFiguresByValue(figures: SourceFigure[]): SourceFigure[] {
  const seen = new Set<number>();
  const out: SourceFigure[] = [];
  for (const f of figures) {
    const key = Math.round(f.balance ?? -1);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function money(n: number | null): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
