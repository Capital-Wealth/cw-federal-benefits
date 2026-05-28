/**
 * Golden test suite for the federal retirement calc engine.
 *
 * Each case pins an OPM-rule-correct expected value for a distinct retirement
 * branch. Run: `npx tsx scripts/golden-cases.ts` (exits 1 on any failure, so
 * it gates CI). These are the cases a federal-benefits SME should bless — they
 * are the contract the engine must never silently break.
 *
 * Money is real here. A red bar means a client's pension projection is wrong.
 */

import { buildReportInput, type PlanState } from "@/lib/plan/buildReportInput";
import { calculateReport } from "@/lib/calculations";

type Check = { label: string; got: number | boolean; want: number | boolean; tolerance?: number };

interface Case {
  name: string;
  state: Partial<PlanState>;
  meta: { dateOfBirth: string };
  checks: (r: any) => Check[];
}

const base: PlanState = {
  Service_Computation_Date__c: "",
  Current_Annual_Salary__c: 0,
  Desired_Retirement_Date__c: "",
  Sick_Leave_Hours_To_Date__c: 0,
  Retirement_System__c: "FERS",
  Employee_Category__c: "None",
  Is_Postal_Employee__c: false,
  Survivor_Benefit_FERS__c: "0%",
  Expected_Salary_Increase__c: 0,
  COLA_Adjustment__c: 2,
  TSP_Trad_G_Balance__c: 0, TSP_Trad_F_Balance__c: 0, TSP_Trad_C_Balance__c: 0,
  TSP_Trad_S_Balance__c: 0, TSP_Trad_I_Balance__c: 0, TSP_Trad_L_Balance__c: 0,
  TSP_Roth_G_Balance__c: 0, TSP_Roth_F_Balance__c: 0, TSP_Roth_C_Balance__c: 0,
  TSP_Roth_S_Balance__c: 0, TSP_Roth_I_Balance__c: 0, TSP_Roth_L_Balance__c: 0,
  TSP_Withdrawal_Age_Years__c: 67,
  SS_FERS_Monthly_Benefit__c: 2000, SS_FERS_Start_Age__c: 62,
  FEHB_Biweekly_Premium__c: 0, FEHB_Annual_Increase__c: 0,
};

const cases: Case[] = [
  {
    // Regular FERS, age 62, 20 yrs → 1.1% multiplier, no penalty, no supplement (age 62).
    name: "Regular FERS 62 / 20yr — 1.1% bump",
    state: { Service_Computation_Date__c: "2008-06-01", Desired_Retirement_Date__c: "2028-06-01",
             Current_Annual_Salary__c: 100000 },
    meta: { dateOfBirth: "1966-06-01" },
    checks: (r) => [
      { label: "annuity", got: r.annuity.annualAnnuity, want: 22000, tolerance: 200 },
      { label: "supplement eligible (age 62 → no)", got: r.fersSupplement.eligible, want: false },
    ],
  },
  {
    // Regular FERS, age 60, 20 yrs → 1.0% × 20, immediate unreduced, supplement eligible.
    name: "Regular FERS 60 / 20yr — immediate unreduced + SRS",
    state: { Service_Computation_Date__c: "2006-06-01", Desired_Retirement_Date__c: "2026-06-01",
             Current_Annual_Salary__c: 100000 },
    meta: { dateOfBirth: "1966-06-01" },
    checks: (r) => [
      { label: "annuity (no penalty)", got: r.annuity.annualAnnuity, want: 20000, tolerance: 200 },
      { label: "supplement eligible", got: r.fersSupplement.eligible, want: true },
      { label: "SRS = SS62 × 20/40 = 1000", got: r.fersSupplement.monthlyAmount, want: 1000, tolerance: 20 },
    ],
  },
  {
    // Regular FERS, MRA 57, 30 yrs → MRA+30 immediate unreduced (the fix). No penalty, SRS eligible.
    name: "Regular FERS MRA+30 — unreduced (NOT MRA+10)",
    state: { Service_Computation_Date__c: "1998-05-01", Desired_Retirement_Date__c: "2028-05-01",
             Current_Annual_Salary__c: 100000 },
    meta: { dateOfBirth: "1971-05-01" },
    checks: (r) => [
      { label: "annuity unreduced (NOT $22,500)", got: r.annuity.annualAnnuity, want: 30000, tolerance: 200 },
      { label: "supplement eligible", got: r.fersSupplement.eligible, want: true },
      { label: "SRS = SS62 × 30/40 = 1500", got: r.fersSupplement.monthlyAmount, want: 1500, tolerance: 30 },
    ],
  },
  {
    // Regular FERS, MRA 57, 15 yrs → TRUE MRA+10: 5%/yr × 5 = 25% penalty, NOT supplement-eligible.
    name: "Regular FERS MRA+10 (15yr) — penalty applies, no SRS",
    state: { Service_Computation_Date__c: "2013-05-01", Desired_Retirement_Date__c: "2028-05-01",
             Current_Annual_Salary__c: 100000 },
    meta: { dateOfBirth: "1971-05-01" },
    checks: (r) => [
      { label: "annuity reduced 25% (15000 → 11250)", got: r.annuity.annualAnnuity, want: 11250, tolerance: 200 },
      { label: "supplement NOT eligible (MRA+10)", got: r.fersSupplement.eligible, want: false },
    ],
  },
  {
    // LEO (Erik), age 57, ~26 yrs, high-3 $187,870 → 1.7%×20 + 1%×rest, no penalty, SRS eligible.
    name: "LEO special provision (Erik Wallace)",
    state: { Service_Computation_Date__c: "2002-09-29", Desired_Retirement_Date__c: "2028-04-30",
             Current_Annual_Salary__c: 187870, Sick_Leave_Hours_To_Date__c: 1353,
             Employee_Category__c: "Law Enforcement", Survivor_Benefit_FERS__c: "50%",
             SS_FERS_Monthly_Benefit__c: 2673, SS_FERS_Start_Age__c: 62 },
    meta: { dateOfBirth: "1971-04-07" },
    checks: (r) => [
      { label: "annuity ~40.2% LEO (NOT 30%)", got: r.annuity.annualAnnuity, want: 75461, tolerance: 300 },
      { label: "effective multiplier ~40%", got: r.annuity.annualAnnuity / r.annuity.high3Average, want: 0.402, tolerance: 0.01 },
      { label: "supplement eligible (LEO @ 20yr)", got: r.fersSupplement.eligible, want: true },
      { label: "SRS ≈ $1,671 (SS62 × 25/40)", got: r.fersSupplement.monthlyAmount, want: 1671, tolerance: 15 },
    ],
  },
];

let failures = 0;
let passes = 0;
for (const c of cases) {
  const state = { ...base, ...c.state } as PlanState;
  const input = buildReportInput(state, { fullName: "Test", dateOfBirth: c.meta.dateOfBirth, address: "x" });
  let r: any;
  try {
    r = calculateReport(input);
  } catch (e) {
    console.log(`✗ ${c.name} — threw: ${e instanceof Error ? e.message : e}`);
    failures++;
    continue;
  }
  const results = c.checks(r);
  const failed = results.filter((chk) => {
    if (typeof chk.want === "boolean") return chk.got !== chk.want;
    const tol = chk.tolerance ?? 0;
    return Math.abs((chk.got as number) - chk.want) > tol;
  });
  if (failed.length === 0) {
    console.log(`✓ ${c.name}`);
    passes++;
  } else {
    console.log(`✗ ${c.name}`);
    for (const f of failed) console.log(`    ${f.label}: got ${f.got}, want ${f.want}${f.tolerance ? ` ±${f.tolerance}` : ""}`);
    failures++;
  }
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
