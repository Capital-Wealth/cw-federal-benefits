"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  SECTIONS,
  ASSET_FIELDS,
  ASSET_CATEGORIES,
  ALL_FIELD_APIS,
  type FieldDef,
} from "@/lib/meeting1/fields";

// Capital Wealth brand
const NAVY = "#16253C";
const GOLD = "#C7A356";
const LOGO_WHITE =
  "https://www.capitalwealth.com/assets/images/logos/logo-horizontal-white.png";

type FieldValue = string | boolean | number | null;
type RecordMap = Record<string, FieldValue>;
interface AssetRow {
  Id?: string;
  Category__c: string;
  [key: string]: FieldValue | undefined;
}

/** Fields that don't count toward "prefilled" — they're set by Apex on every create. */
const SYSTEM_PREFILL_KEYS = new Set([
  "Status__c",
  "Intake_Date__c",
  "Builder_URL__c",
]);

function isPrefilled(api: string, v: FieldValue): boolean {
  if (SYSTEM_PREFILL_KEYS.has(api)) return false;
  if (v === null || v === undefined) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  if (typeof v === "boolean" && v === false) return false;
  return true;
}

// Sections kept visible by default in Introductory-Meeting mode (Lead-side, 30-min discovery).
// Everything else collapses behind "Show full intake (Meeting 1)". Per 5/21 spec.
const INTRO_KEY_SECTIONS = new Set(["opener", "background"]);

export default function Meeting1Form({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [intakeName, setIntakeName] = useState("");
  const [record, setRecord] = useState<RecordMap>({});
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [prefilledCount, setPrefilledCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [done, setDone] = useState(false);
  const [isIntro, setIsIntro] = useState(false);
  const [showFullIntake, setShowFullIntake] = useState(false);
  const toastTimer = useRef<number | null>(null);

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
        // Lead-side intakes have no Account → render Introductory-Meeting mode.
        const introMode = Boolean(data.leadId) && !data.accountName;
        setIsIntro(introMode);
        setShowFullIntake(!introMode);

        const rec: RecordMap = {};
        let prefilled = 0;
        for (const api of ALL_FIELD_APIS) {
          const v = data.record?.[api];
          rec[api] = v === undefined ? null : (v as FieldValue);
          if (isPrefilled(api, rec[api])) prefilled++;
        }
        setRecord(rec);
        setPrefilledCount(prefilled);

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

  const addAsset = () =>
    setAssets((a) => [...a, { Category__c: ASSET_CATEGORIES[0] }]);
  const removeAsset = (i: number) =>
    setAssets((a) => a.filter((_, idx) => idx !== i));
  const setAssetField = (i: number, api: string, value: FieldValue) =>
    setAssets((a) => a.map((row, idx) => (idx === i ? { ...row, [api]: value } : row)));

  const sectionProgress = useMemo(() => {
    // count sections that have ≥1 non-empty field as "started"
    let started = 0;
    for (const s of SECTIONS) {
      for (const f of s.fields) {
        const v = record[f.api];
        if (isPrefilled(f.api, v ?? null)) {
          started++;
          break;
        }
      }
    }
    return { started, total: SECTIONS.length };
  }, [record]);

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
        const at = new Date().toLocaleTimeString();
        setSavedAt(at);
        setShowToast(true);
        if (toastTimer.current) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setShowToast(false), 2200);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  // ---- render ----
  if (loading) {
    return (
      <Frame>
        <p className="mt-8 text-zinc-700">Loading intake…</p>
      </Frame>
    );
  }
  if (error && Object.keys(record).length === 0) {
    return (
      <Frame>
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      </Frame>
    );
  }
  if (done) {
    return <DoneScreen accountName={accountName} />;
  }

  return (
    <Frame
      header={
        <HeaderBar
          accountName={accountName}
          intakeName={intakeName}
          progress={sectionProgress}
          isIntro={isIntro}
        />
      }
    >
      {prefilledCount > 0 && (
        <div
          className="mt-5 mb-4 rounded-md border-l-4 px-4 py-3 text-sm"
          style={{ borderLeftColor: GOLD, backgroundColor: "#FFFBEC", color: NAVY }}
        >
          <span className="font-semibold">
            {prefilledCount} {prefilledCount === 1 ? "field" : "fields"} pre-filled from Salesforce.
          </span>{" "}
          Edit anything you need to correct.
        </div>
      )}

      {isIntro ? (
        <IntroScriptPanel />
      ) : (
        <p className="mb-6 text-[15px] leading-relaxed text-zinc-700">
          You&apos;re the guide — they&apos;re the hero. This is Meeting&nbsp;1: take the
          vitals, not diagnose. The advisor is the doctor in Meeting&nbsp;2.
        </p>
      )}

      {SECTIONS.map((section, idx) => {
        const isKey = INTRO_KEY_SECTIONS.has(section.id);
        if (isIntro && !isKey && !showFullIntake) return null;
        return (
        <section
          key={section.id}
          className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <header className="flex items-baseline gap-3">
            <span
              className="font-mono text-sm font-bold tabular-nums"
              style={{ color: GOLD }}
            >
              §{String(idx + 1).padStart(2, "0")}
            </span>
            <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
              {section.title}
            </h2>
          </header>
          {section.coaching.length > 0 && (
            <div
              className="mt-3 space-y-1.5 rounded-md border-l-4 px-4 py-2.5 text-[15px] leading-relaxed"
              style={{ borderLeftColor: GOLD, backgroundColor: "#F7F4ED", color: NAVY }}
            >
              {section.coaching.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
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
        );
      })}

      {isIntro && !showFullIntake && (
        <button
          type="button"
          onClick={() => setShowFullIntake(true)}
          className="mb-6 w-full rounded-md border-2 border-dashed px-4 py-3 text-sm font-medium hover:bg-zinc-50"
          style={{ borderColor: GOLD, color: NAVY }}
        >
          Show full intake (Meeting 1) — only do this if scope has changed
        </button>
      )}

      {/* Assets — hidden in Introductory Meeting mode unless rep expands the full intake */}
      {(!isIntro || showFullIntake) && (
      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <header className="flex items-baseline gap-3">
          <span
            className="font-mono text-sm font-bold tabular-nums"
            style={{ color: GOLD }}
          >
            §10
          </span>
          <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
            Accounts, Assets &amp; Policies
          </h2>
        </header>
        <p
          className="mt-3 rounded-md border-l-4 px-4 py-2.5 text-[15px] leading-relaxed"
          style={{ borderLeftColor: GOLD, backgroundColor: "#F7F4ED", color: NAVY }}
        >
          One row per item — investments, real estate, life insurance. This is the
          inventory the advisor builds the Retirement Money Map from.
        </p>
        <div className="mt-4 space-y-4">
          {assets.length === 0 && (
            <p className="text-sm text-zinc-700">
              No items yet — add one when you&apos;re ready.
            </p>
          )}
          {assets.map((row, i) => (
            <div key={i} className="rounded-lg border border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <select
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base text-[#16253C] focus:border-[color:var(--cw-navy)] focus:outline-none focus:ring-1"
                  style={{ ["--cw-navy" as string]: NAVY, colorScheme: "light" }}
                  value={row.Category__c}
                  onChange={(e) => {
                    const nextCategory = e.target.value;
                    setAssets((a) =>
                      a.map((r, idx) => {
                        if (idx !== i) return r;
                        const cleaned: AssetRow = { Id: r.Id, Category__c: nextCategory };
                        for (const f of ASSET_FIELDS) {
                          if (f.forCategories.includes(nextCategory) && r[f.api] != null) {
                            cleaned[f.api] = r[f.api];
                          }
                        }
                        return cleaned;
                      })
                    );
                  }}
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
            className="rounded-md border border-dashed px-4 py-2 text-sm font-medium hover:bg-zinc-50"
            style={{ borderColor: GOLD, color: NAVY }}
          >
            + Add a row
          </button>
        </div>
      </section>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Sticky action bar */}
      <div
        className="sticky bottom-0 -mx-4 border-t-2 px-4 py-3 backdrop-blur"
        style={{ borderTopColor: NAVY, backgroundColor: "rgba(255,255,255,0.96)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-700">
            {savedAt ? `Last saved ${savedAt}` : "Not saved yet — your progress lives only in this tab."}
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => doSave(false)}
              className="rounded-md border-2 px-4 py-2.5 text-base font-medium disabled:opacity-50"
              style={{ borderColor: NAVY, color: NAVY }}
            >
              Save Progress
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => doSave(true)}
              className="rounded-md px-5 py-2.5 text-base font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: NAVY }}
            >
              {saving ? "Saving…" : "Complete Intake"}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      <div
        className="pointer-events-none fixed bottom-20 left-1/2 z-30 -translate-x-1/2"
        role="status"
        aria-live="polite"
      >
        {showToast && (
          <div className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            Progress saved
          </div>
        )}
      </div>
    </Frame>
  );
}

// ---------- subcomponents ----------

/**
 * Rep-facing script panel at the top of the Vercel /meeting1 Introductory form.
 * Content sourced from cw-salesforce-metadata/docs/sales-scripts/federal_call1_and_intro_meeting_v1.md
 * (the "What goes at the top..." section, per Ann + Mike 5/21 sales meeting).
 */
function IntroScriptPanel() {
  const checklist: { lead: string; rest: string }[] = [
    {
      lead: "This is discovery, not pitching.",
      rest: " 30 minutes, 100% client-driven, zero answers given today.",
    },
    {
      lead: "Ask the three non-negotiables first:",
      rest: " (1) When do you want to retire? (2) Service Computation Date? (3) Survivor benefit — yes/no + amount, and has the spouse-conversation happened?",
    },
    {
      lead: "Label, mirror, then shut up.",
      rest: " Default to “it sounds like…” / “it seems like…” — never “why.”",
    },
    {
      lead: "Name the villain out loud:",
      rest: " HR was never intended to be a financial planning office; 2011 Sequestration gutted it; YOYO is the system you were handed, not a personal failing.",
    },
    {
      lead: "Tease the FBC in 30 seconds.",
      rest: " Do not explain it. Bridge content questions to Ann: “Good question — Ann’s going to cover that in depth. Let’s make sure you’re on her calendar.”",
    },
    {
      lead: "Spouse check is mandatory.",
      rest: " Survivor benefit cannot be decided one-sided. If spouse isn’t here, the Meeting 1 must include them.",
    },
    {
      lead: "Close on two locks:",
      rest: " (1) Vault link sent today for GRB + FEHB upload. (2) 1-hour Meeting 1 on the calendar before they hang up.",
    },
    {
      lead: "Federal vocabulary only.",
      rest: " GRB, FBC, FEHB, FEGLI, SCD, MRA, TSP, FERS Supplement. Private-sector jargon loses the room.",
    },
  ];
  return (
    <section
      className="mb-6 mt-5 rounded-xl border-2 p-5 shadow-sm"
      style={{ borderColor: GOLD, backgroundColor: NAVY, color: "white" }}
    >
      <div className="mb-3 flex items-baseline gap-3">
        <span
          className="font-mono text-xs font-bold uppercase tracking-widest"
          style={{ color: GOLD }}
        >
          Pre-flight
        </span>
        <h2 className="text-lg font-semibold text-white">
          30-Min Introductory Meeting — Federal (rep-facing)
        </h2>
      </div>
      <p className="mb-4 text-[14px] leading-relaxed text-white/85">
        Read this before you start the form. The Intro Meeting is discovery, not
        pitching — every answer you give today is an answer Ann doesn&apos;t get
        to give in Meeting 1.
      </p>
      <ul className="space-y-2 text-[14px] leading-relaxed">
        {checklist.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span
              className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: GOLD }}
              aria-hidden="true"
            />
            <span className="text-white/95">
              <span className="font-semibold" style={{ color: GOLD }}>
                {item.lead}
              </span>
              {item.rest}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Frame({
  header,
  children,
}: {
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-100" style={{ colorScheme: "light" }}>
      {header}
      <div className="mx-auto max-w-3xl px-4 pb-32">{children}</div>
    </div>
  );
}

function HeaderBar({
  accountName,
  intakeName,
  progress,
  isIntro,
}: {
  accountName: string;
  intakeName: string;
  progress: { started: number; total: number };
  isIntro: boolean;
}) {
  const pct = Math.round((progress.started / progress.total) * 100);
  return (
    <header className="sticky top-0 z-20" style={{ backgroundColor: NAVY }}>
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_WHITE} alt="Capital Wealth" className="h-7" />
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/60">
            {isIntro ? "Introductory Meeting" : "Meeting 1 Intake"}{" "}
            {intakeName && `· ${intakeName}`}
          </div>
          <div className="text-sm font-semibold text-white">
            {accountName || (isIntro ? "Federal Lead" : "—")}
          </div>
        </div>
      </div>
      <div
        className="h-1.5 w-full bg-white/15"
        role="progressbar"
        aria-label="Intake progress"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: GOLD }}
        />
      </div>
    </header>
  );
}

function DoneScreen({ accountName }: { accountName: string }) {
  return (
    <div className="min-h-screen bg-zinc-100" style={{ colorScheme: "light" }}>
      <header className="sticky top-0 z-20" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto max-w-3xl px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_WHITE} alt="Capital Wealth" className="h-7" />
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-xl bg-white p-8 shadow-sm">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: GOLD, color: NAVY }}
            aria-hidden="true"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-center text-2xl font-semibold" style={{ color: NAVY }}>
            Intake complete
          </h1>
          <p className="mt-2 text-center text-sm text-zinc-700">
            Saved to {accountName || "the account"} in Salesforce.
          </p>
          <div
            className="mt-6 rounded-md border-l-4 px-4 py-3 text-sm"
            style={{ borderLeftColor: GOLD, backgroundColor: "#F7F4ED", color: NAVY }}
          >
            <p className="mb-2 font-semibold">
              Before you hang up, confirm two things out loud:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                The advisor builds their Retirement Money Map — fee analysis, risk
                assessment, income plan.
              </li>
              <li>
                They&apos;ll get an email with a risk-tolerance questionnaire, an
                expense plan, and a secure upload link for statements, Social
                Security, and tax returns.
              </li>
            </ol>
            <p className="mt-3 font-semibold">
              And make sure Meeting 2 is on the calendar before the call ends.
            </p>
          </div>
        </div>
      </div>
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
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base text-[#16253C] placeholder:text-zinc-400 focus:outline-none focus:ring-2";
  const focusStyle = {
    ["--tw-ring-color" as string]: NAVY,
    colorScheme: "light" as const,
  };

  if (def.type === "checkbox") {
    return (
      <label className="flex items-center gap-3 sm:col-span-2">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 rounded border-zinc-300"
          style={{ accentColor: NAVY }}
        />
        <span className="text-base text-zinc-800">{def.label}</span>
      </label>
    );
  }

  const labelEl = (
    <span className="mb-1 block text-sm font-medium" style={{ color: NAVY }}>
      {def.label}
    </span>
  );
  const strVal = value == null ? "" : String(value);

  if (def.type === "longtext") {
    return (
      <label className="sm:col-span-2">
        {labelEl}
        <textarea
          rows={3}
          className={base}
          style={focusStyle}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        />
        {def.help && <span className="mt-1 block text-xs text-zinc-600">{def.help}</span>}
      </label>
    );
  }

  if (def.type === "picklist") {
    return (
      <label>
        {labelEl}
        <select
          className={base}
          style={focusStyle}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        >
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
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-zinc-600">
            $
          </span>
        )}
        <input
          type={inputType}
          inputMode={inputMode}
          className={`${base} ${def.type === "currency" ? "pl-7" : ""}`}
          style={focusStyle}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        />
        {def.type === "percent" && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-medium text-zinc-600">
            %
          </span>
        )}
      </div>
      {def.help && <span className="mt-1 block text-xs text-zinc-600">{def.help}</span>}
    </label>
  );
}
