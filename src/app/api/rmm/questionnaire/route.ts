import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/rmm/questionnaire
 *
 * Saves questionnaire answers to the Retirement_Intake__c record.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, ...answers } = body;

  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  if (!UUID_REGEX.test(token)) {
    return Response.json({ error: "Invalid token format" }, { status: 400 });
  }

  const conn = await getSFConnection();

  // Find the intake record — parameterized via jsforce .find() to prevent SOQL injection
  const records = await conn
    .sobject("Retirement_Intake__c")
    .find({ Upload_Token__c: token }, ["Id"])
    .limit(1)
    .execute();

  if (records.length === 0) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const intakeId = (records[0] as Record<string, unknown>).Id as string;

  // Map form answers to SF fields
  const update: Record<string, unknown> = {
    Id: intakeId,
    Status__c: "In Progress",
    Questionnaire_Completed__c: true,
  };

  if (answers.plannedRetirementAge) update.Planned_Retirement_Age__c = parseFloat(answers.plannedRetirementAge);
  if (answers.timeHorizon) update.Time_Horizon__c = answers.timeHorizon;
  if (answers.riskTolerance) update.Risk_Tolerance__c = answers.riskTolerance;
  if (answers.meetingValue) update.Meeting_Value_Statement__c = answers.meetingValue;
  if (answers.primaryConcern) update.Primary_Concern__c = answers.primaryConcern;
  if (answers.employer) update.Employer__c = answers.employer;
  if (answers.jobTitle) update.Job_Title__c = answers.jobTitle;
  if (answers.annualIncome) update.Annual_Income__c = parseFloat(answers.annualIncome);
  if (answers.employmentStatus) update.Employment_Status__c = answers.employmentStatus;
  if (answers.totalInvestableAssets) update.Total_Investable_Assets__c = answers.totalInvestableAssets;
  if (answers.monthlyExpenses) update.Monthly_Expenses__c = parseFloat(answers.monthlyExpenses);
  if (answers.desiredRetirementIncome) update.Desired_Retirement_Income__c = parseFloat(answers.desiredRetirementIncome);
  if (answers.receivingSS) update.Receiving_Social_Security__c = answers.receivingSS;
  update.Is_Federal_Employee__c = answers.isFederalEmployee === true;

  // Concerns checkboxes
  const concerns = answers.concerns || [];
  update.Concern_Outliving_Savings__c = concerns.includes("outliving");
  update.Concern_Social_Security__c = concerns.includes("ss");
  update.Concern_Healthcare__c = concerns.includes("healthcare");
  update.Concern_Long_Term_Care__c = concerns.includes("ltc");
  update.Concern_Legacy__c = concerns.includes("legacy");
  update.Concern_Market_Volatility__c = concerns.includes("volatility");
  update.Concern_Taxes__c = concerns.includes("taxes");

  try {
    await conn.sobject("Retirement_Intake__c").update(update as { Id: string });
    return Response.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // If Total_Investable_Assets__c is Currency but we sent a string, retry without it
    if (msg.includes("Total_Investable_Assets__c") || msg.includes("INVALID_TYPE")) {
      console.error("Total_Investable_Assets__c rejected (likely Currency field vs string value), retrying without it:", msg);
      delete update.Total_Investable_Assets__c;
      try {
        await conn.sobject("Retirement_Intake__c").update(update as { Id: string });
        return Response.json({ success: true, warning: "totalInvestableAssets could not be saved (field type mismatch)" });
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.error("Questionnaire save failed on retry:", retryMsg);
        return Response.json({ error: retryMsg }, { status: 500 });
      }
    }

    console.error("Questionnaire save failed:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
