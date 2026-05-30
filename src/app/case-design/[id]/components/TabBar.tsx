/**
 * TabBar — horizontal meeting-progression tab strip that sits above the diagram.
 * Each tab is one meeting/stage (e.g. "Consolidation" 04/13, "Allocation Map"
 * 04/15) mapped to a Page_Number. Clicking a tab filters the whole canvas to
 * that page. When the parent isn't Draft, all editing controls are disabled
 * (mirrors the builder's status-gated editing).
 *
 * When no tabs exist, the builder renders an implicit single "Page 1" view and
 * this strip surfaces a single read-only chip plus an "Add tab" control (in
 * Draft) so the advisor can split a legacy single-page Money Map into stages.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type { CaseDesignTab } from "@/lib/case-design/types";

/** Format a Tab_Date (YYYY-MM-DD) as a compact MM/DD chip. Empty when null. */
function formatTabDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return d;
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

interface Props {
  tabs: CaseDesignTab[];
  activePage: number;
  /** Position/edge/section/annotation counts keyed by resolved page number. */
  pageCounts: Record<number, number>;
  /** Disabled state for editing controls (true when parent is not Draft). */
  readOnly: boolean;
  onSelect: (page: number) => void;
  onAdd: () => void;
  onRename: (id: string, label: string) => void;
  onSetDate: (id: string, date: string | null) => void;
  onDelete: (tab: CaseDesignTab) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

export default function TabBar({
  tabs,
  activePage,
  pageCounts,
  readOnly,
  onSelect,
  onAdd,
  onRename,
  onSetDate,
  onDelete,
  onMove,
}: Props) {
  // Tabs are pre-sorted by the loader (Sort_Order NULLS LAST, Page_Number),
  // but defend against unsorted optimistic inserts.
  const ordered = [...tabs].sort((a, b) => {
    const sa = a.Sort_Order__c ?? a.Page_Number__c ?? 0;
    const sb = b.Sort_Order__c ?? b.Page_Number__c ?? 0;
    return sa - sb;
  });

  return (
    <div
      className="bg-white border-b border-zinc-200 px-5 py-1.5 flex items-center gap-1.5 overflow-x-auto"
      role="tablist"
      aria-label="Meeting stages"
    >
      {ordered.length === 0 ? (
        <span className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[#16253C] text-white">
          Page 1
          {pageCounts[activePage] != null && (
            <span className="ml-1.5 text-[10px] text-[#C7A356]">
              ({pageCounts[activePage]})
            </span>
          )}
        </span>
      ) : (
        ordered.map((tab, idx) => (
          <TabChip
            key={tab.Id}
            tab={tab}
            active={(tab.Page_Number__c ?? 1) === activePage}
            count={pageCounts[tab.Page_Number__c ?? 1] ?? 0}
            readOnly={readOnly}
            isFirst={idx === 0}
            isLast={idx === ordered.length - 1}
            isOnlyTab={ordered.length === 1}
            onSelect={() => onSelect(tab.Page_Number__c ?? 1)}
            onRename={(label) => onRename(tab.Id, label)}
            onSetDate={(date) => onSetDate(tab.Id, date)}
            onDelete={() => onDelete(tab)}
            onMove={(dir) => onMove(tab.Id, dir)}
          />
        ))
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={onAdd}
          title="Add a new tab (meeting stage)"
          aria-label="Add tab"
          className="ml-1 inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[32px] text-xs font-medium text-[#16253C] border border-dashed border-zinc-300 rounded-md hover:border-[#C7A356] hover:bg-[#C7A356]/5 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 motion-reduce:transition-none flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add tab
        </button>
      )}
    </div>
  );
}

function TabChip({
  tab,
  active,
  count,
  readOnly,
  isFirst,
  isLast,
  isOnlyTab,
  onSelect,
  onRename,
  onSetDate,
  onDelete,
  onMove,
}: {
  tab: CaseDesignTab;
  active: boolean;
  count: number;
  readOnly: boolean;
  isFirst: boolean;
  isLast: boolean;
  isOnlyTab: boolean;
  onSelect: () => void;
  onRename: (label: string) => void;
  onSetDate: (date: string | null) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  // `editing` holds the in-progress label string when renaming, or null when
  // not editing. Seeding it on entry (not via an effect that mirrors props)
  // avoids the cascading-render setState-in-effect pattern.
  const [editing, setEditing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    if (!readOnly) setEditing(tab.Label__c);
  };

  const commitRename = () => {
    const next = (editing ?? "").trim();
    setEditing(null);
    if (next && next !== tab.Label__c) onRename(next);
  };

  const dateLabel = formatTabDate(tab.Tab_Date__c);

  return (
    <div
      className={`group inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 min-h-[32px] rounded-md border flex-shrink-0 transition-colors duration-200 motion-reduce:transition-none ${
        active
          ? "bg-[#16253C] border-[#16253C] text-white"
          : "bg-white border-zinc-200 text-[#16253C] hover:border-[#C7A356]"
      }`}
      role="tab"
      aria-selected={active}
    >
      {/* Move-left */}
      {!readOnly && !isFirst && (
        <button
          type="button"
          onClick={() => onMove(-1)}
          aria-label={`Move ${tab.Label__c} left`}
          title="Move left"
          className={`w-4 h-4 inline-flex items-center justify-center rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-150 motion-reduce:transition-none ${
            active ? "hover:bg-white/10 text-white/70" : "hover:bg-zinc-100 text-zinc-400"
          }`}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      {editing !== null ? (
        <input
          ref={inputRef}
          value={editing}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setEditing(null);
          }}
          maxLength={80}
          className="w-28 text-xs font-semibold bg-white text-[#16253C] border border-[#C7A356] rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C7A356]"
          aria-label="Tab label"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={startEditing}
          className="text-xs font-semibold cursor-pointer whitespace-nowrap focus:outline-none"
          title={readOnly ? tab.Label__c : `${tab.Label__c} — double-click to rename`}
        >
          {tab.Label__c}
          {count > 0 && (
            <span className={`ml-1.5 text-[10px] ${active ? "text-[#C7A356]" : "text-zinc-400"}`}>
              ({count})
            </span>
          )}
        </button>
      )}

      {/* Date — input in Draft, static chip when read-only */}
      {readOnly ? (
        dateLabel && (
          <span className={`text-[10px] tabular-nums ${active ? "text-[#C7A356]" : "text-zinc-400"}`}>
            {dateLabel}
          </span>
        )
      ) : (
        <input
          type="date"
          value={tab.Tab_Date__c ?? ""}
          onChange={(e) => onSetDate(e.target.value || null)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${tab.Label__c} date`}
          title="Tab date"
          className={`text-[10px] tabular-nums bg-transparent rounded px-0.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C7A356] ${
            active ? "text-[#C7A356] [color-scheme:dark]" : "text-zinc-500"
          } ${dateLabel ? "w-[88px]" : "w-[120px]"}`}
        />
      )}

      {/* Move-right */}
      {!readOnly && !isLast && (
        <button
          type="button"
          onClick={() => onMove(1)}
          aria-label={`Move ${tab.Label__c} right`}
          title="Move right"
          className={`w-4 h-4 inline-flex items-center justify-center rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-150 motion-reduce:transition-none ${
            active ? "hover:bg-white/10 text-white/70" : "hover:bg-zinc-100 text-zinc-400"
          }`}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

      {/* Delete — blocked for the last remaining tab */}
      {!readOnly && !isOnlyTab && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${tab.Label__c}`}
          title="Delete tab"
          className={`w-4 h-4 inline-flex items-center justify-center rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-150 motion-reduce:transition-none ${
            active ? "hover:bg-rose-500/30 text-white/70" : "hover:bg-rose-100 text-zinc-400 hover:text-rose-600"
          }`}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
