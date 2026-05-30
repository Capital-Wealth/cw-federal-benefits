"use client";

/**
 * Audit checklist — the right-rail summary that appears after a Generate-from-
 * Vault run (architecture gist §7). Surfaces what the generator did so the
 * advisor can audit rather than re-enter:
 *   ✓ N sources / M destinations / K edges created
 *   ⚠️ low-confidence positions (advisor MUST review)
 *   ⚠️ standalone KEEP positions (locked until 59½ / separation)
 *   ℹ️ Vault Fields_Needing_Review excerpt
 * Each line jumps to (selects) the relevant card on the canvas.
 *
 * Rendered as a floating, collapsible card so it overlays the 3-column work
 * area without reflowing it.
 */
import { useState } from "react";
import type { CaseDesignPosition } from "@/lib/case-design/types";

export interface VaultGenerationSummary {
  sourcesCreated: number;
  destinationsCreated: number;
  edgesCreated: number;
  keepCount: number;
  lowConfidenceCount: number;
  fieldsNeedingReview: string;
}

/** Stage values that represent a standalone KEEP (no rollover edge). */
const KEEP_STAGES = new Set<string>([
  "Locked Until 59½",
  "Locked Until Separation",
  "Standalone — Keep",
  "Eligibility Unknown",
]);

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function AuditChecklistPanel({
  summary,
  sources,
  destinations,
  onJumpTo,
  onDismiss,
}: {
  summary: VaultGenerationSummary;
  sources: CaseDesignPosition[];
  destinations: CaseDesignPosition[];
  onJumpTo: (positionId: string) => void;
  onDismiss: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const keepPositions = sources.filter((p) => KEEP_STAGES.has(p.Stage__c ?? ""));
  const firstSourceId = sources[0]?.Id ?? null;
  const firstDestId = destinations[0]?.Id ?? null;
  const reviewExcerpt = (summary.fieldsNeedingReview || "").trim();

  return (
    <aside
      className="fixed top-28 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden"
      aria-label="Vault generation audit checklist"
    >
      <header className="flex items-center justify-between px-4 py-2.5 bg-[#16253C] text-white">
        <div className="flex items-center gap-2">
          <span className="text-[#C7A356]" aria-hidden="true">✦</span>
          <h2 className="text-sm font-bold tracking-wide">Audit checklist</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((x) => !x)}
            aria-label={collapsed ? "Expand audit checklist" : "Collapse audit checklist"}
            className="w-7 h-7 inline-flex items-center justify-center rounded hover:bg-white/10 cursor-pointer transition-colors"
          >
            <svg className={`w-4 h-4 transition-transform ${collapsed ? "" : "rotate-180"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss audit checklist"
            className="w-7 h-7 inline-flex items-center justify-center rounded hover:bg-white/10 cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-1 text-sm">
          <Row
            tone="ok"
            label={`${summary.sourcesCreated} source${summary.sourcesCreated === 1 ? "" : "s"} created`}
            onClick={firstSourceId ? () => onJumpTo(firstSourceId) : undefined}
          />
          <Row
            tone="ok"
            label={`${summary.destinationsCreated} destination${summary.destinationsCreated === 1 ? "" : "s"} created`}
            onClick={firstDestId ? () => onJumpTo(firstDestId) : undefined}
          />
          <Row tone="ok" label={`${summary.edgesCreated} arrow${summary.edgesCreated === 1 ? "" : "s"} drawn`} />

          {summary.lowConfidenceCount > 0 && (
            <Row
              tone="warn"
              label={`${summary.lowConfidenceCount} position${summary.lowConfidenceCount === 1 ? "" : "s"} need review (low AI confidence)`}
            />
          )}

          {summary.keepCount > 0 && (
            <div className="pt-1">
              <Row
                tone="warn"
                label={`${summary.keepCount} standalone "Keep" position${summary.keepCount === 1 ? "" : "s"} (locked until 59½ or separation)`}
              />
              {keepPositions.length > 0 && (
                <ul className="mt-1 ml-6 space-y-0.5">
                  {keepPositions.map((p) => (
                    <li key={p.Id}>
                      <button
                        type="button"
                        onClick={() => onJumpTo(p.Id)}
                        className="text-left text-[12px] text-[#16253C] hover:text-[#C7A356] hover:underline cursor-pointer transition-colors"
                      >
                        {p.Owner_Label__c ? `${p.Owner_Label__c} · ` : ""}
                        {p.Account_Type__c} — {money(p.Amount__c ?? 0)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {reviewExcerpt && (
            <details className="pt-2 border-t border-zinc-100 mt-2">
              <summary className="flex items-center gap-2 cursor-pointer text-[12px] font-medium text-zinc-600 hover:text-zinc-900">
                <span className="text-blue-500" aria-hidden="true">ℹ︎</span>
                Vault fields flagged for review
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-zinc-600 bg-zinc-50 rounded-md p-2 max-h-40 overflow-y-auto">
                {reviewExcerpt}
              </pre>
            </details>
          )}

          <p className="pt-2 text-[11px] text-zinc-400 leading-snug">
            Generated as a first draft — review each card and adjust before finalizing.
          </p>
        </div>
      )}
    </aside>
  );
}

function Row({
  tone,
  label,
  onClick,
}: {
  tone: "ok" | "warn";
  label: string;
  onClick?: () => void;
}) {
  const icon = tone === "ok" ? "✓" : "⚠︎";
  const iconColor = tone === "ok" ? "text-emerald-600" : "text-amber-600";
  const content = (
    <span className="flex items-start gap-2">
      <span className={`${iconColor} font-bold leading-5`} aria-hidden="true">{icon}</span>
      <span className="text-zinc-800 leading-5">{label}</span>
    </span>
  );
  if (!onClick) {
    return <div className="px-1 py-1">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-1 py-1 rounded hover:bg-zinc-50 cursor-pointer transition-colors"
      title="Jump to card"
    >
      {content}
    </button>
  );
}
