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
// Opener + background = the qualifying anchors; goals = the close. Everything else
// (pensions, SS amounts, fees, estate) collapses behind "Show full intake".
const INTRO_KEY_SECTIONS = new Set(["opener", "background", "goals"]);

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

  // ---- Federal Vault invite ----
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultResult, setVaultResult] = useState<{
    portalUrl: string;
    name: string | null;
    reused: boolean;
    message: string;
  } | null>(null);

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

  const sendVaultInvite = async () => {
    setVaultBusy(true);
    setVaultError(null);
    try {
      const res = await fetch("/api/vault/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setVaultError(data.error || "Could not send the Vault invite.");
        return;
      }
      setVaultResult(data);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : "Network error");
    } finally {
      setVaultBusy(false);
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

      {/* Conversation notes — prominent in discovery mode. The Zoom transcript
          captures the full call; this is for the rep's key takeaways. */}
      {isIntro && (
        <section className="mb-6 rounded-xl border-2 bg-white p-5 shadow-sm" style={{ borderColor: GOLD }}>
          <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
            Conversation Notes
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">
            Capture the key takeaways, concerns in their own words, and what they
            committed to. The full call is saved to Salesforce automatically from
            the Zoom transcript — you don&apos;t need to transcribe.
          </p>
          <textarea
            value={(record["Additional_Notes__c"] as string) ?? ""}
            onChange={(e) => setField("Additional_Notes__c", e.target.value)}
            rows={8}
            placeholder="What did they say? What's the real pain behind the pain? What did they commit to?"
            className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base"
            style={{ color: NAVY, colorScheme: "light" }}
          />
        </section>
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
            {section.fields
              // Additional_Notes__c is surfaced as the prominent Conversation
              // Notes block above in discovery mode — don't render it twice.
              .filter((f) => !(isIntro && f.api === "Additional_Notes__c"))
              .map((f) => (
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

      {/* Federal Vault invite */}
      <div
        className="mb-6 rounded-lg border-l-4 bg-white p-4 shadow-sm"
        style={{ borderLeftColor: GOLD }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: NAVY }}>
              Federal Vault link
            </h3>
            <p className="mt-0.5 text-xs text-zinc-600">
              Create a secure upload link (LES, SF-50, TSP &amp; more) for this
              prospect. The Vault record is created in Salesforce — copy the link
              and share it however you like.
            </p>
          </div>
          <button
            type="button"
            disabled={vaultBusy}
            onClick={sendVaultInvite}
            className="rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: NAVY }}
          >
            {vaultBusy ? "Creating…" : "Create Vault Link"}
          </button>
        </div>

        {vaultError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {vaultError}
          </div>
        )}

        {vaultResult && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
            <div className="font-medium">{vaultResult.message}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={vaultResult.portalUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded border border-emerald-300 bg-white px-2 py-1 font-mono text-[11px]"
                style={{ color: NAVY, colorScheme: "light" }}
              />
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(vaultResult.portalUrl)}
                className="rounded border border-emerald-300 bg-white px-2.5 py-1 font-medium"
                style={{ color: NAVY }}
              >
                Copy link
              </button>
            </div>
          </div>
        )}
      </div>

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
  // The Straight Line, federal discovery edition. Six steps, in order — every
  // beat either raises a certainty or moves toward booking the next meeting.
  const line: { n: string; king: string; title: string; say?: string; note: string }[] = [
    {
      n: "1",
      king: "Voss",
      title: "Open — accusation audit",
      say: "“You've probably been sent to three people who all told you to check OPM's website. We're not doing that today. What would make the next 30 minutes worth your time?”",
      note: "First 4 seconds: sharp, warm, certain. Say it, then go quiet and let them answer.",
    },
    {
      n: "2",
      king: "Belfort",
      title: "The three non-negotiables — ask FIRST",
      say: "(1) When do you want to retire?  (2) Do you know your Service Computation Date (SCD)?  (3) Survivor benefit — yes/no, what amount, and has the spouse conversation happened?",
      note: "These three anchor everything. Get them on the record before anything else.",
    },
    {
      n: "3",
      king: "Voss",
      title: "Label, mirror, then shut up",
      say: "“It sounds like…”  /  “It seems like…”  — mirror the last 1–3 words they stress.",
      note: "Never ask “why.” Silence does the work — let them fill it.",
    },
    {
      n: "4",
      king: "Miller",
      title: "Name the villain",
      say: "“In 2011, sequestration gutted agency HR — it was never a financial-planning office. You were handed a YOYO system: You're On Your Own. Not knowing this isn't on you; it's by design.”",
      note: "Externalize the fight. They're the hero; the system is the villain; CW is the guide.",
    },
    {
      n: "5",
      king: "Belfort",
      title: "Drop ONE insight — then tease, don't teach",
      say: "“Most feds have no idea when they can retire — not when they want to, when the math actually allows.”  (or: GRB estimates run hundreds/mo off; <5% claim the $162.50/mo HSA contribution.)",
      note: "The insight crosses the threshold. Don't explain it — bridge to Ann: “That's exactly what your Money Map answers.”",
    },
    {
      n: "6",
      king: "Belfort",
      title: "Close — directive, two locks",
      say: "“Here's what happens next: Ann builds your Retirement Money Map from what you shared — verifiable numbers, the exact day the math says you can retire. It's complimentary.”  Then: “If we put together a plan that hits your concerns and goals — would you be opposed to seeing it?”",
      note: "Lock 1: Vault link sent today (button at the bottom). Lock 2: next meeting booked before they hang up — spouse on it.",
    },
  ];
  return (
    <section
      className="mb-6 mt-5 rounded-xl border-2 p-5 shadow-sm"
      style={{ borderColor: GOLD, backgroundColor: NAVY, color: "white" }}
    >
      <div className="mb-2 flex items-baseline gap-3">
        <span className="font-mono text-xs font-bold uppercase tracking-widest" style={{ color: GOLD }}>
          Straight Line
        </span>
        <h2 className="text-lg font-semibold text-white">
          30-Min Federal Discovery — rep script
        </h2>
      </div>
      <p className="mb-4 text-[14px] leading-relaxed text-white/85">
        Discovery, not pitching. Stay on the line — every beat moves toward
        booking the next meeting. Give no answers today; every answer you give is
        one Ann doesn&apos;t get to give. No calculators — take them just far
        enough to see they can&apos;t do this alone.
      </p>
      <ol className="space-y-3 text-[14px] leading-relaxed">
        {line.map((step) => (
          <li key={step.n} className="flex gap-3">
            <span
              className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold"
              style={{ backgroundColor: GOLD, color: NAVY }}
              aria-hidden="true"
            >
              {step.n}
            </span>
            <div>
              <div className="font-semibold" style={{ color: GOLD }}>
                {step.title}
                <span className="ml-2 align-middle font-normal text-[11px] uppercase tracking-wide text-white/50">
                  {step.king}
                </span>
              </div>
              {step.say && <p className="mt-0.5 text-white/95">{step.say}</p>}
              <p className="mt-0.5 text-[13px] text-white/65">{step.note}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-white/15 pt-3 text-[12px] text-white/55">
        Federal vocabulary only: GRB, FBC, FEHB, FEGLI, SCD, MRA, TSP, FERS
        Supplement. The full call is captured to Salesforce from the Zoom
        transcript — your notes below are the key takeaways and commitments.
      </p>
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
