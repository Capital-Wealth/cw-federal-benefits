/**
 * FERS Retirement Calculation Engine
 *
 * Implements the Federal Employees Retirement System pension formula,
 * FERS supplement, TSP projections, and total retirement income analysis.
 *
 * References:
 * - OPM FERS Handbook: https://www.opm.gov/retirement-center/fers-information/
 * - FERS Pension Formula: 1% × High-3 × Years of Service (1.1% if age 62+ with 20+ years)
 * - Sick Leave Credit: hours / 2087 = years of additional service credit
 * - FERS Supplement ≈ (Years of FERS service / 40) × SS benefit at 62
 */

import type {
  FederalBenefitsIntake,
  RetirementProjection,
  ScenarioComparison,
} from "@/types";

import {
  HOURS_PER_YEAR, PAY_PERIODS_PER_YEAR, MONTHS_PER_YEAR,
  FERS_MULTIPLIER_STANDARD, FERS_MULTIPLIER_ENHANCED,
  CSRS_MULTIPLIER_FIRST_5, CSRS_MULTIPLIER_NEXT_5, CSRS_MULTIPLIER_OVER_10,
  CSRS_PENSION_CAP, CSRS_SURVIVOR_THRESHOLD,
  FERS_SUPPLEMENT_SS_DIVISOR, FERS_AGENCY_MATCH,
  DEFAULT_SALARY_INCREASE_PCT, DEFAULT_TSP_RETURN_PCT,
  DEFAULT_LIFE_EXPECTANCY_YEARS, DEFAULT_ANNUITY_RATE_PCT,
} from "@/config";

// ============================================================
// Core Calculation Functions
// ============================================================

/**
 * Calculate years of creditable service from SCD to retirement date.
 */
export function calculateYearsOfService(
  scd: string,
  retirementDate: string
): number {
  const start = new Date(scd);
  const end = new Date(retirementDate);
  const diffMs = end.getTime() - start.getTime();
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, years);
}

/**
 * Convert sick leave hours to years of service credit.
 * OPM formula: total sick leave hours / 2087 = additional years of credit
 */
export function sickLeaveToServiceCredit(hours: number): number {
  return hours / HOURS_PER_YEAR;
}

/**
 * Calculate the High-3 average salary.
 * Projects current salary forward with annual increases to find the
 * highest 3 consecutive years of service.
 */
export function calculateHighThree(
  currentSalary: number,
  yearsUntilRetirement: number,
  annualIncrease: number
): number {
  if (yearsUntilRetirement <= 0) return currentSalary;

  // Project salaries forward
  const salaries: number[] = [];
  for (let i = 0; i <= Math.ceil(yearsUntilRetirement); i++) {
    salaries.push(currentSalary * Math.pow(1 + annualIncrease / 100, i));
  }

  // High-3 is the average of the 3 highest consecutive years
  // Typically the last 3 years before retirement
  if (salaries.length >= 3) {
    const last3 = salaries.slice(-3);
    return last3.reduce((a, b) => a + b, 0) / 3;
  }

  return salaries.reduce((a, b) => a + b, 0) / salaries.length;
}

/**
 * Calculate FERS pension.
 *
 * Standard: 1% × High-3 × Years of Service
 * Enhanced: 1.1% × High-3 × Years of Service (if age 62+ with 20+ years)
 */
export function calculateFERSPension(
  highThree: number,
  yearsOfService: number,
  retirementAge: number
): { annual: number; monthly: number; multiplier: number } {
  const useEnhanced = retirementAge >= 62 && yearsOfService >= 20;
  const multiplier = useEnhanced
    ? FERS_MULTIPLIER_ENHANCED
    : FERS_MULTIPLIER_STANDARD;

  const annual = multiplier * highThree * yearsOfService;
  return {
    annual: Math.round(annual * 100) / 100,
    monthly: Math.round((annual / MONTHS_PER_YEAR) * 100) / 100,
    multiplier,
  };
}

/**
 * Calculate CSRS pension (for CSRS/xFERS employees).
 *
 * Tiered formula:
 * - First 5 years: 1.5% × High-3 per year
 * - Next 5 years: 1.75% × High-3 per year
 * - Years over 10: 2% × High-3 per year
 */
export function calculateCSRSPension(
  highThree: number,
  yearsOfService: number
): { annual: number; monthly: number } {
  let annual = 0;

  if (yearsOfService <= 5) {
    annual = CSRS_MULTIPLIER_FIRST_5 * highThree * yearsOfService;
  } else if (yearsOfService <= 10) {
    annual =
      CSRS_MULTIPLIER_FIRST_5 * highThree * 5 +
      CSRS_MULTIPLIER_NEXT_5 * highThree * (yearsOfService - 5);
  } else {
    annual =
      CSRS_MULTIPLIER_FIRST_5 * highThree * 5 +
      CSRS_MULTIPLIER_NEXT_5 * highThree * 5 +
      CSRS_MULTIPLIER_OVER_10 * highThree * (yearsOfService - 10);
  }

  // CSRS pension capped at 80% of high-3
  annual = Math.min(annual, highThree * CSRS_PENSION_CAP);

  return {
    annual: Math.round(annual * 100) / 100,
    monthly: Math.round((annual / MONTHS_PER_YEAR) * 100) / 100,
  };
}

/**
 * Calculate survivor benefit reduction.
 *
 * FERS: 10% reduction for max (50%) survivor benefit
 *       5% reduction for 25% survivor benefit
 * CSRS: Varies by percentage elected
 */
export function calculateSurvivorReduction(
  annualPension: number,
  system: "FERS" | "CSRS",
  survivorPct: number
): number {
  if (system === "FERS") {
    if (survivorPct >= 50) return annualPension * 0.1;
    if (survivorPct >= 25) return annualPension * 0.05;
    return 0;
  }

  // CSRS: reduction = 2.5% of first $3,600 + 10% of remainder, × survivor %
  const base = Math.min(annualPension, CSRS_SURVIVOR_THRESHOLD) * 0.025;
  const excess = Math.max(0, annualPension - CSRS_SURVIVOR_THRESHOLD) * 0.1;
  return (base + excess) * (survivorPct / 100);
}

/**
 * Calculate FERS Supplement for employees retiring before age 62.
 *
 * Approximation: (Years of FERS service / 40) × SS benefit at 62
 * Supplement ends at age 62 when actual SS can begin.
 */
export function calculateFERSSupplement(
  yearsOfFersService: number,
  estimatedSsBenefitAt62: number
): number {
  const supplement =
    (yearsOfFersService / FERS_SUPPLEMENT_SS_DIVISOR) * estimatedSsBenefitAt62;
  return Math.round(supplement * 100) / 100;
}

/**
 * Project TSP balance at retirement.
 *
 * Compounds existing balances + future contributions at assumed return rates.
 */
export function projectTSPBalance(
  currentBalance: number,
  biweeklyContribution: number,
  agencyMatch: number, // typically 5% for FERS
  annualReturn: number,
  yearsUntilRetirement: number
): number {
  const ratePerPeriod = annualReturn / 100 / PAY_PERIODS_PER_YEAR;
  const totalPeriods = Math.round(yearsUntilRetirement * PAY_PERIODS_PER_YEAR);
  const totalBiweeklyContrib = biweeklyContribution + agencyMatch;

  // Future value of existing balance
  let balance = currentBalance * Math.pow(1 + ratePerPeriod, totalPeriods);

  // Future value of contribution stream
  if (ratePerPeriod > 0) {
    balance +=
      totalBiweeklyContrib *
      ((Math.pow(1 + ratePerPeriod, totalPeriods) - 1) / ratePerPeriod);
  } else {
    balance += totalBiweeklyContrib * totalPeriods;
  }

  return Math.round(balance * 100) / 100;
}

/**
 * Calculate monthly TSP income based on withdrawal strategy.
 */
export function calculateTSPMonthlyIncome(
  balance: number,
  withdrawalType: "Lump Sum" | "Monthly Amount" | "Annuity",
  monthlyAmount?: number,
  lifeExpectancyYears?: number,
  annuityRate?: number
): number {
  switch (withdrawalType) {
    case "Lump Sum":
      return 0; // One-time withdrawal, not monthly income
    case "Monthly Amount":
      if (monthlyAmount) return monthlyAmount;
      // Life expectancy method
      if (lifeExpectancyYears && lifeExpectancyYears > 0) {
        return Math.round((balance / (lifeExpectancyYears * MONTHS_PER_YEAR)) * 100) / 100;
      }
      return 0;
    case "Annuity":
      // TSP annuity calculation (simplified)
      const rate = (annuityRate || DEFAULT_ANNUITY_RATE_PCT) / 100 / MONTHS_PER_YEAR;
      const payments = (lifeExpectancyYears || DEFAULT_LIFE_EXPECTANCY_YEARS) * MONTHS_PER_YEAR;
      if (rate > 0) {
        return Math.round(
          balance * (rate / (1 - Math.pow(1 + rate, -payments))) * 100
        ) / 100;
      }
      return Math.round((balance / payments) * 100) / 100;
    default:
      return 0;
  }
}

// ============================================================
// Full Retirement Projection
// ============================================================

/**
 * Generate a complete retirement projection from intake data.
 */
export function calculateRetirementProjection(
  intake: FederalBenefitsIntake
): RetirementProjection | null {
  if (
    !intake.serviceComputationDate ||
    !intake.desiredRetirementDate ||
    !intake.currentAnnualSalary
  ) {
    return null;
  }

  const today = new Date();
  const retirementDate = new Date(intake.desiredRetirementDate);
  const yearsUntilRetirement =
    (retirementDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

  // Years of service
  const baseYears = calculateYearsOfService(
    intake.serviceComputationDate,
    intake.desiredRetirementDate
  );
  const sickLeaveCredit = sickLeaveToServiceCredit(
    intake.sickLeaveHoursToDate || 0
  );
  const totalServiceCredit = baseYears + sickLeaveCredit;

  // Retirement age
  let retirementAge: number;
  if (intake.dateOfBirth) {
    const dob = new Date(intake.dateOfBirth);
    retirementAge = retirementDate.getFullYear() - dob.getFullYear();
  } else {
    // Fallback: estimate from SCD (assume career start at ~25)
    const scdDate = new Date(intake.serviceComputationDate);
    retirementAge = retirementDate.getFullYear() - (scdDate.getFullYear() - 25);
  }

  // High-3 average
  const highThree = calculateHighThree(
    intake.currentAnnualSalary,
    Math.max(0, yearsUntilRetirement),
    intake.expectedSalaryIncrease || DEFAULT_SALARY_INCREASE_PCT
  );

  // Pension calculation
  const isFERS =
    intake.retirementSystem === "FERS" || intake.retirementSystem === "xFERS";
  let annualPension: number;
  let monthlyPension: number;
  let multiplier: number;

  if (isFERS) {
    const fers = calculateFERSPension(highThree, totalServiceCredit, retirementAge);
    annualPension = fers.annual;
    monthlyPension = fers.monthly;
    multiplier = fers.multiplier;
  } else {
    const csrs = calculateCSRSPension(highThree, totalServiceCredit);
    annualPension = csrs.annual;
    monthlyPension = csrs.monthly;
    multiplier = totalServiceCredit <= 5 ? CSRS_MULTIPLIER_FIRST_5 : totalServiceCredit <= 10 ? CSRS_MULTIPLIER_NEXT_5 : CSRS_MULTIPLIER_OVER_10;
  }

  // Survivor benefit reduction
  let survivorPct = 0;
  if (isFERS && intake.survivorBenefitFers) {
    survivorPct = parseInt(intake.survivorBenefitFers);
  } else if (!isFERS && intake.survivorBenefitCsrs) {
    survivorPct = intake.survivorBenefitCsrs;
  }
  const survivorReduction = calculateSurvivorReduction(
    annualPension,
    isFERS ? "FERS" : "CSRS",
    survivorPct
  );
  const netMonthlyPension = (annualPension - survivorReduction) / MONTHS_PER_YEAR;

  // FERS Supplement
  let fersSupplementMonthly: number | undefined;
  const fersSupplementEndAge = 62;
  if (isFERS && retirementAge < 62 && intake.ssFersMonthlyBenefit) {
    fersSupplementMonthly = calculateFERSSupplement(
      baseYears,
      intake.ssFersMonthlyBenefit
    );
  }

  // Social Security
  const ssMonthlyBenefit = intake.ssFersMonthlyBenefit || intake.ssCsrsMonthlyBenefit || 0;
  const ssStartAge = intake.ssFersStartAge || intake.ssCsrsStartAge || 62;

  // TSP Projection
  const tspCurrentTotal =
    (intake.tspTradBalances
      ? Object.values(intake.tspTradBalances).reduce((a, b) => a + b, 0)
      : 0) +
    (intake.tspRothBalances
      ? Object.values(intake.tspRothBalances).reduce((a, b) => a + b, 0)
      : 0);

  const tspBiweeklyContrib =
    (intake.tspTradBiweeklyDollar || 0) + (intake.tspRothBiweeklyDollar || 0);

  // Assume blended 7% return for projection if no specific returns given
  const avgReturn = intake.tspReturns
    ? Object.values(intake.tspReturns).reduce((a, b) => a + b, 0) / 5
    : DEFAULT_TSP_RETURN_PCT;

  // FERS agency match: 5% of salary biweekly
  const biweeklySalary = intake.currentAnnualSalary / PAY_PERIODS_PER_YEAR;
  const agencyMatch = isFERS ? biweeklySalary * FERS_AGENCY_MATCH : 0;

  const tspProjectedBalance = projectTSPBalance(
    tspCurrentTotal,
    tspBiweeklyContrib,
    agencyMatch,
    avgReturn,
    Math.max(0, yearsUntilRetirement)
  );

  const tspMonthlyIncome = calculateTSPMonthlyIncome(
    tspProjectedBalance,
    intake.tspWithdrawalType || "Monthly Amount",
    intake.tspMonthlyDollarAmount,
    DEFAULT_LIFE_EXPECTANCY_YEARS,
    intake.tspAnnuityInterestRate
  );

  // Insurance costs at retirement
  const monthlyFehb = (intake.fehbBiweeklyPremium || 0) * PAY_PERIODS_PER_YEAR / MONTHS_PER_YEAR;
  const monthlyFegli = (intake.fegliBiweeklyPremium || 0) * PAY_PERIODS_PER_YEAR / MONTHS_PER_YEAR;

  // Total monthly income
  const totalMonthlyGross =
    netMonthlyPension +
    (fersSupplementMonthly || 0) +
    tspMonthlyIncome +
    (intake.otherTspRollover ? intake.otherTspRollover / (DEFAULT_LIFE_EXPECTANCY_YEARS * MONTHS_PER_YEAR) : 0) +
    (intake.spouseIncome ? intake.spouseIncome / MONTHS_PER_YEAR : 0) +
    (intake.rentalPropertyIncome ? intake.rentalPropertyIncome / MONTHS_PER_YEAR : 0) +
    (intake.retirementJobIncome ? intake.retirementJobIncome / MONTHS_PER_YEAR : 0);

  const totalMonthlyNet = totalMonthlyGross - monthlyFehb - monthlyFegli;

  // Current monthly net (from LES deductions)
  const currentGrossMonthly = intake.currentAnnualSalary / MONTHS_PER_YEAR;
  const currentDeductions =
    (intake.lesRetirementDeduction || 0) +
    (intake.lesSsOasdi || 0) +
    (intake.lesFederalTax || 0) +
    (intake.lesStateTax || 0) +
    (intake.lesDental || 0) +
    (intake.lesVision || 0) +
    (intake.lesFsa || 0) +
    (intake.lesMedicare || 0) +
    (intake.lesAllotment || 0);
  const currentMonthlyNet = currentGrossMonthly - currentDeductions;

  return {
    retirementDate: intake.desiredRetirementDate,
    retirementAge,
    yearsOfService: Math.round(baseYears * 100) / 100,
    sickLeaveCredit: Math.round(sickLeaveCredit * MONTHS_PER_YEAR * 100) / 100, // in months
    totalServiceCredit: Math.round(totalServiceCredit * 100) / 100,
    highThreeAverage: Math.round(highThree * 100) / 100,
    pensionMultiplier: multiplier,
    annualPension: Math.round(annualPension * 100) / 100,
    monthlyPension: Math.round(monthlyPension * 100) / 100,
    survivorBenefitReduction: Math.round(survivorReduction * 100) / 100,
    netMonthlyPension: Math.round(netMonthlyPension * 100) / 100,
    fersSupplementMonthly: fersSupplementMonthly
      ? Math.round(fersSupplementMonthly * 100) / 100
      : undefined,
    fersSupplementEndAge,
    ssMonthlyBenefit,
    ssStartAge,
    tspProjectedBalance: Math.round(tspProjectedBalance * 100) / 100,
    tspMonthlyIncome: Math.round(tspMonthlyIncome * 100) / 100,
    monthlyFehbPremium: Math.round(monthlyFehb * 100) / 100,
    monthlyFegliPremium: Math.round(monthlyFegli * 100) / 100,
    totalMonthlyGross: Math.round(totalMonthlyGross * 100) / 100,
    totalMonthlyNet: Math.round(totalMonthlyNet * 100) / 100,
    totalAnnualGross: Math.round(totalMonthlyGross * MONTHS_PER_YEAR * 100) / 100,
    currentMonthlyNet: Math.round(currentMonthlyNet * 100) / 100,
    incomeReplacementRatio:
      currentMonthlyNet > 0
        ? Math.round((totalMonthlyNet / currentMonthlyNet) * 10000) / 100
        : 0,
  };
}

/**
 * Generate scenario comparisons for different retirement dates.
 */
export function compareScenarios(
  intake: FederalBenefitsIntake,
  retirementDates: string[]
): ScenarioComparison {
  const scenarios: RetirementProjection[] = [];

  for (const date of retirementDates) {
    const modified = { ...intake, desiredRetirementDate: date };
    const projection = calculateRetirementProjection(modified);
    if (projection) {
      scenarios.push(projection);
    }
  }

  // Simple recommendation: highest income replacement ratio
  const best = scenarios.reduce((a, b) =>
    a.incomeReplacementRatio > b.incomeReplacementRatio ? a : b
  );

  const recommendation = `Retiring on ${best.retirementDate} provides the best income replacement at ${best.incomeReplacementRatio}% of current take-home pay, with a projected monthly retirement income of $${best.totalMonthlyNet.toLocaleString()}.`;

  return { scenarios, recommendation };
}
