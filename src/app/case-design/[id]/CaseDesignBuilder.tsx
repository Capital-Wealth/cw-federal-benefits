/**
 * CaseDesignBuilder — top-level layout for the Money Map builder. Single-screen
 * design: navy header on top (workflow, plan chips, primary CTA), three-column
 * grid below (Sources | Diagram | Destinations), slide-in edit panel on
 * position click, and a floating drawer for advanced settings.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountType,
  CaseDesignBundle,
} from "@/lib/case-design/types";
import type { MeetingIntakeAsset } from "@/lib/case-design/sf-client";
import { useCaseDesign } from "./useCaseDesign";
import Diagram from "./Diagram";
import BuilderHeader from "./components/BuilderHeader";
import AccountColumn from "./components/AccountColumn";
import EditPanel from "./components/EditPanel";
import AdvancedDrawer, { AdvancedDrawerButton } from "./components/AdvancedDrawer";
import Celebrate from "./components/Celebrate";
import HouseholdSummaryStrip from "./components/HouseholdSummaryStrip";

type PlanType =
  | "Rollover"
  | "Replacement"
  | "Consolidation"
  | "LPOA"
  | "Roth Conversion"
  | "IUL Strategy"
  | "1035 Exchange"
  | "Tax Planning";

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

/** Derive a friendly household name to display in the header from the parent record. */
function deriveHouseholdLabel(parent: CaseDesignBundle["parent"]): string {
  // Prefer the live Account.Name from Salesforce (hydrated at load time);
  // strip the "- Household" suffix CW uses on household Account records so
  // "John & Cristi Porter - Household" reads as "John & Cristi Porter".
  const acct = (parent.Account_Name__c || "").trim();
  if (acct) {
    return acct
      .replace(/\s*[-—–]\s*Household\s*$/i, "")
      .replace(/\s+Household\s*$/i, "")
      .trim() || acct;
  }
  // Fallback: free-form Document_Title__c with "Money Map" suffix stripped.
  const t = (parent.Document_Title__c || "").trim();
  if (!t || t === "Retirement Money Map") return "Household";
  const cleaned = t
    .replace(/\s*Retirement Money Map$/i, "")
    .replace(/\s*Money Map$/i, "")
    .trim();
  return cleaned || "Household";
}

export default function CaseDesignBuilder({
  bundle: initial,
}: {
  bundle: CaseDesignBundle;
}) {
  const hook = useCaseDesign(initial);
  const {
    bundle,
    saving,
    lastSavedAt,
    refetch,
    updateParent,
    addPosition,
    updatePosition,
    deletePosition,
    addEdge,
    addSection,
    updateSection,
    deleteSection,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
  } = hook;
  const { parent } = bundle;
  const locked = parent.Status__c === "Locked";

  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [householdAssets, setHouseholdAssets] = useState<MeetingIntakeAsset[]>([]);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<
    null | { kind: "finalize" | "confirm"; message: string; onYes: () => void }
  >(null);
  const [celebration, setCelebration] = useState<null | { childOppCount: number }>(null);
  const [autoFilling, setAutoFilling] = useState(false);
  const autoFillTriedRef = useRef(false);
  const suggestTriedRef = useRef(false);

  // --- Load household assets once on mount (replaces the old VaultSidebar fetch). ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/case-design/${parent.Id}/vault-docs?include=assets`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          assets?: MeetingIntakeAsset[];
        };
        if (cancelled) return;
        setHouseholdAssets(data.assets ?? []);
      } catch {
        // Best-effort — intake loader simply won't appear.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parent.Id]);

  // --- Auto-dismiss toast after 4s ---
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // --- Listen for hook-level mutation errors (replaces window.alert) ---
  useEffect(() => {
    function onErr(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      setToast({ kind: "err", msg: detail || "Save failed" });
      e.preventDefault(); // signal hook that we handled it
    }
    window.addEventListener("cw-case-design-error", onErr);
    return () => window.removeEventListener("cw-case-design-error", onErr);
  }, []);

  // --- Auto-fill from Salesforce on first open ---
  //
  // Fires exactly once per browser session when a Draft Case Design loads with
  // zero positions. The server route is idempotent (refuses to fill when
  // positions already exist), so this is also safe against a double-fire on
  // strict-mode remount. Tries Meeting 1 Intake first, then falls back to the
  // household's Complete Opportunities — see loadAutoFillSources in sf-client.
  useEffect(() => {
    if (autoFillTriedRef.current) return;
    if (locked) return;
    if (parent.Status__c !== "Draft") return;
    if (bundle.positions.length > 0) return;
    autoFillTriedRef.current = true;
    setAutoFilling(true);
    (async () => {
      try {
        const res = await fetch(`/api/case-design/${parent.Id}/auto-fill`, {
          method: "POST",
        });
        const data = (await res.json().catch(() => ({}))) as {
          origin?: string;
          created?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || `Auto-fill failed (${res.status})`);
        if ((data.created ?? 0) > 0) {
          await refetch();
          const originLabel =
            data.origin === "meeting1-intake"
              ? "Meeting 1 intake"
              : data.origin === "opportunity"
                ? "Salesforce portfolio"
                : "Salesforce";
          setToast({
            kind: "ok",
            msg: `Auto-loaded ${data.created} source account${
              data.created === 1 ? "" : "s"
            } from ${originLabel}. Review and adjust each one.`,
          });
        }
      } catch (e) {
        // Surface as a non-blocking toast so the advisor knows the canvas is
        // theirs to build manually. Don't block — empty state still works.
        const msg = e instanceof Error ? e.message : "Auto-fill failed";
        setToast({ kind: "err", msg });
      } finally {
        setAutoFilling(false);
      }
    })();
  }, [parent.Id, parent.Status__c, locked, bundle.positions.length, refetch]);

  // --- Suggest destinations + draw consolidation edges ---
  //
  // Once sources are loaded, fire once if destinations and edges are both
  // empty. Server endpoint is idempotent (refuses to run if destinations or
  // edges exist), so this is also safe against strict-mode double-mount.
  // Skipped if the advisor has already drawn anything.
  useEffect(() => {
    if (suggestTriedRef.current) return;
    if (locked) return;
    if (parent.Status__c !== "Draft") return;
    if (autoFilling) return; // wait for auto-fill to finish
    const sourceCount = bundle.positions.filter((p) => p.Role__c === "Source").length;
    const destCount = bundle.positions.filter((p) => p.Role__c === "Destination").length;
    if (sourceCount === 0) return;
    if (destCount > 0) return;
    if (bundle.edges.length > 0) return;
    suggestTriedRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/case-design/${parent.Id}/suggest-destinations`, {
          method: "POST",
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          destinationsCreated?: number;
          edgesCreated?: number;
          groups?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || `Suggest failed (${res.status})`);
        if ((data.destinationsCreated ?? 0) > 0) {
          await refetch();
          setToast({
            kind: "ok",
            msg: `Drafted ${data.destinationsCreated} destination${
              data.destinationsCreated === 1 ? "" : "s"
            } and ${data.edgesCreated} consolidation arrow${
              data.edgesCreated === 1 ? "" : "s"
            }. Review and adjust.`,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Suggest failed";
        setToast({ kind: "err", msg });
      }
    })();
  }, [
    parent.Id,
    parent.Status__c,
    locked,
    autoFilling,
    bundle.positions,
    bundle.edges.length,
    refetch,
  ]);

  const householdLabel = useMemo(() => deriveHouseholdLabel(parent), [parent]);

  const sources = bundle.positions.filter((p) => p.Role__c === "Source");
  const destinations = bundle.positions.filter(
    (p) => p.Role__c === "Destination"
  );
  const childOppCount = destinations.length;

  const intakeLinkedCount = sources.filter((p) => p.Source_Asset__c).length;
  const selectedPosition = selectedPositionId
    ? bundle.positions.find((p) => p.Id === selectedPositionId) ?? null
    : null;

  // --- Mutations ----------------------------------------------------------

  // Owner_Label__c and Custodian__c are SF-required (required=true at the field
  // level). Empty strings get rejected with REQUIRED_FIELD_MISSING, so we seed
  // legible placeholder text that the advisor overwrites in the EditPanel.
  const handleAddSource = useCallback(async () => {
    const id = await addPosition({
      Role__c: "Source",
      Owner_Label__c: "Client",
      Account_Type__c: "IRA",
      Custodian__c: "—",
    });
    setSelectedPositionId(id);
  }, [addPosition]);

  const handleAddDestination = useCallback(async () => {
    const id = await addPosition({
      Role__c: "Destination",
      Owner_Label__c: "Client",
      Account_Type__c: "IRA",
      Custodian__c: "—",
    });
    setSelectedPositionId(id);
  }, [addPosition]);

  const handleLoadIntake = useCallback(async () => {
    if (householdAssets.length === 0) return;
    const linkedIds = new Set(
      sources.map((p) => p.Source_Asset__c).filter((x): x is string => !!x)
    );
    const toLoad = householdAssets.filter((a) => !linkedIds.has(a.Id));
    if (toLoad.length === 0) return;
    for (const a of toLoad) {
      const amount = a.Balance__c ?? a.Market_Value__c ?? null;
      // Intake fields can be blank; fall back to placeholders so the SF
      // required-field check passes on create.
      await addPosition({
        Role__c: "Source",
        Source_Asset__c: a.Id,
        Owner_Label__c: a.Asset_Owner__c?.trim() || "Client",
        Custodian__c: a.Company__c?.trim() || "—",
        Account_Type__c: inferAccountType(a),
        Amount__c: amount,
        Cash_Value__c: a.Cash_Value__c ?? null,
        Death_Benefit__c: a.Death_Benefit__c ?? null,
      });
    }
    setToast({
      kind: "ok",
      msg: `Loaded ${toLoad.length} source account${toLoad.length === 1 ? "" : "s"} from Meeting 1 intake.`,
    });
  }, [householdAssets, sources, addPosition]);

  const togglePlanType = useCallback(
    (pt: PlanType) => {
      if (locked) return;
      const current = new Set(
        (parent.Plan_Type__c || "").split(";").filter(Boolean) as PlanType[]
      );
      if (current.has(pt)) current.delete(pt);
      else current.add(pt);
      void updateParent({ Plan_Type__c: Array.from(current).join(";") });
    },
    [locked, parent.Plan_Type__c, updateParent]
  );

  // --- Server actions -----------------------------------------------------

  const downloadPdf = useCallback(async () => {
    try {
      const res = await fetch(`/api/case-design/${parent.Id}/pdf`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `PDF generation failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${parent.Document_Title__c || "Case_Design"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast({ kind: "ok", msg: "PDF downloaded." });
    } catch (e) {
      setToast({
        kind: "err",
        msg: e instanceof Error ? e.message : "PDF generation failed",
      });
    }
  }, [parent.Id, parent.Document_Title__c]);

  const softFinalize = useCallback(() => {
    setConfirmingAction({
      kind: "finalize",
      message:
        "Generate the PDF, upload it to Salesforce, and mark this Case Design as Finalized. You can still edit afterward; no Opportunities are created.",
      onYes: async () => {
        setConfirmingAction(null);
        try {
          const res = await fetch(`/api/case-design/${parent.Id}/finalize`, { method: "POST" });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error || `Finalize failed (${res.status})`);
          }
          setToast({ kind: "ok", msg: "Finalized. PDF uploaded to Salesforce." });
          // Refresh parent state — full reload simplest.
          setTimeout(() => window.location.reload(), 400);
        } catch (e) {
          setToast({
            kind: "err",
            msg: e instanceof Error ? e.message : "Finalize failed",
          });
        }
      },
    });
  }, [parent.Id]);

  const confirmAndCreate = useCallback(() => {
    const destCount = destinations.length;
    setConfirmingAction({
      kind: "confirm",
      message: `Confirm & create ${destCount} child Opportunit${destCount === 1 ? "y" : "ies"}? This LOCKS the Case Design and creates a new Salesforce Opportunity for each destination. You cannot edit after confirming.`,
      onYes: async () => {
        setConfirmingAction(null);
        try {
          const res = await fetch(`/api/case-design/${parent.Id}/confirm`, { method: "POST" });
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            childOpportunities?: { destinationId: string; opportunityId: string; name: string }[];
          };
          if (!res.ok) {
            throw new Error(data.error || `Confirm failed (${res.status})`);
          }
          const n = data.childOpportunities?.length ?? 0;
          setCelebration({ childOppCount: n });
        } catch (e) {
          setToast({
            kind: "err",
            msg: e instanceof Error ? e.message : "Confirm failed",
          });
        }
      },
    });
  }, [destinations.length, parent.Id]);

  // --- Render -------------------------------------------------------------

  return (
    <main className="h-screen w-screen overflow-hidden bg-zinc-50 flex flex-col">
      <BuilderHeader
        parent={parent}
        householdLabel={householdLabel}
        saving={saving}
        lastSavedAt={lastSavedAt}
        sourceCount={sources.length}
        destinationCount={destinations.length}
        childOppCount={childOppCount}
        onTogglePlanType={togglePlanType}
        onUpdateParent={(p) => void updateParent(p)}
        onGeneratePdf={downloadPdf}
        onSoftFinalize={softFinalize}
        onConfirmAndCreate={confirmAndCreate}
        onDownloadPdf={downloadPdf}
        onToggleAdvanced={() => setAdvancedOpen((x) => !x)}
        advancedOpen={advancedOpen}
      />

      {/* Household summary strip — instant context for "what are we working with" */}
      <HouseholdSummaryStrip bundle={bundle} householdLabel={householdLabel} />

      {/* State banners */}
      {parent.Status__c === "Finalized" && !locked && (
        <StateBanner
          tone="info"
          icon="check"
          text={
            <>
              PDF generated{" "}
              {parent.Finalized_At__c
                ? `${new Date(parent.Finalized_At__c).toLocaleString()}`
                : ""}
              {" · "}Ready to confirm with the client.
            </>
          }
        />
      )}
      {locked && (
        <StateBanner
          tone="warn"
          icon="lock"
          text={
            <>
              Locked
              {parent.Locked_At__c
                ? ` ${new Date(parent.Locked_At__c).toLocaleDateString()}`
                : ""}
              {" · "}
              {childOppCount} child Opportunit{childOppCount === 1 ? "y" : "ies"} created.
              All fields are read-only.
            </>
          }
        />
      )}

      {/* 3-column work area */}
      <div className="grid grid-cols-12 flex-1 min-h-0">
        <div className="col-span-3 min-h-0">
          <AccountColumn
            role="Source"
            positions={sources}
            selectedPositionId={selectedPositionId}
            pickingReplacementFor={null}
            intakeAssets={householdAssets}
            intakeLoaded={intakeLinkedCount}
            readOnly={locked}
            onSelect={setSelectedPositionId}
            onAdd={() => void handleAddSource()}
            onLoadIntake={() => void handleLoadIntake()}
            onPickReplacement={() => {
              /* no-op on Sources column */
            }}
          />
        </div>

        <div className="col-span-6 min-h-0 relative">
          <Diagram
            bundle={bundle}
            householdLabel={householdLabel}
            selectedPositionId={selectedPositionId}
            intakeAssetCount={householdAssets.length}
            readOnly={locked}
            autoFilling={autoFilling}
            onSelectNode={setSelectedPositionId}
            onAddSource={() => void handleAddSource()}
            onLoadIntake={() => void handleLoadIntake()}
            updatePosition={updatePosition}
            addEdge={addEdge}
          />
        </div>

        <div className="col-span-3 min-h-0">
          <AccountColumn
            role="Destination"
            positions={destinations}
            selectedPositionId={selectedPositionId}
            pickingReplacementFor={null}
            intakeAssets={householdAssets}
            intakeLoaded={intakeLinkedCount}
            readOnly={locked}
            onSelect={setSelectedPositionId}
            onAdd={() => void handleAddDestination()}
            onLoadIntake={() => void handleLoadIntake()}
            onPickReplacement={() => {
              /* no-op for now */
            }}
          />
        </div>
      </div>

      {/* Floating advanced drawer button */}
      <AdvancedDrawerButton
        onClick={() => setAdvancedOpen((x) => !x)}
        isOpen={advancedOpen}
      />

      <AdvancedDrawer
        open={advancedOpen}
        bundle={bundle}
        hook={{
          updateParent,
          addSection,
          updateSection,
          deleteSection,
          addAnnotation,
          updateAnnotation,
          deleteAnnotation,
        }}
        readOnly={locked}
        onClose={() => setAdvancedOpen(false)}
      />

      {selectedPosition && (
        <EditPanel
          key={selectedPosition.Id}
          position={selectedPosition}
          bundle={bundle}
          readOnly={locked}
          onClose={() => setSelectedPositionId(null)}
          onUpdate={updatePosition}
          onDelete={deletePosition}
        />
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {confirmingAction && (
        <ConfirmDialog
          message={confirmingAction.message}
          confirmLabel={
            confirmingAction.kind === "confirm" ? "Lock & create Opps" : "Finalize"
          }
          onCancel={() => setConfirmingAction(null)}
          onConfirm={confirmingAction.onYes}
          danger={confirmingAction.kind === "confirm"}
        />
      )}

      {celebration && (
        <Celebrate
          childOppCount={celebration.childOppCount}
          onDone={() => {
            setCelebration(null);
            window.location.reload();
          }}
        />
      )}
    </main>
  );
}

/* ---------------- Status banner ---------------- */

function StateBanner({
  tone,
  icon,
  text,
}: {
  tone: "info" | "warn";
  icon: "check" | "lock";
  text: React.ReactNode;
}) {
  const cls =
    tone === "info"
      ? "bg-blue-50 border-blue-200 text-blue-900"
      : "bg-amber-50 border-amber-200 text-amber-900";
  return (
    <div
      className={`px-5 py-2 border-b text-xs flex items-center gap-2 ${cls}`}
      role="status"
    >
      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icon === "check" ? (
          <path d="M5 13l4 4L19 7" />
        ) : (
          <>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </>
        )}
      </svg>
      <span>{text}</span>
    </div>
  );
}

/* ---------------- Toast ---------------- */

function Toast({
  kind,
  msg,
  onClose,
}: {
  kind: "ok" | "err";
  msg: string;
  onClose: () => void;
}) {
  const cls =
    kind === "ok"
      ? "bg-[#16253C] border-[#C7A356] text-white"
      : "bg-rose-50 border-rose-300 text-rose-900";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 max-w-md z-50 px-4 py-3 border rounded-lg shadow-xl text-sm flex items-start gap-3 ${cls}`}
    >
      <svg
        className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
          kind === "ok" ? "text-[#C7A356]" : "text-rose-700"
        }`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {kind === "ok" ? (
          <path d="M5 13l4 4L19 7" />
        ) : (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </>
        )}
      </svg>
      <span className="flex-1">{msg}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className={`-mr-1 -mt-1 w-6 h-6 inline-flex items-center justify-center rounded cursor-pointer transition-colors duration-200 motion-reduce:transition-none ${
          kind === "ok" ? "hover:bg-white/10" : "hover:bg-rose-200"
        }`}
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/* ---------------- Confirmation dialog (replaces window.confirm) ---------------- */

function ConfirmDialog({
  message,
  confirmLabel,
  onCancel,
  onConfirm,
  danger,
}: {
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
        role="alertdialog"
        aria-modal="true"
      >
        <h3 className="text-base font-bold text-[#16253C] mb-2">
          {danger ? "Lock this Case Design?" : "Finalize?"}
        </h3>
        <p className="text-sm text-zinc-700 leading-relaxed mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 min-h-[40px] text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-md cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 motion-reduce:transition-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 min-h-[40px] text-sm font-bold rounded-md cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 motion-reduce:transition-none ${
              danger
                ? "bg-[#C7A356] text-[#16253C] hover:bg-[#D9B96E]"
                : "bg-[#16253C] text-white hover:bg-[#1E3456]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
