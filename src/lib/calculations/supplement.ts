/**
 * FERS Supplement Calculation
 *
 * The FERS Supplement approximates the Social Security benefit earned
 * during FERS-covered employment. It is paid from retirement until age 62.
 *
 * Formula:
 *   Monthly supplement = (estimated SS benefit at age 62) × (FERS service years / 40)
 *
 * Eligibility:
 * - Must be FERS (not CSRS)
 * - Must retire before age 62
 * - NOT eligible under MRA+10 (voluntary early) — only for immediate unreduced retirement
 * - Eligible: age 60 with 20+ years, or special provision retirement, or discontinued/RIF
 *
 * The supplement stops at age 62 (when the retiree becomes eligible for SS).
 * Subject to an earnings test if retiree has employment income.
 */

import { parseISO, addYears, format } from 'date-fns';
import type {
  EmploymentInfo,
  RetirementSystem,
  FersSupplementResult,
} from '../calc-types';

/**
 * Determine if the retiree is eligible for the FERS Supplement.
 *
 * @param retirementSystem - Must be FERS or FERS_TRANSFER
 * @param ageAtRetirement - Age when retiring
 * @param isMraPlus10 - Whether this is an MRA+10 early retirement
 * @returns true if eligible
 */
export function isSupplementEligible(
  retirementSystem: RetirementSystem,
  ageAtRetirement: number,
  isMraPlus10: boolean
): boolean {
  // Only FERS and FERS Transfer retirees
  if (retirementSystem !== 'FERS' && retirementSystem !== 'FERS_TRANSFER') {
    return false;
  }

  // Must retire before age 62
  if (ageAtRetirement >= 62) {
    return false;
  }

  // MRA+10 retirees are NOT eligible
  if (isMraPlus10) {
    return false;
  }

  return true;
}

/**
 * SSA earnings test limit applied to the FERS Supplement. Per OPM § 8421a,
 * the supplement is reduced $1 for every $2 of earned income over the SSA
 * "Annual Earnings Test" limit for retirees under FRA. SSA publishes the
 * limit annually (2024 = $22,320; 2025 = $23,400). Updated yearly.
 */
export const SSA_EARNINGS_TEST_LIMIT_2025 = 23400;

/**
 * Apply the earnings test to a monthly supplement amount.
 *
 * @param monthlyAmount  Pre-test monthly supplement
 * @param annualEarnedIncome  Retiree's total earned (W-2/SE) income in the year
 * @param earningsLimit  SSA earnings limit for that year (defaults to 2025)
 * @returns Reduced monthly supplement (never below zero)
 */
export function applyEarningsTest(
  monthlyAmount: number,
  annualEarnedIncome: number,
  earningsLimit: number = SSA_EARNINGS_TEST_LIMIT_2025,
): number {
  if (annualEarnedIncome <= earningsLimit) return monthlyAmount;
  const excess = annualEarnedIncome - earningsLimit;
  const annualReduction = excess / 2;
  const monthlyReduction = annualReduction / 12;
  return Math.max(monthlyAmount - monthlyReduction, 0);
}

/**
 * Calculate the FERS Supplement.
 *
 * @param estimatedSSAt62 - Monthly Social Security benefit estimated at age 62
 * @param fersServiceYears - Total years of FERS-covered service
 * @param dateOfBirth - Employee's date of birth (ISO string)
 * @param retirementDate - Planned retirement date (ISO string)
 * @param retirementSystem - Must be FERS or FERS_TRANSFER
 * @param isMraPlus10 - Whether this is an MRA+10 early retirement
 * @param annualEarnedIncome - Optional post-retirement W-2/SE income; if
 *        provided, the SSA earnings test is applied
 * @returns FersSupplementResult
 */
export function calculateFersSupplement(
  estimatedSSAt62: number,
  fersServiceYears: number,
  dateOfBirth: string,
  retirementDate: string,
  retirementSystem: RetirementSystem,
  isMraPlus10: boolean,
  annualEarnedIncome: number = 0,
): FersSupplementResult {
  const dob = parseISO(dateOfBirth);
  const retirement = parseISO(retirementDate);
  const age62Date = addYears(dob, 62);
  const ageAtRetirement = Math.floor(
    (retirement.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );

  const eligible = isSupplementEligible(
    retirementSystem,
    ageAtRetirement,
    isMraPlus10
  );

  if (!eligible) {
    return {
      eligible: false,
      monthlyAmount: 0,
      annualAmount: 0,
      startDate: format(retirement, 'yyyy-MM-dd'),
      endDate: format(age62Date, 'yyyy-MM-dd'),
    };
  }

  // Supplement = estimated SS at 62 × (FERS years / 40), capped at 40 yrs.
  const cappedYears = Math.min(fersServiceYears, 40);
  const grossMonthly = estimatedSSAt62 * (cappedYears / 40);
  const adjusted = applyEarningsTest(grossMonthly, annualEarnedIncome);

  const monthlyAmount = Math.round(adjusted * 100) / 100;
  const annualAmount = Math.round(monthlyAmount * 12 * 100) / 100;

  return {
    eligible: true,
    monthlyAmount,
    annualAmount,
    startDate: format(retirement, 'yyyy-MM-dd'),
    endDate: format(age62Date, 'yyyy-MM-dd'),
  };
}
