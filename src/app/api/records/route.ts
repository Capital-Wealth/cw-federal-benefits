import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import { REPORT_BUILDER_CONFIG, SF_CONFIG, PAY_PERIODS_PER_YEAR } from "@/config";

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

const API_KEY = REPORT_BUILDER_CONFIG.apiKey;

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
      .sobject(SF_CONFIG.objectName)
      .retrieve(recordId);

    if (!record || !record.Id) {
      return Response.json({ error: "Record not found" }, { status: 404 });
    }

    // Get name + DOB + state from the linked Contact/Lead. DOB lives on Contact
    // (not on FBI — that field doesn't exist on the FBI object), and state of
    // residence comes from the Contact's mailing address.
    let clientName: string | null = null;
    // Prefer the FBI's own Date_of_Birth__c (set by the Live Plan inline editor,
    // readable by the integration user) over the Contact's Birthdate.
    let dateOfBirth: string | null = (record.Date_of_Birth__c as string) ?? null;
    let stateOfResidence: string | null = null;
    let address: string | null = null;

    // Advisor identity — the report is signed by whoever runs it. Prefer the
    // explicit Advisor__c lookup; if blank, fall back to record Owner. Either
    // resolves to a User record we read Name / Email / Phone from.
    let advisorName: string | null = null;
    let advisorEmail: string | null = null;
    let advisorPhone: string | null = null;
    const advisorUserId = (record.Advisor__c as string | null) || (record.OwnerId as string | null);
    if (advisorUserId) {
      const advisorResult = await conn.query(
        `SELECT Name, Email, Phone FROM User WHERE Id = '${advisorUserId}' LIMIT 1`,
      );
      if (advisorResult.records.length > 0) {
        const u = advisorResult.records[0] as Record<string, unknown>;
        advisorName = (u.Name as string) ?? null;
        advisorEmail = (u.Email as string) ?? null;
        advisorPhone = (u.Phone as string) ?? null;
      }
    }
    if (record.Contact__c) {
      const result = await conn.query(
        `SELECT Name, Birthdate, MailingStreet, MailingCity, MailingState, MailingPostalCode FROM Contact WHERE Id = '${record.Contact__c}' LIMIT 1`,
      );
      if (result.records.length > 0) {
        const c = result.records[0] as Record<string, unknown>;
        clientName = (c.Name as string) ?? null;
        if (!dateOfBirth) dateOfBirth = (c.Birthdate as string) ?? null;
        stateOfResidence = (c.MailingState as string) ?? null;
        const street = (c.MailingStreet as string) ?? '';
        const city = (c.MailingCity as string) ?? '';
        const state = (c.MailingState as string) ?? '';
        const zip = (c.MailingPostalCode as string) ?? '';
        const cityStateZip = [city, state].filter(Boolean).join(', ') + (zip ? ` ${zip}` : '');
        address = [street, cityStateZip].filter(s => s.trim()).join(', ') || null;
      }
    } else if (record.Lead__c) {
      const result = await conn.query(
        `SELECT Name, Street, City, State, PostalCode FROM Lead WHERE Id = '${record.Lead__c}' LIMIT 1`,
      );
      if (result.records.length > 0) {
        const l = result.records[0] as Record<string, unknown>;
        clientName = (l.Name as string) ?? null;
        stateOfResidence = (l.State as string) ?? null;
        const street = (l.Street as string) ?? '';
        const city = (l.City as string) ?? '';
        const state = (l.State as string) ?? '';
        const zip = (l.PostalCode as string) ?? '';
        const cityStateZip = [city, state].filter(Boolean).join(', ') + (zip ? ` ${zip}` : '');
        address = [street, cityStateZip].filter(s => s.trim()).join(', ') || null;
      }
    }

    // Map to Vision's expected format
    const mapped = {
      // Metadata
      sfRecordId: record.Id,
      sfRecordName: record.Name,
      status: record.Status__c,
      clientName,
      address,

      // Required fields
      // dateOfBirth is read from Contact.Birthdate above (not on FBI object).
      dateOfBirth,
      serviceComputationDate: record.Service_Computation_Date__c,
      retirementSystem: record.Retirement_System__c,
      employeeType: record.Employee_Type__c,
      employeeCategory: record.Employee_Category__c,
      currentAnnualSalary: record.Current_Annual_Salary__c,
      plannedRetirementDate: record.Desired_Retirement_Date__c,
      sickLeaveHours: record.Sick_Leave_Hours_To_Date__c,
      // Field stores whole percent (e.g. 2 for 2%); calc engine expects decimal.
      annualSalaryIncreaseRate: record.Expected_Salary_Increase__c != null
        ? record.Expected_Salary_Increase__c / 100
        : null,
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
        ? record.TSP_Trad_Biweekly_Dollar__c * PAY_PERIODS_PER_YEAR
        : null,
      tspRothContribution: record.TSP_Roth_Biweekly_Dollar__c
        ? record.TSP_Roth_Biweekly_Dollar__c * PAY_PERIODS_PER_YEAR
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
      // Selected L (Lifecycle) Fund variant — drives the L Fund blended return
      // assumption in the calc engine (resolveLFundReturn).
      tspTradLFund: record.TSP_Trad_L_Fund__c,
      tspRothLFund: record.TSP_Roth_L_Fund__c,

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

      // FEHB — plan name + enrollment type are not yet on the FBI object;
      // downstream calc engine doesn't need them and the mapper supplies a
      // sensible default. Premium + annual increase are populated by the parser.
      fehbPlanName: null,
      fehbEnrollment: null,
      fehbBiweeklyPremium: record.FEHB_Biweekly_Premium__c,
      fehbIncreaseRate: record.FEHB_Annual_Increase__c
        ? record.FEHB_Annual_Increase__c / 100
        : null,

      // Social Security
      ssBenefitAge62: record.SS_FERS_Monthly_Benefit__c || record.SS_CSRS_Monthly_Benefit__c,
      ssStartAge: record.SS_FERS_Start_Age__c || record.SS_CSRS_Start_Age__c,

      // Military — branch is not on the FBI object yet; harmless to omit.
      hasMilitaryService: record.Has_DD214__c,
      militaryBranch: null,
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
      // Marital status / filing status / tax rates aren't tracked on the FBI
      // object today — surface as null so downstream defaults apply (SINGLE,
      // 22% federal, 5% state) and the dataWarnings list can flag them.
      maritalStatus: null,

      // Tax
      filingStatus: null,
      federalTaxRate: null,
      // stateOfResidence is read from Contact.MailingState above (not on FBI).
      stateOfResidence,
      stateTaxRate: null,

      // Deposit/Redeposit
      hasNonDeductionService: record.Has_Periods_No_Contributions__c,
      depositOwed: record.Deposit_Amount_Owed__c,
      hasRefundedService: record.Left_Service_Took_Funds__c,
      reDepositOwed: record.Redeposit_Amount_Owed__c,

      // Other Income — not yet tracked on the FBI; advisor enters in Live Plan.
      otherPensions: null,
      spouseIncome: record.Spouse_Income__c,
      rentalIncome: record.Rental_Property_Income__c,
      investmentIncome: null,
      monthlyHousing: record.Expense_Mortgage_Rent__c,

      // xFERS / FERS Transfer
      transferDate: record.Transfer_Date__c,

      // Annuity extras
      colaAdjustment: record.COLA_Adjustment__c,
      estimatedHigh3Increase: record.Estimated_High_3_Increase__c,

      // Advisor identity — pulled from FBI Advisor__c (or OwnerId fallback)
      // above. Lets the report sign with whoever actually owns the case.
      advisorName,
      advisorEmail,
      advisorPhone,
      advisorCompany: null, // single-tenant; builder supplies "Capital Wealth"

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

    await conn.sobject(SF_CONFIG.objectName).update(update as { Id: string });
    return Response.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
