/**
 * FEHB (Federal Employees Health Benefits) Calculations
 *
 * In retirement, the government continues to pay approximately 72% of the
 * weighted average premium (same formula as active employees). The retiree
 * pays the remainder.
 *
 * Premium projections use compound growth at the assumed annual increase rate.
 *
 * Key rules:
 * - Must have been enrolled in FEHB for the 5 years immediately before retirement
 *   (or since first eligibility if less than 5 years)
 * - Government contribution ≈ 72% of the weighted average premium
 * - Premium is deducted from annuity (pre-tax under FEHB)
 */

import { parseISO, differenceInYears, getYear } from 'date-fns';
import type { FehbInfo, FehbResult, FehbProjectionYear } from '../calc-types';

/**
 * Government share of FEHB premium.
 * By law, the government pays the lesser of:
 *   (a) 72% of the weighted average premium for all plans, or
 *   (b) 75% of the total premium for the specific plan
 *
 * In practice, this works out to roughly 72% for most plans.
 * We use 72% as the standard approximation.
 */
const GOVERNMENT_SHARE_RATE = 0.72;

/**
 * Convert biweekly premium to monthly and annual.
 */
function premiumConversions(biweekly: number): {
  monthly: number;
  annual: number;
} {
  // 26 pay periods per year
  const annual = biweekly * 26;
  const monthly = annual / 12;
  return {
    monthly: Math.round(monthly * 100) / 100,
    annual: Math.round(annual * 100) / 100,
  };
}

/**
 * Calculate FEHB projections.
 *
 * @param fehb - FEHB input data
 * @param dateOfBirth - ISO date string
 * @param retirementDate - ISO date string
 * @param projectionYears - Number of years to project (default 30)
 * @returns FehbResult with current costs and year-by-year projections
 */
export function calculateFehb(
  fehb: FehbInfo,
  dateOfBirth: string,
  retirementDate: string,
  projectionYears: number = 30
): FehbResult {
  const dob = parseISO(dateOfBirth);
  const retirement = parseISO(retirementDate);
  const currentAge = differenceInYears(new Date(), dob);
  const retirementYear = getYear(retirement);
  const currentYear = new Date().getFullYear();

  // Current premium conversions
  const current = premiumConversions(fehb.biweeklyPremium);

  // At retirement, same premium structure but government share changes
  const yearsToRetirement = Math.max(retirementYear - currentYear, 0);
  const retirementBiweekly =
    fehb.biweeklyPremium * Math.pow(1 + fehb.premiumIncreaseRate, yearsToRetirement);
  const retirementPremiums = premiumConversions(retirementBiweekly);

  // Year-by-year projections
  const projections: FehbProjectionYear[] = [];

  for (let i = 0; i <= projectionYears; i++) {
    const year = currentYear + i;
    const age = currentAge + i;
    const isRetired = year >= retirementYear;
    const yearsFromNow = i;

    // Project premium forward from current
    const projectedBiweekly =
      fehb.biweeklyPremium *
      Math.pow(1 + fehb.premiumIncreaseRate, yearsFromNow);
    const projectedAnnual = Math.round(projectedBiweekly * 26 * 100) / 100;
    const projectedMonthly = Math.round((projectedAnnual / 12) * 100) / 100;

    // Government share
    const govShare = isRetired
      ? Math.round(projectedAnnual * GOVERNMENT_SHARE_RATE * 100) / 100
      : Math.round(projectedAnnual * GOVERNMENT_SHARE_RATE * 100) / 100;

    const employeeShare =
      Math.round((projectedAnnual - govShare) * 100) / 100;

    projections.push({
      year,
      age,
      annualPremium: projectedAnnual,
      monthlyPremium: projectedMonthly,
      governmentShare: govShare,
      employeeShare,
    });
  }

  return {
    currentMonthlyPremium: current.monthly,
    retirementMonthlyPremium: retirementPremiums.monthly,
    projections,
  };
}
