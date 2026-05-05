/**
 * Service Credit Calculations
 *
 * Computes total creditable service including civilian, military, and sick leave.
 * Per OPM rules, sick leave hours are converted at 2087 hours/year.
 * Fractional months are dropped from the final total.
 */

import { differenceInMonths, parseISO } from 'date-fns';
import type { EmploymentInfo, MilitaryService } from '../calc-types';

export interface ServiceBreakdown {
  civilianYears: number;
  civilianMonths: number;
  militaryYears: number;
  militaryMonths: number;
  sickLeaveCreditYears: number;
  sickLeaveCreditMonths: number;
  totalYears: number;
  totalMonths: number;
}

/**
 * Convert sick leave hours to creditable service per OPM's published "2087
 * Hour Chart" (CSRS/FERS Handbook ch. 50, Appendix).
 *
 * The chart treats 174 hours as 1 month and ~5.797 hours as 1 day. We compute:
 *   months = floor(hours / 174)
 *   remainderHours = hours mod 174
 *   days = round(remainderHours / 5.797)
 *
 * OPM drops fractional months from total service, so days are only shown for
 * audit purposes and do not affect the annuity multiplier. Years/months are
 * what the multiplier reads.
 */
const OPM_HOURS_PER_MONTH = 174;
const OPM_HOURS_PER_DAY = 5.797;

export function sickLeaveToCredit(hours: number): {
  years: number;
  months: number;
  days: number;
} {
  if (!Number.isFinite(hours) || hours <= 0) {
    return { years: 0, months: 0, days: 0 };
  }
  const totalMonths = Math.floor(hours / OPM_HOURS_PER_MONTH);
  const remainderHours = hours - totalMonths * OPM_HOURS_PER_MONTH;
  const days = Math.round(remainderHours / OPM_HOURS_PER_DAY);
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days,
  };
}

/**
 * Calculate military service credit in years and months.
 * Only counts if deposit has been paid (for FERS) or service is otherwise creditable.
 */
export function calculateMilitaryService(
  military: MilitaryService
): { years: number; months: number } {
  if (!military.hasMilitaryService) {
    return { years: 0, months: 0 };
  }

  const start = parseISO(military.activeDutyStartDate);
  const end = parseISO(military.activeDutyEndDate);
  const totalMonths = differenceInMonths(end, start);

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
  };
}

/**
 * Combine years and months, carrying over months >= 12 into years.
 * Drops any fractional months from the final total (OPM rule).
 */
function combineService(
  ...parts: { years: number; months: number }[]
): { years: number; months: number } {
  let totalMonths = 0;
  for (const part of parts) {
    totalMonths += part.years * 12 + part.months;
  }
  // OPM drops fractional months from total
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
  };
}

/**
 * Calculate total creditable service.
 *
 * Total = civilian service + military service + sick leave credit
 * Fractional months are dropped from the grand total.
 */
export function calculateTotalService(
  employment: EmploymentInfo,
  military: MilitaryService
): ServiceBreakdown {
  const civilian = {
    years: employment.creditableServiceYears,
    months: employment.creditableServiceMonths,
  };

  const mil = calculateMilitaryService(military);
  const sick = sickLeaveToCredit(employment.sickLeaveHours);

  const total = combineService(civilian, mil, sick);

  return {
    civilianYears: civilian.years,
    civilianMonths: civilian.months,
    militaryYears: mil.years,
    militaryMonths: mil.months,
    sickLeaveCreditYears: sick.years,
    sickLeaveCreditMonths: sick.months,
    totalYears: total.years,
    totalMonths: total.months,
  };
}

/**
 * Convert a service breakdown to a decimal number of years.
 * Used by annuity calculations.
 */
export function serviceToDecimalYears(years: number, months: number): number {
  return years + months / 12;
}
