/**
 * FEGLI (Federal Employees' Group Life Insurance) Calculations
 *
 * Coverage amounts:
 *   - Basic: Salary rounded up to nearest $1,000 + $2,000
 *   - Option A (Standard): $10,000 flat
 *   - Option B (Additional): 1x to 5x salary (rounded up to nearest $1,000)
 *   - Option C (Family): $5,000 per multiple on spouse, $2,500 per multiple on child
 *
 * Biweekly rates are age-banded per OPM published rate tables.
 *
 * Post-65 reduction options for Basic:
 *   - No Reduction: keep full coverage, pay full cost
 *   - 75% Reduction: reduces to 25% at no cost after 65
 *   - 50% Reduction: reduces to 50%, small cost after 65
 *   - Additional reduction to 0%: eventually no coverage
 */

import { parseISO, differenceInYears, getYear } from 'date-fns';
import type {
  FegliInfo,
  FegliResult,
  FegliCostYear,
  FegliReduction,
} from '../calc-types';

/**
 * Calculate Basic FEGLI coverage amount.
 * Salary rounded up to nearest $1,000 + $2,000 extra coverage.
 */
export function calculateBasicCoverage(annualSalary: number): number {
  const roundedUp = Math.ceil(annualSalary / 1000) * 1000;
  return roundedUp + 2000;
}

/**
 * Calculate Option B coverage (1-5 multiples of salary, rounded up).
 */
export function calculateOptionBCoverage(
  annualSalary: number,
  multiple: number
): number {
  const roundedUp = Math.ceil(annualSalary / 1000) * 1000;
  return roundedUp * Math.min(Math.max(multiple, 1), 5);
}

/**
 * Calculate Option C coverage per multiple.
 * Each multiple = $5,000 spouse + $2,500 per eligible child.
 * For cost projection purposes, we use per-multiple values.
 */
export function calculateOptionCCoverage(multiple: number): number {
  // Each multiple provides $5,000 spouse coverage + $2,500 child coverage
  // Total face value per multiple for cost purposes
  return 5000 * Math.min(Math.max(multiple, 1), 5);
}

// ---- OPM-Published FEGLI Premium Rates ----
// Source: opm.gov/healthcare-insurance/life-insurance/program-information/tabs/historical-rates/
// Verified: 2025-05-05. Active employee rates published as biweekly (26 pay periods);
// annuitant rates published as monthly. We store both at OPM's published cadence
// and convert when needed.

/** Active employee Basic — biweekly cost per $1,000 of coverage (employee share). */
const BASIC_BIWEEKLY_RATE_PER_1000_ACTIVE = 0.16;

/**
 * Annuitant (retiree) Basic — MONTHLY cost per $1,000 of coverage, by reduction
 * tier, before vs. after the month following the 65th birthday.
 *
 * Per 5 USC § 8714 and OPM's published rate table:
 *   Until age 65 (charged):
 *     75% Reduction: $0.3467/mo per $1,000  (most common election)
 *     50% Reduction: $1.0967/mo per $1,000
 *     No Reduction:  $2.5967/mo per $1,000
 *   After age 65:
 *     75% Reduction: free
 *     50% Reduction: $0.75/mo per $1,000  (residual cost continues)
 *     No Reduction:  $2.25/mo per $1,000
 */
const ANNUITANT_BASIC_MONTHLY_PER_1000_BEFORE_65: Record<string, number> = {
  '75_PERCENT': 0.3467,
  '50_PERCENT': 1.0967,
  'NO_REDUCTION': 2.5967,
  'ZERO': 0.3467, // Same path as 75% until reduction completes
  '25_PERCENT': 0.3467, // Legacy alias for 75% reduction
};
const ANNUITANT_BASIC_MONTHLY_PER_1000_AFTER_65: Record<string, number> = {
  '75_PERCENT': 0,
  '50_PERCENT': 0.75,
  'NO_REDUCTION': 2.25,
  'ZERO': 0,
  '25_PERCENT': 0,
};

/** Active employee Option A (Standard $10,000) — biweekly by age band. */
const OPTION_A_BIWEEKLY_RATES: Record<string, number> = {
  'under35': 0.20,
  '35-39': 0.20,
  '40-44': 0.30,
  '45-49': 0.60,
  '50-54': 1.00,
  '55-59': 1.80,
  '60-64': 6.00,
  '65-69': 6.00, // active employees age 65+ still pay until separation
  '70-74': 6.00,
  '75-79': 6.00,
  '80+': 6.00,
};

/** Annuitant Option A — MONTHLY by age band (free at 65+). */
const ANNUITANT_OPTION_A_MONTHLY_RATES: Record<string, number> = {
  'under35': 0.43,
  '35-39': 0.43,
  '40-44': 0.65,
  '45-49': 1.30,
  '50-54': 2.17,
  '55-59': 3.90,
  '60-64': 13.00,
  '65-69': 0,
  '70-74': 0,
  '75-79': 0,
  '80+': 0,
};

/** Active employee Option B — biweekly per $1,000 of coverage by age band. */
const OPTION_B_BIWEEKLY_RATES_PER_1000: Record<string, number> = {
  'under35': 0.02,
  '35-39': 0.02,
  '40-44': 0.03,
  '45-49': 0.06,
  '50-54': 0.10,
  '55-59': 0.18,
  '60-64': 0.40,
  '65-69': 0.48,
  '70-74': 0.86,
  '75-79': 1.80,
  '80+': 2.88,
};

/** Annuitant Option B — MONTHLY per $1,000 of coverage by age band. */
const ANNUITANT_OPTION_B_MONTHLY_RATES_PER_1000: Record<string, number> = {
  'under35': 0.043,
  '35-39': 0.043,
  '40-44': 0.065,
  '45-49': 0.130,
  '50-54': 0.217,
  '55-59': 0.390,
  '60-64': 0.867,
  '65-69': 1.040,
  '70-74': 1.863,
  '75-79': 3.900,
  '80+': 6.240,
};

/** Active employee Option C — biweekly per multiple by age band. */
const OPTION_C_BIWEEKLY_RATES: Record<string, number> = {
  'under35': 0.20,
  '35-39': 0.24,
  '40-44': 0.37,
  '45-49': 0.53,
  '50-54': 0.83,
  '55-59': 1.33,
  '60-64': 2.43,
  '65-69': 2.83,
  '70-74': 3.83,
  '75-79': 5.76,
  '80+': 7.80,
};

/** Annuitant Option C — MONTHLY per multiple by age band. */
const ANNUITANT_OPTION_C_MONTHLY_RATES: Record<string, number> = {
  'under35': 0.43,
  '35-39': 0.52,
  '40-44': 0.80,
  '45-49': 1.15,
  '50-54': 1.80,
  '55-59': 2.88,
  '60-64': 5.27,
  '65-69': 6.13,
  '70-74': 8.30,
  '75-79': 12.48,
  '80+': 16.90,
};

const BIWEEKLY_TO_MONTHLY = 26 / 12;

/**
 * Get the age band key for rate lookup.
 */
function getAgeBand(age: number): string {
  if (age < 35) return 'under35';
  if (age <= 39) return '35-39';
  if (age <= 44) return '40-44';
  if (age <= 49) return '45-49';
  if (age <= 54) return '50-54';
  if (age <= 59) return '55-59';
  if (age <= 64) return '60-64';
  if (age <= 69) return '65-69';
  if (age <= 74) return '70-74';
  if (age <= 79) return '75-79';
  return '80+';
}

/**
 * Active employee Basic biweekly cost (per OPM rate table, $0.16 per $1,000).
 */
function basicActiveBiweeklyCost(coverage: number): number {
  return (coverage / 1000) * BASIC_BIWEEKLY_RATE_PER_1000_ACTIVE;
}

/**
 * Annuitant Basic monthly cost — depends on age (before/after 65) and the
 * elected reduction tier. Returns the MONTHLY amount; convert to biweekly with
 * `× 12 / 26` if needed.
 */
function basicAnnuitantMonthlyCost(
  coverage: number,
  age: number,
  reduction: FegliReduction
): number {
  const rate =
    age < 65
      ? ANNUITANT_BASIC_MONTHLY_PER_1000_BEFORE_65[reduction] ?? 0.3467
      : ANNUITANT_BASIC_MONTHLY_PER_1000_AFTER_65[reduction] ?? 0;
  return (coverage / 1000) * rate;
}

/**
 * Backwards-compatible biweekly cost wrapper used in pre-retirement years.
 * Annuitant biweekly is derived from the published monthly rate.
 */
function basicBiweeklyCost(
  coverage: number,
  age: number,
  isRetired: boolean,
  reduction: FegliReduction = '75_PERCENT'
): number {
  if (!isRetired) {
    return basicActiveBiweeklyCost(coverage);
  }
  const monthly = basicAnnuitantMonthlyCost(coverage, age, reduction);
  return monthly / BIWEEKLY_TO_MONTHLY;
}

/**
 * Option A biweekly cost. Active employees pay biweekly until separation;
 * annuitants pay the published monthly rate (free at 65+) — converted to a
 * biweekly equivalent for projection consistency.
 */
function optionABiweeklyCost(age: number, isRetired: boolean): number {
  const band = getAgeBand(age);
  if (isRetired) {
    const monthly = ANNUITANT_OPTION_A_MONTHLY_RATES[band] ?? 0;
    return monthly / BIWEEKLY_TO_MONTHLY;
  }
  return OPTION_A_BIWEEKLY_RATES[band] ?? 0;
}

/**
 * Option B biweekly cost. Active rates are biweekly per $1,000 of salary
 * (rounded up to nearest $1,000) × multiple. Annuitant rates are monthly
 * per $1,000 of coverage; converted to biweekly equivalent.
 */
function optionBBiweeklyCost(
  annualSalary: number,
  multiple: number,
  age: number,
  isRetired: boolean
): number {
  const band = getAgeBand(age);
  const roundedSalary = Math.ceil(annualSalary / 1000) * 1000;
  if (isRetired) {
    const monthlyPer1000 = ANNUITANT_OPTION_B_MONTHLY_RATES_PER_1000[band] ?? 0;
    const monthly = (roundedSalary / 1000) * monthlyPer1000 * multiple;
    return monthly / BIWEEKLY_TO_MONTHLY;
  }
  const ratePer1000 = OPTION_B_BIWEEKLY_RATES_PER_1000[band] ?? 0;
  return (roundedSalary / 1000) * ratePer1000 * multiple;
}

/**
 * Option C biweekly cost. Active employees pay biweekly per multiple;
 * annuitants pay monthly per multiple (free at 65+ for some tiers, with
 * residual cost showing in the rate table for ages 65+ tier).
 */
function optionCBiweeklyCost(
  multiple: number,
  age: number,
  isRetired: boolean
): number {
  const band = getAgeBand(age);
  if (isRetired) {
    const monthly = ANNUITANT_OPTION_C_MONTHLY_RATES[band] ?? 0;
    return (monthly * multiple) / BIWEEKLY_TO_MONTHLY;
  }
  const rate = OPTION_C_BIWEEKLY_RATES[band] ?? 0;
  return rate * multiple;
}

/**
 * Apply post-65 Basic coverage reduction.
 *
 * After age 65 (or retirement if later), Basic coverage reduces:
 * - 75% Reduction: reduces 2% per month to 25% of pre-retirement amount (free)
 * - 50% Reduction: reduces 1% per month to 50% (small cost)
 * - No Reduction: keeps full coverage (continues paying)
 * - ZERO: eventually reduces to nothing
 *
 * For simplicity, we model the final reduction amount by year.
 */
function postRetirementBasicCoverage(
  fullCoverage: number,
  age: number,
  retirementAge: number,
  reduction: FegliReduction
): { coverage: number; biweeklyCost: number } {
  const reductionStartAge = Math.max(65, retirementAge);

  // Pre-reduction (after retirement, before 65 or before reduction begins)
  if (age < reductionStartAge) {
    const isRetired = age >= retirementAge;
    return {
      coverage: fullCoverage,
      biweeklyCost: basicBiweeklyCost(fullCoverage, age, isRetired, reduction),
    };
  }

  const monthsSinceStart = (age - reductionStartAge) * 12;

  switch (reduction) {
    case 'NO_REDUCTION':
      // Full coverage continues, retiree keeps paying the No-Reduction tier
      return {
        coverage: fullCoverage,
        biweeklyCost: basicBiweeklyCost(fullCoverage, age, true, 'NO_REDUCTION'),
      };

    case '75_PERCENT': {
      // Reduces 2% per month until 25% remaining. Per OPM rate table, the
      // 75% Reduction tier is FREE once the retiree is past the month after
      // their 65th birthday — and the rate table shows $0.3467/mo until 65,
      // then free. We follow that table: free for retirements ≥65.
      const reductionPercent = Math.min(monthsSinceStart * 0.02, 0.75);
      const coverage = fullCoverage * (1 - reductionPercent);
      const biweeklyCost = basicBiweeklyCost(coverage, age, true, '75_PERCENT');
      return { coverage: Math.round(coverage), biweeklyCost };
    }

    case '50_PERCENT': {
      // Reduces 1% per month until 50% remaining. Per OPM, retiree continues
      // paying $1.0967/mo per $1,000 until age 65, then $0.75/mo per $1,000.
      const reductionPercent = Math.min(monthsSinceStart * 0.01, 0.50);
      const coverage = fullCoverage * (1 - reductionPercent);
      const biweeklyCost = basicBiweeklyCost(coverage, age, true, '50_PERCENT');
      return { coverage: Math.round(coverage), biweeklyCost };
    }

    case '25_PERCENT': {
      // Reduces 2% per month until 25%, then continues to reduce
      // to a final amount based on additional coverage purchased
      const reductionPercent = Math.min(monthsSinceStart * 0.02, 0.75);
      const coverage = fullCoverage * (1 - reductionPercent);
      const biweeklyCost =
        reductionPercent >= 0.75 ? 0 : basicBiweeklyCost(coverage, age, true);
      return { coverage: Math.round(coverage), biweeklyCost };
    }

    case 'ZERO': {
      // Reduces 2% per month until nothing
      const reductionPercent = Math.min(monthsSinceStart * 0.02, 1.0);
      const coverage = fullCoverage * (1 - reductionPercent);
      const biweeklyCost =
        reductionPercent >= 1.0 ? 0 : basicBiweeklyCost(coverage, age, true);
      return { coverage: Math.round(coverage), biweeklyCost };
    }

    default:
      return {
        coverage: fullCoverage,
        biweeklyCost: basicBiweeklyCost(fullCoverage, age, true),
      };
  }
}

/**
 * Main FEGLI calculator.
 *
 * Computes current coverage amounts, current costs, and year-by-year
 * cost projections from current age through projection period.
 */
export function calculateFegli(
  fegli: FegliInfo,
  annualSalary: number,
  dateOfBirth: string,
  retirementDate: string,
  projectionYears: number = 30,
  annualSalaryIncreaseRate: number = 0.02
): FegliResult {
  const dob = parseISO(dateOfBirth);
  const retirement = parseISO(retirementDate);
  const currentAge = differenceInYears(new Date(), dob);
  const retirementAge = differenceInYears(retirement, dob);
  const retirementYear = getYear(retirement);
  const currentYear = new Date().getFullYear();

  // Helper: projected salary at year offset i (i=0 is currentYear)
  const salaryAt = (i: number) =>
    annualSalary * Math.pow(1 + annualSalaryIncreaseRate, i);

  // Current coverage amounts
  const basicCov = fegli.basicCoverage ? calculateBasicCoverage(annualSalary) : 0;
  const optionACov = fegli.optionA ? 10000 : 0;
  const optionBCov = fegli.optionB
    ? calculateOptionBCoverage(annualSalary, fegli.optionBMultiple)
    : 0;
  const optionCCov = fegli.optionC
    ? calculateOptionCCoverage(fegli.optionCMultiple)
    : 0;
  const totalCov = basicCov + optionACov + optionBCov + optionCCov;

  // Current biweekly costs (employee is active today)
  const currentBasicBiweekly = fegli.basicCoverage
    ? basicBiweeklyCost(basicCov, currentAge, false)
    : 0;
  const currentOptionABiweekly = fegli.optionA
    ? optionABiweeklyCost(currentAge, false)
    : 0;
  const currentOptionBBiweekly = fegli.optionB
    ? optionBBiweeklyCost(annualSalary, fegli.optionBMultiple, currentAge, false)
    : 0;
  const currentOptionCBiweekly = fegli.optionC
    ? optionCBiweeklyCost(fegli.optionCMultiple, currentAge, false)
    : 0;

  // 26 pay periods per year, divide by 2 for monthly (~ 2.167 pay periods/month)
  const biweeklyToMonthly = 26 / 12;
  const currentMonthlyCost =
    Math.round(
      (currentBasicBiweekly +
        currentOptionABiweekly +
        currentOptionBBiweekly +
        currentOptionCBiweekly) *
        biweeklyToMonthly *
        100
    ) / 100;

  // Year-by-year cost projections.
  // Pre-retirement: Basic coverage = ceil(projected salary / 1000) × 1000 + $2,000.
  // Post-retirement: coverage freezes at the at-retirement amount and the
  // elected reduction kicks in starting at max(65, retirementAge).
  const costProjections: FegliCostYear[] = [];

  // Pre-compute the at-retirement basic coverage from the projected salary.
  const yearsToRetirement = retirementYear - currentYear;
  const retirementSalary = salaryAt(yearsToRetirement);
  const basicCovAtRetirement = fegli.basicCoverage
    ? calculateBasicCoverage(retirementSalary)
    : 0;

  for (let i = 0; i <= projectionYears; i++) {
    const year = currentYear + i;
    const age = currentAge + i;
    const isRetired = year >= retirementYear;

    // Basic coverage
    let basicInfo: { coverage: number; biweeklyCost: number };
    if (fegli.basicCoverage) {
      if (isRetired) {
        basicInfo = postRetirementBasicCoverage(
          basicCovAtRetirement,
          age,
          retirementAge,
          fegli.postRetirementReduction
        );
      } else {
        const yearSalary = salaryAt(i);
        const yearCoverage = calculateBasicCoverage(yearSalary);
        basicInfo = {
          coverage: yearCoverage,
          biweeklyCost: basicBiweeklyCost(yearCoverage, age, false),
        };
      }
    } else {
      basicInfo = { coverage: 0, biweeklyCost: 0 };
    }

    // Option A: $10,000 flat. Annuitants are free at 65+ (per OPM rate table).
    const optACov = fegli.optionA ? optionACov : 0;
    const optABiweekly = fegli.optionA ? optionABiweeklyCost(age, isRetired) : 0;

    // Option B: stays at full multiple unless retiree elected the 2%/mo reduction.
    // Per OPM rate table the published rates continue at every age band, so
    // coverage holds steady; cost rises with age for those who keep it.
    let optBCov = 0;
    let optBBiweekly = 0;
    if (fegli.optionB) {
      optBCov = optionBCov;
      optBBiweekly = optionBBiweeklyCost(
        annualSalary,
        fegli.optionBMultiple,
        age,
        isRetired,
      );
    }

    // Option C: family coverage. Annuitants pay published monthly rates by age.
    let optCCov = 0;
    let optCBiweekly = 0;
    if (fegli.optionC) {
      optCCov = optionCCov;
      optCBiweekly = optionCBiweeklyCost(fegli.optionCMultiple, age, isRetired);
    }

    // Convert biweekly to annual (26 pay periods)
    const annualBasic = Math.round(basicInfo.biweeklyCost * 26 * 100) / 100;
    const annualOptA = Math.round(optABiweekly * 26 * 100) / 100;
    const annualOptB = Math.round(optBBiweekly * 26 * 100) / 100;
    const annualOptC = Math.round(optCBiweekly * 26 * 100) / 100;
    const totalAnnual =
      Math.round((annualBasic + annualOptA + annualOptB + annualOptC) * 100) /
      100;

    costProjections.push({
      age,
      year,
      basicCost: annualBasic,
      optionACost: annualOptA,
      optionBCost: annualOptB,
      optionCCost: annualOptC,
      totalCost: totalAnnual,
      basicCoverage: basicInfo.coverage,
      optionACoverage: optACov,
      optionBCoverage: optBCov,
      optionCCoverage: optCCov,
    });
  }

  return {
    currentCoverage: {
      basic: basicCov,
      optionA: optionACov,
      optionB: optionBCov,
      optionC: optionCCov,
      total: totalCov,
    },
    currentMonthlyCost,
    costProjections,
  };
}
