import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import { listIntakeDocuments, downloadFromSalesforce } from "@/lib/salesforce/files";
import { parseDocument, mergeParseResults } from "@/lib/parsing/document-parser";
import { updateIntake } from "@/lib/salesforce/connector";
import { SF_CONFIG, PARSE_SERVICE } from "@/config";
import type { DocumentType, FederalBenefitsIntake } from "@/types";

/**
 * POST /api/parse — Parse uploaded documents and update Salesforce.
 *
 * Body: { intakeId: string, intakeObject?: "Federal_Benefits_Intake__c" | "Retirement_Intake__c" }
 *
 * Reads documents from Salesforce Files, parses each with Claude AI, merges
 * the results, and writes extracted fields back to the appropriate intake
 * object (Federal or General). If `intakeObject` is omitted, defaults to
 * Federal for backward compatibility.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { intakeId, intakeObject } = body as {
    intakeId: string;
    intakeObject?: string;
  };

  if (!intakeId) {
    return Response.json({ error: "intakeId is required" }, { status: 400 });
  }

  const targetObject = intakeObject || SF_CONFIG.objectName;

  if (targetObject === "Retirement_Intake__c") {
    return parseGeneral(intakeId);
  }

  return parseFederal(intakeId);
}

// ============================================================
// FEDERAL pipeline — original federal-specific parsing.
// ============================================================

async function parseFederal(intakeId: string): Promise<Response> {
  const documents = await listIntakeDocuments(intakeId);

  if (documents.length === 0) {
    return Response.json({ error: "No documents found on this record" }, { status: 404 });
  }

  const parseResults = [];
  const errors = [];

  for (const doc of documents) {
    try {
      const { buffer, fileName, mimeType } = await downloadFromSalesforce(doc.contentVersionId);

      const result = await parseDocument(
        buffer,
        mimeType,
        doc.documentType as DocumentType,
        fileName
      );
      result.documentId = doc.contentVersionId;
      parseResults.push(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to parse ${doc.title}: ${msg}`);
    }
  }

  if (parseResults.length === 0) {
    return Response.json(
      { error: "All documents failed to parse", errors },
      { status: 422 }
    );
  }

  const { merged, confidence, fieldsNeedingReview } = mergeParseResults(parseResults);

  try {
    const intakeUpdate: Partial<FederalBenefitsIntake> = {
      ...(merged as Partial<FederalBenefitsIntake>),
      status: "AI Parsed",
      aiParseConfidence: confidence,
      aiParsedDate: new Date().toISOString(),
      fieldsNeedingReview:
        fieldsNeedingReview.length > 0 ? fieldsNeedingReview.join("\n") : undefined,
    };

    await updateIntake(intakeId, intakeUpdate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Salesforce update failed: ${msg}`);
  }

  return Response.json({
    intakeObject: "Federal_Benefits_Intake__c",
    parsed: parseResults.length,
    failed: errors.length,
    confidence,
    fieldsExtracted: Object.keys(merged).length,
    fieldsNeedingReview,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ============================================================
// GENERAL pipeline — non-federal retirement docs.
// ============================================================

const GENERAL_PROMPT = `You are analyzing a retirement-related financial document. It could be a 401(k)/403(b)/457 statement, a Traditional or Roth IRA statement, a taxable brokerage statement, an annuity statement, a pension statement, a Social Security benefits statement, a tax return (1040 or W-2), or a paystub.

Extract ONLY the fields below if they appear in THIS document. Return a single JSON object with exactly these keys (use null for any field not present):

{
  "annualIncome": number | null (gross annual income — from a tax return line 1/1a, W-2 Box 1, or a paystub annualized by multiplying YTD gross by 12/month-of-year or biweekly gross by 26),
  "iraTraditionalBalance": number | null (current balance of a Traditional IRA),
  "iraRothBalance": number | null (current balance of a Roth IRA),
  "k401Balance": number | null (current balance of a Traditional 401(k), 403(b), or 457 plan),
  "k401RothBalance": number | null (current balance of a Roth 401(k) or Roth 403(b)),
  "brokerageBalance": number | null (non-retirement taxable brokerage account balance),
  "annuityBalance": number | null (current contract value of an annuity),
  "pensionAnnualIncome": number | null (annual pension benefit amount being or to be paid),
  "pensionSource": string | null (pension plan name or former employer),
  "ssMonthlyBenefit": number | null (Social Security monthly benefit at Full Retirement Age)
}

Rules:
- Return JSON only. No prose, no markdown, no code fences.
- If a field is not in this document, use null — do NOT guess.
- For balances, use the most recent/current value, not the year-start or beginning-balance.`;

interface GeneralParseOutput {
  annualIncome?: number | null;
  iraTraditionalBalance?: number | null;
  iraRothBalance?: number | null;
  k401Balance?: number | null;
  k401RothBalance?: number | null;
  brokerageBalance?: number | null;
  annuityBalance?: number | null;
  pensionAnnualIncome?: number | null;
  pensionSource?: string | null;
  ssMonthlyBenefit?: number | null;
}

async function parseGeneralDoc(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{ fields: GeneralParseOutput; success: boolean; error?: string }> {
  const supportedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const isPdf = mimeType === "application/pdf";
  const isImage = supportedImageTypes.includes(mimeType);
  if (!isPdf && !isImage) return { fields: {}, success: false, error: `Unsupported mime: ${mimeType}` };

  try {
    const res = await fetch(`${PARSE_SERVICE.url}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-parse-secret": PARSE_SERVICE.secret },
      body: JSON.stringify({ mime: mimeType, docBase64: buffer.toString("base64"), prompt: GENERAL_PROMPT }),
      signal: AbortSignal.timeout(PARSE_SERVICE.timeoutMs),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { fields: {}, success: false, error: `${fileName}: parse service ${res.status}: ${detail.slice(0, 200)}` };
    }
    // Only fields both blind passes agreed on come back in `accepted`.
    const data = (await res.json()) as { accepted?: Record<string, unknown> };
    return { fields: (data.accepted ?? {}) as GeneralParseOutput, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { fields: {}, success: false, error: `${fileName}: ${msg}` };
  }
}

/**
 * Pick the best (non-null, largest for balances) value across parsed docs.
 * For string fields, last non-empty wins.
 */
function mergeGeneral(results: GeneralParseOutput[]): GeneralParseOutput {
  const out: GeneralParseOutput = {};
  const balanceKeys: (keyof GeneralParseOutput)[] = [
    "iraTraditionalBalance",
    "iraRothBalance",
    "k401Balance",
    "k401RothBalance",
    "brokerageBalance",
    "annuityBalance",
  ];
  const numberKeys: (keyof GeneralParseOutput)[] = [
    "annualIncome",
    "pensionAnnualIncome",
    "ssMonthlyBenefit",
    ...balanceKeys,
  ];

  for (const key of numberKeys) {
    for (const r of results) {
      const v = r[key];
      if (typeof v === "number" && !Number.isNaN(v) && v > 0) {
        const prev = out[key] as number | undefined;
        if (prev === undefined || v > prev) {
          (out as Record<string, unknown>)[key] = v;
        }
      }
    }
  }

  for (const r of results) {
    if (typeof r.pensionSource === "string" && r.pensionSource.trim()) {
      out.pensionSource = r.pensionSource.trim();
    }
  }

  return out;
}

async function parseGeneral(intakeId: string): Promise<Response> {
  const documents = await listIntakeDocuments(intakeId);
  if (documents.length === 0) {
    return Response.json({ error: "No documents found on this record" }, { status: 404 });
  }

  const perDocResults: GeneralParseOutput[] = [];
  const errors: string[] = [];

  for (const doc of documents) {
    try {
      const { buffer, fileName, mimeType } = await downloadFromSalesforce(doc.contentVersionId);
      const { fields, success, error } = await parseGeneralDoc(buffer, mimeType, fileName);
      if (success) {
        perDocResults.push(fields);
      } else if (error) {
        errors.push(`${fileName}: ${error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to read ${doc.title}: ${msg}`);
    }
  }

  if (perDocResults.length === 0) {
    return Response.json(
      {
        intakeObject: "Retirement_Intake__c",
        error: "All documents failed to parse",
        errors,
      },
      { status: 422 }
    );
  }

  const merged = mergeGeneral(perDocResults);
  const extractedCount = Object.values(merged).filter((v) => v !== null && v !== undefined && v !== "").length;
  // Simple confidence: ratio of target fields that got populated.
  const confidence = Math.round((extractedCount / 10) * 100);

  // Map merged fields to Retirement_Intake__c SF fields.
  const sfFields: Record<string, unknown> = {
    Id: intakeId,
    Status__c: "AI Parsed",
    AI_Parse_Confidence__c: confidence,
    AI_Parsed_Date__c: new Date().toISOString(),
  };
  if (merged.annualIncome != null) sfFields.Annual_Income__c = merged.annualIncome;
  if (merged.iraTraditionalBalance != null) sfFields.IRA_Traditional_Balance__c = merged.iraTraditionalBalance;
  if (merged.iraRothBalance != null) sfFields.IRA_Roth_Balance__c = merged.iraRothBalance;
  if (merged.k401Balance != null) sfFields.K401_Balance__c = merged.k401Balance;
  if (merged.k401RothBalance != null) sfFields.K401_Roth_Balance__c = merged.k401RothBalance;
  if (merged.brokerageBalance != null) sfFields.Brokerage_Balance__c = merged.brokerageBalance;
  if (merged.annuityBalance != null) sfFields.Annuity_Balance__c = merged.annuityBalance;
  if (merged.pensionAnnualIncome != null) {
    sfFields.Pension_Annual_Income__c = merged.pensionAnnualIncome;
    sfFields.Has_Pension__c = true;
  }
  if (merged.pensionSource) sfFields.Pension_Source__c = merged.pensionSource;
  if (merged.ssMonthlyBenefit != null) sfFields.SS_Monthly_Benefit__c = merged.ssMonthlyBenefit;

  try {
    const conn = await getSFConnection();
    await conn.sobject("Retirement_Intake__c").update(sfFields as { Id: string } & Record<string, unknown>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Salesforce update failed: ${msg}`);
  }

  return Response.json({
    intakeObject: "Retirement_Intake__c",
    parsed: perDocResults.length,
    failed: errors.length,
    confidence,
    fieldsExtracted: extractedCount,
    merged,
    errors: errors.length > 0 ? errors : undefined,
  });
}
