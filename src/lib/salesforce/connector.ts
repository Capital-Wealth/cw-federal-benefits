/**
 * Salesforce Connector for Federal Benefits Intake
 *
 * Reads/writes Federal_Benefits_Intake__c records.
 * Supports three auth methods:
 * 1. SF_ACCESS_TOKEN env var (direct token — for dev, auto-refreshed by SF CLI)
 * 2. SF CLI token (reads from `sf org display` if available)
 * 3. Username/password flow (for production/deployed environments)
 */

import jsforce, { Connection } from "jsforce";
import { execSync } from "child_process";
import type { FederalBenefitsIntake } from "@/types";
import { SF_CONFIG } from "@/config";

let connection: Connection | null = null;
let tokenExpiresAt: number = 0;

/**
 * Try to get a fresh access token from the SF CLI.
 * This works in local dev when you're authenticated via `sf org login web`.
 */
function getCliToken(): { accessToken: string; instanceUrl: string } | null {
  try {
    const result = execSync(`sf org display --target-org ${SF_CONFIG.cliOrgAlias} --json 2>/dev/null`, {
      encoding: "utf-8",
      timeout: SF_CONFIG.cliTimeoutMs,
    });
    const data = JSON.parse(result);
    if (data?.result?.accessToken && data?.result?.instanceUrl) {
      return {
        accessToken: data.result.accessToken,
        instanceUrl: data.result.instanceUrl,
      };
    }
  } catch {
    // CLI not available or not authenticated
  }
  return null;
}

/**
 * Get an authenticated Salesforce connection.
 */
export async function getSFConnection(): Promise<Connection> {
  // Re-use connection if token hasn't expired (refresh every 90 min)
  if (connection && Date.now() < tokenExpiresAt) return connection;

  const instanceUrl = SF_CONFIG.instanceUrl;

  // Method 1: Direct access token from env
  if (process.env.SF_ACCESS_TOKEN) {
    connection = new Connection({ instanceUrl, accessToken: process.env.SF_ACCESS_TOKEN });
    tokenExpiresAt = Date.now() + SF_CONFIG.tokenCacheMs;
    return connection;
  }

  // Method 2: SF CLI token (local dev)
  const cliAuth = getCliToken();
  if (cliAuth) {
    connection = new Connection({
      instanceUrl: cliAuth.instanceUrl,
      accessToken: cliAuth.accessToken,
    });
    tokenExpiresAt = Date.now() + SF_CONFIG.tokenCacheMs;
    return connection;
  }

  // Method 3: Username/password (deployed environments)
  if (process.env.SF_USERNAME && process.env.SF_PASSWORD) {
    const conn = new Connection({
      loginUrl: SF_CONFIG.loginUrl,
      instanceUrl,
    });
    await conn.login(
      process.env.SF_USERNAME,
      process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || "")
    );
    connection = conn;
    tokenExpiresAt = Date.now() + SF_CONFIG.tokenCacheMs;
    return conn;
  }

  throw new Error(
    "No Salesforce auth available. Set SF_ACCESS_TOKEN, authenticate SF CLI, or provide SF_USERNAME/SF_PASSWORD."
  );
}

// ============================================================
// Field Mapping: TypeScript ↔ Salesforce API names
// ============================================================

const FIELD_MAP: Record<string, string> = {
  // Lookups & Status
  leadId: "Lead__c",
  contactId: "Contact__c",
  advisorId: "Advisor__c",
  status: "Status__c",
  intakeDate: "Intake_Date__c",
  documentUploadUrl: "Document_Upload_URL__c",
  supabaseFolderId: "Supabase_Folder_ID__c",
  aiParseConfidence: "AI_Parse_Confidence__c",
  fieldsNeedingReview: "Fields_Needing_Review__c",
  aiParsedDate: "AI_Parsed_Date__c",
  advisorReviewedDate: "Advisor_Reviewed_Date__c",
  fedRetireReportGenerated: "FedRetire_Report_Generated__c",
  fedRetireReportDate: "FedRetire_Report_Date__c",

  // Section 1: Annuity
  retirementSystem: "Retirement_System__c",
  employeeType: "Employee_Type__c",
  employeeCategory: "Employee_Category__c",
  retirementType: "Retirement_Type__c",
  serviceComputationDate: "Service_Computation_Date__c",
  desiredRetirementDate: "Desired_Retirement_Date__c",
  transferDate: "Transfer_Date__c",
  spouseDob: "Spouse_DOB__c",
  sickLeaveHoursPerPeriod: "Sick_Leave_Hours_Per_Period__c",
  sickLeaveHoursToDate: "Sick_Leave_Hours_To_Date__c",
  breakInService1From: "Break_In_Service_1_From__c",
  breakInService1To: "Break_In_Service_1_To__c",
  breakInService2From: "Break_In_Service_2_From__c",
  breakInService2To: "Break_In_Service_2_To__c",
  militaryServiceFrom: "Military_Service_From__c",
  militaryServiceTo: "Military_Service_To__c",
  hasDd214: "Has_DD214__c",
  currentAnnualSalary: "Current_Annual_Salary__c",
  expectedSalaryIncrease: "Expected_Salary_Increase__c",
  pastSalaryIncrease: "Past_Salary_Increase__c",
  hasPeriodsNoContributions: "Has_Periods_No_Contributions__c",
  depositPeriodFrom: "Deposit_Period_From__c",
  depositPeriodTo: "Deposit_Period_To__c",
  depositAmountOwed: "Deposit_Amount_Owed__c",
  depositPaidDate: "Deposit_Paid_Date__c",
  leftServiceTookFunds: "Left_Service_Took_Funds__c",
  redepositPeriodFrom: "Redeposit_Period_From__c",
  redepositPeriodTo: "Redeposit_Period_To__c",
  redepositAmountOwed: "Redeposit_Amount_Owed__c",
  withdrawalReceivedDate: "Withdrawal_Received_Date__c",
  willRedeposit: "Will_Redeposit__c",
  estimatedHigh3Increase: "Estimated_High_3_Increase__c",
  colaAdjustment: "COLA_Adjustment__c",
  survivorBenefitCsrs: "Survivor_Benefit_CSRS__c",
  survivorBenefitFers: "Survivor_Benefit_FERS__c",
  ssFersStartAge: "SS_FERS_Start_Age__c",
  ssFersMonthlyBenefit: "SS_FERS_Monthly_Benefit__c",
  ssFersCola: "SS_FERS_COLA__c",
  ssCsrsStartAge: "SS_CSRS_Start_Age__c",
  ssCsrsMonthlyBenefit: "SS_CSRS_Monthly_Benefit__c",
  ssCsrsCola: "SS_CSRS_COLA__c",

  // Section 2: TSP (flat fields — nested objects handled separately)
  tspTradBiweeklyDollar: "TSP_Trad_Biweekly_Dollar__c",
  tspTradBiweeklyPct: "TSP_Trad_Biweekly_Pct__c",
  tspTradCatchup: "TSP_Trad_Catchup__c",
  tspTradLFund: "TSP_Trad_L_Fund__c",
  tspRothBiweeklyDollar: "TSP_Roth_Biweekly_Dollar__c",
  tspRothBiweeklyPct: "TSP_Roth_Biweekly_Pct__c",
  tspRothCatchup: "TSP_Roth_Catchup__c",
  tspRothLFund: "TSP_Roth_L_Fund__c",
  tspWithdrawalAgeYears: "TSP_Withdrawal_Age_Years__c",
  tspWithdrawalAgeMonths: "TSP_Withdrawal_Age_Months__c",
  tspWithdrawalType: "TSP_Withdrawal_Type__c",
  tspMonthlyMethod: "TSP_Monthly_Method__c",
  tspMonthlyDollarAmount: "TSP_Monthly_Dollar_Amount__c",
  tspJointAnnuitant: "TSP_Joint_Annuitant__c",
  tspJointAnnuitantAge: "TSP_Joint_Annuitant_Age__c",
  tspAnnuityInterestRate: "TSP_Annuity_Interest_Rate__c",

  // Section 3: Insurance
  isPostalEmployee: "Is_Postal_Employee__c",
  fegliBiweeklyPremium: "FEGLI_Biweekly_Premium__c",
  fegliBasic: "FEGLI_Basic__c",
  fegliBasicReduce65: "FEGLI_Basic_Reduce_65__c",
  fegliOptionA: "FEGLI_Option_A__c",
  fegliOptionB: "FEGLI_Option_B__c",
  fegliOptionBMultiplier: "FEGLI_Option_B_Multiplier__c",
  fegliOptionBReduce65: "FEGLI_Option_B_Reduce_65__c",
  fegliOptionC: "FEGLI_Option_C__c",
  fegliOptionCSpouse: "FEGLI_Option_C_Spouse__c",
  fegliOptionCMultiplier: "FEGLI_Option_C_Multiplier__c",
  fegliOptionCChildren: "FEGLI_Option_C_Children__c",
  fegliOptionCReduce65: "FEGLI_Option_C_Reduce_65__c",
  fehbBiweeklyPremium: "FEHB_Biweekly_Premium__c",
  fehbAnnualIncrease: "FEHB_Annual_Increase__c",
  ltcStartAge: "LTC_Start_Age__c",
  ltcPlanType: "LTC_Plan_Type__c",
  ltcDailyBenefit: "LTC_Daily_Benefit__c",
  ltcBenefitPeriod: "LTC_Benefit_Period__c",
  ltcInflationProtection: "LTC_Inflation_Protection__c",
  ltcPremiumPayment: "LTC_Premium_Payment__c",
  ltcMaxLifetimeBenefit: "LTC_Max_Lifetime_Benefit__c",

  // Retirement Analyzer
  otherTspRollover: "Other_TSP_Rollover__c",
  spouseIncome: "Spouse_Income__c",
  spouseRetirementSavings: "Spouse_Retirement_Savings__c",
  spouseSocialSecurity: "Spouse_Social_Security__c",
  rentalPropertyIncome: "Rental_Property_Income__c",
  retirementJobIncome: "Retirement_Job_Income__c",
  lesRetirementDeduction: "LES_Retirement_Deduction__c",
  lesSsOasdi: "LES_SS_OASDI__c",
  lesFederalTax: "LES_Federal_Tax__c",
  lesStateTax: "LES_State_Tax__c",
  lesDental: "LES_Dental__c",
  lesVision: "LES_Vision__c",
  lesFsa: "LES_FSA__c",
  lesMedicare: "LES_Medicare__c",
  lesAllotment: "LES_Allotment__c",
  lesOther1: "LES_Other_1__c",
  lesOther2: "LES_Other_2__c",
  livingExpensesTotal: "Living_Expenses_Total__c",
  expenseMortgageRent: "Expense_Mortgage_Rent__c",
  expenseAuto: "Expense_Auto__c",
  expenseCredit: "Expense_Credit__c",
  expenseOther: "Expense_Other__c",
  taxIncreaseInRetirement: "Tax_Increase_In_Retirement__c",
};

// TSP fund fields (nested objects → flat SF fields)
const TSP_FUNDS = ["L", "G", "F", "C", "S", "I"];

/**
 * Convert TypeScript intake to Salesforce record.
 */
export function intakeToSFRecord(intake: Partial<FederalBenefitsIntake>): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  for (const [tsKey, sfKey] of Object.entries(FIELD_MAP)) {
    const value = (intake as Record<string, unknown>)[tsKey];
    if (value !== undefined && value !== null) {
      record[sfKey] = value;
    }
  }

  // Flatten TSP balances
  if (intake.tspTradBalances) {
    for (const fund of TSP_FUNDS) {
      const val = intake.tspTradBalances[fund as keyof typeof intake.tspTradBalances];
      if (val !== undefined) record[`TSP_Trad_${fund}_Balance__c`] = val;
    }
  }
  if (intake.tspRothBalances) {
    for (const fund of TSP_FUNDS) {
      const val = intake.tspRothBalances[fund as keyof typeof intake.tspRothBalances];
      if (val !== undefined) record[`TSP_Roth_${fund}_Balance__c`] = val;
    }
  }
  if (intake.tspTradAllocations) {
    for (const fund of TSP_FUNDS) {
      const val = intake.tspTradAllocations[fund as keyof typeof intake.tspTradAllocations];
      if (val !== undefined) record[`TSP_Trad_Alloc_${fund}__c`] = val;
    }
  }
  if (intake.tspRothAllocations) {
    for (const fund of TSP_FUNDS) {
      const val = intake.tspRothAllocations[fund as keyof typeof intake.tspRothAllocations];
      if (val !== undefined) record[`TSP_Roth_Alloc_${fund}__c`] = val;
    }
  }
  if (intake.tspReturns) {
    for (const fund of ["G", "F", "C", "S", "I"]) {
      const val = intake.tspReturns[fund as keyof typeof intake.tspReturns];
      if (val !== undefined) record[`TSP_Return_${fund}__c`] = val;
    }
  }

  return record;
}

/**
 * Create a new Federal Benefits Intake record in Salesforce.
 */
export async function createIntake(
  intake: Partial<FederalBenefitsIntake>
): Promise<string> {
  const conn = await getSFConnection();
  const record = intakeToSFRecord(intake);
  const result = await conn.sobject("Federal_Benefits_Intake__c").create(record);
  if (!result.success) {
    throw new Error(`Failed to create intake: ${JSON.stringify(result.errors)}`);
  }
  return result.id;
}

/**
 * Update an existing Federal Benefits Intake record.
 */
export async function updateIntake(
  id: string,
  intake: Partial<FederalBenefitsIntake>
): Promise<void> {
  const conn = await getSFConnection();
  const record = intakeToSFRecord(intake);
  record.Id = id;
  const result = await conn.sobject("Federal_Benefits_Intake__c").update(record as { Id: string } & Record<string, unknown>);
  if (!result.success) {
    throw new Error(`Failed to update intake: ${JSON.stringify(result.errors)}`);
  }
}

/**
 * Get an intake record by ID.
 */
export async function getIntake(id: string): Promise<FederalBenefitsIntake | null> {
  const conn = await getSFConnection();
  const allSfFields = Object.values(FIELD_MAP);
  // Add TSP balance/alloc fields
  for (const fund of TSP_FUNDS) {
    allSfFields.push(`TSP_Trad_${fund}_Balance__c`, `TSP_Roth_${fund}_Balance__c`);
    allSfFields.push(`TSP_Trad_Alloc_${fund}__c`, `TSP_Roth_Alloc_${fund}__c`);
  }
  for (const fund of ["G", "F", "C", "S", "I"]) {
    allSfFields.push(`TSP_Return_${fund}__c`);
  }

  const record = await conn
    .sobject("Federal_Benefits_Intake__c")
    .retrieve(id);

  if (!record || !record.Id) return null;

  // Reverse map SF → TS
  const reverseMap: Record<string, string> = {};
  for (const [tsKey, sfKey] of Object.entries(FIELD_MAP)) {
    reverseMap[sfKey] = tsKey;
  }

  const intake: Record<string, unknown> = { id: record.Id, name: record.Name };
  for (const [sfKey, tsKey] of Object.entries(reverseMap)) {
    if (record[sfKey] !== undefined && record[sfKey] !== null) {
      intake[tsKey] = record[sfKey];
    }
  }

  return intake as unknown as FederalBenefitsIntake;
}
