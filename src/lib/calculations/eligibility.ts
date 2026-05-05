/**
 * Retirement Eligibility Calculations
 *
 * Determines earliest eligibility dates for federal retirement under
 * each retirement system and employee type.
 *
 * FERS:
 *   - MRA + 10 years (reduced annuity)
 *   - Age 60 + 20 years (unreduced)
 *   - Age 62 + 5 years (unreduced)
 *
 * FERS Special Provisions (LEO/FF/ATC):
 *   - Age 50 + 20 years
 *   - Any age + 25 years
 *
 * CSRS:
 *   - Age 55 + 30 years
 *   - Age 60 + 20 years
 *   - Age 62 + 5 years
 *
 * MRA by birth year:
 *   Before 1948: 55
 *   1948: 55 + 2 months
 *   1949: 55 + 4 months
 *   1950: 55 + 6 months
 *   1951: 55 + 8 months
 *   1952: 55 + 10 months
 *   1953-1964: 56
 *   1965: 56 + 2 months
 *   1966: 56 + 4 months
 *   1967: 56 + 6 months
 *   1968: 56 + 8 months
 *   1969: 56 + 10 months
 *   1970+: 57
 */

import { parseISO, addYears, addMonths, format, isAfter, isBefore } from 'date-fns';
import type {
  RetirementSystem,
  EmployeeType,
  RetirementEligibility,
  EligibilityDate,
  EmploymentInfo,
} from '../calc-types';

/**
 * Calculate FERS Minimum Retirement Age (MRA) based on birth year.
 *
 * @param birthYear - Year of birth
 * @returns MRA as decimal (e.g., 56.5 for 56 years 6 months)
 */
export function getMRA(birthYear: number): number {
  if (birthYear < 1948) return 55;
  if (birthYear === 1948) return 55 + 2 / 12;
  if (birthYear === 1949) return 55 + 4 / 12;
  if (birthYear === 1950) return 55 + 6 / 12;
  if (birthYear === 1951) return 55 + 8 / 12;
  if (birthYear === 1952) return 55 + 10 / 12;
  if (birthYear >= 1953 && birthYear <= 1964) return 56;
  if (birthYear === 1965) return 56 + 2 / 12;
  if (birthYear === 1966) return 56 + 4 / 12;
  if (birthYear === 1967) return 56 + 6 / 12;
  if (birthYear === 1968) return 56 + 8 / 12;
  if (birthYear === 1969) return 56 + 10 / 12;
  return 57; // 1970 and later
}

/**
 * Convert a decimal age to a date, given a date of birth.
 */
function ageToDate(dob: Date, ageDecimal: number): Date {
  const years = Math.floor(ageDecimal);
  const months = Math.round((ageDecimal - years) * 12);
  let result = addYears(dob, years);
  result = addMonths(result, months);
  return result;
}

/**
 * Calculate the date when an employee will have N years of service,
 * given their service computation date.
 */
function serviceDate(scd: Date, yearsOfService: number): Date {
  return addYears(scd, yearsOfService);
}

/**
 * Determine all possible eligibility dates for FERS regular employees.
 */
function fersEligibilityDates(
  dob: Date,
  scd: Date,
  currentServiceYears: number,
  mra: number
): EligibilityDate[] {
  const dates: EligibilityDate[] = [];

  // MRA + 10 years (reduced — subject to penalty)
  const mraDate = ageToDate(dob, mra);
  const tenYearsDate = serviceDate(scd, 10);
  const mra10Date = isAfter(mraDate, tenYearsDate) ? mraDate : tenYearsDate;
  dates.push({
    type: 'MRA+10',
    date: format(mra10Date, 'yyyy-MM-dd'),
    age: mra,
    serviceYears: 10,
    description: `MRA (${Math.floor(mra)} years ${Math.round((mra % 1) * 12)} months) + 10 years of service (reduced annuity, 5% per year penalty under 62)`,
    eligible: true,
  });

  // Age 60 + 20 years (unreduced)
  const age60Date = addYears(dob, 60);
  const twentyYearsDate = serviceDate(scd, 20);
  const sixtyTwentyDate = isAfter(age60Date, twentyYearsDate)
    ? age60Date
    : twentyYearsDate;
  dates.push({
    type: 'Age 60 + 20',
    date: format(sixtyTwentyDate, 'yyyy-MM-dd'),
    age: 60,
    serviceYears: 20,
    description: 'Age 60 with 20 years of service (unreduced annuity)',
    eligible: true,
  });

  // Age 62 + 5 years (unreduced, 1.1% multiplier)
  const age62Date = addYears(dob, 62);
  const fiveYearsDate = serviceDate(scd, 5);
  const sixtyTwoFiveDate = isAfter(age62Date, fiveYearsDate)
    ? age62Date
    : fiveYearsDate;
  dates.push({
    type: 'Age 62 + 5',
    date: format(sixtyTwoFiveDate, 'yyyy-MM-dd'),
    age: 62,
    serviceYears: 5,
    description: 'Age 62 with 5 years of service (unreduced, 1.1% multiplier if 20+ years)',
    eligible: true,
  });

  return dates;
}

/**
 * Determine eligibility dates for FERS Special Provisions (LEO/FF/ATC).
 */
function fersSpecialEligibilityDates(
  dob: Date,
  scd: Date
): EligibilityDate[] {
  const dates: EligibilityDate[] = [];

  // Age 50 + 20 years of LEO/FF/ATC service
  const age50Date = addYears(dob, 50);
  const twentyYearsDate = serviceDate(scd, 20);
  const fiftyTwentyDate = isAfter(age50Date, twentyYearsDate)
    ? age50Date
    : twentyYearsDate;
  dates.push({
    type: 'Age 50 + 20 (Special)',
    date: format(fiftyTwentyDate, 'yyyy-MM-dd'),
    age: 50,
    serviceYears: 20,
    description: 'Age 50 with 20 years of special provision service (unreduced)',
    eligible: true,
  });

  // Any age + 25 years
  const twentyFiveYearsDate = serviceDate(scd, 25);
  const ageAt25 = Math.floor(
    (twentyFiveYearsDate.getTime() - dob.getTime()) /
      (365.25 * 24 * 60 * 60 * 1000)
  );
  dates.push({
    type: 'Any Age + 25 (Special)',
    date: format(twentyFiveYearsDate, 'yyyy-MM-dd'),
    age: ageAt25,
    serviceYears: 25,
    description: 'Any age with 25 years of special provision service (unreduced)',
    eligible: true,
  });

  return dates;
}

/**
 * Determine eligibility dates for CSRS employees.
 */
function csrsEligibilityDates(dob: Date, scd: Date): EligibilityDate[] {
  const dates: EligibilityDate[] = [];

  // Age 55 + 30 years
  const age55Date = addYears(dob, 55);
  const thirtyYearsDate = serviceDate(scd, 30);
  const fiftyFiveThirtyDate = isAfter(age55Date, thirtyYearsDate)
    ? age55Date
    : thirtyYearsDate;
  dates.push({
    type: 'Age 55 + 30',
    date: format(fiftyFiveThirtyDate, 'yyyy-MM-dd'),
    age: 55,
    serviceYears: 30,
    description: 'Age 55 with 30 years of service (unreduced)',
    eligible: true,
  });

  // Age 60 + 20 years
  const age60Date = addYears(dob, 60);
  const twentyYearsDate = serviceDate(scd, 20);
  const sixtyTwentyDate = isAfter(age60Date, twentyYearsDate)
    ? age60Date
    : twentyYearsDate;
  dates.push({
    type: 'Age 60 + 20',
    date: format(sixtyTwentyDate, 'yyyy-MM-dd'),
    age: 60,
    serviceYears: 20,
    description: 'Age 60 with 20 years of service (unreduced)',
    eligible: true,
  });

  // Age 62 + 5 years
  const age62Date = addYears(dob, 62);
  const fiveYearsDate = serviceDate(scd, 5);
  const sixtyTwoFiveDate = isAfter(age62Date, fiveYearsDate)
    ? age62Date
    : fiveYearsDate;
  dates.push({
    type: 'Age 62 + 5',
    date: format(sixtyTwoFiveDate, 'yyyy-MM-dd'),
    age: 62,
    serviceYears: 5,
    description: 'Age 62 with 5 years of service (unreduced)',
    eligible: true,
  });

  return dates;
}

/**
 * Determine if an employee is a special provision type.
 */
function isSpecialProvision(employeeType: EmployeeType): boolean {
  return (
    employeeType === 'LEO' ||
    employeeType === 'FIREFIGHTER' ||
    employeeType === 'ATC'
  );
}

/**
 * Calculate all retirement eligibility information.
 *
 * @param dateOfBirth - ISO date string
 * @param serviceComputationDate - ISO date string
 * @param retirementSystem - FERS, CSRS, etc.
 * @param employeeType - REGULAR, LEO, FF, ATC, POSTAL
 * @param currentServiceYears - Total creditable years of service
 * @returns RetirementEligibility with all possible dates
 */
export function calculateEligibility(
  dateOfBirth: string,
  serviceComputationDate: string,
  retirementSystem: RetirementSystem,
  employeeType: EmployeeType,
  currentServiceYears: number
): RetirementEligibility {
  const dob = parseISO(dateOfBirth);
  const scd = parseISO(serviceComputationDate);
  const birthYear = dob.getFullYear();
  const mra = getMRA(birthYear);

  let eligibilityDates: EligibilityDate[] = [];

  switch (retirementSystem) {
    case 'FERS':
    case 'FERS_TRANSFER': {
      if (isSpecialProvision(employeeType)) {
        // Special provisions get both special and regular eligibility
        eligibilityDates = [
          ...fersSpecialEligibilityDates(dob, scd),
          ...fersEligibilityDates(dob, scd, currentServiceYears, mra),
        ];
      } else {
        eligibilityDates = fersEligibilityDates(
          dob,
          scd,
          currentServiceYears,
          mra
        );
      }
      break;
    }

    case 'CSRS':
    case 'CSRS_OFFSET': {
      eligibilityDates = csrsEligibilityDates(dob, scd);
      break;
    }
  }

  // Sort by date and find earliest
  eligibilityDates.sort(
    (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()
  );

  const earliestEligibleDate =
    eligibilityDates.length > 0 ? eligibilityDates[0].date : '';

  return {
    earliestEligibleDate,
    mra: Math.round(mra * 100) / 100,
    eligibilityDates,
  };
}
