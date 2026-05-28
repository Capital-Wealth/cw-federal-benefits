/**
 * Early Retirement (MRA+10) Penalty Calculations
 *
 * FERS MRA+10 early retirement:
 * - Must have reached Minimum Retirement Age (MRA) with at least 10 years of service
 * - Annuity is reduced by 5/12 of 1% for each month the retiree is under age 62
 * - This equals 5% per year under age 62
 * - The penalty can be eliminated by deferring the annuity start date
 *
 * Special provisions employees (LEO/FF/ATC) have different rules and do NOT
 * get the MRA+10 penalty for their eligible retirements.
 */

import { parseISO, differenceInMonths } from 'date-fns';
import type { MraPlus10Result, EmploymentInfo } from '../calc-types';
import { serviceToDecimalYears } from './service';

/**
 * Determine if this is an MRA+10 early retirement.
 *
 * MRA+10 applies when:
 * - FERS employee
 * - Has reached MRA
 * - Has at least 10 years of service but less than 20
 * - Is under age 60 (age 60+20 is unreduced, age 62+5 is unreduced)
 *
 * If service >= 20 and age >= 60, it's an unreduced retirement.
 * If service >= 5 and age >= 62, it's an unreduced retirement.
 */
export function isMraPlus10Retirement(
  ageAtRetirement: number,
  mra: number,
  serviceYears: number
): boolean {
  // Must have reached MRA
  if (ageAtRetirement < mra) return false;

  // Must have at least 10 years of service
  if (serviceYears < 10) return false;

  // If age >= 62 with 5+ years, this is unreduced (not MRA+10)
  if (ageAtRetirement >= 62 && serviceYears >= 5) return false;

  // If age >= 60 with 20+ years, this is unreduced (not MRA+10)
  if (ageAtRetirement >= 60 && serviceYears >= 20) return false;

  // MRA + 30 years is an immediate UNREDUCED retirement (5 USC 8412(a)) —
  // NOT MRA+10. The "30-and-out at MRA" profile is the most common federal
  // retirement; without this carve-out it gets a bogus 5%/yr penalty AND a
  // zeroed FERS Supplement. MRA+10 is specifically MRA with 10–29 years.
  if (serviceYears >= 30) return false;

  // Otherwise, this is MRA+10 with penalty
  return true;
}

/**
 * Calculate the MRA+10 early retirement penalty.
 *
 * Reduction: 5/12 of 1% per month under age 62.
 * That's (5/12)% per month = 0.4167% per month = 5% per year.
 *
 * @param unreducedAnnualAnnuity - Annuity before MRA+10 reduction
 * @param dateOfBirth - ISO date string
 * @param retirementDate - ISO date string
 * @param mra - Minimum Retirement Age
 * @param serviceYears - Total years of service
 * @returns MraPlus10Result
 */
export function calculateMraPlus10Penalty(
  unreducedAnnualAnnuity: number,
  dateOfBirth: string,
  retirementDate: string,
  mra: number,
  serviceYears: number
): MraPlus10Result {
  const dob = parseISO(dateOfBirth);
  const retirement = parseISO(retirementDate);

  const ageAtRetirement =
    (retirement.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  const applies = isMraPlus10Retirement(ageAtRetirement, mra, serviceYears);

  if (!applies) {
    return {
      applies: false,
      penaltyPercent: 0,
      monthsUnder62: 0,
      reducedAnnuity: unreducedAnnualAnnuity,
    };
  }

  // Calculate months under age 62
  const age62Date = new Date(dob);
  age62Date.setFullYear(age62Date.getFullYear() + 62);
  const monthsUnder62 = Math.max(differenceInMonths(age62Date, retirement), 0);

  // Penalty: 5/12 of 1% per month under 62
  const penaltyPerMonth = 5 / 12 / 100; // 0.004167
  const totalPenaltyPercent = monthsUnder62 * penaltyPerMonth;
  const penaltyPercent = Math.round(totalPenaltyPercent * 10000) / 10000;

  const reducedAnnuity =
    Math.round(unreducedAnnualAnnuity * (1 - totalPenaltyPercent) * 100) / 100;

  return {
    applies: true,
    penaltyPercent,
    monthsUnder62,
    reducedAnnuity: Math.max(reducedAnnuity, 0),
  };
}
