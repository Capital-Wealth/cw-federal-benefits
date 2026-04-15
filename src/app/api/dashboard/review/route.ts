import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import { listIntakeDocuments } from "@/lib/salesforce/files";
import { SF_CONFIG } from "@/config";

/**
 * GET /api/dashboard/review?id=a2vXXX
 *
 * Returns everything the advisor needs to review an intake:
 * - SF record fields (what the AI extracted)
 * - Uploaded documents from SF Files
 * - Confidence scores and flagged fields
 *
 * All data from Salesforce — no external dependencies.
 */
export async function GET(request: NextRequest) {
  const intakeId = request.nextUrl.searchParams.get("id");
  if (!intakeId) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  try {
    const conn = await getSFConnection();
    const record = await conn.sobject(SF_CONFIG.objectName).retrieve(intakeId);
    if (!record || !record.Id) {
      return Response.json({ error: "Record not found" }, { status: 404 });
    }

    // Get documents from SF Files
    const documents = await listIntakeDocuments(intakeId);

    const review = {
      intake: {
        id: record.Id,
        name: record.Name,
        status: record.Status__c,
        confidence: record.AI_Parse_Confidence__c,
        parsedDate: record.AI_Parsed_Date__c,
        fieldsNeedingReview: record.Fields_Needing_Review__c,
        reportGenerated: record.FedRetire_Report_Generated__c,
      },

      documents: documents.map((d) => ({
        id: d.contentVersionId,
        file_name: d.fileName,
        document_type: d.documentType,
        file_size: d.fileSize,
        uploaded_at: d.createdDate,
      })),

      documentChecklist: {
        LES: documents.some((d) => d.documentType === "LES"),
        SF50: documents.some((d) => d.documentType === "SF50"),
        TSP_Statement: documents.some((d) => d.documentType === "TSP_Statement"),
        DD214: documents.some((d) => d.documentType === "DD214"),
        PSB: documents.some((d) => d.documentType === "PSB"),
        SS_Statement: documents.some((d) => d.documentType === "SS_Statement"),
      },

      extracted: {
        employment: {
          retirementSystem: record.Retirement_System__c,
          employeeType: record.Employee_Type__c,
          employeeCategory: record.Employee_Category__c,
          currentAnnualSalary: record.Current_Annual_Salary__c,
          serviceComputationDate: record.Service_Computation_Date__c,
          desiredRetirementDate: record.Desired_Retirement_Date__c,
          sickLeaveHours: record.Sick_Leave_Hours_To_Date__c,
        },
        tsp: {
          traditionalTotal:
            (record.TSP_Trad_G_Balance__c || 0) + (record.TSP_Trad_F_Balance__c || 0) +
            (record.TSP_Trad_C_Balance__c || 0) + (record.TSP_Trad_S_Balance__c || 0) +
            (record.TSP_Trad_I_Balance__c || 0) + (record.TSP_Trad_L_Balance__c || 0),
          rothTotal:
            (record.TSP_Roth_G_Balance__c || 0) + (record.TSP_Roth_F_Balance__c || 0) +
            (record.TSP_Roth_C_Balance__c || 0) + (record.TSP_Roth_S_Balance__c || 0) +
            (record.TSP_Roth_I_Balance__c || 0) + (record.TSP_Roth_L_Balance__c || 0),
          biweeklyContribution: record.TSP_Trad_Biweekly_Dollar__c,
          rothBiweeklyContribution: record.TSP_Roth_Biweekly_Dollar__c,
          withdrawalType: record.TSP_Withdrawal_Type__c,
        },
        insurance: {
          fegliBasic: record.FEGLI_Basic__c,
          fegliOptionA: record.FEGLI_Option_A__c,
          fegliOptionB: record.FEGLI_Option_B__c,
          fegliOptionBMultiplier: record.FEGLI_Option_B_Multiplier__c,
          fehbPlan: record.FEHB_Plan_Name__c,
          fehbEnrollment: record.FEHB_Enrollment_Type__c,
          fehbBiweeklyPremium: record.FEHB_Biweekly_Premium__c,
        },
        socialSecurity: {
          monthlyBenefit: record.SS_FERS_Monthly_Benefit__c || record.SS_CSRS_Monthly_Benefit__c,
          startAge: record.SS_FERS_Start_Age__c || record.SS_CSRS_Start_Age__c,
        },
        military: {
          hasDd214: record.Has_DD214__c,
          serviceFrom: record.Military_Service_From__c,
          serviceTo: record.Military_Service_To__c,
          branch: record.Military_Branch__c,
        },
        survivor: {
          fersBenefit: record.Survivor_Benefit_FERS__c,
          spouseDob: record.Spouse_DOB__c,
          maritalStatus: record.Marital_Status__c,
        },
        deductions: {
          federalTax: record.LES_Federal_Tax__c,
          stateTax: record.LES_State_Tax__c,
          retirement: record.LES_Retirement_Deduction__c,
          medicare: record.LES_Medicare__c,
          ssOasdi: record.LES_SS_OASDI__c,
          fehb: record.FEHB_Biweekly_Premium__c,
          fegli: record.FEGLI_Biweekly_Premium__c,
        },
      },
    };

    return Response.json(review);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
