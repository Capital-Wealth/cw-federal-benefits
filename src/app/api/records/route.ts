import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

/**
 * GET /api/records?id=a2vXXXXXXXXXXXXX
 *
 * Data API for GullStack Report Builder.
 * Reads a Federal_Benefits_Intake__c record and returns all fields
 * in the format Vision's calculation engine expects.
 *
 * Auth: API key in X-API-Key header (shared secret with Vision's app).
 * This replaces the need for a Salesforce Connected App — our server
 * authenticates with SF using the existing CLI/password flow, and Vision
 * calls us instead of SF directly.
 */

const API_KEY = process.env.REPORT_BUILDER_API_KEY;

export async function GET(request: NextRequest) {
  // Auth check
  const providedKey = request.headers.get("x-api-key");
  if (!API_KEY || providedKey !== API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recordId = request.nextUrl.searchParams.get("id");
  if (!recordId) {
    return Response.json({ error: "id parameter required" }, { status: 400 });
  }

  try {
    const conn = await getSFConnection();

    // Query the full record with all fields Vision needs
    const record = await conn
      .sobject("Federal_Benefits_Intake__c")
      .retrieve(recordId);

    if (!record || !record.Id) {
      return Response.json({ error: "Record not found" }, { status: 404 });
    }

    // Get Contact/Lead name if linked
    let clientName: string | null = null;
    if (record.Contact__c) {
      const result = await conn.query(`SELECT Name FROM Contact WHERE Id = '${record.Contact__c}' LIMIT 1`);
      if (result.records.length > 0) clientName = (result.records[0] as Record<string, unknown>).Name as string;
    } else if (record.Lead__c) {
      const result = await conn.query(`SELECT Name FROM Lead WHERE Id = '${record.Lead__c}' LIMIT 1`);
      if (result.records.length > 0) clientName = (result.records[0] as Record<string, unknown>).Name as string;
    }

    // Map to Vision's expected format
    const mapped = {
      // Metadata
      sfRecordId: record.Id,
      sfRecordName: record.Name,
      status: record.Status__c,
      clientName,

      // Required fields
      dateOfBirth: record.Date_of_Birth__c,
      serviceComputationDate: record.Service_Computation_Date__c,
      retirementSystem: record.Retirement_System__c,
      employeeType: record.Employee_Type__c,
      employeeCategory: record.Employee_Category__c,
      currentAnnualSalary: record.Current_Annual_Salary__c,
      plannedRetirementDate: record.Desired_Retirement_Date__c,
      sickLeaveHours: record.Sick_Leave_Hours_To_Date__c,
      annualSalaryIncreaseRate: record.Expected_Salary_Increase__c,
      isPostalEmployee: record.Is_Postal_Employee__c,

      // TSP Traditional
      tspTraditionalG: record.TSP_Trad_G_Balance__c,
      tspTraditionalF: record.TSP_Trad_F_Balance__c,
      tspTraditionalC: record.TSP_Trad_C_Balance__c,
      tspTraditionalS: record.TSP_Trad_S_Balance__c,
      tspTraditionalI: record.TSP_Trad_I_Balance__c,
      tspTraditionalL: record.TSP_Trad_L_Balance__c,

      // TSP Roth
      tspRothG: record.TSP_Roth_G_Balance__c,
      tspRothF: record.TSP_Roth_F_Balance__c,
      tspRothC: record.TSP_Roth_C_Balance__c,
      tspRothS: record.TSP_Roth_S_Balance__c,
      tspRothI: record.TSP_Roth_I_Balance__c,
      tspRothL: record.TSP_Roth_L_Balance__c,

      // TSP Contributions (convert biweekly to annual for Vision)
      tspAnnualContribution: record.TSP_Trad_Biweekly_Dollar__c
        ? record.TSP_Trad_Biweekly_Dollar__c * 26
        : null,
      tspRothContribution: record.TSP_Roth_Biweekly_Dollar__c
        ? record.TSP_Roth_Biweekly_Dollar__c * 26
        : null,
      tspCatchUp:
        (record.TSP_Trad_Catchup__c || 0) + (record.TSP_Roth_Catchup__c || 0),
      tspExpectedReturn: (() => {
        const returns = [
          record.TSP_Return_G__c,
          record.TSP_Return_F__c,
          record.TSP_Return_C__c,
          record.TSP_Return_S__c,
          record.TSP_Return_I__c,
        ].filter((r) => r != null);
        return returns.length > 0
          ? returns.reduce((a, b) => a + b, 0) / returns.length / 100
          : null;
      })(),
      tspWithdrawalAge: record.TSP_Withdrawal_Age_Years__c,
      tspWithdrawalMethod: (() => {
        const map: Record<string, string> = {
          "Lump Sum": "LUMP_SUM",
          "Monthly Amount": "MONTHLY_PAYMENTS",
          Annuity: "LIFE_ANNUITY",
        };
        return map[record.TSP_Withdrawal_Type__c] || record.TSP_Withdrawal_Type__c;
      })(),
      tspMonthlyWithdrawal: record.TSP_Monthly_Dollar_Amount__c,

      // TSP Allocations
      tspTraditionalAllocations: {
        G: record.TSP_Trad_Alloc_G__c,
        F: record.TSP_Trad_Alloc_F__c,
        C: record.TSP_Trad_Alloc_C__c,
        S: record.TSP_Trad_Alloc_S__c,
        I: record.TSP_Trad_Alloc_I__c,
        L: record.TSP_Trad_Alloc_L__c,
      },
      tspRothAllocations: {
        G: record.TSP_Roth_Alloc_G__c,
        F: record.TSP_Roth_Alloc_F__c,
        C: record.TSP_Roth_Alloc_C__c,
        S: record.TSP_Roth_Alloc_S__c,
        I: record.TSP_Roth_Alloc_I__c,
        L: record.TSP_Roth_Alloc_L__c,
      },
      tspPerFundReturns: {
        G: record.TSP_Return_G__c,
        F: record.TSP_Return_F__c,
        C: record.TSP_Return_C__c,
        S: record.TSP_Return_S__c,
        I: record.TSP_Return_I__c,
      },

      // FEGLI
      fegliBasic: record.FEGLI_Basic__c,
      fegliOptionA: record.FEGLI_Option_A__c,
      fegliOptionB: record.FEGLI_Option_B__c,
      fegliOptionBMultiple: record.FEGLI_Option_B_Multiplier__c
        ? parseInt(record.FEGLI_Option_B_Multiplier__c)
        : null,
      fegliOptionC: record.FEGLI_Option_C__c,
      fegliOptionCMultiple: record.FEGLI_Option_C_Multiplier__c
        ? parseInt(record.FEGLI_Option_C_Multiplier__c)
        : null,
      fegliPostRetirement: record.FEGLI_Basic_Reduce_65__c,
      fegliBiweeklyPremium: record.FEGLI_Biweekly_Premium__c,

      // FEHB
      fehbPlanName: record.FEHB_Plan_Name__c,
      fehbEnrollment: (() => {
        const map: Record<string, string> = {
          "Self Only": "SELF_ONLY",
          "Self Plus One": "SELF_PLUS_ONE",
          "Self and Family": "SELF_AND_FAMILY",
        };
        return map[record.FEHB_Enrollment_Type__c] || record.FEHB_Enrollment_Type__c;
      })(),
      fehbBiweeklyPremium: record.FEHB_Biweekly_Premium__c,
      fehbIncreaseRate: record.FEHB_Annual_Increase__c
        ? record.FEHB_Annual_Increase__c / 100
        : null,

      // Social Security
      ssBenefitAge62: record.SS_FERS_Monthly_Benefit__c || record.SS_CSRS_Monthly_Benefit__c,
      ssStartAge: record.SS_FERS_Start_Age__c || record.SS_CSRS_Start_Age__c,

      // Military
      hasMilitaryService: record.Has_DD214__c,
      militaryBranch: record.Military_Branch__c,
      militaryStartDate: record.Military_Service_From__c,
      militaryEndDate: record.Military_Service_To__c,
      militaryDepositPaid: record.Military_Deposit_Paid__c,

      // Survivor
      survivorElection: (() => {
        const map: Record<string, string> = {
          "0%": "NONE",
          "25%": "25_PERCENT",
          "50%": "50_PERCENT",
        };
        return map[record.Survivor_Benefit_FERS__c] || record.Survivor_Benefit_FERS__c;
      })(),
      survivorBenefitCsrs: record.Survivor_Benefit_CSRS__c,
      spouseDOB: record.Spouse_DOB__c,
      maritalStatus: record.Marital_Status__c
        ? record.Marital_Status__c.toUpperCase()
        : null,

      // Tax
      filingStatus: record.Filing_Status__c
        ? record.Filing_Status__c.toUpperCase().replace(/ /g, "_")
        : null,
      federalTaxRate: record.Federal_Tax_Rate__c
        ? record.Federal_Tax_Rate__c / 100
        : null,
      stateOfResidence: record.State_of_Residence__c,
      stateTaxRate: record.State_Tax_Rate__c
        ? record.State_Tax_Rate__c / 100
        : null,

      // Deposit/Redeposit
      hasNonDeductionService: record.Has_Periods_No_Contributions__c,
      depositOwed: record.Deposit_Amount_Owed__c,
      hasRefundedService: record.Left_Service_Took_Funds__c,
      reDepositOwed: record.Redeposit_Amount_Owed__c,

      // Other Income
      otherPensions: record.Other_Pensions__c,
      spouseIncome: record.Spouse_Income__c,
      rentalIncome: record.Rental_Property_Income__c,
      investmentIncome: record.Investment_Income__c,
      monthlyHousing: record.Expense_Mortgage_Rent__c,

      // xFERS / FERS Transfer
      transferDate: record.Transfer_Date__c,

      // Annuity extras
      colaAdjustment: record.COLA_Adjustment__c,
      estimatedHigh3Increase: record.Estimated_High_3_Increase__c,

      // AI parsing metadata
      aiParseConfidence: record.AI_Parse_Confidence__c,
      aiParsedDate: record.AI_Parsed_Date__c,
      fieldsNeedingReview: record.Fields_Needing_Review__c,
      reportGenerated: record.FedRetire_Report_Generated__c,
    };

    return Response.json(mapped);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Failed to fetch record", details: msg }, { status: 500 });
  }
}

/**
 * POST /api/records — Update record after report generation
 *
 * Body: { id: string, reportGenerated: true, reportDate: string }
 */
export async function POST(request: NextRequest) {
  const providedKey = request.headers.get("x-api-key");
  if (!API_KEY || providedKey !== API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, reportGenerated, reportDate } = await request.json();
  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  try {
    const conn = await getSFConnection();
    const update = { Id: id } as { Id: string } & Record<string, unknown>;
    if (reportGenerated !== undefined) update.FedRetire_Report_Generated__c = reportGenerated;
    if (reportDate) update.FedRetire_Report_Date__c = reportDate;

    await conn.sobject("Federal_Benefits_Intake__c").update(update as { Id: string });
    return Response.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
