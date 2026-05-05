// ============================================================
// Federal Retirement Report Builder — Master Type Definitions
// ============================================================

// ---- Enums ----

export type RetirementSystem = 'FERS' | 'CSRS' | 'CSRS_OFFSET' | 'FERS_TRANSFER';

export type EmployeeType = 'REGULAR' | 'LEO' | 'FIREFIGHTER' | 'ATC' | 'POSTAL' | 'CONGRESSIONAL';

export type MaritalStatus = 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED';

export type SurvivorElection = 'NONE' | '25_PERCENT' | '50_PERCENT';

export type FegliReduction = 'NO_REDUCTION' | '75_PERCENT' | '50_PERCENT' | '25_PERCENT' | 'ZERO';

export type FehbEnrollment = 'SELF_ONLY' | 'SELF_PLUS_ONE' | 'SELF_AND_FAMILY';

export type FilingStatus = 'SINGLE' | 'MARRIED_FILING_JOINTLY' | 'MARRIED_FILING_SEPARATELY' | 'HEAD_OF_HOUSEHOLD';

export type TspWithdrawalMethod = 'LUMP_SUM' | 'MONTHLY_PAYMENTS' | 'LIFE_ANNUITY' | 'COMBINATION';

export type TspFund = 'G' | 'F' | 'C' | 'S' | 'I' | 'L';

// ---- Input Data ----

export interface PersonalInfo {
  fullName: string;
  dateOfBirth: string; // ISO date
  address: string;
  maritalStatus: MaritalStatus;
  spouseDateOfBirth: string;
}

export interface EmploymentInfo {
  serviceComputationDate: string; // ISO date
  retirementSystem: RetirementSystem;
  employeeType: EmployeeType;
  currentAnnualSalary: number;
  annualSalaryIncreaseRate: number; // e.g. 0.02 for 2%
  creditableServiceYears: number;
  creditableServiceMonths: number;
  sickLeaveHours: number;
  plannedRetirementDate: string; // ISO date
  // FERS Transfer fields
  csrsServiceYears?: number;
  csrsServiceMonths?: number;
  fersServiceYears?: number;
  fersServiceMonths?: number;
}

export interface TspFundBalance {
  fund: TspFund;
  balance: number;
  returnRate: number; // annual, e.g. 0.07 for 7%
}

export interface TspInfo {
  traditionalBalances: TspFundBalance[];
  rothBalances: TspFundBalance[];
  annualContributionTraditional: number;
  annualContributionRoth: number;
  governmentMatchPercent: number;
  catchUpContribution: number;
  expectedReturnRate: number; // overall blended rate
  plannedWithdrawalAge: number;
  withdrawalMethod: TspWithdrawalMethod;
  monthlyWithdrawalAmount?: number;
}

export interface FegliInfo {
  basicCoverage: boolean;
  optionA: boolean; // Standard $10,000
  optionB: boolean;
  optionBMultiple: number; // 1-5
  optionC: boolean;
  optionCMultiple: number; // 1-5
  postRetirementReduction: FegliReduction;
}

export interface FehbInfo {
  currentPlanName: string;
  enrollment: FehbEnrollment;
  biweeklyPremium: number;
  premiumIncreaseRate: number; // e.g. 0.05 for 5%
}

export interface SocialSecurityInfo {
  estimatedBenefitAge62: number;
  estimatedBenefitFRA: number;
  plannedStartAge: number;
}

export interface LtcInfo {
  enrolled: boolean;
  currentPremium: number; // monthly
  dailyBenefitAmount: number;
  benefitPeriodYears: number;
}

export interface OtherIncome {
  otherPensions: number; // annual
  spouseIncome: number;
  rentalIncome: number;
  investmentIncome: number;
  otherTaxableIncome: number;
  otherNonTaxableIncome: number;
}

export interface Expenses {
  housing: number; // monthly
  utilities: number;
  transportation: number;
  food: number;
  healthcareOutOfPocket: number;
  insurance: number;
  debtPayments: number;
  entertainment: number;
  travel: number;
  charitableGiving: number;
  other: number;
}

export interface TaxInfo {
  filingStatus: FilingStatus;
  federalTaxRate: number; // effective rate, e.g. 0.22
  stateOfResidence: string;
  stateTaxRate: number; // effective rate
}

export interface MilitaryService {
  hasMilitaryService: boolean;
  branch: string;
  activeDutyStartDate: string;
  activeDutyEndDate: string;
  depositPaid: boolean;
  depositAmountOwed: number;
}

export interface DepositInfo {
  hasNonDeductionService: boolean;
  depositOwed: number;
  hasRefundedService: boolean;
  reDepositOwed: number;
}

// ---- Complete Report Input ----

export interface ReportInput {
  personal: PersonalInfo;
  employment: EmploymentInfo;
  tsp: TspInfo;
  fegli: FegliInfo;
  fehb: FehbInfo;
  socialSecurity: SocialSecurityInfo;
  ltc: LtcInfo;
  otherIncome: OtherIncome;
  expenses: Expenses;
  tax: TaxInfo;
  military: MilitaryService;
  deposits: DepositInfo;
  // Advisor branding
  advisorName?: string;
  advisorCompany?: string;
  advisorPhone?: string;
  advisorEmail?: string;
  colaAssumption?: number; // default 0.02
  projectionYears?: number; // default 30
  survivorElection?: SurvivorElection;
}

// ---- Calculation Results ----

export interface AnnuityResult {
  annualAnnuity: number;
  monthlyAnnuity: number;
  high3Average: number;
  totalServiceYears: number;
  totalServiceMonths: number;
  sickLeaveCredit: number; // in years
  multiplier: number; // effective multiplier used
  csrsComponent?: number; // for FERS Transfer
  fersComponent?: number;
}

export interface SurvivorBenefitResult {
  election: SurvivorElection;
  annualCost: number; // annual reduction to annuity
  monthlyCost: number;
  survivorAnnualBenefit: number;
  survivorMonthlyBenefit: number;
}

export interface FersSupplementResult {
  eligible: boolean;
  monthlyAmount: number;
  annualAmount: number;
  startDate: string;
  endDate: string; // age 62
}

export interface SocialSecurityResult {
  monthlyBenefitAtStartAge: number;
  annualBenefitAtStartAge: number;
  startAge: number;
  fullRetirementAge: number;
  yearlyProjections: { year: number; annualBenefit: number }[];
}

export interface ColaProjection {
  year: number;
  colaRate: number;
  annuityAfterCola: number;
}

export interface TspProjectionYear {
  year: number;
  age: number;
  startBalance: number;
  contributions: number;
  governmentMatch: number;
  growth: number;
  endBalance: number;
}

export interface TspResult {
  traditionalProjections: TspProjectionYear[];
  rothProjections: TspProjectionYear[];
  totalAtRetirement: number;
  traditionalAtRetirement: number;
  rothAtRetirement: number;
  monthlyWithdrawal: number;
  annualWithdrawal: number;
}

export interface FegliCostYear {
  age: number;
  year: number;
  basicCost: number;
  optionACost: number;
  optionBCost: number;
  optionCCost: number;
  totalCost: number;
  basicCoverage: number;
  optionACoverage: number;
  optionBCoverage: number;
  optionCCoverage: number;
}

export interface FegliResult {
  currentCoverage: {
    basic: number;
    optionA: number;
    optionB: number;
    optionC: number;
    total: number;
  };
  currentMonthlyCost: number;
  costProjections: FegliCostYear[];
}

export interface FehbProjectionYear {
  year: number;
  age: number;
  annualPremium: number;
  monthlyPremium: number;
  governmentShare: number;
  employeeShare: number;
}

export interface FehbResult {
  currentMonthlyPremium: number;
  retirementMonthlyPremium: number;
  projections: FehbProjectionYear[];
}

export interface IncomeComparisonResult {
  lastPaycheck: {
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
  };
  firstRetirementCheck: {
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
  };
  monthlyDifference: number;
  replacementRatio: number;
}

export interface YearlyProjection {
  year: number;
  age: number;
  annuity: number;
  fersSupplement: number;
  socialSecurity: number;
  tspWithdrawal: number;
  otherIncome: number;
  totalIncome: number;
  fegliCost: number;
  fehbCost: number;
  survivorBenefitCost: number;
  federalTax: number;
  stateTax: number;
  ltcPremium: number;
  totalExpenses: number;
  livingExpenses: number;
  netIncome: number;
}

export interface EligibilityDate {
  type: string;
  date: string;
  age: number;
  serviceYears: number;
  description: string;
  eligible: boolean;
}

export interface RetirementEligibility {
  earliestEligibleDate: string;
  mra: number; // Minimum Retirement Age
  eligibilityDates: EligibilityDate[];
}

export interface High3Detail {
  year: number;
  salary: number;
  inHigh3: boolean;
}

export interface MraPlus10Result {
  applies: boolean;
  penaltyPercent: number;
  monthsUnder62: number;
  reducedAnnuity: number;
}

// ---- Complete Calculation Result ----

export interface CalculationResult {
  annuity: AnnuityResult;
  survivorBenefit: SurvivorBenefitResult;
  fersSupplement: FersSupplementResult;
  socialSecurity: SocialSecurityResult;
  colaProjections: ColaProjection[];
  tsp: TspResult;
  fegli: FegliResult;
  fehb: FehbResult;
  incomeComparison: IncomeComparisonResult;
  yearlyProjections: YearlyProjection[];
  eligibility: RetirementEligibility;
  high3Detail: High3Detail[];
  mraPlus10: MraPlus10Result;
  proposedRetirement: {
    date: string;
    age: number;
    annualAnnuity: number;
    monthlyAnnuity: number;
  };
  delayedRetirement: {
    date: string;
    age: number;
    annualAnnuity: number;
    monthlyAnnuity: number;
  };
}

// ---- Saved Report ----

export interface SavedReport {
  id: string;
  createdAt: string;
  updatedAt: string;
  clientName: string;
  retirementSystem: RetirementSystem;
  plannedRetirementDate: string;
  input: ReportInput;
  result: CalculationResult;
}
