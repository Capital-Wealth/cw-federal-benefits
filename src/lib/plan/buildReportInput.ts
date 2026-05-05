/**
 * Map editable Live Plan state + the SF intake into a full ReportInput
 * that the ported calc engine accepts. Same mapping the
 * /api/salesforce/generate route uses, simplified to the inputs the live
 * editor controls.
 */

import { differenceInMonths, parseISO } from "date-fns";
import type { ReportInput, SurvivorElection } from "@/lib/calc-types";

export interface PlanState {
  Service_Computation_Date__c: string;
  Current_Annual_Salary__c: number;
  Desired_Retirement_Date__c: string;
  Sick_Leave_Hours_To_Date__c: number;
  Retirement_System__c: string;
  Survivor_Benefit_FERS__c: string;
  Expected_Salary_Increase__c: number; // whole percent
  COLA_Adjustment__c: number; // whole percent
  TSP_Trad_G_Balance__c: number;
  TSP_Trad_F_Balance__c: number;
  TSP_Trad_C_Balance__c: number;
  TSP_Trad_S_Balance__c: number;
  TSP_Trad_I_Balance__c: number;
  TSP_Trad_L_Balance__c: number;
  TSP_Withdrawal_Age_Years__c: number;
  SS_FERS_Monthly_Benefit__c: number;
  SS_FERS_Start_Age__c: number;
  FEHB_Biweekly_Premium__c: number;
  FEHB_Annual_Increase__c: number; // whole percent
}

function deriveCreditableService(scd: string, retDate: string) {
  if (!scd || !retDate) return { years: 0, months: 0 };
  try {
    const totalMonths = Math.max(0, differenceInMonths(parseISO(retDate), parseISO(scd)));
    return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
  } catch {
    return { years: 0, months: 0 };
  }
}

function mapRetirementSystem(v: string): "FERS" | "CSRS" | "FERS_TRANSFER" | "CSRS_OFFSET" {
  const u = (v || "FERS").toUpperCase();
  if (u === "XFERS") return "FERS_TRANSFER";
  if (u.includes("OFFSET")) return "CSRS_OFFSET";
  if (u.includes("CSRS")) return "CSRS";
  return "FERS";
}

function mapSurvivor(v: string): SurvivorElection {
  if (v === "50%") return "50_PERCENT";
  if (v === "25%") return "25_PERCENT";
  return "NONE";
}

export function buildReportInput(
  state: PlanState,
  meta: { fullName: string; dateOfBirth: string; address: string | null },
): ReportInput {
  const civilian = deriveCreditableService(
    state.Service_Computation_Date__c,
    state.Desired_Retirement_Date__c,
  );

  const tspReturn = 0.07; // average TSP fund mix; calc engine will use blendedRate from balances+returnRate

  return {
    personal: {
      fullName: meta.fullName,
      dateOfBirth: meta.dateOfBirth,
      address: meta.address ?? "",
      maritalStatus: "MARRIED", // honored only as fallback for survivor; explicit election overrides
      spouseDateOfBirth: "",
    },
    employment: {
      serviceComputationDate: state.Service_Computation_Date__c,
      retirementSystem: mapRetirementSystem(state.Retirement_System__c),
      employeeType: "REGULAR",
      currentAnnualSalary: state.Current_Annual_Salary__c,
      annualSalaryIncreaseRate: state.Expected_Salary_Increase__c / 100,
      creditableServiceYears: civilian.years,
      creditableServiceMonths: civilian.months,
      sickLeaveHours: state.Sick_Leave_Hours_To_Date__c,
      plannedRetirementDate: state.Desired_Retirement_Date__c,
      csrsServiceYears: 0,
      csrsServiceMonths: 0,
      fersServiceYears: 0,
      fersServiceMonths: 0,
    },
    tsp: {
      traditionalBalances: [
        { fund: "G", balance: state.TSP_Trad_G_Balance__c, returnRate: 0.025 },
        { fund: "F", balance: state.TSP_Trad_F_Balance__c, returnRate: 0.04 },
        { fund: "C", balance: state.TSP_Trad_C_Balance__c, returnRate: 0.10 },
        { fund: "S", balance: state.TSP_Trad_S_Balance__c, returnRate: 0.09 },
        { fund: "I", balance: state.TSP_Trad_I_Balance__c, returnRate: 0.07 },
        { fund: "L", balance: state.TSP_Trad_L_Balance__c, returnRate: 0.07 },
      ],
      rothBalances: [
        { fund: "G", balance: 0, returnRate: 0.025 },
        { fund: "F", balance: 0, returnRate: 0.04 },
        { fund: "C", balance: 0, returnRate: 0.10 },
        { fund: "S", balance: 0, returnRate: 0.09 },
        { fund: "I", balance: 0, returnRate: 0.07 },
        { fund: "L", balance: 0, returnRate: 0.07 },
      ],
      annualContributionTraditional: 0,
      annualContributionRoth: 0,
      governmentMatchPercent: 5,
      catchUpContribution: 0,
      expectedReturnRate: tspReturn,
      plannedWithdrawalAge: state.TSP_Withdrawal_Age_Years__c || 67,
      withdrawalMethod: "MONTHLY_PAYMENTS",
      monthlyWithdrawalAmount: undefined,
    },
    fegli: {
      basicCoverage: true,
      optionA: false,
      optionB: false,
      optionBMultiple: 1,
      optionC: false,
      optionCMultiple: 1,
      postRetirementReduction: "75_PERCENT",
    },
    fehb: {
      currentPlanName: "BCBS Standard",
      enrollment: "SELF_PLUS_ONE",
      biweeklyPremium: state.FEHB_Biweekly_Premium__c || 200,
      premiumIncreaseRate: (state.FEHB_Annual_Increase__c || 6) / 100,
    },
    socialSecurity: {
      estimatedBenefitAge62: 0,
      estimatedBenefitFRA: state.SS_FERS_Monthly_Benefit__c || 0,
      plannedStartAge: state.SS_FERS_Start_Age__c || 67,
    },
    ltc: { enrolled: false, currentPremium: 0, dailyBenefitAmount: 0, benefitPeriodYears: 3 },
    otherIncome: {
      otherPensions: 0,
      spouseIncome: 0,
      rentalIncome: 0,
      investmentIncome: 0,
      otherTaxableIncome: 0,
      otherNonTaxableIncome: 0,
    },
    expenses: {
      housing: 0, utilities: 0, transportation: 0, food: 0,
      healthcareOutOfPocket: 0, insurance: 0, debtPayments: 0,
      entertainment: 0, travel: 0, charitableGiving: 0, other: 0,
    },
    tax: {
      filingStatus: "MARRIED_FILING_JOINTLY",
      federalTaxRate: 0.22,
      stateOfResidence: "UT",
      stateTaxRate: 0.05,
    },
    military: {
      hasMilitaryService: false,
      branch: "",
      activeDutyStartDate: "",
      activeDutyEndDate: "",
      depositPaid: false,
      depositAmountOwed: 0,
    },
    deposits: {
      hasNonDeductionService: false,
      depositOwed: 0,
      hasRefundedService: false,
      reDepositOwed: 0,
    },
    survivorElection: mapSurvivor(state.Survivor_Benefit_FERS__c),
    colaAssumption: (state.COLA_Adjustment__c || 2) / 100,
    projectionYears: 30,
  };
}
