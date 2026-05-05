"use client";

/**
 * Live Plan v1.0 — Federal Benefits Gap Analysis (dynamic web app).
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

import { useMemo, useState } from "react";
import type { LivePlanSession } from "@/lib/plan/token";
import { calculateReport } from "@/lib/calculations";
import { buildReportInput, type PlanState } from "@/lib/plan/buildReportInput";
import { ColaChart, TspChart, NetCashflowChart } from "./PlanCharts";

const FONT_DISPLAY = "'Cormorant Garamond', Georgia, serif";
const FONT_BODY = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

interface Props {
  session: LivePlanSession;
  initialIntake: Record<string, unknown>;
  clientName: string | null;
  dateOfBirth: string | null;
  address: string | null;
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
    Survivor_Benefit_FERS__c: str(intake.Survivor_Benefit_FERS__c) || "50%",
    Expected_Salary_Increase__c: num(intake.Expected_Salary_Increase__c),
    COLA_Adjustment__c: num(intake.COLA_Adjustment__c),
    TSP_Trad_G_Balance__c: num(intake.TSP_Trad_G_Balance__c),
    TSP_Trad_F_Balance__c: num(intake.TSP_Trad_F_Balance__c),
    TSP_Trad_C_Balance__c: num(intake.TSP_Trad_C_Balance__c),
    TSP_Trad_S_Balance__c: num(intake.TSP_Trad_S_Balance__c),
    TSP_Trad_I_Balance__c: num(intake.TSP_Trad_I_Balance__c),
    TSP_Trad_L_Balance__c: num(intake.TSP_Trad_L_Balance__c),
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
  dateOfBirth,
  address,
}: Props) {
  const initial = buildInitialState(initialIntake);

  const [planA, setPlanA] = useState<PlanState>(initial);
  const [planB, setPlanB] = useState<PlanState | null>(null);
  const [active, setActive] = useState<ActivePlan>("A");
  const [savedA, setSavedA] = useState<PlanState>(initial);

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const currentState = active === "A" ? planA : planB ?? initial;
  const setCurrent = active === "A" ? setPlanA : setPlanB;

  const dirty = JSON.stringify(planA) !== JSON.stringify(savedA);

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

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4fa", fontFamily: FONT_BODY, color: "#0F1A2A" }}>
      <header style={{ background: "#16253C", color: "#fff", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #C7A356" }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: "#C7A356", letterSpacing: 2 }}>CAPITAL WEALTH</div>
          <div style={{ fontSize: 11, color: "#cad4e2", letterSpacing: 3 }}>FEDERAL BENEFITS GAP ANALYSIS — LIVE PLAN v1.0</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: "#cad4e2" }}>
          <div><strong style={{ color: "#fff" }}>{clientName ?? "—"}</strong></div>
          <div>Edited by {session.userName}</div>
        </div>
      </header>

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

            <Group title="TSP">
              <NumInput label="G Fund" value={currentState.TSP_Trad_G_Balance__c} onChange={(v) => update("TSP_Trad_G_Balance__c", v)} />
              <NumInput label="F Fund" value={currentState.TSP_Trad_F_Balance__c} onChange={(v) => update("TSP_Trad_F_Balance__c", v)} />
              <NumInput label="C Fund" value={currentState.TSP_Trad_C_Balance__c} onChange={(v) => update("TSP_Trad_C_Balance__c", v)} />
              <NumInput label="S Fund" value={currentState.TSP_Trad_S_Balance__c} onChange={(v) => update("TSP_Trad_S_Balance__c", v)} />
              <NumInput label="I Fund" value={currentState.TSP_Trad_I_Balance__c} onChange={(v) => update("TSP_Trad_I_Balance__c", v)} />
              <NumInput label="L Fund" value={currentState.TSP_Trad_L_Balance__c} onChange={(v) => update("TSP_Trad_L_Balance__c", v)} />
              <NumInput label="Withdrawal Age" value={currentState.TSP_Withdrawal_Age_Years__c} onChange={(v) => update("TSP_Withdrawal_Age_Years__c", v)} step={1} />
            </Group>

            <Group title="Social Security & FEHB">
              <NumInput label="SS Monthly Benefit ($)" value={currentState.SS_FERS_Monthly_Benefit__c} onChange={(v) => update("SS_FERS_Monthly_Benefit__c", v)} step={10} />
              <NumInput label="SS Start Age" value={currentState.SS_FERS_Start_Age__c} onChange={(v) => update("SS_FERS_Start_Age__c", v)} step={1} />
              <NumInput label="FEHB Biweekly Premium ($)" value={currentState.FEHB_Biweekly_Premium__c} onChange={(v) => update("FEHB_Biweekly_Premium__c", v)} step={1} />
              <NumInput label="FEHB Annual Increase (%)" value={currentState.FEHB_Annual_Increase__c} onChange={(v) => update("FEHB_Annual_Increase__c", v)} step={0.25} />
            </Group>

            {active === "A" && (
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={handleSave} disabled={!dirty || saving} style={primaryBtn(dirty && !saving)}>
                  {saving ? "Saving…" : dirty ? "Save Changes" : "All Saved"}
                </button>
                <button onClick={handleGeneratePdf} disabled={generating} style={goldBtn(!generating)}>
                  {generating ? "Generating…" : "Lock & Generate PDF"}
                </button>
              </div>
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
        </aside>
      </div>
    </div>
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
}) {
  const { label, highlighted, state, result, clientName, address, dateOfBirth, isComparison } = props;
  if (!result) {
    return (
      <main style={{ background: "#fff", padding: 32, borderRadius: 4, opacity: 0.5 }}>
        Calculating…
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
      {isComparison && (
        <div style={{ fontSize: 10, color: "#C7A356", letterSpacing: 3, fontWeight: 600, marginBottom: 4 }}>
          {label.toUpperCase()}
        </div>
      )}
      <div style={{ fontSize: 10, color: "#C7A356", letterSpacing: 3, fontWeight: 600 }}>YOUR PLAN AT A GLANCE</div>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: "#16253C", margin: "4px 0 8px" }}>Federal Employee Benefits Summary</h1>
      <div style={{ width: 50, height: 2, background: "#C7A356", marginBottom: 16 }} />

      {/* Hero */}
      <div style={{ background: "#16253C", padding: "20px 24px", marginBottom: 14, borderRadius: 4 }}>
        <div style={{ fontSize: 9, color: "#FDD25E", letterSpacing: 2.5, fontWeight: 600 }}>YOUR MONTHLY ANNUITY AT RETIREMENT</div>
        <div style={{ fontSize: 36, fontFamily: FONT_DISPLAY, color: "#C7A356", lineHeight: 1.05, marginTop: 6 }}>
          {fmt$(result.annuity.monthlyAnnuity, false)}<span style={{ fontSize: 16 }}>/mo</span>
        </div>
        <div style={{ fontSize: 11, color: "#cad4e2", marginTop: 6 }}>
          {fmt$(result.annuity.annualAnnuity, false)}/yr · {state.COLA_Adjustment__c}% COLA · begins {fmtDate(state.Desired_Retirement_Date__c)}
        </div>
      </div>

      {/* Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        <Tile label="HIGH-3" value={fmt$(result.annuity.high3Average, false)} />
        <Tile label="SERVICE" value={`${result.annuity.totalServiceYears}y ${result.annuity.totalServiceMonths}m`} />
        <Tile label="AGE @ RET" value={String(ageAtRetirement)} />
      </div>

      {/* Survivor */}
      <SectionLabel>SURVIVOR — {state.Survivor_Benefit_FERS__c}</SectionLabel>
      <Row label="Annuity (no survivor)" value={`${fmt$(result.annuity.monthlyAnnuity, false)}/mo`} />
      <Row label="Annuity (with survivor)" value={`${fmt$((result.annuity.annualAnnuity - result.survivorBenefit.annualCost) / 12, false)}/mo`} />
      <Row label="Spouse benefit" value={`${fmt$(result.survivorBenefit.survivorMonthlyBenefit, false)}/mo`} />
      <Row label="Survivor cost" value={`${fmt$(result.survivorBenefit.monthlyCost, false)}/mo`} />

      {!isComparison && (
        <>
          <SectionLabel>FERS SUPPLEMENT &amp; SOCIAL SECURITY</SectionLabel>
          <Row label="FERS Supplement (monthly)" value={result.fersSupplement.eligible ? fmt$(result.fersSupplement.monthlyAmount, false) : "Not eligible"} />
          <Row label="SS at start age" value={fmt$(result.socialSecurity.monthlyBenefitAtStartAge, false)} />
          <Row label="SS Full Retirement Age" value={String(result.socialSecurity.fullRetirementAge)} />

          <SectionLabel>TSP</SectionLabel>
          <Row label="Total balance at retirement" value={fmt$(result.tsp.totalAtRetirement, false)} />
          <Row label="Traditional" value={fmt$(result.tsp.traditionalAtRetirement, false)} />
          <Row label="Roth" value={fmt$(result.tsp.rothAtRetirement, false)} />
          <Row label="Monthly withdrawal" value={`${fmt$(result.tsp.monthlyWithdrawal, false)}/mo`} />

          <SectionLabel>FEGLI &amp; FEHB</SectionLabel>
          <Row label="FEGLI Basic at retirement" value={fmt$(result.fegli.currentCoverage.basic, false)} />
          <Row label="FEHB monthly premium (current)" value={`${fmt$(result.fehb.currentMonthlyPremium, false)}/mo`} />
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
            <SectionLabel>AT RETIREMENT</SectionLabel>
            <Row label="System" value={state.Retirement_System__c} />
            <Row label="Retirement Date" value={fmtDate(state.Desired_Retirement_Date__c)} />
            <Row label="High-3 Average" value={fmt$(result.annuity.high3Average, false)} />
            <Row label="Annual COLA" value={`${state.COLA_Adjustment__c}%`} />
            <Row label="Multiplier" value={`${(result.annuity.multiplier * 100).toFixed(2)}%`} />
          </div>
        </div>
      )}
    </main>
  );
}

// ============================================================
// Calc adapter — never crash on bad input
// ============================================================

function safeCalculate(state: PlanState, meta: { fullName: string; dateOfBirth: string; address: string | null }) {
  try {
    if (!state.Service_Computation_Date__c || !state.Desired_Retirement_Date__c) return null;
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
  return (
    <div style={{ background: "#fafbfc", borderLeft: "3px solid #C7A356", padding: "10px 12px" }}>
      <div style={{ fontSize: 9, color: "#6B7280", letterSpacing: 1.5, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600, color: "#16253C", marginTop: 2 }}>{value}</div>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "0.5px solid #eef0f3", fontSize: 12 }}>
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
