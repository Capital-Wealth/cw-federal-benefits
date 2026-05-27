/**
 * BuilderHeader — navy top bar showing logo, document label, workflow status,
 * plan-type chips, auto-save indicator, an overflow menu, and a single state-
 * aware primary CTA. Replaces the multi-button cluster from the legacy header.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type { CaseDesignParent } from "@/lib/case-design/types";

const PLAN_TYPES = [
  "Rollover",
  "Replacement",
  "Consolidation",
  "LPOA",
  "Roth Conversion",
  "IUL Strategy",
  "1035 Exchange",
  "Tax Planning",
] as const;

type PlanType = (typeof PLAN_TYPES)[number];

interface BuilderHeaderProps {
  parent: CaseDesignParent;
  householdLabel: string;
  saving: boolean;
  lastSavedAt: Date | null;
  sourceCount: number;
  destinationCount: number;
  childOppCount: number;
  onTogglePlanType: (pt: PlanType) => void;
  onUpdateParent: (patch: Partial<CaseDesignParent>) => void;
  onGeneratePdf: () => void;
  onSoftFinalize: () => void;
  onConfirmAndCreate: () => void;
  onDownloadPdf: () => void;
  onToggleAdvanced: () => void;
  advancedOpen: boolean;
}

export default function BuilderHeader(props: BuilderHeaderProps) {
  const {
    parent,
    householdLabel,
    saving,
    lastSavedAt,
    sourceCount,
    destinationCount,
    onTogglePlanType,
    onGeneratePdf,
    onSoftFinalize,
    onConfirmAndCreate,
    onDownloadPdf,
    onToggleAdvanced,
    advancedOpen,
  } = props;

  const locked = parent.Status__c === "Locked";
  const finalized = parent.Status__c === "Finalized" || parent.Status__c === "Presented";
  const hasSources = sourceCount > 0;
  const hasDestinations = destinationCount > 0;
  const canConfirm = hasSources && hasDestinations && !locked;

  const selectedPlanTypes = new Set(
    (parent.Plan_Type__c || "").split(";").filter(Boolean) as PlanType[]
  );

  return (
    <header className="sticky top-0 z-40 h-16 bg-[#16253C] text-white border-b-2 border-[#C7A356] px-5 flex items-center justify-between gap-4">
      {/* Left: brand + title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <img
          src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-color.png"
          alt="Capital Wealth"
          className="h-4 brightness-0 invert flex-shrink-0"
        />
        <div className="min-w-0 hidden sm:block">
          <h1 className="text-base font-bold leading-tight truncate">
            Money Map for {householdLabel}
          </h1>
          <p className="text-[11px] text-[#C7A356] leading-tight truncate">{parent.Name}</p>
        </div>
      </div>

      {/* Center: workflow pill */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
        <WorkflowDot active={parent.Status__c === "Draft"} done={finalized || locked} label="Draft" />
        <WorkflowArrow />
        <WorkflowDot active={finalized && !locked} done={locked} label="Confirmed" />
        <WorkflowArrow />
        <WorkflowDot active={locked} done={false} label="Locked" />
      </div>

      {/* Right: chips + save + menu + primary CTA */}
      <div className="flex items-center gap-2.5 flex-1 justify-end min-w-0">
        <PlanTypeChips
          selected={selectedPlanTypes}
          onToggle={onTogglePlanType}
          disabled={locked}
        />

        <SaveIndicator saving={saving} lastSavedAt={lastSavedAt} />

        <OverflowMenu
          onGeneratePdf={onGeneratePdf}
          onSoftFinalize={onSoftFinalize}
          onToggleAdvanced={onToggleAdvanced}
          advancedOpen={advancedOpen}
          locked={locked}
          hasPdf={!!parent.PDF_ContentVersion_Id__c}
        />

        <PrimaryCTA
          status={parent.Status__c}
          canConfirm={canConfirm}
          hasSources={hasSources}
          hasDestinations={hasDestinations}
          hasPdf={!!parent.PDF_ContentVersion_Id__c}
          onConfirmAndCreate={onConfirmAndCreate}
          onDownloadPdf={onDownloadPdf}
        />
      </div>
    </header>
  );
}

/* ---------------- Workflow pill ---------------- */

function WorkflowDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  const dotClass = active
    ? "bg-[#C7A356]"
    : done
      ? "bg-[#C7A356]/60"
      : "bg-zinc-400";
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-block w-2 h-2 rounded-full ${dotClass} ${active ? "ring-2 ring-[#C7A356]/30" : ""}`}
        aria-hidden="true"
      />
      <span
        className={`text-[11px] font-medium tracking-wide ${
          active ? "text-white" : done ? "text-white/80" : "text-white/50"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function WorkflowArrow() {
  return (
    <svg
      className="w-3 h-3 text-white/30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/* ---------------- Plan-type chip strip ---------------- */

function PlanTypeChips({
  selected,
  onToggle,
  disabled,
}: {
  selected: Set<PlanType>;
  onToggle: (pt: PlanType) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const visible = PLAN_TYPES.slice(0, 3);
  const overflow = PLAN_TYPES.slice(3);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const overflowSelectedCount = overflow.filter((pt) => selected.has(pt)).length;

  return (
    <div className="hidden lg:flex items-center gap-1.5 relative" ref={ref}>
      {visible.map((pt) => {
        const active = selected.has(pt);
        return (
          <button
            key={pt}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(pt)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 focus:ring-offset-[#16253C] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none ${
              active
                ? "bg-[#C7A356] text-[#16253C]"
                : "bg-white/5 text-white/80 border border-white/15 hover:bg-white/10"
            }`}
          >
            {pt}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="px-2 py-1 text-[11px] font-medium rounded-full bg-white/5 border border-white/15 text-white/80 hover:bg-white/10 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 focus:ring-offset-[#16253C] motion-reduce:transition-none"
        aria-haspopup="true"
        aria-expanded={open}
      >
        +{overflow.length}
        {overflowSelectedCount > 0 && (
          <span className="ml-1 text-[#C7A356] font-semibold">({overflowSelectedCount})</span>
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-zinc-200 rounded-lg shadow-xl p-2 z-50">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-2 py-1">
            More plan types
          </div>
          {overflow.map((pt) => {
            const active = selected.has(pt);
            return (
              <button
                key={pt}
                type="button"
                disabled={disabled}
                onClick={() => onToggle(pt)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed motion-reduce:transition-none ${
                  active
                    ? "bg-[#16253C] text-white"
                    : "hover:bg-zinc-100 text-zinc-900"
                }`}
              >
                <span
                  className={`inline-block w-3 h-3 rounded border ${
                    active ? "bg-[#C7A356] border-[#C7A356]" : "border-zinc-400"
                  }`}
                  aria-hidden="true"
                />
                {pt}
              </button>
            );
          })}
          {(selected.has("Roth Conversion") || overflow.some((pt) => pt === "Roth Conversion" && selected.has(pt))) && (
            <p className="px-2 pt-2 mt-1 text-[10px] text-amber-700 border-t border-zinc-100">
              Roth disclaimer footer will appear on the PDF.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Save indicator ---------------- */

function SaveIndicator({ saving, lastSavedAt }: { saving: boolean; lastSavedAt: Date | null }) {
  if (saving) {
    return (
      <span className="hidden md:flex items-center gap-1.5 text-[11px] text-[#C7A356] whitespace-nowrap">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-[#C7A356] animate-pulse"
          aria-hidden="true"
        />
        Saving…
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className="hidden md:inline text-[11px] text-emerald-300 whitespace-nowrap">
        Saved {lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </span>
    );
  }
  return null;
}

/* ---------------- Overflow menu (⋮) ---------------- */

function OverflowMenu({
  onGeneratePdf,
  onSoftFinalize,
  onToggleAdvanced,
  advancedOpen,
  locked,
  hasPdf,
}: {
  onGeneratePdf: () => void;
  onSoftFinalize: () => void;
  onToggleAdvanced: () => void;
  advancedOpen: boolean;
  locked: boolean;
  hasPdf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={open}
        className="w-9 h-9 rounded-md inline-flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/15 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 focus:ring-offset-[#16253C] motion-reduce:transition-none"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-zinc-200 rounded-lg shadow-xl py-1.5 z-50">
          <MenuItem
            onClick={() => {
              onGeneratePdf();
              setOpen(false);
            }}
            label="Preview PDF"
            hint="Download without uploading to Salesforce"
            disabled={locked && !hasPdf}
          />
          <MenuItem
            onClick={() => {
              onSoftFinalize();
              setOpen(false);
            }}
            label="Soft Finalize"
            hint="Generate & upload PDF — no Opps created"
            disabled={locked}
          />
          <div className="my-1 border-t border-zinc-100" />
          <MenuItem
            onClick={() => {
              onToggleAdvanced();
              setOpen(false);
            }}
            label={advancedOpen ? "Hide Advanced" : "Show Advanced"}
            hint="Notes, Sections, Annotations"
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  label,
  hint,
  disabled,
}: {
  onClick: () => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-3 py-2 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
    >
      <div className="text-sm font-medium text-zinc-900">{label}</div>
      <div className="text-[11px] text-zinc-500">{hint}</div>
    </button>
  );
}

/* ---------------- Primary CTA ---------------- */

function PrimaryCTA({
  status,
  canConfirm,
  hasSources,
  hasDestinations,
  hasPdf,
  onConfirmAndCreate,
  onDownloadPdf,
}: {
  status: CaseDesignParent["Status__c"];
  canConfirm: boolean;
  hasSources: boolean;
  hasDestinations: boolean;
  hasPdf: boolean;
  onConfirmAndCreate: () => void;
  onDownloadPdf: () => void;
}) {
  if (status === "Locked") {
    return (
      <button
        type="button"
        onClick={onDownloadPdf}
        disabled={!hasPdf}
        className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-xs font-semibold bg-white text-[#16253C] rounded-md hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 focus:ring-offset-[#16253C] motion-reduce:transition-none"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        Download PDF
      </button>
    );
  }

  if (status === "Finalized" || status === "Presented") {
    return (
      <button
        type="button"
        onClick={onConfirmAndCreate}
        disabled={!canConfirm}
        className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-xs font-bold bg-[#C7A356] text-[#16253C] rounded-md hover:bg-[#D9B96E] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 focus:ring-offset-[#16253C] motion-reduce:transition-none"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 13l4 4L19 7" />
        </svg>
        Confirm & Create Opps
      </button>
    );
  }

  // Draft
  if (canConfirm) {
    return (
      <button
        type="button"
        onClick={onConfirmAndCreate}
        className="cw-cta-ready inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-xs font-bold bg-[#C7A356] text-[#16253C] rounded-md hover:bg-[#D9B96E] cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 focus:ring-offset-[#16253C] motion-reduce:transition-none"
        title="Locks the Case Design and creates child Opportunities in Salesforce for each destination."
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 13l4 4L19 7" />
        </svg>
        Confirm & Create Opps
      </button>
    );
  }

  const message = !hasSources
    ? "Add a source to continue"
    : !hasDestinations
      ? "Add a destination to continue"
      : "Add accounts to continue";

  return (
    <button
      type="button"
      disabled
      className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-xs font-medium bg-white/10 text-white/60 border border-white/15 rounded-md cursor-not-allowed"
    >
      {message}
    </button>
  );
}
