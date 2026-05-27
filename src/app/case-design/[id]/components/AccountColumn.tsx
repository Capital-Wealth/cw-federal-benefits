/**
 * AccountColumn — left rail (Sources) or right rail (Destinations). Renders
 * positions in a collapsible Owner → Bucket → Account tree so a 14-account
 * household isn't an undifferentiated flat list. Each level shows its own
 * subtotal so the advisor can navigate by money, not by individual name.
 *
 * Sources column shows the Meeting 1 intake importer banner when assets are
 * available but not yet linked. Destinations column omits the tree (one
 * advisor-designed bucket) and just lists cards directly.
 */
"use client";

import { useMemo, useState } from "react";
import type {
  AccountType,
  CaseDesignPosition,
  PositionRole,
} from "@/lib/case-design/types";
import type { MeetingIntakeAsset } from "@/lib/case-design/sf-client";
import {
  accountTypeBucket,
  formatFeeBadge,
  formatMoneyCompact,
  formatValueDisplay,
  type AccountBucket,
} from "@/lib/case-design/auto-layout";

interface AccountColumnProps {
  role: "Source" | "Destination";
  positions: CaseDesignPosition[];
  selectedPositionId: string | null;
  pickingReplacementFor: CaseDesignPosition | null;
  intakeAssets: MeetingIntakeAsset[];
  intakeLoaded: number;
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

        {/* Sources: Owner → Bucket tree. Destinations: flat list. */}
        {positions.length > 0 && isSource && (
          <OwnerBucketTree
            positions={positions}
            selectedPositionId={selectedPositionId}
            onSelect={onSelect}
          />
        )}

        {positions.length > 0 && !isSource && (
          <div className="space-y-2">
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
          </div>
        )}

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

/* ---------------- Owner → Bucket tree (sources only) ---------------- */

interface OwnerNode {
  owner: string;
  total: number;
  count: number;
  buckets: Array<{
    bucket: AccountBucket;
    items: CaseDesignPosition[];
    total: number;
  }>;
}

function OwnerBucketTree({
  positions,
  selectedPositionId,
  onSelect,
}: {
  positions: CaseDesignPosition[];
  selectedPositionId: string | null;
  onSelect: (id: string) => void;
}) {
  const tree = useMemo(() => buildTree(positions), [positions]);

  // All owner groups expanded by default — the value is the breakdown,
  // not the hiding.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-3">
      {tree.map((owner) => {
        const isCollapsed = collapsed.has(`owner:${owner.owner}`);
        return (
          <div key={owner.owner} className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(`owner:${owner.owner}`)}
              aria-expanded={!isCollapsed}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-[#16253C] to-[#1E3456] text-white cursor-pointer hover:from-[#1E3456] hover:to-[#26405E] transition-colors duration-200 motion-reduce:transition-none"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Chevron expanded={!isCollapsed} />
                <span className="text-sm font-bold truncate">{owner.owner}</span>
                <span className="text-[10px] text-white/60">
                  {owner.count} acct{owner.count === 1 ? "" : "s"}
                </span>
              </div>
              <span className="text-xs font-bold text-[#C7A356] tabular-nums whitespace-nowrap">
                {formatMoneyCompact(owner.total)}
              </span>
            </button>

            {!isCollapsed && (
              <div className="px-2 py-1.5 space-y-1.5">
                {owner.buckets.map(({ bucket, items, total }) => (
                  <BucketGroup
                    key={bucket}
                    bucketLabel={bucket}
                    items={items}
                    total={total}
                    selectedPositionId={selectedPositionId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BucketGroup({
  bucketLabel,
  items,
  total,
  selectedPositionId,
  onSelect,
}: {
  bucketLabel: AccountBucket;
  items: CaseDesignPosition[];
  total: number;
  selectedPositionId: string | null;
  onSelect: (id: string) => void;
}) {
  const bucketColor = bucketStripeClass(bucketLabel);
  return (
    <div className="rounded-md">
      <div className="flex items-center justify-between gap-2 px-2 py-1 text-[10px] font-semibold tracking-wider uppercase">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-3 rounded-sm ${bucketColor}`} aria-hidden="true" />
          <span className="text-zinc-700">{bucketLabel}</span>
          <span className="text-zinc-400 font-medium normal-case">({items.length})</span>
        </div>
        <span className="text-zinc-700 tabular-nums">{formatMoneyCompact(total)}</span>
      </div>
      <div className="space-y-1">
        {items.map((p) => (
          <CompactRow
            key={p.Id}
            position={p}
            selected={selectedPositionId === p.Id}
            onSelect={() => onSelect(p.Id)}
          />
        ))}
      </div>
    </div>
  );
}

function CompactRow({
  position,
  selected,
  onSelect,
}: {
  position: CaseDesignPosition;
  selected: boolean;
  onSelect: () => void;
}) {
  const p = position;
  const value = formatValueDisplay(p);
  const accountTypeDisplay =
    p.Account_Type__c === "Other" && p.Account_Type_Other__c
      ? p.Account_Type_Other__c
      : (p.Account_Type__c as AccountType);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`cw-hover-lift w-full text-left px-2 py-1.5 rounded-md border text-[12px] cursor-pointer transition-colors duration-200 motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 ${
        selected
          ? "border-[#C7A356] bg-[#C7A356]/10 ring-2 ring-[#C7A356]/30"
          : "border-zinc-100 bg-zinc-50 hover:border-zinc-300 hover:bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[#16253C] truncate">
            {accountTypeDisplay}
            {p.Custodian__c && p.Custodian__c !== "—" && (
              <span className="text-zinc-500 font-normal"> · {p.Custodian__c}</span>
            )}
          </div>
          {p.Product_Detail__c && (
            <div className="text-[10px] text-zinc-500 truncate">{p.Product_Detail__c}</div>
          )}
        </div>
        <div className="text-[12px] font-bold text-zinc-900 tabular-nums whitespace-nowrap">
          {value}
        </div>
      </div>
    </button>
  );
}

/* ---------------- Destination card (kept from previous design) ---------------- */

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

/* ---------------- Helpers ---------------- */

function buildTree(positions: CaseDesignPosition[]): OwnerNode[] {
  const ownerMap = new Map<string, CaseDesignPosition[]>();
  for (const p of positions) {
    const key = (p.Owner_Label__c || "Client").trim() || "Client";
    if (!ownerMap.has(key)) ownerMap.set(key, []);
    ownerMap.get(key)!.push(p);
  }
  const owners: OwnerNode[] = [];
  for (const [owner, list] of ownerMap.entries()) {
    const bucketMap = new Map<AccountBucket, CaseDesignPosition[]>();
    for (const p of list) {
      const b = accountTypeBucket(p.Account_Type__c);
      if (!bucketMap.has(b)) bucketMap.set(b, []);
      bucketMap.get(b)!.push(p);
    }
    const buckets = Array.from(bucketMap.entries()).map(([bucket, items]) => {
      items.sort(
        (a, b) =>
          (b.Amount__c ?? b.Account_Value__c ?? 0) -
          (a.Amount__c ?? a.Account_Value__c ?? 0),
      );
      const total = items.reduce(
        (s, p) => s + (p.Amount__c ?? p.Account_Value__c ?? 0),
        0,
      );
      return { bucket, items, total };
    });
    const total = list.reduce(
      (s, p) => s + (p.Amount__c ?? p.Account_Value__c ?? 0),
      0,
    );
    owners.push({ owner, total, count: list.length, buckets });
  }
  owners.sort((a, b) => b.total - a.total);
  return owners;
}

function bucketStripeClass(b: AccountBucket): string {
  switch (b) {
    case "Annuities":
      return "bg-amber-500";
    case "Retirement":
      return "bg-blue-600";
    case "Roth":
      return "bg-emerald-600";
    case "Non-Qualified":
      return "bg-violet-600";
    case "Life Insurance":
      return "bg-rose-600";
    case "Cash & Equivalents":
      return "bg-slate-500";
    default:
      return "bg-zinc-400";
  }
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3 h-3 text-white/80 transition-transform duration-200 motion-reduce:transition-none ${
        expanded ? "rotate-90" : ""
      }`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ColumnHelpTooltip({ role }: { role: PositionRole }) {
  const hint =
    role === "Source"
      ? "Where the money currently sits — grouped by owner, then account type."
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
