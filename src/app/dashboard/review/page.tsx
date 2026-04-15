"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface ReviewData {
  intake: {
    id: string;
    name: string;
    status: string;
    confidence: number | null;
    parsedDate: string | null;
    fieldsNeedingReview: string | null;
    reportGenerated: boolean;
  };
  documents: {
    id: string;
    file_name: string;
    document_type: string;
    file_size: number;
    parsed: boolean;
    confidence: number | null;
    uploaded_at: string;
  }[];
  documentChecklist: Record<string, boolean>;
  extracted: {
    employment: Record<string, unknown>;
    tsp: Record<string, unknown>;
    insurance: Record<string, unknown>;
    socialSecurity: Record<string, unknown>;
    military: Record<string, unknown>;
    survivor: Record<string, unknown>;
    deductions: Record<string, unknown>;
  };
}

const DOC_LABELS: Record<string, string> = {
  LES: "Leave & Earnings Statement",
  SF50: "SF-50 (Personnel Action)",
  TSP_Statement: "TSP Statement",
  DD214: "DD-214 (Military)",
  PSB: "Benefits Statement",
  SS_Statement: "Social Security Statement",
};

function formatCurrency(val: unknown): string {
  if (val == null) return "--";
  return "$" + Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatField(key: string, val: unknown): string {
  if (val == null || val === "") return "--";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number" && (key.includes("Salary") || key.includes("Total") || key.includes("Benefit") || key.includes("Premium") || key.includes("Tax") || key.includes("Contribution") || key.includes("tax") || key.includes("premium") || key.includes("retirement") || key.includes("medicare"))) {
    return formatCurrency(val);
  }
  return String(val);
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-zinc-50"><p className="text-zinc-500">Loading review...</p></div>}>
      <ReviewContent />
    </Suspense>
  );
}

function ReviewContent() {
  const searchParams = useSearchParams();
  const intakeId = searchParams.get("id");

  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!intakeId) return;
    fetch(`/api/dashboard/review?id=${intakeId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || "Failed");
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [intakeId]);

  if (!intakeId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <p className="text-zinc-500">No intake ID provided</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <p className="text-zinc-500">Loading review...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <p className="text-red-600">{error || "Failed to load"}</p>
      </div>
    );
  }

  const { intake, documents, documentChecklist, extracted } = data;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-8 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <a href="/dashboard" className="text-sm text-emerald-600 hover:text-emerald-800 mb-1 block">
              &larr; Back to Pipeline
            </a>
            <h1 className="text-xl font-semibold text-zinc-900">
              Review: {intake.name}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {intake.confidence != null && (
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                intake.confidence >= 80 ? "bg-emerald-100 text-emerald-700" :
                intake.confidence >= 60 ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700"
              }`}>
                {intake.confidence}% AI Confidence
              </span>
            )}
            <span className="text-sm font-medium px-3 py-1 rounded-full bg-zinc-100 text-zinc-600">
              {intake.status}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-8 space-y-6">
        {/* Fields Needing Review */}
        {intake.fieldsNeedingReview && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-amber-900 mb-2">Fields Flagged for Review</h2>
            <pre className="text-sm text-amber-800 whitespace-pre-wrap">{intake.fieldsNeedingReview}</pre>
          </div>
        )}

        {/* Document Checklist */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Document Checklist</h2>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(DOC_LABELS).map(([key, label]) => (
              <div key={key} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                documentChecklist[key] ? "bg-emerald-50 border border-emerald-200" : "bg-zinc-50 border border-zinc-200"
              }`}>
                <span className={documentChecklist[key] ? "text-emerald-600" : "text-zinc-300"}>
                  {documentChecklist[key] ? "\u2713" : "\u25CB"}
                </span>
                <span className={`text-sm ${documentChecklist[key] ? "text-emerald-900 font-medium" : "text-zinc-500"}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Uploaded files */}
          {documents.length > 0 && (
            <div className="mt-4 space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-sm px-3 py-2 bg-zinc-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span>{doc.parsed ? "\u2705" : "\u23F3"}</span>
                    <span className="font-medium text-zinc-900">{doc.file_name}</span>
                    <span className="text-zinc-400">({DOC_LABELS[doc.document_type] || doc.document_type})</span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {doc.confidence != null ? `${doc.confidence}% confidence` : ""}
                    {" "}{Math.round(doc.file_size / 1024)}KB
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Extracted Data — Employment */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Employment & Retirement</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {Object.entries(extracted.employment).map(([key, val]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-zinc-500">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                <span className="font-medium text-zinc-900">{formatField(key, val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* TSP */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">TSP (Thrift Savings Plan)</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {Object.entries(extracted.tsp).map(([key, val]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-zinc-500">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                <span className="font-medium text-zinc-900">{formatField(key, val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Insurance */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">FEGLI & FEHB Insurance</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {Object.entries(extracted.insurance).map(([key, val]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-zinc-500">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                <span className="font-medium text-zinc-900">{formatField(key, val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Social Security + Military + Survivor in one row */}
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Social Security</h3>
            {Object.entries(extracted.socialSecurity).map(([key, val]) => (
              <div key={key} className="flex justify-between text-sm mb-2">
                <span className="text-zinc-500">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                <span className="font-medium text-zinc-900">{formatField(key, val)}</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Military Service</h3>
            {Object.entries(extracted.military).map(([key, val]) => (
              <div key={key} className="flex justify-between text-sm mb-2">
                <span className="text-zinc-500">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                <span className="font-medium text-zinc-900">{formatField(key, val)}</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Survivor Benefits</h3>
            {Object.entries(extracted.survivor).map(([key, val]) => (
              <div key={key} className="flex justify-between text-sm mb-2">
                <span className="text-zinc-500">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                <span className="font-medium text-zinc-900">{formatField(key, val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* LES Deductions */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">LES Deductions (Biweekly)</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {Object.entries(extracted.deductions).map(([key, val]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-zinc-500">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                <span className="font-medium text-zinc-900">{formatField(key, val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-4 pt-4">
          <a href={`https://capitalwealth.my.salesforce.com/lightning/r/Federal_Benefits_Intake__c/${intake.id}/view`}
            target="_blank" rel="noopener noreferrer"
            className="px-5 py-2.5 border border-zinc-300 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Edit in Salesforce
          </a>
          {!intake.reportGenerated && (
            <button
              onClick={async () => {
                await fetch("/api/dashboard/report", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ intakeId: intake.id }),
                });
                window.location.reload();
              }}
              className="px-5 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800">
              Generate Retirement Money Map Report
            </button>
          )}
          {intake.reportGenerated && (
            <span className="px-5 py-2.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium">
              Report Generated
            </span>
          )}
        </div>
      </main>
    </div>
  );
}
