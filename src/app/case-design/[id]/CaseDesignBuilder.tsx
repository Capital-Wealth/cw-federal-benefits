/**
 * CaseDesignBuilder — top-level layout: CW header, Vault sidebar (left), forms
 * (middle), react-flow diagram (right). Owns the household-asset state so the
 * form panel can prefill source positions from Meeting 1 intake assets.
 */
"use client";

import { useCallback, useState } from "react";
import type { CaseDesignBundle, CaseDesignParent } from "@/lib/case-design/types";
import type { MeetingIntakeAsset } from "@/lib/case-design/sf-client";
import { useCaseDesign } from "./useCaseDesign";
import VaultSidebar from "./VaultSidebar";
import FormPanels from "./FormPanels";
import Diagram from "./Diagram";

export default function CaseDesignBuilder({ bundle: initial }: { bundle: CaseDesignBundle }) {
  const hook = useCaseDesign(initial);
  const { bundle, saving, lastSavedAt, updateParent, updatePosition } = hook;
  const { parent } = bundle;
  const locked = parent.Status__c === "Locked";

  const [householdAssets, setHouseholdAssets] = useState<MeetingIntakeAsset[]>([]);
  const handleAssetsLoaded = useCallback((assets: MeetingIntakeAsset[]) => {
    setHouseholdAssets(assets);
  }, []);

  const generatePdf = async () => {
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
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "PDF generation failed");
    }
  };

  const finalize = async () => {
    if (
      !window.confirm(
        "Finalize this Case Design? Generates the PDF and uploads it to Salesforce. You can still edit afterward."
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/case-design/${parent.Id}/finalize`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Finalize failed (${res.status})`);
      }
      window.location.reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Finalize failed");
    }
  };

  const confirmAndCreate = async () => {
    const destCount = bundle.positions.filter((p) => p.Role__c === "Destination").length;
    if (
      !window.confirm(
        `Confirm & create ${destCount} child Opportunit${destCount === 1 ? "y" : "ies"}? This LOCKS the Case Design and creates a new Salesforce Opportunity for each destination. You cannot edit after confirming.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/case-design/${parent.Id}/confirm`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        childOpportunities?: { destinationId: string; opportunityId: string; name: string }[];
      };
      if (!res.ok) {
        throw new Error(data.error || `Confirm failed (${res.status})`);
      }
      const childCount = data.childOpportunities?.length ?? 0;
      window.alert(
        `Locked. Created ${childCount} child Opportunit${childCount === 1 ? "y" : "ies"} in Salesforce.`
      );
      window.location.reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Confirm failed");
    }
  };

  return (
    <main className="grid grid-cols-12 h-screen w-screen overflow-hidden bg-zinc-50">
      <header className="col-span-12 sticky top-0 z-40 bg-[#16253C] text-white px-5 py-3 flex items-center justify-between border-b-2 border-[#C7A356]">
        <div className="flex items-center gap-4 min-w-0">
          <img
            src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-color.png"
            alt="Capital Wealth"
            className="h-6 brightness-0 invert"
          />
          <div className="min-w-0">
            <h1 className="text-base font-bold truncate">
              {parent.Document_Title__c || "Retirement Money Map"}
            </h1>
            <p className="text-[11px] text-[#C7A356] truncate">{parent.Name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <span className="text-zinc-300">Plan Date</span>
            <input
              type="date"
              disabled={locked}
              value={parent.Plan_Date__c ?? ""}
              onChange={(e) => {
                void updateParent({ Plan_Date__c: e.target.value || null });
              }}
              className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs"
            />
          </label>
          <StatusPill status={parent.Status__c} />
        </div>

        <div className="flex items-center gap-3">
          <SaveIndicator saving={saving} lastSavedAt={lastSavedAt} />
          <button
            type="button"
            onClick={generatePdf}
            disabled={locked && !parent.PDF_ContentVersion_Id__c}
            className="px-3 py-1.5 text-xs font-medium bg-white text-[#16253C] rounded hover:bg-[#C7A356] hover:text-white disabled:opacity-50"
          >
            Generate PDF
          </button>
          {!locked && (
            <>
              <button
                type="button"
                onClick={finalize}
                className="px-3 py-1.5 text-xs font-medium bg-white/10 border border-white/20 text-white rounded hover:bg-white/20"
              >
                Finalize
              </button>
              <button
                type="button"
                onClick={confirmAndCreate}
                className="px-3 py-1.5 text-xs font-bold bg-[#C7A356] text-[#16253C] rounded hover:bg-[#D9B96E]"
                title="Locks the Case Design and creates child Opportunities in Salesforce for each destination."
              >
                Confirm & Create Opps
              </button>
            </>
          )}
        </div>
      </header>

      {locked && (
        <div className="col-span-12 bg-amber-100 border-b border-amber-300 px-5 py-2 text-xs text-amber-900">
          This Case Design is <strong>Locked</strong>
          {parent.Locked_At__c ? ` (${new Date(parent.Locked_At__c).toLocaleString()})` : ""}.
          Fields and the diagram are read-only.
        </div>
      )}

      <aside className="col-span-3 lg:col-span-2 overflow-y-auto border-r border-zinc-200 bg-white">
        <VaultSidebar caseDesignId={parent.Id} onAssetsLoaded={handleAssetsLoaded} />
      </aside>

      <section className="col-span-5 lg:col-span-4 overflow-y-auto border-r border-zinc-200 bg-zinc-50">
        <FormPanels
          bundle={bundle}
          hook={hook}
          householdAssets={householdAssets}
          readOnly={locked}
        />
      </section>

      <section className="col-span-4 lg:col-span-6 overflow-hidden bg-white">
        <Diagram bundle={bundle} updatePosition={updatePosition} readOnly={locked} />
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: CaseDesignParent["Status__c"] }) {
  const styles: Record<CaseDesignParent["Status__c"], string> = {
    Draft: "bg-zinc-200 text-zinc-800",
    Finalized: "bg-blue-200 text-blue-900",
    Presented: "bg-emerald-200 text-emerald-900",
    Locked: "bg-amber-200 text-amber-900",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function SaveIndicator({ saving, lastSavedAt }: { saving: boolean; lastSavedAt: Date | null }) {
  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[#C7A356]">
        <span className="inline-block w-2 h-2 rounded-full bg-[#C7A356] animate-pulse" />
        Saving…
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className="text-xs text-emerald-300">
        Saved {lastSavedAt.toLocaleTimeString()}
      </span>
    );
  }
  return <span className="text-xs text-zinc-400">No changes yet</span>;
}
