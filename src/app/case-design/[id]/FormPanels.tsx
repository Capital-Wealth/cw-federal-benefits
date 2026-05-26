/**
 * FormPanels — tabbed middle column for Sources / Destinations / Standalone /
 * Edges / Sections / Annotations. Each row is collapsible; field changes are
 * pushed through the useCaseDesign hook (which handles optimistic state +
 * server reconciliation). Source/Destination rows can link to a Meeting 1
 * intake asset and prefill from it.
 */
"use client";

import { useState } from "react";
import type {
  AccountType,
  AnnotationStyle,
  CaseDesignAnnotation,
  CaseDesignBundle,
  CaseDesignEdge,
  CaseDesignPosition,
  CaseDesignSection,
  EdgeMethod,
  EdgeStatus,
  PositionRole,
  SectionType,
} from "@/lib/case-design/types";
import type { MeetingIntakeAsset } from "@/lib/case-design/sf-client";

type UseCaseDesignHook = {
  updateParent: (patch: Partial<CaseDesignBundle["parent"]>) => Promise<void>;
  addPosition: (data: Partial<CaseDesignPosition>) => Promise<string>;
  updatePosition: (id: string, patch: Partial<CaseDesignPosition>) => Promise<void>;
  deletePosition: (id: string) => Promise<void>;
  addSection: (data: Partial<CaseDesignSection>) => Promise<string>;
  updateSection: (id: string, patch: Partial<CaseDesignSection>) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  addEdge: (data: Partial<CaseDesignEdge>) => Promise<string>;
  updateEdge: (id: string, patch: Partial<CaseDesignEdge>) => Promise<void>;
  deleteEdge: (id: string) => Promise<void>;
  addAnnotation: (data: Partial<CaseDesignAnnotation>) => Promise<string>;
  updateAnnotation: (id: string, patch: Partial<CaseDesignAnnotation>) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
};

interface FormPanelsProps {
  bundle: CaseDesignBundle;
  hook: UseCaseDesignHook;
  householdAssets: MeetingIntakeAsset[];
  readOnly?: boolean;
}

const ACCOUNT_TYPES: AccountType[] = [
  "401k", "403b", "Roth 403b", "IRA", "Roth IRA", "Roth", "Simple IRA", "SEP IRA",
  "Inherited IRA", "Inherited IRA Trust", "NQ", "NQ-TOD", "Trust NQ", "Non Proto-Trust",
  "HSA", "1099", "Bank Savings", "Cash", "Crypto", "Whole Life", "Whole Life (Paid Up)",
  "IUL", "Variable Annuity", "Fixed Indexed Annuity", "Overseas Investment", "Other",
];

const EDGE_METHODS: EdgeMethod[] = [
  "TOA", "Rollover", "Replacement", "LPOA", "LPOA Completed", "1035",
  "Internal Roth", "Roth Conversion", "Continue Contributions", "Partial Transfer", "Custom",
];

const EDGE_STATUSES: EdgeStatus[] = ["Planned", "In Progress", "Completed"];

const SECTION_TYPES: SectionType[] = [
  "Consolidation", "Continue Contributions", "Tax Planning", "Self Directed", "Stage", "Custom",
];

const ANNOTATION_STYLES: AnnotationStyle[] = [
  "Standard", "High Priority", "Disclaimer", "Note Block",
];

type Tab = "plan" | "sources" | "destinations" | "standalone" | "edges" | "sections" | "annotations";

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "sources", label: "Sources" },
  { id: "destinations", label: "Destinations" },
  { id: "standalone", label: "Standalone" },
  { id: "edges", label: "Edges" },
  { id: "sections", label: "Sections" },
  { id: "annotations", label: "Annotations" },
];

const PLAN_TYPES = [
  "Rollover", "Replacement", "Consolidation", "LPOA",
  "Roth Conversion", "IUL Strategy", "1035 Exchange", "Tax Planning",
] as const;

const INPUT_CLASS =
  "w-full px-2 py-1.5 text-sm border border-zinc-300 rounded focus:outline-none focus:border-[#C7A356] focus:ring-1 focus:ring-[#C7A356]/30 disabled:bg-zinc-50";
const LABEL_CLASS = "block text-[11px] font-medium uppercase tracking-wide text-zinc-500 mb-1";

function inferAccountType(asset: MeetingIntakeAsset): AccountType {
  const t = (asset.Investment_Type__c || asset.Category__c || "").toLowerCase();
  if (t.includes("roth ira")) return "Roth IRA";
  if (t.includes("ira")) return "IRA";
  if (t.includes("401")) return "401k";
  if (t.includes("403")) return "403b";
  if (t.includes("hsa")) return "HSA";
  if (t.includes("whole life")) return "Whole Life";
  if (t.includes("iul")) return "IUL";
  if (t.includes("variable annuity")) return "Variable Annuity";
  if (t.includes("fixed indexed") || t.includes("fia")) return "Fixed Indexed Annuity";
  if (t.includes("savings")) return "Bank Savings";
  if (t.includes("cash")) return "Cash";
  if (t.includes("crypto")) return "Crypto";
  return "Other";
}

export default function FormPanels({
  bundle,
  hook,
  householdAssets,
  readOnly = false,
}: FormPanelsProps) {
  const [tab, setTab] = useState<Tab>("plan");

  const planTypeCount = bundle.parent.Plan_Type__c
    ? bundle.parent.Plan_Type__c.split(";").filter(Boolean).length
    : 0;

  const counts: Record<Tab, number> = {
    plan: planTypeCount,
    sources: bundle.positions.filter((p) => p.Role__c === "Source").length,
    destinations: bundle.positions.filter((p) => p.Role__c === "Destination").length,
    standalone: bundle.positions.filter((p) => p.Role__c === "Standalone").length,
    edges: bundle.edges.length,
    sections: bundle.sections.length,
    annotations: bundle.annotations.length,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-zinc-200 bg-zinc-50 sticky top-0 z-10">
        {TAB_LABELS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded ${
              tab === t.id
                ? "bg-[#16253C] text-white"
                : "bg-white border border-zinc-300 text-zinc-700 hover:border-[#C7A356]"
            }`}
          >
            {t.label} ({counts[t.id]})
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {tab === "plan" && (
          <PlanPanel bundle={bundle} hook={hook} readOnly={readOnly} />
        )}
        {tab === "sources" && (
          <PositionList
            role="Source"
            bundle={bundle}
            hook={hook}
            householdAssets={householdAssets}
            readOnly={readOnly}
          />
        )}
        {tab === "destinations" && (
          <PositionList
            role="Destination"
            bundle={bundle}
            hook={hook}
            householdAssets={householdAssets}
            readOnly={readOnly}
          />
        )}
        {tab === "standalone" && (
          <PositionList
            role="Standalone"
            bundle={bundle}
            hook={hook}
            householdAssets={householdAssets}
            readOnly={readOnly}
          />
        )}
        {tab === "edges" && <EdgeList bundle={bundle} hook={hook} readOnly={readOnly} />}
        {tab === "sections" && <SectionList bundle={bundle} hook={hook} readOnly={readOnly} />}
        {tab === "annotations" && (
          <AnnotationList bundle={bundle} hook={hook} readOnly={readOnly} />
        )}
      </div>
    </div>
  );
}

/* ---------------- Position rows (Sources / Destinations / Standalone) ---------------- */

function PositionList({
  role,
  bundle,
  hook,
  householdAssets,
  readOnly,
}: {
  role: PositionRole;
  bundle: CaseDesignBundle;
  hook: UseCaseDesignHook;
  householdAssets: MeetingIntakeAsset[];
  readOnly: boolean;
}) {
  const rows = bundle.positions.filter((p) => p.Role__c === role);
  const sources = bundle.positions.filter((p) => p.Role__c === "Source");

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-sm text-zinc-500 italic px-1 py-3">
          No {role.toLowerCase()} accounts yet.
        </p>
      )}
      {rows.map((p) => (
        <PositionRow
          key={p.Id}
          position={p}
          hook={hook}
          householdAssets={householdAssets}
          sources={sources}
          readOnly={readOnly}
        />
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() =>
            hook.addPosition({
              Role__c: role,
              Owner_Label__c: "",
              Account_Type__c: "Other",
              Custodian__c: "",
            })
          }
          className="w-full px-3 py-2 text-xs font-medium border-2 border-dashed border-zinc-300 rounded text-zinc-600 hover:border-[#C7A356] hover:text-[#16253C]"
        >
          + Add {role.toLowerCase()}
        </button>
      )}
    </div>
  );
}

function PositionRow({
  position,
  hook,
  householdAssets,
  sources,
  readOnly,
}: {
  position: CaseDesignPosition;
  hook: UseCaseDesignHook;
  householdAssets: MeetingIntakeAsset[];
  sources: CaseDesignPosition[];
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const p = position;
  const value =
    p.Amount__c != null
      ? `$${p.Amount__c.toLocaleString()}`
      : p.Account_Value__c != null
        ? `AV $${p.Account_Value__c.toLocaleString()}`
        : p.Cash_Value__c != null
          ? `CV $${p.Cash_Value__c.toLocaleString()}`
          : "—";

  const linkAsset = (assetId: string) => {
    const asset = householdAssets.find((a) => a.Id === assetId);
    if (!asset) return;
    const amount = asset.Balance__c ?? asset.Market_Value__c ?? null;
    void hook.updatePosition(p.Id, {
      Source_Asset__c: asset.Id,
      Owner_Label__c: asset.Asset_Owner__c ?? p.Owner_Label__c,
      Custodian__c: asset.Company__c ?? p.Custodian__c,
      Account_Type__c: inferAccountType(asset),
      Amount__c: amount,
      Cash_Value__c: asset.Cash_Value__c ?? null,
      Death_Benefit__c: asset.Death_Benefit__c ?? null,
    });
  };

  return (
    <div className="border border-zinc-200 rounded bg-white">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="w-full px-3 py-2 flex justify-between items-baseline text-left hover:bg-zinc-50"
      >
        <span className="text-sm text-[#16253C] truncate">
          <span className="font-semibold">{p.Owner_Label__c || "(no owner)"}</span>{" "}
          <span className="text-zinc-500">· {p.Account_Type__c}</span>
          {p.Custodian__c && (
            <span className="text-zinc-500"> · {p.Custodian__c}</span>
          )}
        </span>
        <span className="text-xs text-zinc-600 ml-2 whitespace-nowrap">
          {value} {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="border-t border-zinc-200 p-3 grid grid-cols-2 gap-3 text-sm">
          {p.Role__c !== "Standalone" && householdAssets.length > 0 && (
            <div className="col-span-2">
              <label className={LABEL_CLASS}>Link to intake asset</label>
              <select
                disabled={readOnly}
                value={p.Source_Asset__c ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) linkAsset(v);
                  else void hook.updatePosition(p.Id, { Source_Asset__c: null });
                }}
                className={INPUT_CLASS}
              >
                <option value="">— None —</option>
                {householdAssets.map((a) => (
                  <option key={a.Id} value={a.Id}>
                    {a.Asset_Owner__c ?? "?"} · {a.Company__c ?? a.Investment_Type__c ?? a.Name}
                    {a.Balance__c != null ? ` · $${a.Balance__c.toLocaleString()}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <FieldText
            label="Owner"
            value={p.Owner_Label__c}
            onCommit={(v) => hook.updatePosition(p.Id, { Owner_Label__c: v })}
            disabled={readOnly}
          />
          <div>
            <label className={LABEL_CLASS}>Account Type</label>
            <select
              disabled={readOnly}
              value={p.Account_Type__c}
              onChange={(e) =>
                hook.updatePosition(p.Id, { Account_Type__c: e.target.value as AccountType })
              }
              className={INPUT_CLASS}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {p.Account_Type__c === "Other" && (
            <FieldText
              label="Account Type — Other"
              value={p.Account_Type_Other__c ?? ""}
              onCommit={(v) =>
                hook.updatePosition(p.Id, { Account_Type_Other__c: v || null })
              }
              disabled={readOnly}
            />
          )}
          <FieldText
            label="Custodian"
            value={p.Custodian__c}
            onCommit={(v) => hook.updatePosition(p.Id, { Custodian__c: v })}
            disabled={readOnly}
          />
          <FieldText
            label="Product Detail"
            value={p.Product_Detail__c ?? ""}
            onCommit={(v) => hook.updatePosition(p.Id, { Product_Detail__c: v || null })}
            disabled={readOnly}
          />
          <FieldText
            label="Account # last 4"
            value={p.Account_Number_Last4__c ?? ""}
            onCommit={(v) =>
              hook.updatePosition(p.Id, { Account_Number_Last4__c: v || null })
            }
            disabled={readOnly}
          />
          <FieldNumber
            label="Amount"
            value={p.Amount__c}
            onCommit={(v) => hook.updatePosition(p.Id, { Amount__c: v })}
            disabled={readOnly}
          />
          <FieldNumber
            label="Account Value (AV)"
            value={p.Account_Value__c}
            onCommit={(v) => hook.updatePosition(p.Id, { Account_Value__c: v })}
            disabled={readOnly}
          />
          <FieldNumber
            label="Surrender Value (SV)"
            value={p.Surrender_Value__c}
            onCommit={(v) => hook.updatePosition(p.Id, { Surrender_Value__c: v })}
            disabled={readOnly}
          />
          <FieldNumber
            label="Cash Value (CV)"
            value={p.Cash_Value__c}
            onCommit={(v) => hook.updatePosition(p.Id, { Cash_Value__c: v })}
            disabled={readOnly}
          />
          <FieldNumber
            label="Death Benefit (DB)"
            value={p.Death_Benefit__c}
            onCommit={(v) => hook.updatePosition(p.Id, { Death_Benefit__c: v })}
            disabled={readOnly}
          />
          <FieldNumber
            label="Annual Fee %"
            value={p.Annual_Fee_Pct__c}
            step={0.01}
            onCommit={(v) => hook.updatePosition(p.Id, { Annual_Fee_Pct__c: v })}
            disabled={readOnly}
          />
          <FieldText
            label="Annual Fee Display"
            value={p.Annual_Fee_Display__c ?? ""}
            onCommit={(v) =>
              hook.updatePosition(p.Id, { Annual_Fee_Display__c: v || null })
            }
            disabled={readOnly}
          />
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={p.Fee_Is_Approximate__c}
                onChange={(e) =>
                  hook.updatePosition(p.Id, { Fee_Is_Approximate__c: e.target.checked })
                }
              />
              Fee is approximate
            </label>
          </div>
          <div className="col-span-2">
            <label className={LABEL_CLASS}>Contribution note</label>
            <textarea
              disabled={readOnly}
              defaultValue={p.Contribution_Note__c ?? ""}
              onBlur={(e) =>
                hook.updatePosition(p.Id, { Contribution_Note__c: e.target.value || null })
              }
              rows={2}
              className={INPUT_CLASS}
            />
          </div>

          {p.Role__c === "Destination" && (
            <div className="col-span-2">
              <label className={LABEL_CLASS}>Replaces source</label>
              <select
                disabled={readOnly}
                value={p.Replaces_Position__c ?? ""}
                onChange={(e) =>
                  hook.updatePosition(p.Id, {
                    Replaces_Position__c: e.target.value || null,
                  })
                }
                className={INPUT_CLASS}
              >
                <option value="">— None —</option>
                {sources.map((s) => (
                  <option key={s.Id} value={s.Id}>
                    {s.Owner_Label__c} · {s.Account_Type__c} · {s.Custodian__c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!readOnly && (
            <div className="col-span-2 pt-2 border-t border-zinc-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete ${p.Owner_Label__c || "this position"}?`)) {
                    void hook.deletePosition(p.Id);
                  }
                }}
                className="px-3 py-1 text-xs text-rose-700 border border-rose-200 rounded hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Edges ---------------- */

function EdgeList({
  bundle,
  hook,
  readOnly,
}: {
  bundle: CaseDesignBundle;
  hook: UseCaseDesignHook;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-2">
      {bundle.edges.length === 0 && (
        <p className="text-sm text-zinc-500 italic px-1 py-3">No money-movement edges yet.</p>
      )}
      {bundle.edges.map((e) => (
        <EdgeRow key={e.Id} edge={e} bundle={bundle} hook={hook} readOnly={readOnly} />
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() =>
            hook.addEdge({
              From_Position__c: bundle.positions[0]?.Id ?? "",
              To_Position__c: bundle.positions[1]?.Id ?? "",
              Method__c: "TOA",
              Status__c: "Planned",
            })
          }
          disabled={bundle.positions.length < 2}
          className="w-full px-3 py-2 text-xs font-medium border-2 border-dashed border-zinc-300 rounded text-zinc-600 hover:border-[#C7A356] hover:text-[#16253C] disabled:opacity-50 disabled:hover:border-zinc-300"
        >
          + Add edge {bundle.positions.length < 2 && "(need at least 2 positions)"}
        </button>
      )}
    </div>
  );
}

function EdgeRow({
  edge,
  bundle,
  hook,
  readOnly,
}: {
  edge: CaseDesignEdge;
  bundle: CaseDesignBundle;
  hook: UseCaseDesignHook;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const e = edge;
  const from = bundle.positions.find((p) => p.Id === e.From_Position__c);
  const to = bundle.positions.find((p) => p.Id === e.To_Position__c);
  const label =
    e.Method__c === "Custom" && e.Method_Label_Override__c
      ? e.Method_Label_Override__c
      : e.Method__c;

  return (
    <div className="border border-zinc-200 rounded bg-white">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="w-full px-3 py-2 flex justify-between items-baseline text-left hover:bg-zinc-50"
      >
        <span className="text-sm text-[#16253C] truncate">
          <span className="font-semibold">{label}</span>{" "}
          <span className="text-zinc-500">
            {from?.Owner_Label__c || "?"} → {to?.Owner_Label__c || "?"}
          </span>
        </span>
        <span className="text-xs text-zinc-600 ml-2">
          {e.Status__c} {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="border-t border-zinc-200 p-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className={LABEL_CLASS}>From</label>
            <select
              disabled={readOnly}
              value={e.From_Position__c}
              onChange={(ev) => hook.updateEdge(e.Id, { From_Position__c: ev.target.value })}
              className={INPUT_CLASS}
            >
              {bundle.positions.map((p) => (
                <option key={p.Id} value={p.Id}>
                  {p.Owner_Label__c || "?"} · {p.Account_Type__c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>To</label>
            <select
              disabled={readOnly}
              value={e.To_Position__c}
              onChange={(ev) => hook.updateEdge(e.Id, { To_Position__c: ev.target.value })}
              className={INPUT_CLASS}
            >
              {bundle.positions.map((p) => (
                <option key={p.Id} value={p.Id}>
                  {p.Owner_Label__c || "?"} · {p.Account_Type__c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Method</label>
            <select
              disabled={readOnly}
              value={e.Method__c}
              onChange={(ev) =>
                hook.updateEdge(e.Id, { Method__c: ev.target.value as EdgeMethod })
              }
              className={INPUT_CLASS}
            >
              {EDGE_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <FieldText
            label="Method Label Override"
            value={e.Method_Label_Override__c ?? ""}
            onCommit={(v) =>
              hook.updateEdge(e.Id, { Method_Label_Override__c: v || null })
            }
            disabled={readOnly}
          />
          <FieldNumber
            label="Partial Amount"
            value={e.Partial_Amount__c}
            onCommit={(v) => hook.updateEdge(e.Id, { Partial_Amount__c: v })}
            disabled={readOnly}
          />
          <FieldNumber
            label="Gross Amount"
            value={e.Gross_Amount__c}
            onCommit={(v) => hook.updateEdge(e.Id, { Gross_Amount__c: v })}
            disabled={readOnly}
          />
          <FieldNumber
            label="Federal Tax"
            value={e.Federal_Tax__c}
            onCommit={(v) => hook.updateEdge(e.Id, { Federal_Tax__c: v })}
            disabled={readOnly}
          />
          <FieldNumber
            label="State Tax"
            value={e.State_Tax__c}
            onCommit={(v) => hook.updateEdge(e.Id, { State_Tax__c: v })}
            disabled={readOnly}
          />
          <FieldText
            label="Tax Payment Source"
            value={e.Tax_Payment_Source__c ?? ""}
            onCommit={(v) =>
              hook.updateEdge(e.Id, { Tax_Payment_Source__c: v || null })
            }
            disabled={readOnly}
          />
          <FieldText
            label="Timing Note"
            value={e.Timing_Note__c ?? ""}
            onCommit={(v) => hook.updateEdge(e.Id, { Timing_Note__c: v || null })}
            disabled={readOnly}
          />
          <FieldText
            label="Stage"
            value={e.Stage__c ?? ""}
            onCommit={(v) => hook.updateEdge(e.Id, { Stage__c: v || null })}
            disabled={readOnly}
          />
          <div>
            <label className={LABEL_CLASS}>Status</label>
            <select
              disabled={readOnly}
              value={e.Status__c}
              onChange={(ev) =>
                hook.updateEdge(e.Id, { Status__c: ev.target.value as EdgeStatus })
              }
              className={INPUT_CLASS}
            >
              {EDGE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {!readOnly && (
            <div className="col-span-2 pt-2 border-t border-zinc-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Delete this edge?")) void hook.deleteEdge(e.Id);
                }}
                className="px-3 py-1 text-xs text-rose-700 border border-rose-200 rounded hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Sections ---------------- */

function SectionList({
  bundle,
  hook,
  readOnly,
}: {
  bundle: CaseDesignBundle;
  hook: UseCaseDesignHook;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-2">
      {bundle.sections.length === 0 && (
        <p className="text-sm text-zinc-500 italic px-1 py-3">No sections defined.</p>
      )}
      {bundle.sections.map((s) => (
        <SectionRow key={s.Id} section={s} hook={hook} readOnly={readOnly} />
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() =>
            hook.addSection({
              Label__c: "New Section",
              Section_Type__c: "Custom",
              Page_Number__c: 1,
              Style__c: "Standard",
            })
          }
          className="w-full px-3 py-2 text-xs font-medium border-2 border-dashed border-zinc-300 rounded text-zinc-600 hover:border-[#C7A356] hover:text-[#16253C]"
        >
          + Add section
        </button>
      )}
    </div>
  );
}

function SectionRow({
  section,
  hook,
  readOnly,
}: {
  section: CaseDesignSection;
  hook: UseCaseDesignHook;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const s = section;
  return (
    <div className="border border-zinc-200 rounded bg-white">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="w-full px-3 py-2 flex justify-between items-baseline text-left hover:bg-zinc-50"
      >
        <span className="text-sm text-[#16253C] truncate">
          <span className="font-semibold">{s.Label__c || "(no label)"}</span>{" "}
          <span className="text-zinc-500">· {s.Section_Type__c} · page {s.Page_Number__c}</span>
        </span>
        <span className="text-xs text-zinc-600 ml-2">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-200 p-3 grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <FieldText
              label="Label"
              value={s.Label__c}
              onCommit={(v) => hook.updateSection(s.Id, { Label__c: v })}
              disabled={readOnly}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Section Type</label>
            <select
              disabled={readOnly}
              value={s.Section_Type__c}
              onChange={(ev) =>
                hook.updateSection(s.Id, { Section_Type__c: ev.target.value as SectionType })
              }
              className={INPUT_CLASS}
            >
              {SECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Style</label>
            <select
              disabled={readOnly}
              value={s.Style__c}
              onChange={(ev) =>
                hook.updateSection(s.Id, {
                  Style__c: ev.target.value as CaseDesignSection["Style__c"],
                })
              }
              className={INPUT_CLASS}
            >
              <option value="Standard">Standard</option>
              <option value="Highlighted">Highlighted</option>
            </select>
          </div>
          <FieldNumber
            label="Page Number"
            value={s.Page_Number__c}
            onCommit={(v) => hook.updateSection(s.Id, { Page_Number__c: v ?? 1 })}
            disabled={readOnly}
          />
          <FieldNumber
            label="Sort Order"
            value={s.Sort_Order__c}
            onCommit={(v) => hook.updateSection(s.Id, { Sort_Order__c: v })}
            disabled={readOnly}
          />
          {!readOnly && (
            <div className="col-span-2 pt-2 border-t border-zinc-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete section "${s.Label__c}"?`)) {
                    void hook.deleteSection(s.Id);
                  }
                }}
                className="px-3 py-1 text-xs text-rose-700 border border-rose-200 rounded hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Annotations ---------------- */

function AnnotationList({
  bundle,
  hook,
  readOnly,
}: {
  bundle: CaseDesignBundle;
  hook: UseCaseDesignHook;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-2">
      {bundle.annotations.length === 0 && (
        <p className="text-sm text-zinc-500 italic px-1 py-3">No annotations.</p>
      )}
      {bundle.annotations.map((a) => (
        <AnnotationRow
          key={a.Id}
          annotation={a}
          bundle={bundle}
          hook={hook}
          readOnly={readOnly}
        />
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() =>
            hook.addAnnotation({
              Text__c: "",
              Style__c: "Standard",
              Page_Number__c: 1,
            })
          }
          className="w-full px-3 py-2 text-xs font-medium border-2 border-dashed border-zinc-300 rounded text-zinc-600 hover:border-[#C7A356] hover:text-[#16253C]"
        >
          + Add annotation
        </button>
      )}
    </div>
  );
}

function AnnotationRow({
  annotation,
  bundle,
  hook,
  readOnly,
}: {
  annotation: CaseDesignAnnotation;
  bundle: CaseDesignBundle;
  hook: UseCaseDesignHook;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const a = annotation;
  const preview = a.Text__c.length > 80 ? `${a.Text__c.slice(0, 80)}…` : a.Text__c;
  return (
    <div className="border border-zinc-200 rounded bg-white">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="w-full px-3 py-2 flex justify-between items-baseline text-left hover:bg-zinc-50"
      >
        <span className="text-sm text-[#16253C] truncate text-left">
          <span className="text-[10px] uppercase tracking-wide text-zinc-400 mr-2">
            {a.Style__c}
          </span>
          <span>{preview || "(empty)"}</span>
        </span>
        <span className="text-xs text-zinc-600 ml-2">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-200 p-3 grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <label className={LABEL_CLASS}>Text</label>
            <textarea
              disabled={readOnly}
              defaultValue={a.Text__c}
              onBlur={(e) => hook.updateAnnotation(a.Id, { Text__c: e.target.value })}
              rows={3}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Style</label>
            <select
              disabled={readOnly}
              value={a.Style__c}
              onChange={(ev) =>
                hook.updateAnnotation(a.Id, {
                  Style__c: ev.target.value as AnnotationStyle,
                })
              }
              className={INPUT_CLASS}
            >
              {ANNOTATION_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <FieldNumber
            label="Page Number"
            value={a.Page_Number__c}
            onCommit={(v) => hook.updateAnnotation(a.Id, { Page_Number__c: v ?? 1 })}
            disabled={readOnly}
          />
          <div>
            <label className={LABEL_CLASS}>Section</label>
            <select
              disabled={readOnly}
              value={a.Section__c ?? ""}
              onChange={(ev) =>
                hook.updateAnnotation(a.Id, { Section__c: ev.target.value || null })
              }
              className={INPUT_CLASS}
            >
              <option value="">— None —</option>
              {bundle.sections.map((s) => (
                <option key={s.Id} value={s.Id}>
                  {s.Label__c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Anchor Position</label>
            <select
              disabled={readOnly}
              value={a.Anchor_Position__c ?? ""}
              onChange={(ev) =>
                hook.updateAnnotation(a.Id, {
                  Anchor_Position__c: ev.target.value || null,
                })
              }
              className={INPUT_CLASS}
            >
              <option value="">— None —</option>
              {bundle.positions.map((p) => (
                <option key={p.Id} value={p.Id}>
                  {p.Owner_Label__c} · {p.Account_Type__c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Anchor Edge</label>
            <select
              disabled={readOnly}
              value={a.Anchor_Edge__c ?? ""}
              onChange={(ev) =>
                hook.updateAnnotation(a.Id, { Anchor_Edge__c: ev.target.value || null })
              }
              className={INPUT_CLASS}
            >
              <option value="">— None —</option>
              {bundle.edges.map((e) => (
                <option key={e.Id} value={e.Id}>
                  {e.Method__c} · {e.Name || e.Id}
                </option>
              ))}
            </select>
          </div>
          <FieldNumber
            label="Sort Order"
            value={a.Sort_Order__c}
            onCommit={(v) => hook.updateAnnotation(a.Id, { Sort_Order__c: v })}
            disabled={readOnly}
          />
          {!readOnly && (
            <div className="col-span-2 pt-2 border-t border-zinc-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Delete this annotation?")) {
                    void hook.deleteAnnotation(a.Id);
                  }
                }}
                className="px-3 py-1 text-xs text-rose-700 border border-rose-200 rounded hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Field primitives ---------------- */

function FieldText({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(value);
  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      <input
        type="text"
        disabled={disabled}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onCommit(local);
        }}
        className={INPUT_CLASS}
      />
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onCommit,
  step,
  disabled,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  step?: number;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState<string>(value == null ? "" : String(value));
  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      <input
        type="number"
        step={step ?? "any"}
        disabled={disabled}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const next = local === "" ? null : Number(local);
          const same =
            (next == null && value == null) || (next != null && next === value);
          if (!same && (next == null || !Number.isNaN(next))) onCommit(next);
        }}
        className={INPUT_CLASS}
      />
    </div>
  );
}

function PlanPanel({
  bundle,
  hook,
  readOnly,
}: {
  bundle: CaseDesignBundle;
  hook: UseCaseDesignHook;
  readOnly?: boolean;
}) {
  const { parent } = bundle;
  const selectedPlanTypes = new Set(
    (parent.Plan_Type__c || "").split(";").filter(Boolean)
  );

  const togglePlanType = (pt: string) => {
    if (readOnly) return;
    const next = new Set(selectedPlanTypes);
    if (next.has(pt)) next.delete(pt);
    else next.add(pt);
    void hook.updateParent({ Plan_Type__c: Array.from(next).join(";") });
  };

  return (
    <div className="space-y-5">
      <section className="bg-white border border-zinc-200 rounded p-4">
        <h3 className="text-sm font-semibold text-[#16253C] mb-3">
          Document title
        </h3>
        <input
          type="text"
          disabled={readOnly}
          defaultValue={parent.Document_Title__c}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== parent.Document_Title__c) {
              void hook.updateParent({ Document_Title__c: v });
            }
          }}
          className={INPUT_CLASS}
          placeholder="Retirement Money Map"
        />
      </section>

      <section className="bg-white border border-zinc-200 rounded p-4">
        <h3 className="text-sm font-semibold text-[#16253C] mb-1">Plan type</h3>
        <p className="text-xs text-zinc-500 mb-3">
          Multi-select. Selecting "Roth Conversion" or "Tax Planning" auto-adds
          the disclaimer footer to the PDF.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {PLAN_TYPES.map((pt) => (
            <label
              key={pt}
              className={`flex items-center gap-2 px-2 py-1.5 border rounded text-xs cursor-pointer ${
                selectedPlanTypes.has(pt)
                  ? "bg-[#16253C] text-white border-[#16253C]"
                  : "bg-white border-zinc-300 text-zinc-700 hover:border-[#C7A356]"
              } ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                disabled={readOnly}
                checked={selectedPlanTypes.has(pt)}
                onChange={() => togglePlanType(pt)}
                className="accent-[#C7A356]"
              />
              {pt}
            </label>
          ))}
        </div>
        {parent.Has_Roth_Conversion__c && (
          <p className="text-[11px] text-amber-700 mt-3">
            Roth disclaimer footer will appear on the generated PDF.
          </p>
        )}
      </section>

      <section className="bg-white border border-zinc-200 rounded p-4">
        <h3 className="text-sm font-semibold text-[#16253C] mb-1">
          Plan notes (internal)
        </h3>
        <p className="text-xs text-zinc-500 mb-3">
          Free-form notes for the advisor. Not rendered on the client-facing PDF.
        </p>
        <textarea
          disabled={readOnly}
          defaultValue={parent.Notes__c ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (parent.Notes__c ?? "")) {
              void hook.updateParent({ Notes__c: v });
            }
          }}
          rows={8}
          className={`${INPUT_CLASS} font-mono text-xs leading-relaxed`}
          placeholder="Strategy summary, open questions, next steps for the advisor team..."
        />
      </section>

      <section className="bg-white border border-zinc-200 rounded p-4">
        <h3 className="text-sm font-semibold text-[#16253C] mb-3">Rollup</h3>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-zinc-500">Source total</dt>
            <dd className="font-mono font-semibold">
              {parent.Total_Source_Value__c != null
                ? `$${parent.Total_Source_Value__c.toLocaleString()}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Destination total</dt>
            <dd className="font-mono font-semibold">
              {parent.Total_Destination_Value__c != null
                ? `$${parent.Total_Destination_Value__c.toLocaleString()}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Plan date</dt>
            <dd>{parent.Plan_Date__c ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Status</dt>
            <dd>{parent.Status__c}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
