/**
 * Master Calculation Orchestrator
 *
 * Takes a complete ReportInput, calls all individual calculators,
 * and assembles the full CalculationResult.
 */

import { parseISO, differenceInYears, addYears, getYear, format } from 'date-fns';
import type { ReportInput, CalculationResult, SurvivorElection } from '../calc-types';

import { calculateTotalService, serviceToDecimalYears } from './service';
import { calculateHigh3 } from './high3';
import { calculateAnnuityWithAge } from './annuity';
import { calculateSurvivorBenefit } from './survivor';
import { calculateFersSupplement } from './supplement';
import { calculateSocialSecurity } from './social-security';
import { calculateColaProjections } from './cola';
import { calculateTsp } from './tsp';
import { calculateFegli } from './fegli';
import { calculateFehb } from './fehb';
import { calculateMraPlus10Penalty, isMraPlus10Retirement } from './early-retirement';
import { calculateDeposits } from './deposits';
import { calculateEligibility, getMRA } from './eligibility';
import {
  calculateLastPaycheck,
  calculateFirstRetirementCheck,
  buildIncomeComparison,
  calculateYearlyProjections,
} from './income';

/**
 * Run all calculations and produce the complete result.
 *
 * This is the single entry point for the entire calculation engine.
 */
export function calculateReport(input: ReportInput): CalculationResult {
  const dob = parseISO(input.personal.dateOfBirth);
  const retirementDate = parseISO(input.employment.plannedRetirementDate);
  const birthYear = dob.getFullYear();
  const retirementYear = getYear(retirementDate);
  const projectionYears = input.projectionYears ?? 30;
  const colaAssumption = input.colaAssumption ?? 0.02;

  // Age at retirement
  const ageAtRetirement = differenceInYears(retirementDate, dob);

  // ---- Service ----
  const service = calculateTotalService(input.employment, input.military);
  const totalServiceDecimal = serviceToDecimalYears(
    service.totalYears,
    service.totalMonths
  );

  // ---- High-3 ----
  const { high3Average, detail: high3Detail } = calculateHigh3(
    input.employment
  );

  // ---- Eligibility ----
  const eligibility = calculateEligibility(
    input.personal.dateOfBirth,
    input.employment.serviceComputationDate,
    input.employment.retirementSystem,
    input.employment.employeeType,
    service.totalYears
  );

  // ---- MRA+10 Early Retirement ----
  const mra = getMRA(birthYear);
  const isMra10 = isMraPlus10Retirement(ageAtRetirement, mra, totalServiceDecimal);

  // ---- Annuity ----
  const annuity = calculateAnnuityWithAge(
    input.employment,
    input.military,
    ageAtRetirement,
    input.socialSecurity.estimatedBenefitAge62
  );

  // ---- MRA+10 Penalty ----
  const mraPlus10 = calculateMraPlus10Penalty(
    annuity.annualAnnuity,
    input.personal.dateOfBirth,
    input.employment.plannedRetirementDate,
    mra,
    totalServiceDecimal
  );

  // Apply MRA+10 penalty to annuity if applicable
  const effectiveAnnualAnnuity = mraPlus10.applies
    ? mraPlus10.reducedAnnuity
    : annuity.annualAnnuity;
  const effectiveMonthlyAnnuity =
    Math.round((effectiveAnnualAnnuity / 12) * 100) / 100;

  // Update annuity result with effective amounts
  const effectiveAnnuity = {
    ...annuity,
    annualAnnuity: effectiveAnnualAnnuity,
    monthlyAnnuity: effectiveMonthlyAnnuity,
  };

  // ---- Survivor Benefit ----
  // Honor explicit input.survivorElection when provided (set by the advisor or
  // parsed from the SF FBI record). Fall back to marital-status default only
  // when truly absent — silently overriding an explicit '50_PERCENT' to NONE
  // because maritalStatus is missing was Matt Dyer's bug.
  const survivorElection: SurvivorElection =
    (input.survivorElection as SurvivorElection | undefined) ??
    (input.personal.maritalStatus === 'MARRIED' ? '50_PERCENT' : 'NONE');
  const survivorBenefit = calculateSurvivorBenefit(
    effectiveAnnualAnnuity,
    survivorElection,
    input.employment.retirementSystem
  );

  // Annuity after survivor reduction
  const annuityAfterSurvivor = effectiveAnnualAnnuity - survivorBenefit.annualCost;

  // ---- FERS Supplement ----
  // Determine FERS service years for supplement calculation
  let fersServiceYears: number;
  if (input.employment.retirementSystem === 'FERS_TRANSFER') {
    fersServiceYears = serviceToDecimalYears(
      input.employment.fersServiceYears ?? 0,
      input.employment.fersServiceMonths ?? 0
    );
  } else {
    fersServiceYears = totalServiceDecimal;
  }

  const fersSupplement = calculateFersSupplement(
    input.socialSecurity.estimatedBenefitAge62,
    fersServiceYears,
    input.personal.dateOfBirth,
    input.employment.plannedRetirementDate,
    input.employment.retirementSystem,
    isMra10
  );

  // ---- Social Security ----
  const socialSecurity = calculateSocialSecurity(
    input.socialSecurity,
    birthYear,
    retirementYear,
    colaAssumption,
    projectionYears
  );

  // ---- COLA Projections ----
  const retirementMonth = parseISO(input.employment.plannedRetirementDate).getMonth();
  const colaProjections = calculateColaProjections(
    annuityAfterSurvivor,
    input.employment.retirementSystem,
    colaAssumption,
    retirementYear,
    projectionYears,
    retirementMonth,
  );

  // ---- TSP ----
  const tsp = calculateTsp(
    input.tsp,
    input.employment,
    input.personal.dateOfBirth,
    projectionYears
  );

  // ---- FEGLI ----
  const fegli = calculateFegli(
    input.fegli,
    input.employment.currentAnnualSalary,
    input.personal.dateOfBirth,
    input.employment.plannedRetirementDate,
    projectionYears,
    input.employment.annualSalaryIncreaseRate,
  );

  // ---- FEHB ----
  const fehb = calculateFehb(
    input.fehb,
    input.personal.dateOfBirth,
    input.employment.plannedRetirementDate,
    projectionYears
  );

  // ---- Deposits ----
  calculateDeposits(
    input.deposits,
    input.military,
    input.employment.retirementSystem,
    high3Average
  );

  // ---- Income Comparison ----
  const lastPaycheck = calculateLastPaycheck(input);

  // Get FEHB employee share at retirement
  const fehbRetirementYear = fehb.projections.find(
    (p) => p.year === retirementYear
  );
  const fehbEmployeeMonthly = fehbRetirementYear
    ? fehbRetirementYear.employeeShare / 12
    : fehb.retirementMonthlyPremium * 0.28;

  // Get FEGLI monthly cost at retirement
  const fegliRetirementYear = fegli.costProjections.find(
    (p) => p.year === retirementYear
  );
  const fegliMonthly = fegliRetirementYear
    ? fegliRetirementYear.totalCost / 12
    : fegli.currentMonthlyCost;

  const firstRetirement = calculateFirstRetirementCheck(
    effectiveAnnuity,
    survivorBenefit,
    fersSupplement,
    socialSecurity,
    tsp,
    fehbEmployeeMonthly,
    fegliMonthly,
    input
  );

  const incomeComparison = buildIncomeComparison(lastPaycheck, firstRetirement);

  // ---- Yearly Projections ----
  const yearlyProjections = calculateYearlyProjections(
    input,
    effectiveAnnuity,
    survivorBenefit,
    fersSupplement,
    socialSecurity,
    tsp,
    fegli,
    fehb,
    colaProjections,
    projectionYears
  );

  // ---- Delayed Retirement (1 year later) ----
  const delayedRetirementDate = addYears(retirementDate, 1);
  const delayedAge = ageAtRetirement + 1;
  const delayedServiceYears = service.totalYears + 1;
  const delayedServiceMonths = service.totalMonths;

  // Recalculate annuity for delayed retirement
  const delayedEmployment = {
    ...input.employment,
    creditableServiceYears: delayedServiceYears,
    creditableServiceMonths: delayedServiceMonths,
    plannedRetirementDate: format(delayedRetirementDate, 'yyyy-MM-dd'),
    currentAnnualSalary:
      input.employment.currentAnnualSalary *
      (1 + input.employment.annualSalaryIncreaseRate),
  };

  const delayedAnnuity = calculateAnnuityWithAge(
    delayedEmployment,
    input.military,
    delayedAge,
    input.socialSecurity.estimatedBenefitAge62
  );

  // ---- Assemble Result ----
  return {
    annuity: effectiveAnnuity,
    survivorBenefit,
    fersSupplement,
    socialSecurity,
    colaProjections,
    tsp,
    fegli,
    fehb,
    incomeComparison,
    yearlyProjections,
    eligibility,
    high3Detail,
    mraPlus10,
    proposedRetirement: {
      date: input.employment.plannedRetirementDate,
      age: ageAtRetirement,
      annualAnnuity: effectiveAnnualAnnuity,
      monthlyAnnuity: effectiveMonthlyAnnuity,
    },
    delayedRetirement: {
      date: format(delayedRetirementDate, 'yyyy-MM-dd'),
      age: delayedAge,
      annualAnnuity: delayedAnnuity.annualAnnuity,
      monthlyAnnuity: delayedAnnuity.monthlyAnnuity,
    },
  };
}

// Re-export all calculators for individual use
export { calculateTotalService, serviceToDecimalYears } from './service';
export { calculateHigh3 } from './high3';
export { calculateAnnuityWithAge, calculateFersAnnuity, calculateCsrsAnnuity, calculateCongressionalAnnuity, calculateCsrsSpecialAnnuity, calculateFersSpecialAnnuity } from './annuity';
export { calculateSurvivorBenefit } from './survivor';
export { calculateFersSupplement } from './supplement';
export { calculateSocialSecurity, getFullRetirementAge } from './social-security';
export { calculateColaProjections, fersColaRate, csrsColaRate } from './cola';
export { calculateTsp, calculateGovernmentMatch } from './tsp';
export { calculateFegli } from './fegli';
export { calculateFehb } from './fehb';
export { calculateMraPlus10Penalty, isMraPlus10Retirement } from './early-retirement';
export { calculateDeposits } from './deposits';
export { calculateEligibility, getMRA } from './eligibility';
