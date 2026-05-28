/**
 * COLA (Cost-of-Living Adjustment) Calculations
 *
 * FERS COLA rules:
 *   - If CPI increase <= 2%: COLA = CPI
 *   - If CPI increase > 2% and <= 3%: COLA = 2%
 *   - If CPI increase > 3%: COLA = CPI - 1%
 *
 * CSRS COLA rules:
 *   - Full CPI increase (no cap)
 *
 * FERS Special Provisions (LEO/FF/ATC) and FERS Transfer:
 *   - Same FERS COLA rules apply
 *
 * CSRS Offset:
 *   - Same as CSRS (full CPI) for the annuity portion
 *
 * Note: COLA is first applied in the December after retirement (payable January).
 * Retirees who have been retired less than 1 year receive a prorated COLA.
 */

import type {
  RetirementSystem,
  ColaProjection,
} from '../calc-types';

/**
 * Calculate the effective COLA rate for FERS based on CPI increase.
 *
 * @param cpiIncrease - Annual CPI-W increase (e.g., 0.03 for 3%)
 * @returns Effective COLA rate
 */
export function fersColaRate(cpiIncrease: number): number {
  if (cpiIncrease <= 0) return 0;
  if (cpiIncrease <= 0.02) return cpiIncrease;
  if (cpiIncrease <= 0.03) return 0.02;
  return cpiIncrease - 0.01;
}

/**
 * Calculate the effective COLA rate for CSRS based on CPI increase.
 * CSRS retirees get the full CPI adjustment.
 *
 * @param cpiIncrease - Annual CPI-W increase
 * @returns Effective COLA rate (same as CPI)
 */
export function csrsColaRate(cpiIncrease: number): number {
  return Math.max(cpiIncrease, 0);
}

/**
 * Get the COLA rate based on retirement system and CPI assumption.
 */
export function getColaRate(
  retirementSystem: RetirementSystem,
  cpiIncrease: number
): number {
  switch (retirementSystem) {
    case 'FERS':
    case 'FERS_TRANSFER':
      return fersColaRate(cpiIncrease);
    case 'CSRS':
    case 'CSRS_OFFSET':
      return csrsColaRate(cpiIncrease);
    default:
      return fersColaRate(cpiIncrease);
  }
}

/**
 * First-year COLA proration. OPM (5 USC § 8462(c)) prorates the first COLA
 * paid to a retiree by 1/12 for each month they were retired before the
 * COLA's effective date (December 1). A retiree who retired in November
 * gets 1/12 of the COLA the following January; an April retiree gets 8/12.
 *
 * @param retirementMonth  0-indexed month (Jan = 0, Dec = 11)
 * @returns proration factor between 0 and 1
 */
export function firstYearColaProration(retirementMonth: number): number {
  // Months retired before Dec 1 = (12 - retirementMonth - 1) when month < 11.
  // Retirement in Dec → 0 months before next Dec → 0 proration.
  // Retirement in Nov → 1 month → 1/12 proration.
  // Retirement in Jan → 11 months → 11/12 proration.
  const monthsBeforeDec = Math.max(11 - retirementMonth, 0);
  return monthsBeforeDec / 12;
}

/**
 * Generate year-by-year COLA projections for the annuity.
 *
 * @param startingAnnualAnnuity - Annual annuity at retirement (after survivor reduction)
 * @param retirementSystem - Determines COLA formula
 * @param cpiAssumption - Assumed annual CPI increase
 * @param retirementYear - Year of retirement
 * @param projectionYears - Number of years to project (default 30)
 * @param retirementMonth - 0-indexed month of retirement (default Jan/0)
 * @returns Array of ColaProjection
 */
export function calculateColaProjections(
  startingAnnualAnnuity: number,
  retirementSystem: RetirementSystem,
  cpiAssumption: number,
  retirementYear: number,
  projectionYears: number = 30,
  retirementMonth: number = 0,
  ageAtRetirement: number = 62,
  colaStartsImmediately: boolean = true,
): ColaProjection[] {
  // FERS COLA rule: regular FERS retirees receive NO COLA until age 62 (5 USC
  // 8462(c)). Exempt — COLA from retirement — are CSRS, CSRS Offset, FERS
  // special provisions (LEO/FF/ATC), disability, and survivor annuitants;
  // those callers pass colaStartsImmediately=true. Before 62 the annuity is
  // frozen at its starting amount; the first COLA lands the year the retiree
  // turns 62.
  const projections: ColaProjection[] = [];
  let currentAnnuity = startingAnnualAnnuity;
  const proration = firstYearColaProration(retirementMonth);
  let firstColaApplied = false;

  for (let i = 0; i < projectionYears; i++) {
    const year = retirementYear + i;
    const ageThisYear = ageAtRetirement + i;
    const colaEligibleThisYear = i > 0 && (colaStartsImmediately || ageThisYear >= 62);

    if (!colaEligibleThisYear) {
      // Retirement year, or a pre-62 year for a regular FERS retiree: frozen.
      projections.push({
        year,
        colaRate: 0,
        annuityAfterCola: Math.round(currentAnnuity * 100) / 100,
      });
      continue;
    }

    const baseCola = getColaRate(retirementSystem, cpiAssumption);
    // Prorate only the very first COLA the retiree actually receives.
    const cola = !firstColaApplied ? baseCola * proration : baseCola;
    firstColaApplied = true;
    currentAnnuity = currentAnnuity * (1 + cola);
    projections.push({
      year,
      colaRate: Math.round(cola * 10000) / 10000,
      annuityAfterCola: Math.round(currentAnnuity * 100) / 100,
    });
  }

  return projections;
}
