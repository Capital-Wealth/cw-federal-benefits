"use client";

import { useState, useEffect, useCallback } from "react";
import {
  SECTIONS,
  ASSET_FIELDS,
  ASSET_CATEGORIES,
  ALL_FIELD_APIS,
  type FieldDef,
} from "@/lib/meeting1/fields";

type FieldValue = string | boolean | number | null;
type RecordMap = Record<string, FieldValue>;
interface AssetRow {
  Id?: string;
  Category__c: string;
  [key: string]: FieldValue | undefined;
}

export default function Meeting1Form({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string>("");
  const [intakeName, setIntakeName] = useState<string>("");
  const [record, setRecord] = useState<RecordMap>({});
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // ---- load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/meeting1/session?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Could not load this intake.");
          return;
        }
        setAccountName(data.accountName || "");
        setIntakeName(data.intakeName || "");
        const rec: RecordMap = {};
        for (const api of ALL_FIELD_APIS) {
          const v = data.record?.[api];
          rec[api] = v === undefined ? null : (v as FieldValue);
        }
        setRecord(rec);
        const incoming = Array.isArray(data.assets) ? data.assets : [];
        setAssets(
          incoming.map(
            (a: Record<string, FieldValue>): AssetRow => ({
              Id: (a.Id as string) || undefined,
              Category__c: (a.Category__c as string) || ASSET_CATEGORIES[0],
              ...a,
            })
          )
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const setField = useCallback((api: string, value: FieldValue) => {
    setRecord((r) => ({ ...r, [api]: value }));
  }, []);

  // ---- assets ----
  const addAsset = () =>
    setAssets((a) => [...a, { Category__c: ASSET_CATEGORIES[0] }]);
  const removeAsset = (i: number) =>
    setAssets((a) => a.filter((_, idx) => idx !== i));
  const setAssetField = (i: number, api: string, value: FieldValue) =>
    setAssets((a) => a.map((row, idx) => (idx === i ? { ...row, [api]: value } : row)));

  // ---- payload ----
  const buildPayload = () => {
    const fields: RecordMap = {};
    for (const api of ALL_FIELD_APIS) {
      const v = record[api];
      if (v !== undefined) fields[api] = v;
    }
    const assetPayload = assets
      .filter((a) => a.Category__c)
      .map((a) => {
        const out: Record<string, FieldValue | undefined> = { Category__c: a.Category__c };
        for (const f of ASSET_FIELDS) {
          if (f.forCategories.includes(a.Category__c) && a[f.api] != null && a[f.api] !== "") {
            out[f.api] = a[f.api];
          }
        }
        return out;
      });
    return { token, fields, assets: assetPayload };
  };

  const doSave = async (complete: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meeting1/${complete ? "complete" : "save"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed.");
        return;
      }
      if (complete) {
        setDone(true);
      } else {
        setSavedAt(new Date().toLocaleTimeString());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  // ---- render states ----
  if (loading) {
    return (
      <Shell>
        <p className="text-slate-500">Loading intake…</p>
      </Shell>
    );
  }
  if (error && Object.keys(record).length === 0) {
    return (
      <Shell>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      </Shell>
    );
  }
  if (done) {
    return (
      <Shell>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-xl font-semibold text-emerald-800">Intake complete</h2>
          <p className="mt-2 text-emerald-700">
            Saved back to Salesforce. Before you hang up, confirm the two next steps out loud:
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-emerald-700">
            <li>The advisor builds their Retirement Money Map — fee analysis, risk assessment, income plan.</li>
            <li>
              They&apos;ll get an email with a risk-tolerance questionnaire, an expense plan, and a
              secure upload link for statements, Social Security, and tax returns.
            </li>
          </ol>
          <p className="mt-3 font-medium text-emerald-800">
            And make sure Meeting 2 is on the calendar before the call ends.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-blue-600">
          Meeting 1 — Discovery Visit
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">
          {accountName || "Intake"}{" "}
          {intakeName && <span className="text-slate-400">· {intakeName}</span>}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          You&apos;re the guide — they&apos;re the hero. This is the introduction, not the
          commitment. Take the vitals; the advisor is the doctor in Meeting 2.
        </p>
      </header>

      {SECTIONS.map((section) => (
        <section
          key={section.id}
          className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
          <div className="mt-2 space-y-1.5 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
            {section.coaching.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {section.fields.map((f) => (
              <Field
                key={f.api}
                def={f}
                value={record[f.api] ?? null}
                onChange={(v) => setField(f.api, v)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Assets */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Accounts, Assets &amp; Policies</h2>
        <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          One row per item — investments, real estate, life insurance. This is the inventory the
          advisor builds the Retirement Money Map from.
        </p>
        <div className="mt-4 space-y-4">
          {assets.map((row, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-base"
                  value={row.Category__c}
                  onChange={(e) => setAssetField(i, "Category__c", e.target.value)}
                >
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeAsset(i)}
                  className="text-sm font-medium text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ASSET_FIELDS.filter((f) => f.forCategories.includes(row.Category__c)).map((f) => (
                  <Field
                    key={f.api}
                    def={f}
                    value={(row[f.api] as FieldValue) ?? null}
                    onChange={(v) => setAssetField(i, f.api, v)}
                  />
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addAsset}
            className="rounded-md border border-dashed border-slate-400 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            + Add a row
          </button>
        </div>
      </section>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <span className="text-sm text-slate-500">
          {savedAt ? `Progress saved at ${savedAt}` : "Not saved yet"}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => doSave(false)}
            className="rounded-md border border-slate-300 px-4 py-2.5 text-base font-medium text-slate-700 disabled:opacity-50"
          >
            Save Progress
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => doSave(true)}
            className="rounded-md bg-blue-600 px-5 py-2.5 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Complete Intake"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
    </div>
  );
}

function Field({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  const base =
    "w-full rounded-md border border-slate-300 px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  if (def.type === "checkbox") {
    return (
      <label className="flex items-center gap-3 sm:col-span-2">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 rounded border-slate-300"
        />
        <span className="text-base text-slate-800">{def.label}</span>
      </label>
    );
  }

  const labelEl = (
    <span className="mb-1 block text-sm font-medium text-slate-700">{def.label}</span>
  );
  const strVal = value == null ? "" : String(value);

  if (def.type === "longtext") {
    return (
      <label className="sm:col-span-2">
        {labelEl}
        <textarea
          rows={3}
          className={base}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        />
        {def.help && <span className="mt-1 block text-xs text-slate-400">{def.help}</span>}
      </label>
    );
  }

  if (def.type === "picklist") {
    return (
      <label>
        {labelEl}
        <select className={base} value={strVal} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {(def.options || []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const inputType =
    def.type === "date" ? "date" : def.type === "number" ? "number" : "text";
  const inputMode =
    def.type === "currency" || def.type === "percent" || def.type === "number"
      ? ("decimal" as const)
      : undefined;

  return (
    <label>
      {labelEl}
      <div className="relative">
        {def.type === "currency" && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            $
          </span>
        )}
        <input
          type={inputType}
          inputMode={inputMode}
          className={`${base} ${def.type === "currency" ? "pl-7" : ""}`}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        />
        {def.type === "percent" && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            %
          </span>
        )}
      </div>
      {def.help && <span className="mt-1 block text-xs text-slate-400">{def.help}</span>}
    </label>
  );
}
