/**
 * Income Comparison & Projection Calculations
 *
 * - Last paycheck analysis (gross - all deductions = net)
 * - First retirement check (annuity - costs + supplements = net)
 * - Replacement ratio
 * - Year-by-year income/expense projections for 30+ years
 */

import type {
  ReportInput,
  IncomeComparisonResult,
  YearlyProjection,
  AnnuityResult,
  SurvivorBenefitResult,
  FersSupplementResult,
  SocialSecurityResult,
  TspResult,
  FegliResult,
  FehbResult,
  ColaProjection,
} from '../calc-types';

/**
 * Calculate the last active-duty paycheck breakdown.
 *
 * Deductions from gross monthly salary:
 * - FERS/CSRS retirement contribution
 * - TSP contribution
 * - FICA + Medicare (FERS employees pay FICA; CSRS do not)
 * - Federal income tax
 * - State income tax
 * - FEGLI premium
 * - FEHB premium
 * - Other deductions (union dues, etc.)
 */
export function calculateLastPaycheck(input: ReportInput): {
  grossMonthly: number;
  retirementContribution: number;
  tspContribution: number;
  ficaMedicare: number;
  federalTax: number;
  stateTax: number;
  fegliPremium: number;
  fehbPremium: number;
  otherDeductions: number;
  netMonthly: number;
} {
  const grossMonthly = input.employment.currentAnnualSalary / 12;

  // Retirement contribution rates:
  // FERS: 4.4% (post-2013 hires: 4.4%), FERS-RAE: 3.6%, FERS-FRAE: 4.4%
  // CSRS: 7.0%, CSRS Offset: 0.8% (offset by FICA)
  let retirementRate: number;
  switch (input.employment.retirementSystem) {
    case 'FERS':
    case 'FERS_TRANSFER':
      retirementRate = 0.044; // FERS-FRAE (most current)
      break;
    case 'CSRS':
      retirementRate = 0.07;
      break;
    case 'CSRS_OFFSET':
      retirementRate = 0.008; // reduced by FICA
      break;
    default:
      retirementRate = 0.044;
  }
  const retirementContribution =
    Math.round(grossMonthly * retirementRate * 100) / 100;

  // TSP contribution
  const monthlyTsp =
    Math.round(
      ((input.tsp.annualContributionTraditional +
        input.tsp.annualContributionRoth +
        input.tsp.catchUpContribution) /
        12) *
        100
    ) / 100;

  // FICA + Medicare
  // FERS employees: 6.2% FICA (up to wage base) + 1.45% Medicare
  // CSRS employees: only 1.45% Medicare (no FICA)
  let ficaRate: number;
  if (
    input.employment.retirementSystem === 'CSRS'
  ) {
    ficaRate = 0.0145; // Medicare only
  } else {
    ficaRate = 0.0765; // 6.2% FICA + 1.45% Medicare
  }
  const ficaMedicare = Math.round(grossMonthly * ficaRate * 100) / 100;

  // Taxes
  const federalTax =
    Math.round(grossMonthly * input.tax.federalTaxRate * 100) / 100;
  const stateTax =
    Math.round(grossMonthly * input.tax.stateTaxRate * 100) / 100;

  // FEGLI — approximate monthly from biweekly
  // We'll use a rough calculation; the detailed one is in fegli.ts
  const fegliMonthly = 0; // Will be filled from FEGLI result

  // FEHB
  const fehbMonthly =
    Math.round(((input.fehb.biweeklyPremium * 26) / 12) * 100) / 100;

  const otherDeductions = 0; // Placeholder for union dues, etc.

  const totalDeductions =
    retirementContribution +
    monthlyTsp +
    ficaMedicare +
    federalTax +
    stateTax +
    fegliMonthly +
    fehbMonthly +
    otherDeductions;

  const netMonthly = Math.round((grossMonthly - totalDeductions) * 100) / 100;

  return {
    grossMonthly: Math.round(grossMonthly * 100) / 100,
    retirementContribution,
    tspContribution: monthlyTsp,
    ficaMedicare,
    federalTax,
    stateTax,
    fegliPremium: fegliMonthly,
    fehbPremium: fehbMonthly,
    otherDeductions,
    netMonthly,
  };
}

/**
 * Calculate the first retirement check breakdown.
 *
 * Income sources:
 * - Gross annuity (after survivor reduction, after MRA+10 penalty)
 * - FERS Supplement (if eligible)
 * - Social Security (if at claiming age)
 * - TSP withdrawal
 * - Other income
 *
 * Deductions:
 * - Federal tax on annuity
 * - State tax on annuity
 * - FEGLI premium
 * - FEHB premium (employee share)
 */
export function calculateFirstRetirementCheck(
  annuity: AnnuityResult,
  survivor: SurvivorBenefitResult,
  supplement: FersSupplementResult,
  ss: SocialSecurityResult,
  tsp: TspResult,
  fehbEmployeeMonthly: number,
  fegliMonthly: number,
  input: ReportInput
): {
  grossAnnuity: number;
  survivorBenefitCost: number;
  federalTax: number;
  stateTax: number;
  fegliPremium: number;
  fehbPremium: number;
  fersSupplement: number;
  socialSecurity: number;
  tspWithdrawal: number;
  otherIncome: number;
  netMonthly: number;
} {
  const grossAnnuityMonthly = annuity.monthlyAnnuity;
  const survivorCostMonthly = survivor.monthlyCost;

  // Annuity after survivor reduction
  const netAnnuity = grossAnnuityMonthly - survivorCostMonthly;

  // FERS Supplement (if eligible and before age 62)
  const supplementMonthly = supplement.eligible ? supplement.monthlyAmount : 0;

  // Social Security (may be 0 if not yet at claiming age)
  const ssMonthly = ss.monthlyBenefitAtStartAge;
  // Check if SS has started at retirement
  const retirementYear = new Date(
    input.employment.plannedRetirementDate
  ).getFullYear();
  const birthYear = new Date(input.personal.dateOfBirth).getFullYear();
  const ageAtRetirement = retirementYear - birthYear;
  const ssAtRetirement =
    ageAtRetirement >= input.socialSecurity.plannedStartAge ? ssMonthly : 0;

  // TSP withdrawal
  const tspMonthly = tsp.monthlyWithdrawal;

  // Other income
  const otherMonthly =
    Math.round(
      ((input.otherIncome.otherPensions +
        input.otherIncome.spouseIncome +
        input.otherIncome.rentalIncome +
        input.otherIncome.investmentIncome +
        input.otherIncome.otherTaxableIncome +
        input.otherIncome.otherNonTaxableIncome) /
        12) *
        100
    ) / 100;

  // Total gross income
  const totalGrossMonthly =
    netAnnuity + supplementMonthly + ssAtRetirement + tspMonthly + otherMonthly;

  // Taxes (on taxable portion)
  // Annuity and TSP traditional withdrawals are fully taxable
  // SS is partially taxable (up to 85%)
  // Roth TSP is tax-free
  const taxableIncome =
    netAnnuity + supplementMonthly + ssAtRetirement * 0.85 + tspMonthly;
  const federalTax =
    Math.round(taxableIncome * input.tax.federalTaxRate * 100) / 100;
  const stateTax =
    Math.round(taxableIncome * input.tax.stateTaxRate * 100) / 100;

  const netMonthly =
    Math.round(
      (totalGrossMonthly - federalTax - stateTax - fegliMonthly - fehbEmployeeMonthly) *
        100
    ) / 100;

  return {
    grossAnnuity: Math.round(grossAnnuityMonthly * 100) / 100,
    survivorBenefitCost: Math.round(survivorCostMonthly * 100) / 100,
    federalTax,
    stateTax,
    fegliPremium: Math.round(fegliMonthly * 100) / 100,
    fehbPremium: Math.round(fehbEmployeeMonthly * 100) / 100,
    fersSupplement: Math.round(supplementMonthly * 100) / 100,
    socialSecurity: Math.round(ssAtRetirement * 100) / 100,
    tspWithdrawal: Math.round(tspMonthly * 100) / 100,
    otherIncome: Math.round(otherMonthly * 100) / 100,
    netMonthly,
  };
}

/**
 * Build the income comparison between last paycheck and first retirement check.
 */
export function buildIncomeComparison(
  lastPaycheck: ReturnType<typeof calculateLastPaycheck>,
  firstRetirement: ReturnType<typeof calculateFirstRetirementCheck>
): IncomeComparisonResult {
  const monthlyDifference =
    Math.round((firstRetirement.netMonthly - lastPaycheck.netMonthly) * 100) /
    100;

  const replacementRatio =
    lastPaycheck.netMonthly > 0
      ? Math.round(
          (firstRetirement.netMonthly / lastPaycheck.netMonthly) * 10000
        ) / 10000
      : 0;

  return {
    lastPaycheck,
    firstRetirementCheck: firstRetirement,
    monthlyDifference,
    replacementRatio,
  };
}

/**
 * Generate year-by-year income and expense projections.
 *
 * Projects all income streams and expenses forward with their respective
 * growth rates (COLA for annuity, SS COLA, inflation for expenses, etc.)
 */
export function calculateYearlyProjections(
  input: ReportInput,
  annuity: AnnuityResult,
  survivor: SurvivorBenefitResult,
  supplement: FersSupplementResult,
  ss: SocialSecurityResult,
  tsp: TspResult,
  fegli: FegliResult,
  fehb: FehbResult,
  colaProjections: ColaProjection[],
  projectionYears: number = 30
): YearlyProjection[] {
  const retirementYear = new Date(
    input.employment.plannedRetirementDate
  ).getFullYear();
  const birthYear = new Date(input.personal.dateOfBirth).getFullYear();
  const colaAssumption = input.colaAssumption ?? 0.02;

  const projections: YearlyProjection[] = [];

  // Monthly expenses total
  const monthlyExpenses =
    input.expenses.housing +
    input.expenses.utilities +
    input.expenses.transportation +
    input.expenses.food +
    input.expenses.healthcareOutOfPocket +
    input.expenses.insurance +
    input.expenses.debtPayments +
    input.expenses.entertainment +
    input.expenses.travel +
    input.expenses.charitableGiving +
    input.expenses.other;
  const annualExpenses = monthlyExpenses * 12;

  // Other income (annual)
  const otherIncomeAnnual =
    input.otherIncome.otherPensions +
    input.otherIncome.spouseIncome +
    input.otherIncome.rentalIncome +
    input.otherIncome.investmentIncome +
    input.otherIncome.otherTaxableIncome +
    input.otherIncome.otherNonTaxableIncome;

  for (let i = 0; i < projectionYears; i++) {
    const year = retirementYear + i;
    const age = year - birthYear;

    // Annuity with COLA applied
    const colaEntry = colaProjections[i];
    const annuityAmount = colaEntry
      ? colaEntry.annuityAfterCola
      : annuity.annualAnnuity;

    // Survivor benefit cost (stays proportional)
    const survivorCost = survivor.annualCost;

    // FERS Supplement: only until age 62
    const supplementAmount =
      supplement.eligible && age < 62 ? supplement.annualAmount : 0;

    // Social Security
    const ssProjection = ss.yearlyProjections.find((p) => p.year === year);
    const ssAmount = ssProjection ? ssProjection.annualBenefit : 0;

    // TSP withdrawal — the engine models a FIXED monthly payment (balance
    // spread to a target age), which does NOT grow with inflation. Indexing it
    // by COLA overstated late-year TSP income (~+80% by year 30 at 2%). Keep
    // it flat to match the fixed-payment method actually computed.
    const tspWithdrawal = tsp.annualWithdrawal;

    // Other income (adjusted for inflation)
    const otherIncome = otherIncomeAnnual * Math.pow(1 + colaAssumption, i);

    // Total income
    const totalIncome =
      annuityAmount -
      survivorCost +
      supplementAmount +
      ssAmount +
      tspWithdrawal +
      otherIncome;

    // FEGLI cost
    const fegliYear = fegli.costProjections.find((p) => p.year === year);
    const fegliCost = fegliYear ? fegliYear.totalCost : 0;

    // FEHB cost (employee share)
    const fehbYear = fehb.projections.find((p) => p.year === year);
    const fehbCost = fehbYear ? fehbYear.employeeShare : 0;

    // LTC premium
    const ltcPremium = input.ltc.enrolled
      ? input.ltc.currentPremium * 12 * Math.pow(1 + 0.03, i) // 3% annual increase assumption
      : 0;

    // Living expenses (adjusted for inflation)
    const livingExpenses = annualExpenses * Math.pow(1 + colaAssumption, i);

    // Taxes
    const taxableIncome =
      annuityAmount - survivorCost + supplementAmount + ssAmount * 0.85 + tspWithdrawal;
    const federalTax =
      Math.round(
        Math.max(taxableIncome, 0) * input.tax.federalTaxRate * 100
      ) / 100;
    const stateTax =
      Math.round(Math.max(taxableIncome, 0) * input.tax.stateTaxRate * 100) /
      100;

    // Total expenses
    const totalExpenses =
      fegliCost +
      fehbCost +
      survivorCost +
      federalTax +
      stateTax +
      ltcPremium +
      livingExpenses;

    const netIncome = Math.round((totalIncome - totalExpenses + survivorCost) * 100) / 100;
    // Note: survivorCost is added back because it was already subtracted from totalIncome

    projections.push({
      year,
      age,
      annuity: Math.round(annuityAmount * 100) / 100,
      fersSupplement: Math.round(supplementAmount * 100) / 100,
      socialSecurity: Math.round(ssAmount * 100) / 100,
      tspWithdrawal: Math.round(tspWithdrawal * 100) / 100,
      otherIncome: Math.round(otherIncome * 100) / 100,
      totalIncome: Math.round(totalIncome * 100) / 100,
      fegliCost: Math.round(fegliCost * 100) / 100,
      fehbCost: Math.round(fehbCost * 100) / 100,
      survivorBenefitCost: Math.round(survivorCost * 100) / 100,
      federalTax,
      stateTax,
      ltcPremium: Math.round(ltcPremium * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      livingExpenses: Math.round(livingExpenses * 100) / 100,
      netIncome,
    });
  }

  return projections;
}
