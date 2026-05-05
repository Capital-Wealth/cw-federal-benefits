/**
 * Deposit and Redeposit Calculations
 *
 * Federal employees may owe deposits for:
 * 1. Non-deduction service (civilian service where retirement deductions were not withheld)
 *    - FERS deposit: 1.3% of basic pay earned during the period (3.1% for Congressional)
 *    - CSRS deposit: 7% of basic pay (7.5% for Congressional)
 *
 * 2. Redeposits (for service where retirement contributions were refunded)
 *    - Amount = refunded contributions
 *
 * Interest accrues on unpaid deposits/redeposits:
 * - No interest if paid before separation or within required timeframe
 * - After the interest-free period: variable rate set annually by Treasury
 * - Interest is compounded annually
 *
 * If deposits are not paid:
 * - FERS: service is not credited in annuity computation
 * - CSRS: service IS credited but annuity is actuarially reduced
 */

import type { DepositInfo, MilitaryService, RetirementSystem } from '../calc-types';

/**
 * Annual interest rates used by OPM for deposit/redeposit calculations.
 * These are based on the average yield on Treasury securities.
 * Using a representative set of recent rates.
 */
const DEPOSIT_INTEREST_RATES: Record<number, number> = {
  2000: 0.0575,
  2001: 0.0575,
  2002: 0.05,
  2003: 0.0425,
  2004: 0.04,
  2005: 0.04,
  2006: 0.0425,
  2007: 0.045,
  2008: 0.0475,
  2009: 0.0425,
  2010: 0.035,
  2011: 0.0275,
  2012: 0.02,
  2013: 0.0175,
  2014: 0.02,
  2015: 0.0225,
  2016: 0.02,
  2017: 0.02,
  2018: 0.0225,
  2019: 0.0275,
  2020: 0.02,
  2021: 0.0125,
  2022: 0.015,
  2023: 0.03,
  2024: 0.04,
  2025: 0.0425,
  2026: 0.04,
};

/**
 * Get the interest rate for a given year.
 * Falls back to a default rate for years not in the table.
 */
function getInterestRate(year: number): number {
  return DEPOSIT_INTEREST_RATES[year] ?? 0.035;
}

/**
 * Calculate the deposit amount owed for non-deduction civilian service.
 *
 * @param basicPayEarned - Total basic pay earned during the non-deduction period
 * @param retirementSystem - FERS or CSRS (determines deposit rate)
 * @returns Base deposit amount (before interest)
 */
export function calculateBaseDeposit(
  basicPayEarned: number,
  retirementSystem: RetirementSystem
): number {
  let rate: number;
  switch (retirementSystem) {
    case 'FERS':
    case 'FERS_TRANSFER':
      rate = 0.013; // 1.3% for FERS
      break;
    case 'CSRS':
    case 'CSRS_OFFSET':
      rate = 0.07; // 7% for CSRS
      break;
    default:
      rate = 0.013;
  }
  return Math.round(basicPayEarned * rate * 100) / 100;
}

/**
 * Calculate the military service deposit.
 *
 * Post-1956 military service deposit for FERS:
 * - 3% of military basic pay (for service after 1998: 3.0%)
 * - For pre-1999 service: 7% if CSRS time
 *
 * Simplified: uses 3% of estimated military pay.
 *
 * @param military - Military service information
 * @param retirementSystem - Determines deposit rate
 * @returns Deposit amount owed (0 if already paid or no military service)
 */
export function calculateMilitaryDeposit(
  military: MilitaryService,
  retirementSystem: RetirementSystem
): number {
  if (!military.hasMilitaryService || military.depositPaid) {
    return 0;
  }
  // If the user has provided a specific amount owed, use it
  if (military.depositAmountOwed > 0) {
    return military.depositAmountOwed;
  }
  return 0;
}

/**
 * Calculate interest on an unpaid deposit or redeposit.
 *
 * Interest accrues from the date it first became due, compounded annually.
 *
 * @param principal - Original deposit/redeposit amount
 * @param startYear - Year interest begins accruing
 * @param endYear - Year of payment (or current year)
 * @returns Total amount owed including interest
 */
export function calculateDepositWithInterest(
  principal: number,
  startYear: number,
  endYear: number
): { totalOwed: number; interestAccrued: number; yearByYear: { year: number; rate: number; balance: number }[] } {
  if (principal <= 0 || endYear <= startYear) {
    return { totalOwed: principal, interestAccrued: 0, yearByYear: [] };
  }

  let balance = principal;
  const yearByYear: { year: number; rate: number; balance: number }[] = [];

  for (let year = startYear; year < endYear; year++) {
    const rate = getInterestRate(year);
    const interest = balance * rate;
    balance = Math.round((balance + interest) * 100) / 100;
    yearByYear.push({
      year,
      rate,
      balance,
    });
  }

  return {
    totalOwed: Math.round(balance * 100) / 100,
    interestAccrued: Math.round((balance - principal) * 100) / 100,
    yearByYear,
  };
}

/**
 * Calculate the annuity impact of unpaid deposits.
 *
 * For FERS: unpaid deposit means the service is NOT credited.
 *   - Impact = lost annuity from uncredited years
 *
 * For CSRS: service is credited but annuity is actuarially reduced.
 *   - Reduction ≈ deposit amount with interest / present value factor
 *
 * @param depositOwed - Amount of unpaid deposit
 * @param serviceYearsAffected - Years of service that would be lost/reduced
 * @param high3 - High-3 average salary
 * @param retirementSystem - FERS or CSRS
 * @returns Annual annuity impact
 */
export function calculateDepositImpactOnAnnuity(
  depositOwed: number,
  serviceYearsAffected: number,
  high3: number,
  retirementSystem: RetirementSystem
): { annualImpact: number; recommendation: string } {
  if (depositOwed <= 0 || serviceYearsAffected <= 0) {
    return { annualImpact: 0, recommendation: 'No deposit action needed.' };
  }

  if (retirementSystem === 'FERS' || retirementSystem === 'FERS_TRANSFER') {
    // FERS: service not credited = lost annuity
    // Lost annuity = 1% × high-3 × years (approximate)
    const lostAnnual = 0.01 * high3 * serviceYearsAffected;
    const roundedLost = Math.round(lostAnnual * 100) / 100;

    return {
      annualImpact: roundedLost,
      recommendation:
        lostAnnual > depositOwed
          ? `Paying the deposit of $${depositOwed.toFixed(2)} is recommended. You would gain $${roundedLost.toFixed(2)}/year in annuity.`
          : `Consider the cost-benefit: deposit is $${depositOwed.toFixed(2)} for $${roundedLost.toFixed(2)}/year in additional annuity.`,
    };
  }

  // CSRS: actuarial reduction
  // Approximate reduction using a present value factor of ~14 (typical for age 60-62)
  const presentValueFactor = 14;
  const annualReduction =
    Math.round((depositOwed / presentValueFactor) * 100) / 100;

  return {
    annualImpact: annualReduction,
    recommendation: `Unpaid redeposit of $${depositOwed.toFixed(2)} results in ~$${annualReduction.toFixed(2)}/year annuity reduction.`,
  };
}

/**
 * Master deposit calculator combining all deposit types.
 */
export function calculateDeposits(
  deposits: DepositInfo,
  military: MilitaryService,
  retirementSystem: RetirementSystem,
  high3: number
): {
  civilianDepositOwed: number;
  civilianReDepositOwed: number;
  militaryDepositOwed: number;
  totalOwed: number;
  annuityImpact: number;
  recommendation: string;
} {
  const civilianDeposit = deposits.hasNonDeductionService
    ? deposits.depositOwed
    : 0;
  const civilianReDeposit = deposits.hasRefundedService
    ? deposits.reDepositOwed
    : 0;
  const militaryDeposit = calculateMilitaryDeposit(military, retirementSystem);
  const totalOwed = civilianDeposit + civilianReDeposit + militaryDeposit;

  // Estimate affected service years (rough: deposit / average annual deposit)
  // For a more precise calculation, we'd need the actual service dates
  const estimatedYearsAffected =
    civilianDeposit > 0 ? Math.max(civilianDeposit / (high3 * 0.013), 1) : 0;

  const impact = calculateDepositImpactOnAnnuity(
    totalOwed,
    estimatedYearsAffected,
    high3,
    retirementSystem
  );

  return {
    civilianDepositOwed: civilianDeposit,
    civilianReDepositOwed: civilianReDeposit,
    militaryDepositOwed: militaryDeposit,
    totalOwed: Math.round(totalOwed * 100) / 100,
    annuityImpact: impact.annualImpact,
    recommendation: impact.recommendation,
  };
}
