// CW Federal Benefits Platform — Core Types

// ============================================================
// Intake Record (mirrors SF Federal_Benefits_Intake__c)
// ============================================================

export type RetirementSystem = "CSRS" | "FERS" | "xFERS";
export type EmployeeType = "Regular" | "Other";
export type EmployeeCategory = "None" | "Firefighter" | "Law Enforcement" | "Air Traffic Controller";
export type RetirementType = "Regular" | "Optional" | "Mandatory";
export type IntakeStatus = "Draft" | "Link Sent" | "Docs Uploaded" | "AI Parsed" | "Advisor Review" | "Complete";
export type FERSSurvivorBenefit = "0%" | "25%" | "50%";
export type TSPWithdrawalType = "Lump Sum" | "Monthly Amount" | "Annuity";
export type TSPMonthlyMethod = "Specific Dollar Amount" | "Life Expectancy";
export type LTCBenefitPeriod = "2 Years" | "3 Years" | "5 Years" | "Unlimited";
export type LTCInflationProtection = "ACI 5%" | "ACI 4%" | "FPO";
export type FEGLIReduction = "No Reduction" | "50% Reduction" | "75% Reduction";
export type FEGLIMultiplier = "1x" | "2x" | "3x" | "4x" | "5x";

export interface FederalBenefitsIntake {
  id?: string;
  name?: string; // FBI-0001, etc.
  dateOfBirth?: string;
  leadId?: string;
  contactId?: string;
  advisorId?: string;
  status: IntakeStatus;
  intakeDate?: string;
  documentUploadUrl?: string;
  supabaseFolderId?: string;
  aiParseConfidence?: number;
  fieldsNeedingReview?: string;
  aiParsedDate?: string;
  advisorReviewedDate?: string;
  fedRetireReportGenerated?: boolean;
  fedRetireReportDate?: string;

  // Section 1: Annuity — Retirement Eligibility
  retirementSystem?: RetirementSystem;
  employeeType?: EmployeeType;
  employeeCategory?: EmployeeCategory;
  retirementType?: RetirementType;
  serviceComputationDate?: string;
  desiredRetirementDate?: string;
  transferDate?: string;
  spouseDob?: string;

  // Creditable Service
  sickLeaveHoursPerPeriod?: string;
  sickLeaveHoursToDate?: number;
  breakInService1From?: string;
  breakInService1To?: string;
  breakInService2From?: string;
  breakInService2To?: string;
  militaryServiceFrom?: string;
  militaryServiceTo?: string;
  hasDd214?: boolean;

  // High Three Average
  currentAnnualSalary?: number;
  expectedSalaryIncrease?: number;
  pastSalaryIncrease?: number;

  // Deposit
  hasPeriodsNoContributions?: boolean;
  depositPeriodFrom?: string;
  depositPeriodTo?: string;
  depositAmountOwed?: number;
  depositPaidDate?: string;

  // Redeposit
  leftServiceTookFunds?: boolean;
  redepositPeriodFrom?: string;
  redepositPeriodTo?: string;
  redepositAmountOwed?: number;
  withdrawalReceivedDate?: string;
  willRedeposit?: boolean;

  // Annuity Calculation
  estimatedHigh3Increase?: number;
  colaAdjustment?: number;
  survivorBenefitCsrs?: number;
  survivorBenefitFers?: FERSSurvivorBenefit;

  // Social Security — FERS
  ssFersStartAge?: number;
  ssFersMonthlyBenefit?: number;
  ssFersCola?: number;

  // Social Security — CSRS Offset
  ssCsrsStartAge?: number;
  ssCsrsMonthlyBenefit?: number;
  ssCsrsCola?: number;

  // Section 2: TSP
  tspTradBalances?: TSPFundBalances;
  tspTradBiweeklyDollar?: number;
  tspTradBiweeklyPct?: number;
  tspTradCatchup?: number;
  tspTradAllocations?: TSPFundAllocations;
  tspTradLFund?: string;

  tspRothBalances?: TSPFundBalances;
  tspRothBiweeklyDollar?: number;
  tspRothBiweeklyPct?: number;
  tspRothCatchup?: number;
  tspRothAllocations?: TSPFundAllocations;
  tspRothLFund?: string;

  tspReturns?: TSPFundReturns;
  tspWithdrawalAgeYears?: number;
  tspWithdrawalAgeMonths?: number;
  tspWithdrawalType?: TSPWithdrawalType;
  tspMonthlyMethod?: TSPMonthlyMethod;
  tspMonthlyDollarAmount?: number;
  tspJointAnnuitant?: boolean;
  tspJointAnnuitantAge?: number;
  tspAnnuityInterestRate?: number;

  // Section 3: Insurance
  isPostalEmployee?: boolean;
  fegliBiweeklyPremium?: number;
  fegliBasic?: boolean;
  fegliBasicReduce65?: FEGLIReduction;
  fegliOptionA?: boolean;
  fegliOptionB?: boolean;
  fegliOptionBMultiplier?: FEGLIMultiplier;
  fegliOptionBReduce65?: boolean;
  fegliOptionC?: boolean;
  fegliOptionCSpouse?: boolean;
  fegliOptionCMultiplier?: FEGLIMultiplier;
  fegliOptionCChildren?: boolean;
  fegliOptionCReduce65?: boolean;
  fehbBiweeklyPremium?: number;
  fehbAnnualIncrease?: number;

  // Long Term Care
  ltcStartAge?: number;
  ltcPlanType?: string;
  ltcDailyBenefit?: number;
  ltcBenefitPeriod?: LTCBenefitPeriod;
  ltcInflationProtection?: LTCInflationProtection;
  ltcPremiumPayment?: number;
  ltcMaxLifetimeBenefit?: number;

  // Retirement Analyzer
  otherTspRollover?: number;
  spouseIncome?: number;
  spouseRetirementSavings?: number;
  spouseSocialSecurity?: number;
  rentalPropertyIncome?: number;
  retirementJobIncome?: number;

  // LES Income Analysis
  lesRetirementDeduction?: number;
  lesSsOasdi?: number;
  lesFederalTax?: number;
  lesStateTax?: number;
  lesDental?: number;
  lesVision?: number;
  lesFsa?: number;
  lesMedicare?: number;
  lesAllotment?: number;
  lesOther1?: number;
  lesOther2?: number;

  // Expenses
  livingExpensesTotal?: number;
  expenseMortgageRent?: number;
  expenseAuto?: number;
  expenseCredit?: number;
  expenseOther?: number;
  taxIncreaseInRetirement?: string;
}

export interface TSPFundBalances {
  L: number;
  G: number;
  F: number;
  C: number;
  S: number;
  I: number;
}

export interface TSPFundAllocations {
  L: number;
  G: number;
  F: number;
  C: number;
  S: number;
  I: number;
}

export interface TSPFundReturns {
  G: number;
  F: number;
  C: number;
  S: number;
  I: number;
}

// ============================================================
// Calculation Engine Types
// ============================================================

export interface RetirementProjection {
  retirementDate: string;
  retirementAge: number;
  yearsOfService: number;
  sickLeaveCredit: number; // months
  totalServiceCredit: number; // years + sick leave

  // Pension
  highThreeAverage: number;
  pensionMultiplier: number;
  annualPension: number;
  monthlyPension: number;
  survivorBenefitReduction: number;
  netMonthlyPension: number;

  // FERS Supplement (if retiring before 62)
  fersSupplementMonthly?: number;
  fersSupplementEndAge: number;

  // Social Security
  ssMonthlyBenefit: number;
  ssStartAge: number;

  // TSP
  tspProjectedBalance: number;
  tspMonthlyIncome: number;

  // Insurance costs
  monthlyFehbPremium: number;
  monthlyFegliPremium: number;

  // Total retirement income
  totalMonthlyGross: number;
  totalMonthlyNet: number;
  totalAnnualGross: number;

  // Comparison
  currentMonthlyNet: number;
  incomeReplacementRatio: number;
}

export interface ScenarioComparison {
  scenarios: RetirementProjection[];
  recommendation: string;
}

// ============================================================
// Document Processing Types
// ============================================================

export type DocumentType = "LES" | "TSP_Statement" | "SF50" | "DD214" | "PSB" | "SS_Statement" | "Other";

export interface UploadedDocument {
  id: string;
  intakeId: string;
  fileName: string;
  fileType: string;
  documentType: DocumentType;
  storagePath: string;
  uploadedAt: string;
  parsed: boolean;
  parsedAt?: string;
  confidence?: number;
}

export interface ParsedField {
  fieldName: string;
  value: string | number | boolean;
  confidence: number;
  source: string; // which document
  pageNumber?: number;
}

export interface ParseResult {
  documentId: string;
  documentType: DocumentType;
  fields: ParsedField[];
  overallConfidence: number;
  warnings: string[];
}
