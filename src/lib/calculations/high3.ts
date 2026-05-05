/**
 * High-3 Average Salary Calculation
 *
 * Projects salary forward using an annual increase rate, then finds the
 * highest 3 consecutive years of basic pay. Returns year-by-year detail.
 */

import { parseISO, getYear, differenceInCalendarYears } from 'date-fns';
import type { EmploymentInfo, High3Detail } from '../calc-types';

/**
 * Build a year-by-year salary history from the current salary projected
 * forward (and backward if needed) using the annual increase rate.
 *
 * We project from the current year to the retirement year, applying the
 * salary increase each year.
 */
export function projectSalaries(employment: EmploymentInfo): High3Detail[] {
  const retirementDate = parseISO(employment.plannedRetirementDate);
  const retirementYear = getYear(retirementDate);
  const retirementMonth = retirementDate.getMonth(); // 0 = Jan
  const currentYear = new Date().getFullYear();
  const rate = employment.annualSalaryIncreaseRate;
  const baseSalary = employment.currentAnnualSalary;

  const salaries: High3Detail[] = [];

  // High-3 per OPM = highest 3 consecutive YEARS of basic pay. If the
  // retirement happens early in the year (before July) the employee did
  // not earn a full year's salary, so we exclude that partial year.
  const startYear = currentYear - 3;
  const endYear = retirementMonth < 6 ? retirementYear - 1 : retirementYear;

  for (let year = startYear; year <= endYear; year++) {
    const yearsDiff = year - currentYear;
    // Compound forward or backward from current salary
    const salary = baseSalary * Math.pow(1 + rate, yearsDiff);
    salaries.push({
      year,
      salary: Math.round(salary * 100) / 100,
      inHigh3: false,
    });
  }

  return salaries;
}

/**
 * Find the highest 3 consecutive years from the salary projection.
 *
 * The high-3 average is the highest average basic pay over any 3
 * consecutive years of service. OPM computes this over 3 consecutive
 * years (36 consecutive months). We approximate with calendar years.
 */
export function findHigh3(salaries: High3Detail[]): {
  high3Average: number;
  detail: High3Detail[];
} {
  if (salaries.length < 3) {
    // If fewer than 3 years, average whatever is available
    const avg =
      salaries.reduce((sum, s) => sum + s.salary, 0) / salaries.length;
    return {
      high3Average: Math.round(avg * 100) / 100,
      detail: salaries.map((s) => ({ ...s, inHigh3: true })),
    };
  }

  let bestSum = -Infinity;
  let bestStartIndex = 0;

  for (let i = 0; i <= salaries.length - 3; i++) {
    const sum =
      salaries[i].salary + salaries[i + 1].salary + salaries[i + 2].salary;
    if (sum > bestSum) {
      bestSum = sum;
      bestStartIndex = i;
    }
  }

  const detail = salaries.map((s, idx) => ({
    ...s,
    inHigh3: idx >= bestStartIndex && idx < bestStartIndex + 3,
  }));

  const high3Average = Math.round((bestSum / 3) * 100) / 100;

  return { high3Average, detail };
}

/**
 * Main entry: project salaries and compute High-3 average.
 */
export function calculateHigh3(employment: EmploymentInfo): {
  high3Average: number;
  detail: High3Detail[];
} {
  const salaries = projectSalaries(employment);
  return findHigh3(salaries);
}
