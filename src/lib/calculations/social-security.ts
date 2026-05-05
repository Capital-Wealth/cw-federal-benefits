/**
 * Social Security Benefit Calculations
 *
 * - Full Retirement Age (FRA) by birth year
 * - Early reduction factors (before FRA)
 * - Delayed retirement credits (after FRA)
 * - COLA projections on SS benefits
 */

import type { SocialSecurityInfo, SocialSecurityResult } from '../calc-types';

/**
 * Determine Full Retirement Age (FRA) based on birth year.
 *
 * Per SSA:
 *   Birth year 1943-1954: FRA = 66
 *   1955: 66 + 2 months
 *   1956: 66 + 4 months
 *   1957: 66 + 6 months
 *   1958: 66 + 8 months
 *   1959: 66 + 10 months
 *   1960+: 67
 *
 * Returns FRA as a decimal (e.g., 66.1667 for 66 years 2 months).
 */
export function getFullRetirementAge(birthYear: number): number {
  if (birthYear <= 1942) return 65 + 10 / 12; // 65 and 10 months for 1942
  if (birthYear <= 1954) return 66;
  if (birthYear === 1955) return 66 + 2 / 12;
  if (birthYear === 1956) return 66 + 4 / 12;
  if (birthYear === 1957) return 66 + 6 / 12;
  if (birthYear === 1958) return 66 + 8 / 12;
  if (birthYear === 1959) return 66 + 10 / 12;
  return 67; // 1960 and later
}

/**
 * Calculate the monthly benefit at a given claiming age.
 *
 * If claiming before FRA:
 *   - First 36 months early: reduce by 5/9 of 1% per month (6.67%/yr)
 *   - Additional months beyond 36: reduce by 5/12 of 1% per month (5%/yr)
 *
 * If claiming after FRA:
 *   - Delayed retirement credits: 8% per year (2/3 of 1% per month)
 *   - Max credits: age 70 (no benefit increase after 70)
 *
 * @param benefitAtFRA - Monthly benefit amount at Full Retirement Age
 * @param claimingAge - Age at which benefits are claimed (decimal)
 * @param fra - Full Retirement Age (decimal)
 * @returns Adjusted monthly benefit
 */
export function adjustBenefitForAge(
  benefitAtFRA: number,
  claimingAge: number,
  fra: number
): number {
  if (claimingAge >= fra) {
    // Delayed retirement credits: 8% per year after FRA up to age 70
    const delayMonths = Math.min((claimingAge - fra) * 12, (70 - fra) * 12);
    const creditPerMonth = 8 / 12 / 100; // 2/3 of 1% per month
    return Math.round(benefitAtFRA * (1 + delayMonths * creditPerMonth) * 100) / 100;
  }

  // Early claiming reduction
  const monthsEarly = Math.round((fra - claimingAge) * 12);

  // First 36 months: 5/9 of 1% per month
  const first36 = Math.min(monthsEarly, 36);
  const reductionFirst36 = first36 * (5 / 9 / 100);

  // Months beyond 36: 5/12 of 1% per month
  const beyond36 = Math.max(monthsEarly - 36, 0);
  const reductionBeyond36 = beyond36 * (5 / 12 / 100);

  const totalReduction = reductionFirst36 + reductionBeyond36;
  return Math.round(benefitAtFRA * (1 - totalReduction) * 100) / 100;
}

/**
 * Derive the FRA benefit from age-62 estimate.
 *
 * Given the estimated benefit at 62 and FRA, we can back-calculate
 * what the FRA benefit would be. But if the user provides both the
 * age-62 estimate and the FRA estimate, we use the FRA estimate directly.
 */
export function deriveFRABenefit(
  estimatedAt62: number,
  estimatedAtFRA: number
): number {
  // If user provides FRA estimate, use it directly
  if (estimatedAtFRA > 0) return estimatedAtFRA;

  // Otherwise this is the user's age-62 estimate; we assume it's already
  // been calculated by SSA factoring in early reduction. No further adjustment.
  return estimatedAt62;
}

/**
 * Calculate Social Security projections.
 *
 * @param ssInfo - Social Security input data
 * @param birthYear - Year of birth
 * @param retirementYear - Year of retirement
 * @param colaRate - Annual COLA assumption for SS benefits
 * @param projectionYears - Number of years to project
 */
export function calculateSocialSecurity(
  ssInfo: SocialSecurityInfo,
  birthYear: number,
  retirementYear: number,
  colaRate: number = 0.02,
  projectionYears: number = 30
): SocialSecurityResult {
  const fra = getFullRetirementAge(birthYear);
  const claimingAge = ssInfo.plannedStartAge;

  // Use the FRA estimate if available, otherwise derive from age-62
  const benefitAtFRA = deriveFRABenefit(
    ssInfo.estimatedBenefitAge62,
    ssInfo.estimatedBenefitFRA
  );

  // Calculate benefit at the planned start age
  const monthlyBenefit = adjustBenefitForAge(benefitAtFRA, claimingAge, fra);
  const annualBenefit = Math.round(monthlyBenefit * 12 * 100) / 100;

  // SS benefits start at the claiming age year
  const ssStartYear = birthYear + claimingAge;

  // Year-by-year projections with COLA
  const yearlyProjections: { year: number; annualBenefit: number }[] = [];
  let currentAnnual = annualBenefit;

  for (let i = 0; i < projectionYears; i++) {
    const year = retirementYear + i;

    if (year < ssStartYear) {
      yearlyProjections.push({ year, annualBenefit: 0 });
    } else {
      // Apply COLA starting the year after benefits begin
      if (year > ssStartYear) {
        currentAnnual = Math.round(currentAnnual * (1 + colaRate) * 100) / 100;
      }
      yearlyProjections.push({
        year,
        annualBenefit: currentAnnual,
      });
    }
  }

  return {
    monthlyBenefitAtStartAge: monthlyBenefit,
    annualBenefitAtStartAge: annualBenefit,
    startAge: claimingAge,
    fullRetirementAge: Math.round(fra * 100) / 100,
    yearlyProjections,
  };
}
