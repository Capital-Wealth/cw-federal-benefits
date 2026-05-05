/**
 * Survivor Benefit Calculations
 *
 * FERS (5 USC § 8419):
 *   • 50% election: annuity reduced by 10%; survivor receives 50% of UNREDUCED annuity
 *   • 25% election: annuity reduced by  5%; survivor receives 25% of UNREDUCED annuity
 *   • None:         no reduction, no survivor benefit
 *
 * CSRS (5 USC § 8341, OPM CSRS Handbook ch. 52):
 *   The retiree elects a "survivor base" (any whole-dollar amount up to the
 *   full annuity). The survivor receives 55% of that base. Annuity reduction:
 *     2.5% × first $3,600 of the base, plus
 *     10%  × remainder of the base above $3,600
 *   We model the two pre-set tiers (full = full annuity as base; partial =
 *   half of annuity as base). Custom bases supported via `csrsCustomBase`.
 *
 * The reduction is applied to the UNREDUCED annuity (before survivor election).
 */

import type { SurvivorElection, SurvivorBenefitResult } from '../calc-types';

const CSRS_TIER_BREAK = 3600;
const CSRS_TIER_LOW = 0.025;
const CSRS_TIER_HIGH = 0.10;
const CSRS_SURVIVOR_RATE = 0.55;

/**
 * CSRS reduction formula given a survivor base (the dollars of annuity the
 * retiree wants to make the survivor benefit be calculated from).
 *
 *   reduction = 2.5% × min(base, $3,600) + 10% × max(base − $3,600, 0)
 *
 * Returns annual cost (the reduction to the retiree's annuity).
 */
function csrsReductionForBase(base: number): number {
  const lowTier = Math.min(base, CSRS_TIER_BREAK) * CSRS_TIER_LOW;
  const highTier = Math.max(base - CSRS_TIER_BREAK, 0) * CSRS_TIER_HIGH;
  return Math.round((lowTier + highTier) * 100) / 100;
}

export function calculateSurvivorBenefit(
  unreducedAnnualAnnuity: number,
  election: SurvivorElection,
  retirementSystem: 'FERS' | 'CSRS' | 'CSRS_OFFSET' | 'FERS_TRANSFER' = 'FERS',
  csrsCustomBase?: number,
): SurvivorBenefitResult {
  if (election === 'NONE') {
    return {
      election,
      annualCost: 0,
      monthlyCost: 0,
      survivorAnnualBenefit: 0,
      survivorMonthlyBenefit: 0,
    };
  }

  const isCsrsType =
    retirementSystem === 'CSRS' || retirementSystem === 'CSRS_OFFSET';

  if (isCsrsType) {
    // Survivor base = either user-provided custom amount, or the full/partial
    // tier mapped from the FERS-style election input.
    const base =
      csrsCustomBase != null && csrsCustomBase > 0
        ? Math.min(csrsCustomBase, unreducedAnnualAnnuity)
        : election === '50_PERCENT'
          ? unreducedAnnualAnnuity            // full base — max CSRS election
          : unreducedAnnualAnnuity * 0.5;     // partial — common half-base election

    const annualCost = csrsReductionForBase(base);
    const survivorAnnual =
      Math.round(base * CSRS_SURVIVOR_RATE * 100) / 100;

    return {
      election,
      annualCost,
      monthlyCost: Math.round((annualCost / 12) * 100) / 100,
      survivorAnnualBenefit: survivorAnnual,
      survivorMonthlyBenefit: Math.round((survivorAnnual / 12) * 100) / 100,
    };
  }

  // FERS / FERS_TRANSFER
  const reductionRate = election === '50_PERCENT' ? 0.10 : 0.05;
  const survivorRate = election === '50_PERCENT' ? 0.50 : 0.25;

  const annualCost =
    Math.round(unreducedAnnualAnnuity * reductionRate * 100) / 100;
  const survivorAnnualBenefit =
    Math.round(unreducedAnnualAnnuity * survivorRate * 100) / 100;

  return {
    election,
    annualCost,
    monthlyCost: Math.round((annualCost / 12) * 100) / 100,
    survivorAnnualBenefit,
    survivorMonthlyBenefit:
      Math.round((survivorAnnualBenefit / 12) * 100) / 100,
  };
}
