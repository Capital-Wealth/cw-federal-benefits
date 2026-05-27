/**
 * AccountColumn — left rail (Sources) or right rail (Destinations). Lists the
 * positions of the given role as compact cards, surfaces an intake-loader
 * banner on the Sources column when Meeting 1 assets are available, and
 * exposes "+ Add" / per-card edit / per-card replace actions.
 */
"use client";

import type {
  AccountType,
  CaseDesignPosition,
  PositionRole,
} from "@/lib/case-design/types";
import type { MeetingIntakeAsset } from "@/lib/case-design/sf-client";
import { formatValueDisplay, formatFeeBadge } from "@/lib/case-design/auto-layout";

interface AccountColumnProps {
  role: "Source" | "Destination";
  positions: CaseDesignPosition[];
  selectedPositionId: string | null;
  pickingReplacementFor: CaseDesignPosition | null;
  intakeAssets: MeetingIntakeAsset[];
  intakeLoaded: number; // how many sources are already linked to intake
  readOnly: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onLoadIntake: () => void;
  onPickReplacement: (destinationId: string, sourceId: string) => void;
}

export default function AccountColumn(props: AccountColumnProps) {
  const {
    role,
    positions,
    selectedPositionId,
    pickingReplacementFor,
    intakeAssets,
    intakeLoaded,
    readOnly,
    onSelect,
    onAdd,
    onLoadIntake,
    onPickReplacement,
  } = props;

  const isSource = role === "Source";
  const intakeAvailable = isSource && intakeAssets.length > 0 && intakeLoaded < intakeAssets.length;

  // When the user has clicked a source in pick-replacement mode, the destination
  // column shows a "Replace this destination" affordance on each card.
  const replacementMode = !isSource && pickingReplacementFor != null;

  return (
    <aside
      className={`flex flex-col h-full bg-white ${isSource ? "border-r" : "border-l"} border-zinc-200`}
      aria-label={`${role}s column`}
    >
      <header className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-[#16253C]">
            {isSource ? "Sources" : "Destinations"}
          </h2>
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-semibold bg-zinc-100 text-zinc-700 rounded-full">
            {positions.length}
          </span>
          <ColumnHelpTooltip role={role} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {intakeAvailable && !readOnly && (
          <button
            type="button"
            onClick={onLoadIntake}
            className="w-full text-left bg-[#C7A356]/10 border border-[#C7A356]/60 rounded-lg px-3 py-2.5 hover:bg-[#C7A356]/15 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 motion-reduce:transition-none"
          >
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-[#C7A356] mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#16253C]">
                  {intakeAssets.length} accounts in Meeting 1 intake
                </div>
                <div className="text-[11px] text-zinc-600 mt-0.5">
                  Load all as sources
                  <span className="text-[#16253C] font-semibold ml-1">→</span>
                </div>
              </div>
            </div>
          </button>
        )}

        {positions.length === 0 && !readOnly && (
          <div className="text-center py-8">
            <svg className="w-10 h-10 text-zinc-300 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <rect x="3" y="6" width="18" height="14" rx="2" />
              <path d="M3 10h18" />
            </svg>
            <p className="text-xs text-zinc-500 mb-3">
              {isSource
                ? "No source accounts yet."
                : "No destination accounts yet."}
            </p>
          </div>
        )}

        {positions.map((p) => (
          <AccountCard
            key={p.Id}
            position={p}
            selected={selectedPositionId === p.Id}
            replacementMode={replacementMode}
            sourceBeingReplaced={pickingReplacementFor}
            onSelect={() => onSelect(p.Id)}
            onPickAsReplacement={() => {
              if (pickingReplacementFor) onPickReplacement(p.Id, pickingReplacementFor.Id);
            }}
          />
        ))}

        {!readOnly && (
          <button
            type="button"
            onClick={onAdd}
            className="w-full px-3 py-3 min-h-[44px] text-xs font-medium border-2 border-dashed border-zinc-300 rounded-lg text-zinc-600 hover:border-[#C7A356] hover:text-[#16253C] hover:bg-[#C7A356]/5 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 motion-reduce:transition-none flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add {isSource ? "source" : "destination"}
          </button>
        )}
      </div>
    </aside>
  );
}

/* ---------------- Account card ---------------- */

function AccountCard({
  position,
  selected,
  replacementMode,
  sourceBeingReplaced,
  onSelect,
  onPickAsReplacement,
}: {
  position: CaseDesignPosition;
  selected: boolean;
  replacementMode: boolean;
  sourceBeingReplaced: CaseDesignPosition | null;
  onSelect: () => void;
  onPickAsReplacement: () => void;
}) {
  const p = position;
  const value = formatValueDisplay(p);
  const fee = formatFeeBadge(p);
  const accountTypeDisplay =
    p.Account_Type__c === "Other" && p.Account_Type_Other__c
      ? p.Account_Type_Other__c
      : (p.Account_Type__c as AccountType);

  return (
    <div
      className={`cw-hover-lift cw-node-pop group relative border rounded-lg bg-white transition-colors duration-200 motion-reduce:transition-none ${
        selected
          ? "border-[#C7A356] shadow-sm ring-2 ring-[#C7A356]/30"
          : "border-zinc-200 hover:border-zinc-300"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left px-3 py-2.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 rounded-lg"
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#1E40AF] truncate">
              {p.Owner_Label__c || "(no owner)"}
            </div>
            <div className="text-[12px] text-[#1E40AF]/90 truncate">{accountTypeDisplay}</div>
          </div>
          <div className="text-sm font-bold text-zinc-900 whitespace-nowrap">{value}</div>
        </div>
        <div className="mt-1 text-[12px] text-zinc-700 truncate">
          {p.Custodian__c || <span className="italic text-zinc-400">No custodian</span>}
          {p.Account_Number_Last4__c && (
            <span className="text-zinc-500"> · ···{p.Account_Number_Last4__c}</span>
          )}
        </div>
        {p.Product_Detail__c && (
          <div className="text-[11px] italic text-zinc-600 truncate mt-0.5">
            {p.Product_Detail__c}
          </div>
        )}
        {fee && (
          <span className="inline-block mt-1.5 px-1.5 py-0.5 text-[10px] border border-zinc-300 rounded-full text-zinc-700 bg-zinc-50">
            {fee}
          </span>
        )}
      </button>

      {replacementMode && sourceBeingReplaced && (
        <div className="px-3 py-2 border-t border-zinc-100 bg-[#C7A356]/5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPickAsReplacement();
            }}
            className="text-[11px] font-semibold text-[#16253C] hover:text-[#C7A356] cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
          >
            ← Replace with this destination
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Help tooltip ---------------- */

function ColumnHelpTooltip({ role }: { role: PositionRole }) {
  const hint =
    role === "Source"
      ? "Where the money currently sits — accounts the client owns today."
      : "Where the money should go — your proposed allocation.";
  return (
    <span className="relative group/tt inline-flex">
      <svg
        className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-600 cursor-help"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label="More info"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-56 px-2.5 py-1.5 text-[11px] leading-snug text-white bg-[#16253C] rounded-md shadow-lg opacity-0 group-hover/tt:opacity-100 pointer-events-none transition-opacity duration-200 motion-reduce:transition-none z-50">
        {hint}
      </span>
    </span>
  );
}
