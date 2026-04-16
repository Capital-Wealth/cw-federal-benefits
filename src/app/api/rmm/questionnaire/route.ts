import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

/**
 * POST /api/rmm/questionnaire
 *
 * Saves questionnaire answers to the Retirement_Intake__c record.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, ...answers } = body;

  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  const conn = await getSFConnection();

  // Find the intake record
  const result = await conn.query(
    `SELECT Id FROM Retirement_Intake__c WHERE Upload_Token__c = '${token}' LIMIT 1`
  );

  if (result.records.length === 0) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const intakeId = (result.records[0] as Record<string, unknown>).Id as string;

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
  if (answers.totalInvestableAssets) update.Total_Investable_Assets__c = null; // Range stored as text
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
    return Response.json({ error: msg }, { status: 500 });
  }
}
