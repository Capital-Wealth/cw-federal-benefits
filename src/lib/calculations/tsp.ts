/**
 * TSP (Thrift Savings Plan) Calculations
 *
 * - Per-fund growth projections (G/F/C/S/I/L)
 * - Traditional + Roth balances tracked separately
 * - Government match (FERS: automatic 1% + match up to 5% of salary)
 * - Year-by-year: start balance, contributions, match, growth, end balance
 * - Withdrawal calculations: lump sum, monthly payments, life annuity
 */

import { parseISO, getYear, differenceInYears } from 'date-fns';
import type {
  TspInfo,
  TspFundBalance,
  TspResult,
  TspProjectionYear,
  EmploymentInfo,
  RetirementSystem,
} from '../calc-types';

/**
 * TSP Life Annuity Factor Table — single-life immediate, level payment, no
 * survivor. Monthly payment per $1,000 of TSP balance.
 *
 * IMPORTANT: TSP life annuities are quoted by MetLife at the TSP interest-rate
 * index in effect on the day of purchase. The index is published monthly and
 * has ranged from ~3.0% (2020) to ~4.7% (2024-2025). Higher index = higher
 * monthly factor. The values below assume a ~4.5% index typical of 2024-2025
 * conditions. Use this table for advisor planning estimates only — for a
 * binding quote, request one from tsp.gov within 60 days of the planned
 * election (rates change monthly).
 *
 * Source: TSP "How to Calculate Your TSP Annuity" reference, MetLife factor
 * tables, cross-checked against OPM federal retirement projections.
 */
const TSP_ANNUITY_FACTORS: [number, number][] = [
  [55, 5.34], [56, 5.43], [57, 5.54], [58, 5.65], [59, 5.79],
  [60, 5.93], [61, 6.10], [62, 6.27], [63, 6.45], [64, 6.65],
  [65, 6.86], [66, 7.10], [67, 7.34], [68, 7.62], [69, 7.91],
  [70, 8.23], [71, 8.58], [72, 8.96], [73, 9.39], [74, 9.85],
  [75, 10.36], [76, 10.93], [77, 11.55], [78, 12.24], [79, 13.01],
  [80, 13.86],
];

/**
 * Look up or interpolate the TSP life annuity factor for a given age.
 * For ages below 55, uses 55's factor. Above 80, uses 80's factor.
 */
function getTspAnnuityFactor(age: number): number {
  if (age <= 55) return TSP_ANNUITY_FACTORS[0][1];
  if (age >= 80) return TSP_ANNUITY_FACTORS[TSP_ANNUITY_FACTORS.length - 1][1];

  // Find surrounding entries for interpolation
  for (let i = 0; i < TSP_ANNUITY_FACTORS.length - 1; i++) {
    const [ageLow, factorLow] = TSP_ANNUITY_FACTORS[i];
    const [ageHigh, factorHigh] = TSP_ANNUITY_FACTORS[i + 1];
    if (age >= ageLow && age <= ageHigh) {
      // Linear interpolation
      const fraction = (age - ageLow) / (ageHigh - ageLow);
      return factorLow + fraction * (factorHigh - factorLow);
    }
  }

  // Fallback (shouldn't reach here)
  return 6.05;
}

/**
 * Calculate aggregate balance and blended return rate across funds.
 */
function aggregateFunds(
  funds: TspFundBalance[]
): { totalBalance: number; blendedRate: number } {
  const totalBalance = funds.reduce((sum, f) => sum + f.balance, 0);
  if (totalBalance === 0) return { totalBalance: 0, blendedRate: 0 };

  // Weighted average return rate
  const weightedRate = funds.reduce(
    (sum, f) => sum + f.returnRate * (f.balance / totalBalance),
    0
  );

  return { totalBalance, blendedRate: weightedRate };
}

/**
 * Calculate the FERS government match.
 *
 * FERS matching:
 *   - Automatic 1% of salary (regardless of employee contribution)
 *   - Dollar-for-dollar match on first 3% of salary contributed
 *   - 50 cents per dollar on next 2% of salary contributed
 *   - Maximum match = 1% auto + 3% + 1% = 5% of salary
 *
 * @param annualSalary - Current annual salary
 * @param employeeContribution - Employee's annual TSP contribution
 * @param retirementSystem - Only FERS/FERS_TRANSFER get the match
 * @returns Annual government match amount
 */
export function calculateGovernmentMatch(
  annualSalary: number,
  employeeContribution: number,
  retirementSystem: RetirementSystem
): number {
  // Only FERS and FERS Transfer get the government match
  if (retirementSystem !== 'FERS' && retirementSystem !== 'FERS_TRANSFER') {
    return 0;
  }

  // Automatic 1%
  const auto1 = annualSalary * 0.01;

  // Employee contribution as percent of salary
  const employeePercent =
    annualSalary > 0 ? employeeContribution / annualSalary : 0;

  // Dollar-for-dollar match on first 3%
  const matchFirst3 = Math.min(employeePercent, 0.03) * annualSalary;

  // 50-cent match on next 2% (3% to 5%)
  const matchNext2 =
    Math.min(Math.max(employeePercent - 0.03, 0), 0.02) * annualSalary * 0.5;

  return Math.round((auto1 + matchFirst3 + matchNext2) * 100) / 100;
}

/**
 * Project TSP balances year-by-year from now to retirement and optionally beyond.
 *
 * @param startBalance - Starting balance
 * @param annualContribution - Annual employee contribution
 * @param annualMatch - Annual government match
 * @param returnRate - Annual return rate (blended or per-fund)
 * @param startYear - Current year
 * @param startAge - Current age
 * @param retirementYear - Year of retirement
 * @param projectionEndYear - Last year to project
 * @returns Array of TspProjectionYear
 */
function projectBalances(
  startBalance: number,
  annualContribution: number,
  annualMatch: number,
  returnRate: number,
  startYear: number,
  startAge: number,
  retirementYear: number,
  projectionEndYear: number,
  salaryIncreaseRate: number = 0
): TspProjectionYear[] {
  const projections: TspProjectionYear[] = [];
  let balance = startBalance;

  for (let year = startYear; year <= projectionEndYear; year++) {
    const age = startAge + (year - startYear);
    const isPreRetirement = year < retirementYear;

    // Contribution escalates with salary growth pre-retirement.
    const escalator = Math.pow(1 + salaryIncreaseRate, year - startYear);
    const contributions = isPreRetirement ? annualContribution * escalator : 0;
    const match = isPreRetirement ? annualMatch * escalator : 0;

    // Growth applies to start balance + half of year's contributions (mid-year assumption)
    const growthBase = balance + (contributions + match) / 2;
    const growth = Math.round(growthBase * returnRate * 100) / 100;

    const endBalance =
      Math.round((balance + contributions + match + growth) * 100) / 100;

    projections.push({
      year,
      age,
      startBalance: Math.round(balance * 100) / 100,
      contributions: Math.round(contributions * 100) / 100,
      governmentMatch: Math.round(match * 100) / 100,
      growth,
      endBalance,
    });

    balance = endBalance;
  }

  return projections;
}

/**
 * Calculate monthly withdrawal based on method.
 *
 * - LUMP_SUM: entire balance withdrawn at retirement
 * - MONTHLY_PAYMENTS: fixed monthly amount
 * - LIFE_ANNUITY: balance / expected months remaining (simplified)
 * - COMBINATION: user-specified monthly amount
 */
export function calculateWithdrawal(
  totalBalance: number,
  method: string,
  monthlyAmount: number | undefined,
  ageAtRetirement: number
): { monthly: number; annual: number } {
  switch (method) {
    case 'LUMP_SUM':
      return { monthly: totalBalance, annual: totalBalance };

    case 'MONTHLY_PAYMENTS':
      if (monthlyAmount && monthlyAmount > 0) {
        return {
          monthly: monthlyAmount,
          annual: Math.round(monthlyAmount * 12 * 100) / 100,
        };
      }
      // Default: spread over expected remaining life (IRS life expectancy ~85)
      const remainingMonths = Math.max((85 - ageAtRetirement) * 12, 12);
      const defaultMonthly =
        Math.round((totalBalance / remainingMonths) * 100) / 100;
      return {
        monthly: defaultMonthly,
        annual: Math.round(defaultMonthly * 12 * 100) / 100,
      };

    case 'LIFE_ANNUITY': {
      // TSP life annuity using real MetLife factor table
      // Factor = monthly payment per $1,000 of balance
      const factor = getTspAnnuityFactor(ageAtRetirement);
      const monthly = Math.round((totalBalance * factor) / 1000 * 100) / 100;
      return { monthly, annual: Math.round(monthly * 12 * 100) / 100 };
    }

    case 'COMBINATION':
      if (monthlyAmount && monthlyAmount > 0) {
        return {
          monthly: monthlyAmount,
          annual: Math.round(monthlyAmount * 12 * 100) / 100,
        };
      }
      return { monthly: 0, annual: 0 };

    default:
      return { monthly: 0, annual: 0 };
  }
}

/**
 * Main TSP calculator.
 *
 * Projects Traditional and Roth balances separately through retirement,
 * calculates government match, and determines withdrawal amounts.
 */
export function calculateTsp(
  tsp: TspInfo,
  employment: EmploymentInfo,
  dateOfBirth: string,
  projectionYears: number = 30
): TspResult {
  const dob = parseISO(dateOfBirth);
  const retirementDate = parseISO(employment.plannedRetirementDate);
  const currentYear = new Date().getFullYear();
  const retirementYear = getYear(retirementDate);
  const currentAge = differenceInYears(new Date(), dob);
  const ageAtRetirement = differenceInYears(retirementDate, dob);
  const projectionEndYear = retirementYear + projectionYears;

  // Aggregate fund balances
  const traditional = aggregateFunds(tsp.traditionalBalances);
  const roth = aggregateFunds(tsp.rothBalances);

  // Use blended rate or overall expected return
  const tradRate =
    traditional.blendedRate > 0
      ? traditional.blendedRate
      : tsp.expectedReturnRate;
  const rothRate =
    roth.blendedRate > 0 ? roth.blendedRate : tsp.expectedReturnRate;

  // Government match based on total employee contributions
  const totalEmployeeContribution =
    tsp.annualContributionTraditional +
    tsp.annualContributionRoth +
    tsp.catchUpContribution;

  const annualMatch = calculateGovernmentMatch(
    employment.currentAnnualSalary,
    totalEmployeeContribution,
    employment.retirementSystem
  );

  // Split match proportionally between Traditional and Roth
  // Government match always goes to Traditional
  const matchToTraditional = annualMatch;

  // Project Traditional
  const traditionalProjections = projectBalances(
    traditional.totalBalance,
    tsp.annualContributionTraditional + tsp.catchUpContribution,
    matchToTraditional,
    tradRate,
    currentYear,
    currentAge,
    retirementYear,
    projectionEndYear,
    employment.annualSalaryIncreaseRate
  );

  // Project Roth (no government match — match always goes to Traditional)
  const rothProjections = projectBalances(
    roth.totalBalance,
    tsp.annualContributionRoth,
    0,
    rothRate,
    currentYear,
    currentAge,
    retirementYear,
    projectionEndYear,
    employment.annualSalaryIncreaseRate
  );

  // Balances at retirement
  const retirementIndex = retirementYear - currentYear;
  const tradAtRetirement =
    retirementIndex >= 0 && retirementIndex < traditionalProjections.length
      ? traditionalProjections[retirementIndex].endBalance
      : traditional.totalBalance;
  const rothAtRetirement =
    retirementIndex >= 0 && retirementIndex < rothProjections.length
      ? rothProjections[retirementIndex].endBalance
      : roth.totalBalance;
  const totalAtRetirement = tradAtRetirement + rothAtRetirement;

  // Withdrawal calculation
  const withdrawal = calculateWithdrawal(
    totalAtRetirement,
    tsp.withdrawalMethod,
    tsp.monthlyWithdrawalAmount,
    ageAtRetirement
  );

  return {
    traditionalProjections,
    rothProjections,
    totalAtRetirement: Math.round(totalAtRetirement * 100) / 100,
    traditionalAtRetirement: Math.round(tradAtRetirement * 100) / 100,
    rothAtRetirement: Math.round(rothAtRetirement * 100) / 100,
    monthlyWithdrawal: withdrawal.monthly,
    annualWithdrawal: withdrawal.annual,
  };
}
