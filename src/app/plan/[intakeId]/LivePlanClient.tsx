"use client";

/**
 * Live Plan v1.0 — Federal Benefit Comparison (dynamic web app).
 *
 * v1.0 upgrades:
 *   - Full 14-module calc engine (FERS Supplement, SS, TSP growth, FEGLI,
 *     FEHB, COLA tables, eligibility, deposits) — ported from
 *     gullstack-report-builder. Same authoritative math as the PDF.
 *   - Recharts visualizations: COLA-projected annuity, TSP growth, net cashflow.
 *   - Plan A vs Plan B side-by-side scenarios with one-click duplicate.
 *
 * Auth still HMAC token (advisor-only); SSO swap lands separately.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { LivePlanSession } from "@/lib/plan/token";
import { calculateReport } from "@/lib/calculations";
import { buildReportInput, type PlanState } from "@/lib/plan/buildReportInput";
import { ColaChart, TspChart, NetCashflowChart } from "./PlanCharts";

const FONT_DISPLAY = "'Cormorant Garamond', Georgia, serif";
const FONT_BODY = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const HIGHLIGHT_BG = "#FFF3C4"; // warm highlighter yellow for light rows
const HIGHLIGHT_RING = "#E6B800"; // gold ring for dark/contained elements

// ============================================================
// Presentation highlighting
// ------------------------------------------------------------
// When the advisor turns on "Highlight" mode in the header, clicking any row,
// value, tile, or the hero number marks it gold for the client and click again
// clears it. Highlights live only in React state (screen-only, per meeting);
// they are not persisted and do not bake into the generated PDF. Highlight mode
// also suppresses inline editing so numbers can't be changed mid-meeting.
// ============================================================

interface HighlightApi {
  mode: boolean;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
}

const HighlightCtx = createContext<HighlightApi>({
  mode: false,
  has: () => false,
  toggle: () => {},
});

function useHighlight() {
  return useContext(HighlightCtx);
}

/**
 * Namespaces highlight ids by a column prefix (e.g. "Plan A") so the same row
 * label in Plan A and Plan B highlight independently.
 */
function ColumnHighlight({ prefix, children }: { prefix: string; children: React.ReactNode }) {
  const parent = useHighlight();
  const value = useMemo<HighlightApi>(
    () => ({
      mode: parent.mode,
      has: (id) => parent.has(`${prefix}::${id}`),
      toggle: (id) => parent.toggle(`${prefix}::${id}`),
    }),
    [parent, prefix],
  );
  return <HighlightCtx.Provider value={value}>{children}</HighlightCtx.Provider>;
}

interface Props {
  session: LivePlanSession;
  initialIntake: Record<string, unknown>;
  clientName: string | null;
  dateOfBirth: string | null;
  address: string | null;
  contactId: string | null;
}

const EDITABLE_FIELDS: (keyof PlanState)[] = [
  "Desired_Retirement_Date__c",
  "Survivor_Benefit_FERS__c",
  "Current_Annual_Salary__c",
  "Expected_Salary_Increase__c",
  "COLA_Adjustment__c",
  "Sick_Leave_Hours_To_Date__c",
  "Service_Computation_Date__c",
  "Retirement_System__c",
  "TSP_Trad_G_Balance__c",
  "TSP_Trad_F_Balance__c",
  "TSP_Trad_C_Balance__c",
  "TSP_Trad_S_Balance__c",
  "TSP_Trad_I_Balance__c",
  "TSP_Trad_L_Balance__c",
  "TSP_Roth_G_Balance__c",
  "TSP_Roth_F_Balance__c",
  "TSP_Roth_C_Balance__c",
  "TSP_Roth_S_Balance__c",
  "TSP_Roth_I_Balance__c",
  "TSP_Roth_L_Balance__c",
  "TSP_Withdrawal_Age_Years__c",
  "SS_FERS_Monthly_Benefit__c",
  "SS_FERS_Start_Age__c",
  "FEHB_Biweekly_Premium__c",
  "FEHB_Annual_Increase__c",
];

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function buildInitialState(intake: Record<string, unknown>): PlanState {
  return {
    Service_Computation_Date__c: str(intake.Service_Computation_Date__c),
    Current_Annual_Salary__c: num(intake.Current_Annual_Salary__c),
    Desired_Retirement_Date__c: str(intake.Desired_Retirement_Date__c),
    Sick_Leave_Hours_To_Date__c: num(intake.Sick_Leave_Hours_To_Date__c),
    Retirement_System__c: str(intake.Retirement_System__c) || "FERS",
    Employee_Category__c: str(intake.Employee_Category__c) || "None",
    Is_Postal_Employee__c: Boolean(intake.Is_Postal_Employee__c),
    Survivor_Benefit_FERS__c: str(intake.Survivor_Benefit_FERS__c) || "50%",
    Expected_Salary_Increase__c: num(intake.Expected_Salary_Increase__c),
    COLA_Adjustment__c: num(intake.COLA_Adjustment__c),
    TSP_Trad_G_Balance__c: num(intake.TSP_Trad_G_Balance__c),
    TSP_Trad_F_Balance__c: num(intake.TSP_Trad_F_Balance__c),
    TSP_Trad_C_Balance__c: num(intake.TSP_Trad_C_Balance__c),
    TSP_Trad_S_Balance__c: num(intake.TSP_Trad_S_Balance__c),
    TSP_Trad_I_Balance__c: num(intake.TSP_Trad_I_Balance__c),
    TSP_Trad_L_Balance__c: num(intake.TSP_Trad_L_Balance__c),
    TSP_Roth_G_Balance__c: num(intake.TSP_Roth_G_Balance__c),
    TSP_Roth_F_Balance__c: num(intake.TSP_Roth_F_Balance__c),
    TSP_Roth_C_Balance__c: num(intake.TSP_Roth_C_Balance__c),
    TSP_Roth_S_Balance__c: num(intake.TSP_Roth_S_Balance__c),
    TSP_Roth_I_Balance__c: num(intake.TSP_Roth_I_Balance__c),
    TSP_Roth_L_Balance__c: num(intake.TSP_Roth_L_Balance__c),
    TSP_Withdrawal_Age_Years__c: num(intake.TSP_Withdrawal_Age_Years__c),
    SS_FERS_Monthly_Benefit__c: num(intake.SS_FERS_Monthly_Benefit__c),
    SS_FERS_Start_Age__c: num(intake.SS_FERS_Start_Age__c),
    FEHB_Biweekly_Premium__c: num(intake.FEHB_Biweekly_Premium__c),
    FEHB_Annual_Increase__c: num(intake.FEHB_Annual_Increase__c),
  };
}

type ActivePlan = "A" | "B";

export default function LivePlanClient({
  session,
  initialIntake,
  clientName,
  dateOfBirth: initialDob,
  address,
  contactId,
}: Props) {
  const initial = buildInitialState(initialIntake);

  const [planA, setPlanA] = useState<PlanState>(initial);
  const [planB, setPlanB] = useState<PlanState | null>(null);
  const [active, setActive] = useState<ActivePlan>("A");
  const [savedA, setSavedA] = useState<PlanState>(initial);

  // DOB lives on Contact, not the FBI. We track it here so the user can edit
  // it inline; on save, the API endpoint writes it back to Contact.Birthdate.
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(initialDob);
  const [savedDob, setSavedDob] = useState<string | null>(initialDob);

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [docs, setDocs] = useState<{ id: string; title: string; fileType: string; sizeBytes: number }[]>([]);

  const sessionToken = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("session")
    : null;

  useEffect(() => {
    if (!sessionToken) return;
    fetch(`/api/plan/documents?token=${sessionToken}`)
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((d) => setDocs(d.documents || []))
      .catch(() => {});
  }, [sessionToken]);

  // Presentation highlighting (screen-only, per meeting).
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlights, setHighlights] = useState<Set<string>>(() => new Set());
  const highlightApi = useMemo<HighlightApi>(
    () => ({
      mode: highlightMode,
      has: (id) => highlights.has(id),
      toggle: (id) =>
        setHighlights((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
    }),
    [highlightMode, highlights],
  );

  const currentState = active === "A" ? planA : planB ?? initial;
  const setCurrent = active === "A" ? setPlanA : setPlanB;

  const dirty = JSON.stringify(planA) !== JSON.stringify(savedA) || dateOfBirth !== savedDob;

  // Run the full calc engine for each scenario.
  const meta = {
    fullName: clientName ?? "Federal Employee",
    dateOfBirth: dateOfBirth ?? "1970-01-01",
    address,
  };
  const resultA = useMemo(
    () => safeCalculate(planA, meta),
    [planA, meta.fullName, meta.dateOfBirth, meta.address],
  );
  const resultB = useMemo(
    () => (planB ? safeCalculate(planB, meta) : null),
    [planB, meta.fullName, meta.dateOfBirth, meta.address],
  );

  function update<K extends keyof PlanState>(key: K, value: PlanState[K]) {
    setCurrent((s: PlanState | null) => ({ ...(s ?? initial), [key]: value }));
  }

  function addPlanB() {
    setPlanB(JSON.parse(JSON.stringify(planA)));
    setActive("B");
  }

  function removePlanB() {
    setPlanB(null);
    setActive("A");
  }

  function adoptPlanB() {
    if (!planB) return;
    setPlanA(planB);
    setPlanB(null);
    setActive("A");
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];
      for (const f of EDITABLE_FIELDS) {
        if (planA[f] !== savedA[f]) {
          changes.push({ field: f, oldValue: savedA[f], newValue: planA[f] });
        }
      }
      if (changes.length === 0) {
        setMessage({ kind: "ok", text: "Nothing changed." });
        return;
      }
      const res = await fetch("/api/plan/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: new URLSearchParams(window.location.search).get("session"),
          intakeId: session.intakeId,
          state: planA,
          changes,
          computedAnnualAnnuity: resultA?.annuity.annualAnnuity ?? 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      setSavedA(planA);
      setMessage({ kind: "ok", text: `Saved ${changes.length} change(s) to Salesforce.` });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReparse() {
    setReparsing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeId: session.intakeId,
          intakeObject: "Federal_Benefits_Intake__c",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Re-parse failed (${res.status})`);
      const parsed = json.parsed ?? 0;
      const failed = json.failed ?? 0;
      setMessage({
        kind: "ok",
        text: `Re-parsed ${parsed} document${parsed === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}. Reloading…`,
      });
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Re-parse failed" });
      setReparsing(false);
    }
  }

  async function handleGeneratePdf() {
    setGenerating(true);
    setMessage(null);
    try {
      if (dirty) await handleSave();
      const res = await fetch("/api/plan/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: new URLSearchParams(window.location.search).get("session"),
          intakeId: session.intakeId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `PDF generation failed (${res.status})`);
      setMessage({ kind: "ok", text: `PDF generated and attached to the SF record.` });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "PDF failed" });
    } finally {
      setGenerating(false);
    }
  }

  const currentResult = active === "A" ? resultA : resultB;

  const highlightCount = highlights.size;

  return (
   <HighlightCtx.Provider value={highlightApi}>
    <div style={{ minHeight: "100vh", background: "#f0f4fa", fontFamily: FONT_BODY, color: "#0F1A2A" }}>
      <header style={{ background: "#16253C", color: "#fff", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #C7A356" }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: "#C7A356", letterSpacing: 2 }}>CAPITAL WEALTH</div>
          <div style={{ fontSize: 11, color: "#cad4e2", letterSpacing: 3 }}>FEDERAL BENEFIT COMPARISON — LIVE PLAN v1.1</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setHighlightMode((m) => !m)}
              title="Toggle highlight mode for presenting"
              style={{
                padding: "8px 14px", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${highlightMode ? "#C7A356" : "#3a4a63"}`,
                background: highlightMode ? "#C7A356" : "transparent",
                color: highlightMode ? "#16253C" : "#cad4e2",
              }}
            >
              {highlightMode ? "🖍 Highlighting" : "🖍 Highlight"}
            </button>
            {highlightCount > 0 && (
              <button
                onClick={() => setHighlights(new Set())}
                title="Clear all highlights"
                style={{
                  padding: "8px 12px", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: "1px solid #3a4a63", background: "transparent", color: "#cad4e2",
                }}
              >
                Clear ({highlightCount})
              </button>
            )}
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: "#cad4e2" }}>
            <div><strong style={{ color: "#fff" }}>{clientName ?? "—"}</strong></div>
            <div>Edited by {session.userName ?? "Advisor"}</div>
          </div>
        </div>
      </header>

      {/* Mode hint banner — switches with highlight mode */}
      {highlightMode ? (
        <div style={{ background: "#16253C", borderBottom: "1px solid #C7A356", padding: "8px 32px", fontSize: 12, color: "#FDD25E", textAlign: "center" }}>
          <strong>🖍 Highlight mode is on.</strong> Click any row, value, tile, or the headline number to highlight it for the client — click again to remove. Editing is locked while highlighting.
        </div>
      ) : (
        <div style={{ background: "#fef9ee", borderBottom: "1px solid #C7A356", padding: "8px 32px", fontSize: 12, color: "#374151", textAlign: "center" }}>
          <strong style={{ color: "#16253C" }}>✎ Inline edit is on.</strong> Click any value with a dashed gold underline to edit it directly — numbers update everywhere instantly.
        </div>
      )}

      {/* Scenario tabs */}
      <div style={{ background: "#fff", padding: "10px 32px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#6B7280", letterSpacing: 1.5, fontWeight: 600, textTransform: "uppercase", marginRight: 8 }}>Scenario:</span>
        <ScenarioTab label="Plan A" active={active === "A"} onClick={() => setActive("A")} />
        {planB ? (
          <>
            <ScenarioTab label="Plan B" active={active === "B"} onClick={() => setActive("B")} />
            <button onClick={removePlanB} style={miniBtn("#fff", "#DC2626")}>× Remove B</button>
            {active === "B" && <button onClick={adoptPlanB} style={miniBtn("#C7A356", "#16253C")}>Adopt B as Plan A</button>}
          </>
        ) : (
          <button onClick={addPlanB} style={miniBtn("#16253C", "#fff")}>+ Add Plan B (Compare)</button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: planB ? "1fr 1fr 360px" : "1fr 360px", gap: 24, padding: 24, maxWidth: 1600, margin: "0 auto" }}>
        {/* PLAN A column */}
        <PlanColumn
          label="Plan A"
          highlighted={active === "A" || !planB}
          state={planA}
          result={resultA}
          clientName={clientName}
          address={address}
          dateOfBirth={dateOfBirth}
          isComparison={!!planB}
          onUpdate={(k, v) => setPlanA((s) => ({ ...s, [k]: v }))}
          onReparse={handleReparse}
          reparsing={reparsing}
        />

        {/* PLAN B column (conditional) */}
        {planB && resultB && (
          <PlanColumn
            label="Plan B"
            highlighted={active === "B"}
            state={planB}
            result={resultB}
            clientName={clientName}
            address={address}
            dateOfBirth={dateOfBirth}
            isComparison
            onUpdate={(k, v) => setPlanB((s: PlanState | null) => ({ ...(s ?? initial), [k]: v }))}
            onReparse={handleReparse}
            reparsing={reparsing}
          />
        )}

        {/* Edit panel */}
        <aside style={{ position: "sticky", top: 24, alignSelf: "start", height: "calc(100vh - 200px)", overflowY: "auto" }}>
          <div style={{ background: "#fff", padding: 20, borderRadius: 4, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 10, color: "#C7A356", letterSpacing: 3, fontWeight: 600 }}>LIVE EDIT — {active === "A" ? "PLAN A" : "PLAN B"}</div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: "#16253C", margin: "4px 0 16px" }}>Tune the Plan</h2>

            <Group title="Retirement">
              <Input label="Retirement Date" type="date" value={currentState.Desired_Retirement_Date__c} onChange={(v) => update("Desired_Retirement_Date__c", v)} />
              <Select label="Survivor" value={currentState.Survivor_Benefit_FERS__c} options={[{ label: "None", value: "0%" }, { label: "25%", value: "25%" }, { label: "50%", value: "50%" }]} onChange={(v) => update("Survivor_Benefit_FERS__c", v)} />
              <Select label="System" value={currentState.Retirement_System__c} options={[{ label: "FERS", value: "FERS" }, { label: "CSRS", value: "CSRS" }, { label: "FERS Transfer", value: "xFERS" }]} onChange={(v) => update("Retirement_System__c", v)} />
            </Group>

            <Group title="Service & Salary">
              <Input label="SCD" type="date" value={currentState.Service_Computation_Date__c} onChange={(v) => update("Service_Computation_Date__c", v)} />
              <NumInput label="Annual Salary ($)" value={currentState.Current_Annual_Salary__c} onChange={(v) => update("Current_Annual_Salary__c", v)} step={1000} />
              <NumInput label="Annual Salary Increase (%)" value={currentState.Expected_Salary_Increase__c} onChange={(v) => update("Expected_Salary_Increase__c", v)} step={0.25} />
              <NumInput label="Sick Leave Hours" value={currentState.Sick_Leave_Hours_To_Date__c} onChange={(v) => update("Sick_Leave_Hours_To_Date__c", v)} step={4} />
              <NumInput label="COLA Assumption (%)" value={currentState.COLA_Adjustment__c} onChange={(v) => update("COLA_Adjustment__c", v)} step={0.25} />
            </Group>

            <Group title="TSP — Traditional">
              <NumInput label="G Fund" value={currentState.TSP_Trad_G_Balance__c} onChange={(v) => update("TSP_Trad_G_Balance__c", v)} />
              <NumInput label="F Fund" value={currentState.TSP_Trad_F_Balance__c} onChange={(v) => update("TSP_Trad_F_Balance__c", v)} />
              <NumInput label="C Fund" value={currentState.TSP_Trad_C_Balance__c} onChange={(v) => update("TSP_Trad_C_Balance__c", v)} />
              <NumInput label="S Fund" value={currentState.TSP_Trad_S_Balance__c} onChange={(v) => update("TSP_Trad_S_Balance__c", v)} />
              <NumInput label="I Fund" value={currentState.TSP_Trad_I_Balance__c} onChange={(v) => update("TSP_Trad_I_Balance__c", v)} />
              <NumInput label="L Fund" value={currentState.TSP_Trad_L_Balance__c} onChange={(v) => update("TSP_Trad_L_Balance__c", v)} />
              <NumInput label="Withdrawal Age" value={currentState.TSP_Withdrawal_Age_Years__c} onChange={(v) => update("TSP_Withdrawal_Age_Years__c", v)} step={1} />
            </Group>

            <Group title="TSP — Roth">
              <NumInput label="G Fund" value={currentState.TSP_Roth_G_Balance__c} onChange={(v) => update("TSP_Roth_G_Balance__c", v)} />
              <NumInput label="F Fund" value={currentState.TSP_Roth_F_Balance__c} onChange={(v) => update("TSP_Roth_F_Balance__c", v)} />
              <NumInput label="C Fund" value={currentState.TSP_Roth_C_Balance__c} onChange={(v) => update("TSP_Roth_C_Balance__c", v)} />
              <NumInput label="S Fund" value={currentState.TSP_Roth_S_Balance__c} onChange={(v) => update("TSP_Roth_S_Balance__c", v)} />
              <NumInput label="I Fund" value={currentState.TSP_Roth_I_Balance__c} onChange={(v) => update("TSP_Roth_I_Balance__c", v)} />
              <NumInput label="L Fund" value={currentState.TSP_Roth_L_Balance__c} onChange={(v) => update("TSP_Roth_L_Balance__c", v)} />
            </Group>

            <Group title="Social Security & FEHB">
              <NumInput label="SS Monthly Benefit ($)" value={currentState.SS_FERS_Monthly_Benefit__c} onChange={(v) => update("SS_FERS_Monthly_Benefit__c", v)} step={10} />
              <NumInput label="SS Start Age" value={currentState.SS_FERS_Start_Age__c} onChange={(v) => update("SS_FERS_Start_Age__c", v)} step={1} />
              <NumInput label="FEHB Biweekly Premium ($)" value={currentState.FEHB_Biweekly_Premium__c} onChange={(v) => update("FEHB_Biweekly_Premium__c", v)} step={1} />
              <NumInput label="FEHB Annual Increase (%)" value={currentState.FEHB_Annual_Increase__c} onChange={(v) => update("FEHB_Annual_Increase__c", v)} step={0.25} />
            </Group>

            {active === "A" && (
              <>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button onClick={handleSave} disabled={!dirty || saving} style={primaryBtn(dirty && !saving)}>
                    {saving ? "Saving…" : dirty ? "Save Changes" : "All Saved"}
                  </button>
                  <button onClick={handleGeneratePdf} disabled={generating} style={goldBtn(!generating)}>
                    {generating ? "Generating…" : "Lock & Generate PDF"}
                  </button>
                </div>
                <button
                  onClick={handleReparse}
                  disabled={reparsing || saving || generating}
                  title="Re-runs AI extraction on every document attached to this record. Use after a client uploads a missing doc late."
                  style={{
                    width: "100%", marginTop: 8, padding: "10px 14px", borderRadius: 4,
                    border: "1px solid #16253C", background: reparsing ? "#7b868C" : "#fff",
                    color: reparsing ? "#fff" : "#16253C", fontWeight: 600, fontSize: 12,
                    cursor: reparsing || saving || generating ? "not-allowed" : "pointer",
                  }}
                >
                  {reparsing ? "Re-parsing documents…" : "↻ Recalculate from uploaded documents"}
                </button>
              </>
            )}
            {active === "B" && (
              <div style={{ marginTop: 16, padding: 10, background: "#fef9ee", border: "1px solid #C7A356", borderRadius: 4, fontSize: 11, color: "#374151" }}>
                Plan B is a what-if scenario. Edit freely — nothing saves to Salesforce until you click <strong>Adopt B as Plan A</strong>.
              </div>
            )}
            {message && (
              <div style={{
                marginTop: 12, padding: 10, borderRadius: 4, fontSize: 12,
                background: message.kind === "ok" ? "#bbf7d0" : "#fee2e2",
                color: message.kind === "ok" ? "#065f46" : "#991b1b",
              }}>
                {message.text}
              </div>
            )}
          </div>

          {/* Source documents — view the uploaded LES / SF-50 / TSP / SSA
              statements alongside the report to audit the numbers in real time. */}
          <div style={{ background: "#fff", padding: 20, borderRadius: 4, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginTop: 16 }}>
            <div style={{ fontSize: 10, color: "#C7A356", letterSpacing: 3, fontWeight: 600 }}>SOURCE DOCUMENTS</div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: "#16253C", margin: "4px 0 12px" }}>
              Uploaded Documents{docs.length ? ` (${docs.length})` : ""}
            </h2>
            {docs.length === 0 ? (
              <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
                No documents attached to this record yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {docs.map((d) => (
                  <a
                    key={d.id}
                    href={`/api/plan/document/${d.id}?token=${sessionToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: 10, padding: "8px 10px", borderRadius: 4,
                      border: "1px solid #E5E7EB", textDecoration: "none",
                      background: "#fafbfc",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#16253C", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📄 {d.title}
                    </span>
                    <span style={{ fontSize: 10, color: "#6B7280", flexShrink: 0 }}>
                      {d.fileType} · {(d.sizeBytes / 1024).toFixed(0)} KB · View ↗
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
   </HighlightCtx.Provider>
  );
}

// ============================================================
// Plan column — report preview + charts for one scenario
// ============================================================

function PlanColumn(props: {
  label: string;
  highlighted: boolean;
  state: PlanState;
  result: ReturnType<typeof safeCalculate>;
  clientName: string | null;
  address: string | null;
  dateOfBirth: string | null;
  isComparison: boolean;
  onUpdate: <K extends keyof PlanState>(key: K, value: PlanState[K]) => void;
  onReparse: () => void;
  reparsing: boolean;
}) {
  const { label, highlighted, state, result, clientName, address, dateOfBirth, isComparison, onUpdate, onReparse, reparsing } = props;

  // Always render the plan, even when fields are missing. The calc engine
  // returns 0s for unknowns; the banner below lists what's estimated so the
  // advisor can fill in (or get the info from the client later).
  const missing: string[] = [];
  if (!state.Service_Computation_Date__c) missing.push("Service Computation Date");
  if (!dateOfBirth) missing.push("Date of Birth");
  if (!state.Current_Annual_Salary__c) missing.push("Current Annual Salary");
  if (!state.Retirement_System__c) missing.push("Retirement System (FERS/CSRS)");
  if (!address) missing.push("Mailing Address (on Contact)");
  // Planned Retirement Date is intentionally omitted — buildReportInput
  // auto-defaults it to DOB + 57 (FERS MRA / LEO mandatory retirement age)
  // so the advisor can override on the right panel if needed.

  if (!result) {
    // The calc engine threw despite the soft-defaults — surface the raw
    // problem rather than the missing-inputs message.
    return (
      <main style={{
        background: "#fff", padding: 32, borderRadius: 4,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)", minHeight: 320,
      }}>
        <div style={{ fontSize: 10, color: "#C7A356", letterSpacing: 3, fontWeight: 600 }}>CALC ENGINE ERROR</div>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: "#16253C", margin: "4px 0 8px" }}>
          The projection couldn&apos;t run
        </h1>
        <div style={{ width: 50, height: 2, background: "#C7A356", marginBottom: 16 }} />
        <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
          Try adjusting an input on the right, or re-parse the uploaded documents.
        </p>
        <button
          onClick={onReparse}
          disabled={reparsing}
          style={{
            marginTop: 12, padding: "10px 16px", borderRadius: 4,
            border: "1px solid #16253C",
            background: reparsing ? "#7b868C" : "#16253C",
            color: "#fff", fontWeight: 700, fontSize: 13,
            cursor: reparsing ? "not-allowed" : "pointer",
          }}
        >
          {reparsing ? "Re-parsing documents…" : "↻ Recalculate from uploaded documents"}
        </button>
      </main>
    );
  }
  const dob = dateOfBirth ?? "1970-01-01";
  const dobDate = new Date(dob);
  const retDate = state.Desired_Retirement_Date__c ? new Date(state.Desired_Retirement_Date__c) : new Date();
  const ageAtRetirement = Math.floor((retDate.getTime() - dobDate.getTime()) / (365.25 * 86400 * 1000));
  const currentAge = Math.floor((new Date().getTime() - dobDate.getTime()) / (365.25 * 86400 * 1000));

  return (
    <main style={{
      background: "#fff", padding: 24, borderRadius: 4,
      boxShadow: highlighted ? "0 0 0 2px #C7A356, 0 1px 3px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.06)",
      transition: "box-shadow 0.15s",
    }}>
     <ColumnHighlight prefix={label}>
      {isComparison && (
        <div style={{ fontSize: 10, color: "#C7A356", letterSpacing: 3, fontWeight: 600, marginBottom: 4 }}>
          {label.toUpperCase()}
        </div>
      )}
      <div style={{ fontSize: 10, color: "#C7A356", letterSpacing: 3, fontWeight: 600 }}>YOUR PLAN AT A GLANCE</div>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: "#16253C", margin: "4px 0 8px" }}>Federal Employee Benefits Summary</h1>
      <div style={{ width: 50, height: 2, background: "#C7A356", marginBottom: 16 }} />

      {missing.length > 0 && (
        <div style={{
          background: "#fef9ee", border: "1px solid #C7A356", borderLeft: "3px solid #C7A356",
          padding: "10px 14px", marginBottom: 14, borderRadius: 4,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
            <strong style={{ color: "#16253C" }}>Estimated — {missing.length} field{missing.length === 1 ? "" : "s"} pending:</strong>{" "}
            {missing.join(" · ")}.{" "}
            <span style={{ color: "#6B7280" }}>
              Numbers below reflect zeros for unknowns. Fill in on the right or re-parse documents to refine.
            </span>
          </div>
          <button
            onClick={onReparse}
            disabled={reparsing}
            style={{
              flexShrink: 0, padding: "6px 10px", borderRadius: 4,
              border: "1px solid #16253C",
              background: reparsing ? "#7b868C" : "#fff",
              color: reparsing ? "#fff" : "#16253C",
              fontWeight: 600, fontSize: 11,
              cursor: reparsing ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {reparsing ? "Re-parsing…" : "↻ Recalculate"}
          </button>
        </div>
      )}

      {/* Hero */}
      <Highlightable id="hero-annuity" style={{ background: "#16253C", padding: "20px 24px", marginBottom: 14, borderRadius: 4 }}>
        <div style={{ fontSize: 9, color: "#FDD25E", letterSpacing: 2.5, fontWeight: 600 }}>YOUR MONTHLY ANNUITY AT RETIREMENT</div>
        <div style={{ fontSize: 36, fontFamily: FONT_DISPLAY, color: "#C7A356", lineHeight: 1.05, marginTop: 6 }}>
          {fmt$(result.annuity.monthlyAnnuity, false)}<span style={{ fontSize: 16 }}>/mo</span>
        </div>
        <div style={{ fontSize: 11, color: "#cad4e2", marginTop: 6 }}>
          {fmt$(result.annuity.annualAnnuity, false)}/yr · {state.COLA_Adjustment__c}% COLA · begins {fmtDate(state.Desired_Retirement_Date__c)}
        </div>
      </Highlightable>

      {/* Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        <Tile label="HIGH-3" value={fmt$(result.annuity.high3Average, false)} />
        <Tile label="TOTAL SERVICE" value={`${result.annuity.totalServiceYears}y ${result.annuity.totalServiceMonths}m`} />
        <Tile label="AGE @ RET" value={String(ageAtRetirement)} />
      </div>

      {/* Service Breakdown — shows how civilian + sick leave roll into total.
          Sick leave hours are inline-editable; civilian service is derived
          from SCD ↔ Retirement Date which are also inline-editable below. */}
      <SectionLabel>SERVICE BREAKDOWN</SectionLabel>
      {(() => {
        const civYrs = state.Service_Computation_Date__c && state.Desired_Retirement_Date__c
          ? (() => {
              const scd = new Date(state.Service_Computation_Date__c);
              const ret = new Date(state.Desired_Retirement_Date__c);
              const months = Math.max(0, (ret.getFullYear() - scd.getFullYear()) * 12 + (ret.getMonth() - scd.getMonth()));
              return { y: Math.floor(months / 12), m: months % 12 };
            })()
          : { y: 0, m: 0 };
        const sickHrs = state.Sick_Leave_Hours_To_Date__c || 0;
        const sickMonthsTotal = Math.floor(sickHrs / 174);
        const sickY = Math.floor(sickMonthsTotal / 12);
        const sickM = sickMonthsTotal % 12;
        return (
          <>
            <Row label="Civilian Service (SCD → Retirement)" value={`${civYrs.y}y ${civYrs.m}m`} />
            <EditableRow
              label={`Sick Leave Hours (÷ 174 hr/mo = ${sickY}y ${sickM}m)`}
              display={sickHrs.toLocaleString()}
              value={sickHrs}
              step={4}
              onCommit={(v) => onUpdate("Sick_Leave_Hours_To_Date__c", Number(v))}
            />
            <Row label="Total Creditable Service" value={`${result.annuity.totalServiceYears}y ${result.annuity.totalServiceMonths}m`} />
          </>
        );
      })()}

      {/* Survivor — election is inline-editable */}
      <SectionLabel>SURVIVOR — {state.Survivor_Benefit_FERS__c}</SectionLabel>
      <EditableRow
        label="Survivor election"
        display={state.Survivor_Benefit_FERS__c}
        value={state.Survivor_Benefit_FERS__c}
        type="select"
        options={[{ label: "None", value: "0%" }, { label: "25%", value: "25%" }, { label: "50%", value: "50%" }]}
        onCommit={(v) => onUpdate("Survivor_Benefit_FERS__c", String(v))}
      />
      <Row label="Annuity (no survivor)" value={`${fmt$(result.annuity.monthlyAnnuity, false)}/mo`} />
      <Row label="Annuity (with survivor)" value={`${fmt$((result.annuity.annualAnnuity - result.survivorBenefit.annualCost) / 12, false)}/mo`} />
      <Row label="Spouse benefit" value={`${fmt$(result.survivorBenefit.survivorMonthlyBenefit, false)}/mo`} />
      <Row label="Survivor cost" value={`${fmt$(result.survivorBenefit.monthlyCost, false)}/mo`} />

      {!isComparison && (
        <>
          <SectionLabel>FERS SUPPLEMENT &amp; SOCIAL SECURITY</SectionLabel>
          <Row label="FERS Supplement (monthly)" value={result.fersSupplement.eligible ? fmt$(result.fersSupplement.monthlyAmount, false) : "Not eligible"} />
          <EditableRow
            label="SS Monthly Benefit (input)"
            display={fmt$(state.SS_FERS_Monthly_Benefit__c, false)}
            value={state.SS_FERS_Monthly_Benefit__c}
            step={10}
            onCommit={(v) => onUpdate("SS_FERS_Monthly_Benefit__c", Number(v))}
          />
          <EditableRow
            label="SS Start Age"
            display={String(state.SS_FERS_Start_Age__c)}
            value={state.SS_FERS_Start_Age__c}
            step={1}
            onCommit={(v) => onUpdate("SS_FERS_Start_Age__c", Number(v))}
          />
          <Row label="SS at start age (computed)" value={fmt$(result.socialSecurity.monthlyBenefitAtStartAge, false)} />
          <Row label="SS Full Retirement Age" value={String(result.socialSecurity.fullRetirementAge)} />

          <SectionLabel>TSP — TRADITIONAL</SectionLabel>
          <EditableRow hid="trad-G" label="G Fund balance" display={fmt$(state.TSP_Trad_G_Balance__c, false)} value={state.TSP_Trad_G_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Trad_G_Balance__c", Number(v))} />
          <EditableRow hid="trad-F" label="F Fund balance" display={fmt$(state.TSP_Trad_F_Balance__c, false)} value={state.TSP_Trad_F_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Trad_F_Balance__c", Number(v))} />
          <EditableRow hid="trad-C" label="C Fund balance" display={fmt$(state.TSP_Trad_C_Balance__c, false)} value={state.TSP_Trad_C_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Trad_C_Balance__c", Number(v))} />
          <EditableRow hid="trad-S" label="S Fund balance" display={fmt$(state.TSP_Trad_S_Balance__c, false)} value={state.TSP_Trad_S_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Trad_S_Balance__c", Number(v))} />
          <EditableRow hid="trad-I" label="I Fund balance" display={fmt$(state.TSP_Trad_I_Balance__c, false)} value={state.TSP_Trad_I_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Trad_I_Balance__c", Number(v))} />
          <EditableRow hid="trad-L" label="L Fund balance" display={fmt$(state.TSP_Trad_L_Balance__c, false)} value={state.TSP_Trad_L_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Trad_L_Balance__c", Number(v))} />
          <Row label="Traditional total today" value={fmt$(state.TSP_Trad_G_Balance__c + state.TSP_Trad_F_Balance__c + state.TSP_Trad_C_Balance__c + state.TSP_Trad_S_Balance__c + state.TSP_Trad_I_Balance__c + state.TSP_Trad_L_Balance__c, false)} />

          <SectionLabel>TSP — ROTH</SectionLabel>
          <EditableRow hid="roth-G" label="G Fund balance" display={fmt$(state.TSP_Roth_G_Balance__c, false)} value={state.TSP_Roth_G_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Roth_G_Balance__c", Number(v))} />
          <EditableRow hid="roth-F" label="F Fund balance" display={fmt$(state.TSP_Roth_F_Balance__c, false)} value={state.TSP_Roth_F_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Roth_F_Balance__c", Number(v))} />
          <EditableRow hid="roth-C" label="C Fund balance" display={fmt$(state.TSP_Roth_C_Balance__c, false)} value={state.TSP_Roth_C_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Roth_C_Balance__c", Number(v))} />
          <EditableRow hid="roth-S" label="S Fund balance" display={fmt$(state.TSP_Roth_S_Balance__c, false)} value={state.TSP_Roth_S_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Roth_S_Balance__c", Number(v))} />
          <EditableRow hid="roth-I" label="I Fund balance" display={fmt$(state.TSP_Roth_I_Balance__c, false)} value={state.TSP_Roth_I_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Roth_I_Balance__c", Number(v))} />
          <EditableRow hid="roth-L" label="L Fund balance" display={fmt$(state.TSP_Roth_L_Balance__c, false)} value={state.TSP_Roth_L_Balance__c} step={100} onCommit={(v) => onUpdate("TSP_Roth_L_Balance__c", Number(v))} />
          <Row label="Roth total today" value={fmt$(state.TSP_Roth_G_Balance__c + state.TSP_Roth_F_Balance__c + state.TSP_Roth_C_Balance__c + state.TSP_Roth_S_Balance__c + state.TSP_Roth_I_Balance__c + state.TSP_Roth_L_Balance__c, false)} />

          <SectionLabel>TSP — AT RETIREMENT</SectionLabel>
          <EditableRow label="Withdrawal Age" display={String(state.TSP_Withdrawal_Age_Years__c)} value={state.TSP_Withdrawal_Age_Years__c} step={1} onCommit={(v) => onUpdate("TSP_Withdrawal_Age_Years__c", Number(v))} />
          <Row label="Traditional at retirement" value={fmt$(result.tsp.traditionalAtRetirement, false)} />
          <Row label="Roth at retirement" value={fmt$(result.tsp.rothAtRetirement, false)} />
          <Row label="Total balance at retirement" value={fmt$(result.tsp.totalAtRetirement, false)} />
          <Row label="Monthly withdrawal" value={`${fmt$(result.tsp.monthlyWithdrawal, false)}/mo`} />

          <SectionLabel>FEGLI &amp; FEHB</SectionLabel>
          <Row label="FEGLI Basic at retirement" value={fmt$(result.fegli.currentCoverage.basic, false)} />
          <EditableRow
            label="FEHB Biweekly Premium"
            display={fmt$(state.FEHB_Biweekly_Premium__c)}
            value={state.FEHB_Biweekly_Premium__c}
            step={1}
            onCommit={(v) => onUpdate("FEHB_Biweekly_Premium__c", Number(v))}
          />
          <EditableRow
            label="FEHB Annual Increase (%)"
            display={`${state.FEHB_Annual_Increase__c}%`}
            value={state.FEHB_Annual_Increase__c}
            step={0.25}
            onCommit={(v) => onUpdate("FEHB_Annual_Increase__c", Number(v))}
          />
          <Row label="FEHB monthly (current)" value={`${fmt$(result.fehb.currentMonthlyPremium, false)}/mo`} />
          <Row label="FEHB monthly at retirement" value={`${fmt$(result.fehb.retirementMonthlyPremium, false)}/mo`} />

          {/* Charts */}
          <ColaChart result={result} />
          <TspChart result={result} />
          <NetCashflowChart result={result} />
        </>
      )}

      {!isComparison && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18 }}>
          <div>
            <SectionLabel>PERSONAL</SectionLabel>
            <Row label="Name" value={clientName ?? "—"} />
            <Row label="Address" value={address ?? "—"} />
            <Row label="Date of Birth" value={fmtDate(dateOfBirth)} />
            <Row label="Current Age" value={String(currentAge)} />
          </div>
          <div>
            <SectionLabel>AT RETIREMENT (CLICK ANY VALUE TO EDIT)</SectionLabel>
            <EditableRow
              label="System"
              display={state.Retirement_System__c}
              value={state.Retirement_System__c}
              type="select"
              options={[{ label: "FERS", value: "FERS" }, { label: "CSRS", value: "CSRS" }, { label: "FERS Transfer", value: "xFERS" }]}
              onCommit={(v) => onUpdate("Retirement_System__c", String(v))}
            />
            <EditableRow
              label="Retirement Date"
              display={fmtDate(state.Desired_Retirement_Date__c)}
              value={state.Desired_Retirement_Date__c}
              type="date"
              onCommit={(v) => onUpdate("Desired_Retirement_Date__c", String(v))}
            />
            <EditableRow
              label="SCD"
              display={fmtDate(state.Service_Computation_Date__c)}
              value={state.Service_Computation_Date__c}
              type="date"
              onCommit={(v) => onUpdate("Service_Computation_Date__c", String(v))}
            />
            <EditableRow
              label="Annual Salary"
              display={fmt$(state.Current_Annual_Salary__c, false)}
              value={state.Current_Annual_Salary__c}
              step={1000}
              onCommit={(v) => onUpdate("Current_Annual_Salary__c", Number(v))}
            />
            <EditableRow
              label="Salary Increase (%)"
              display={`${state.Expected_Salary_Increase__c}%`}
              value={state.Expected_Salary_Increase__c}
              step={0.25}
              onCommit={(v) => onUpdate("Expected_Salary_Increase__c", Number(v))}
            />
            <Row label="High-3 Average (computed)" value={fmt$(result.annuity.high3Average, false)} />
            <EditableRow
              label="Annual COLA (%)"
              display={`${state.COLA_Adjustment__c}%`}
              value={state.COLA_Adjustment__c}
              step={0.25}
              onCommit={(v) => onUpdate("COLA_Adjustment__c", Number(v))}
            />
            <Row label="Multiplier" value={`${(result.annuity.multiplier * 100).toFixed(2)}%`} />
          </div>
        </div>
      )}
     </ColumnHighlight>
    </main>
  );
}

// ============================================================
// Calc adapter — never crash on bad input
// ============================================================

function safeCalculate(state: PlanState, meta: { fullName: string; dateOfBirth: string; address: string | null }) {
  // Soft-fail philosophy: the plan should always render. When required
  // dates/numbers are missing, buildReportInput substitutes safe defaults
  // (today, 0, FERS) so the calc engine returns clean zeros instead of
  // NaNs. The PlanColumn surfaces which fields are estimated.
  try {
    const input = buildReportInput(state, meta);
    return calculateReport(input);
  } catch (e) {
    console.error("Calc engine error:", e);
    return null;
  }
}

// ============================================================
// UI primitives
// ============================================================

function ScenarioTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 16px", borderRadius: 4, fontSize: 12, fontWeight: 600,
      background: active ? "#16253C" : "#fff",
      color: active ? "#fff" : "#16253C",
      border: active ? "1px solid #16253C" : "1px solid #E5E7EB",
      cursor: "pointer",
    }}>{label}</button>
  );
}

function miniBtn(bg: string, fg: string) {
  return {
    padding: "6px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600,
    background: bg, color: fg, border: `1px solid ${bg === "#fff" ? "#E5E7EB" : bg}`,
    cursor: "pointer",
  } as const;
}

function primaryBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: "10px 14px", borderRadius: 4, border: "none",
    background: active ? "#16253C" : "#7b868C",
    color: "#fff", fontWeight: 600, fontSize: 13,
    cursor: active ? "pointer" : "not-allowed",
  };
}

function goldBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: "10px 14px", borderRadius: 4, border: "none",
    background: active ? "#C7A356" : "#7b868C",
    color: "#16253C", fontWeight: 700, fontSize: 13,
    cursor: active ? "pointer" : "not-allowed",
  };
}

function Tile({ label, value }: { label: string; value: string }) {
  const hl = useHighlight();
  const on = hl.has(`tile:${label}`);
  return (
    <div
      onClick={hl.mode ? () => hl.toggle(`tile:${label}`) : undefined}
      style={{
        background: on ? HIGHLIGHT_BG : "#fafbfc",
        borderLeft: "3px solid #C7A356",
        padding: "10px 12px",
        cursor: hl.mode ? "pointer" : undefined,
        boxShadow: on ? `inset 0 0 0 1px ${HIGHLIGHT_RING}` : undefined,
      }}
    >
      <div style={{ fontSize: 9, color: "#6B7280", letterSpacing: 1.5, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600, color: "#16253C", marginTop: 2 }}>{value}</div>
    </div>
  );
}

/**
 * Generic highlight wrapper for contained blocks (hero, charts). Adds a gold
 * ring when highlighted; toggles on click while in highlight mode.
 */
function Highlightable({ id, children, style }: { id: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const hl = useHighlight();
  const on = hl.has(id);
  return (
    <div
      onClick={hl.mode ? (e) => { e.stopPropagation(); hl.toggle(id); } : undefined}
      style={{
        ...style,
        cursor: hl.mode ? "pointer" : style?.cursor,
        outline: on ? `3px solid ${HIGHLIGHT_RING}` : undefined,
        outlineOffset: on ? 2 : undefined,
        borderRadius: style?.borderRadius ?? (on ? 4 : undefined),
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "#16253C", letterSpacing: 1.5,
      textTransform: "uppercase", marginTop: 16, marginBottom: 6,
      paddingBottom: 2, borderBottom: "1px solid #C7A356",
      display: "inline-block", paddingRight: 12,
    }}>{children}</div>
  );
}

/**
 * Inline-editable row. Click the value → swap to input → blur/Enter to commit.
 * The visible value is whatever the parent passes via `display`; the underlying
 * editable value is `value` (number/string), and `onCommit` writes it back to
 * the plan state. The same recompute pipeline fires (via React state).
 */
function EditableRow({
  label,
  display,
  value,
  type = "number",
  step = 1,
  options,
  hid,
  onCommit,
}: {
  label: string;
  display: string;
  value: number | string;
  type?: "number" | "text" | "date" | "select";
  step?: number;
  options?: { label: string; value: string }[];
  hid?: string;
  onCommit: (v: number | string) => void;
}) {
  const hl = useHighlight();
  const id = hid ?? label;
  const on = hl.has(id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(String(value));
  const [hover, setHover] = useState(false);

  const commit = () => {
    setEditing(false);
    if (type === "number") {
      const n = Number(draft);
      if (Number.isFinite(n) && n !== Number(value)) onCommit(n);
    } else if (draft !== String(value)) {
      onCommit(draft);
    }
  };

  return (
    <div
      onClick={hl.mode ? () => hl.toggle(id) : undefined}
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "5px 8px",
        margin: "0 -8px",
        borderBottom: "0.5px solid #eef0f3",
        fontSize: 13,
        background: on ? HIGHLIGHT_BG : undefined,
        borderRadius: on ? 3 : undefined,
        cursor: hl.mode ? "pointer" : undefined,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={{ color: "#374151" }}>{label}</span>
      {editing && !hl.mode ? (
        type === "select" ? (
          <select
            autoFocus
            value={draft}
            onChange={(e) => { setDraft(e.target.value); onCommit(e.target.value); setEditing(false); }}
            onBlur={() => setEditing(false)}
            style={inlineInputStyle}
          >
            {(options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            autoFocus
            type={type}
            step={type === "number" ? step : undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
            }}
            style={inlineInputStyle}
          />
        )
      ) : (
        <span
          onClick={hl.mode ? undefined : () => { setDraft(String(value)); setEditing(true); }}
          title={hl.mode ? "Click to highlight" : "Click to edit"}
          style={{
            color: "#16253C",
            fontWeight: 600,
            cursor: "pointer",
            borderBottom: !hl.mode && hover ? "1px dashed #C7A356" : "1px dashed transparent",
            paddingBottom: 1,
            transition: "border-color 0.1s",
          }}
        >
          {display}
          {!hl.mode && hover && <span style={{ marginLeft: 6, fontSize: 10, color: "#C7A356", opacity: 0.7 }}>✎</span>}
        </span>
      )}
    </div>
  );
}

const inlineInputStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#16253C",
  textAlign: "right",
  padding: "2px 6px",
  border: "1px solid #C7A356",
  borderRadius: 3,
  background: "#fef9ee",
  fontFamily: FONT_BODY,
  minWidth: 110,
};

function Row({ label, value, hid }: { label: string; value: string; hid?: string }) {
  const hl = useHighlight();
  const id = hid ?? label;
  const on = hl.has(id);
  return (
    <div
      onClick={hl.mode ? () => hl.toggle(id) : undefined}
      style={{
        display: "flex", justifyContent: "space-between",
        padding: "4px 8px", margin: "0 -8px",
        borderBottom: "0.5px solid #eef0f3", fontSize: 12,
        background: on ? HIGHLIGHT_BG : undefined,
        borderRadius: on ? 3 : undefined,
        cursor: hl.mode ? "pointer" : undefined,
      }}
    >
      <span style={{ color: "#374151" }}>{label}</span>
      <span style={{ color: "#16253C", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, color: "#16253C", letterSpacing: 1.5, fontWeight: 700,
        textTransform: "uppercase", marginBottom: 6, paddingBottom: 2, borderBottom: "1px solid #C7A356",
        display: "inline-block", paddingRight: 12,
      }}>{title}</div>
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
    </div>
  );
}

function Input({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block", fontSize: 11, color: "#374151" }}>
      <div style={{ marginBottom: 2 }}>{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function NumInput({ label, value, onChange, step = 100 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label style={{ display: "block", fontSize: 11, color: "#374151" }}>
      <div style={{ marginBottom: 2 }}>{label}</div>
      <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))} style={inputStyle} />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block", fontSize: 11, color: "#374151" }}>
      <div style={{ marginBottom: 2 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, background: "#fff" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "5px 8px", border: "1px solid #E5E7EB", borderRadius: 3, fontSize: 13, fontFamily: FONT_BODY,
};

function fmt$(v: number, decimals = true): string {
  if (!Number.isFinite(v)) return "$0";
  return "$" + v.toLocaleString("en-US", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return s;
  }
}
