/**
 * AI Document Parser for Federal Benefits Intake
 *
 * Calls the Anthropic SDK directly (claude-opus-4-7) with vision so it runs
 * unchanged on Vercel serverless. PDFs go in as `document` content blocks;
 * images as `image` blocks. Requires ANTHROPIC_API_KEY in env.
 *
 * Critical for FERS high-3 accuracy: the LES prompt is structured to extract
 * EVERY retirement-creditable earnings line item, not just base pay. For
 * LEOs / Firefighters / ATC, availability pay (AUO, LEAP, standby) counts
 * toward high-3 and is up to 25% of basic pay — missing it makes the
 * computed annuity ~25% too low. See feedback_les_availability_pay_high3.md.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { DocumentType, ParseResult, ParsedField } from "@/types";
import { PARSE_CONFIG } from "@/config";

const anthropic = new Anthropic();
const PARSER_MODEL = "claude-opus-4-7";

// ============================================================
// Document-Type-Specific Extraction Prompts
// ============================================================

const EXTRACTION_PROMPTS: Record<DocumentType, string> = {
  LES: `You are analyzing a federal employee Leave and Earnings Statement (LES). Federal LESs vary by agency (USDA AD-334, DFAS, NFC, etc.) — line item codes differ but the categories are consistent.

CRITICAL: high-3 average salary for FERS retirement includes MORE than base pay. You must identify and sum every retirement-creditable earnings line. Missing availability pay on an LEO LES makes the high-3 up to 25% too low.

RETIREMENT-CREDITABLE earnings (sum these into "currentAnnualSalary"):
  - Code 01 REGULAR TIME / basic pay
  - Locality pay (when shown as a separate line; usually built into base on modern LESs)
  - Code 41 STANDBY-AUO-AVAIL / AUO (Administratively Uncontrollable Overtime, 5 USC 5545(c)(2)) — counts for LEOs
  - LEAP / Criminal Investigator Availability Pay (5 USC 5545a) — 25% of base for criminal investigators
  - Premium pay for criminal investigators
  - Night differential (for some categories)
  - Sunday pay (for some categories)
  - Hazard pay / hazardous duty pay (counts for some categories)

NOT retirement-creditable (do NOT include in currentAnnualSalary):
  - Cash awards / lump-sum performance bonuses (code 44)
  - Retention allowance / recruitment incentive (code 52)
  - Overtime (regular FLSA OT, not AUO)
  - Annual / sick leave payouts (codes 61, 66)
  - Allowances (uniform, COLA-type allowances, etc.)
  - Reimbursements

Extract these fields. Return ONLY a JSON object — no markdown, no prose. Use null for fields not present:

{
  "currentAnnualSalary": number (SUM of all retirement-creditable annual earnings — base × 26 + AUO × 26 + LEAP × 26 + etc.),
  "baseAnnualSalary": number (just base / regular time × 26, for transparency),
  "availabilityPayAnnual": number (AUO + LEAP + Availability Pay × 26 if any),
  "salaryBreakdown": [
    { "code": string, "description": string, "biweekly": number, "annual": number, "creditableForHigh3": boolean }
  ] (one entry per earnings line item you see),
  "retirementSystem": "FERS" | "CSRS" | "xFERS" (from retirement plan code: K=FERS, 1=CSRS, C/CY=CSRS Offset/xFERS),
  "employeeCategory": "None" | "Law Enforcement" | "Firefighter" | "Air Traffic Controller" (INFER from agency + line items: if you see AUO/LEAP/standby AND the agency is ICE/FBI/ATF/DEA/Secret Service/CBP/USMS/IRS-CI/USPIS/DSS → Law Enforcement; if agency is a fire department or position is firefighter → Firefighter; if agency is FAA/ATC → Air Traffic Controller; otherwise None),
  "federalAgency": string (full agency name from header — e.g. "Immigration and Customs Enforcement"),
  "gradeStep": string (e.g. "GS-14/06"),
  "lesRetirementDeduction": number (biweekly retirement deduction — line "75 03 RETIREMENT" or similar),
  "lesSsOasdi": number (biweekly OASDI/Social Security deduction),
  "lesFederalTax": number (biweekly federal tax withheld — base only, NOT including any extra additional withholding),
  "lesStateTax": number (biweekly state tax withheld),
  "lesDental": number (biweekly dental premium),
  "lesVision": number (biweekly vision premium),
  "lesFsa": number (biweekly FSA deduction),
  "lesMedicare": number (biweekly Medicare deduction),
  "lesAllotment": number (biweekly allotment total),
  "fegliBiweeklyPremium": number (biweekly FEGLI premium),
  "fehbBiweeklyPremium": number (biweekly FEHB/health insurance premium),
  "sickLeaveHoursToDate": number (cumulative sick leave hours BALANCE — usually labeled "BALANCE" in the leave section),
  "annualLeaveHoursToDate": number (cumulative annual leave BALANCE),
  "isPostalEmployee": boolean (true if agency is USPS)
}

For "salaryBreakdown", include every earnings line you see and mark each line's creditableForHigh3 based on the rules above. This breakdown is what the advisor uses to verify which line items got summed into high-3.

For "currentAnnualSalary", you MUST sum ALL line items where creditableForHigh3=true. Show your work in the breakdown.`,

  SF50: `You are analyzing a federal Standard Form 50 (SF-50) — Notification of Personnel Action.
Extract these fields exactly. Return ONLY a JSON object with these keys (use null for any field not found):

{
  "dateOfBirth": "YYYY-MM-DD" (employee date of birth, if shown),
  "serviceComputationDate": "YYYY-MM-DD" (SCD for retirement, Block 31),
  "retirementSystem": "FERS" | "CSRS" | "xFERS" (retirement plan code in Block 30),
  "employeeType": "Regular" | "Other",
  "employeeCategory": "None" | "Firefighter" | "Law Enforcement" | "Air Traffic Controller" (from position/occupation code),
  "currentAnnualSalary": number (basic pay in Block 20),
  "isPostalEmployee": boolean (true if agency is USPS, Block 21),
  "federalAgency": string (agency name from Block 21),
  "gradeStep": string (pay grade and step from Block 18/19)
}`,

  TSP_Statement: `You are analyzing a federal Thrift Savings Plan (TSP) statement.
Extract these fields exactly. Return ONLY a JSON object with these keys (use null for any field not found):

{
  "tspTradBalances": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number },
  "tspRothBalances": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number },
  "tspTradAllocations": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number } (percentages 0-100),
  "tspRothAllocations": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number } (percentages 0-100),
  "tspTradBiweeklyPct": number (traditional contribution percentage),
  "tspRothBiweeklyPct": number (Roth contribution percentage),
  "tspTradBiweeklyDollar": number (traditional biweekly dollar amount if shown),
  "tspRothBiweeklyDollar": number (Roth biweekly dollar amount if shown),
  "tspTradCatchup": number (traditional catch-up contribution if shown),
  "tspRothCatchup": number (Roth catch-up contribution if shown),
  "tspTradLFund": string (L Fund name for traditional, e.g. "L2035"),
  "tspRothLFund": string (L Fund name for Roth)
}

For fund balances, set any fund not present to 0.`,

  DD214: `You are analyzing a DD-214 (Certificate of Release or Discharge from Active Duty).
Extract these fields exactly. Return ONLY a JSON object with these keys (use null for any field not found):

{
  "militaryServiceFrom": "YYYY-MM-DD" (date entered active duty, Block 12a),
  "militaryServiceTo": "YYYY-MM-DD" (separation date, Block 12b),
  "hasDd214": true
}`,

  PSB: `You are analyzing a federal Personal Benefits Statement (also called Personal Statement of Benefits).
Extract these fields exactly. Return ONLY a JSON object with these keys (use null for any field not found):

{
  "dateOfBirth": "YYYY-MM-DD" (employee date of birth, if shown),
  "fegliBasic": boolean (has basic FEGLI coverage),
  "fegliOptionA": boolean (has Option A),
  "fegliOptionB": boolean (has Option B),
  "fegliOptionBMultiplier": "1x" | "2x" | "3x" | "4x" | "5x",
  "fegliOptionC": boolean (has Option C),
  "fegliOptionCMultiplier": "1x" | "2x" | "3x" | "4x" | "5x",
  "fegliOptionCSpouse": boolean,
  "fegliOptionCChildren": boolean,
  "fehbBiweeklyPremium": number,
  "survivorBenefitFers": "0%" | "25%" | "50%",
  "ssFersMonthlyBenefit": number (estimated SS monthly benefit at 62 if shown),
  "ssFersStartAge": number
}`,

  SS_Statement: `You are analyzing a Social Security Statement.
Extract these fields exactly. Return ONLY a JSON object with these keys (use null for any field not found):

{
  "dateOfBirth": "YYYY-MM-DD" (the date of birth printed on the Social Security statement),
  "ssFersMonthlyBenefit": number (estimated monthly benefit at age 62),
  "ssFersStartAge": 62,
  "ssCsrsMonthlyBenefit": number (same value — used for CSRS offset calc too),
  "ssCsrsStartAge": 62
}

If the statement shows benefits at multiple ages (62, 67, 70), use the age-62 figure.`,

  Other: `You are analyzing a federal employee document. The document type wasn't pre-classified, so first identify what it is (LES, SF-50, TSP statement, Social Security statement, PSB, DD-214, paystub, tax return, etc.) and then extract every field below that you can find. Return ONLY a JSON object — use null for any field not present. Do not guess.

CRITICAL if this is an LES: high-3 includes more than base pay. Sum ALL retirement-creditable lines (base + AUO + LEAP + availability + locality if separate). EXCLUDE cash awards, retention allowance, leave payouts, regular overtime, and allowances. If you see AUO/LEAP/standby line items, the employee is almost certainly LEO/Firefighter/ATC — set employeeCategory accordingly.

{
  "currentAnnualSalary": number (for LES: SUM of all retirement-creditable annual earnings; for SF-50: basic pay in Block 20; for paystub: annualized gross),
  "baseAnnualSalary": number (just base pay; helps the advisor verify),
  "availabilityPayAnnual": number (AUO + LEAP + Availability if any),
  "salaryBreakdown": [{ "code": string, "description": string, "biweekly": number, "annual": number, "creditableForHigh3": boolean }],
  "retirementSystem": "FERS" | "CSRS" | "xFERS",
  "serviceComputationDate": "YYYY-MM-DD",
  "employeeCategory": "None" | "Law Enforcement" | "Firefighter" | "Air Traffic Controller",
  "federalAgency": string,
  "gradeStep": string,
  "isPostalEmployee": boolean,
  "sickLeaveHoursToDate": number,
  "annualLeaveHoursToDate": number,
  "lesRetirementDeduction": number,
  "lesSsOasdi": number,
  "lesFederalTax": number,
  "lesStateTax": number,
  "lesDental": number,
  "lesVision": number,
  "lesFsa": number,
  "lesMedicare": number,
  "lesAllotment": number,
  "fegliBiweeklyPremium": number,
  "fehbBiweeklyPremium": number,
  "tspTradBalances": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number },
  "tspRothBalances": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number },
  "tspTradAllocations": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number },
  "tspRothAllocations": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number },
  "tspTradBiweeklyPct": number,
  "tspRothBiweeklyPct": number,
  "fegliBasic": boolean,
  "fegliOptionA": boolean,
  "fegliOptionB": boolean,
  "fegliOptionBMultiplier": "1x" | "2x" | "3x" | "4x" | "5x",
  "fegliOptionC": boolean,
  "fegliOptionCMultiplier": "1x" | "2x" | "3x" | "4x" | "5x",
  "ssFersMonthlyBenefit": number (estimated monthly SS benefit at FRA — typically age 67),
  "ssFersStartAge": number,
  "militaryServiceFrom": "YYYY-MM-DD",
  "militaryServiceTo": "YYYY-MM-DD",
  "hasDd214": boolean,
  "detectedDocumentType": "LES" | "SF50" | "TSP_Statement" | "DD214" | "PSB" | "SocialSecurity" | "Paystub" | "TaxReturn" | "Other"
}

Only return fields you can read directly. Omit (use null) anything unclear.`,
};

const PARSE_SUFFIX = `

IMPORTANT:
- Return ONLY valid JSON, no markdown fencing, no explanation.
- For currency values, return numbers only (no $ signs or commas).
- For dates, use YYYY-MM-DD format.
- For percentages stored as decimals in the document, convert to the expected format.
- If a field is partially visible or unclear, include it but note low confidence.

After the JSON object, on a new line, output a confidence assessment as:
CONFIDENCE: <number 0-100>
WARNINGS: <comma-separated list of any issues, or "none">`;

// ============================================================
// Core Parsing Function
// ============================================================

/**
 * Parse a document using the Claude CLI (routes through Max plan OAuth).
 *
 * Saves the file to a temp path, passes it to `claude -p` which uses
 * Claude's vision to read the document and extract fields.
 */
export async function parseDocument(
  fileBuffer: Buffer,
  fileType: string,
  documentType: DocumentType,
  fileName: string
): Promise<ParseResult> {
  const supportedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  type SupportedImageType = typeof supportedImageTypes[number];

  const isPdf = fileType === "application/pdf";
  const isImage = (supportedImageTypes as readonly string[]).includes(fileType);

  if (!isPdf && !isImage) {
    return {
      documentId: "",
      documentType,
      fields: [],
      overallConfidence: 0,
      warnings: [`File type ${fileType} not supported for AI parsing. Upload PDF or image.`],
    };
  }

  const prompt = EXTRACTION_PROMPTS[documentType] + PARSE_SUFFIX;
  const docBlock = isPdf
    ? {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: fileBuffer.toString("base64"),
        },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: fileType as SupportedImageType,
          data: fileBuffer.toString("base64"),
        },
      };

  try {
    const response = await anthropic.messages.create(
      {
        model: PARSER_MODEL,
        max_tokens: 8192,
        messages: [{
          role: "user",
          content: [
            docBlock,
            { type: "text", text: `Analyze this ${documentType} document and extract the requested fields.\n\n${prompt}` },
          ],
        }],
      },
      { timeout: PARSE_CONFIG.timeoutMs },
    );

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      return {
        documentId: "",
        documentType,
        fields: [],
        overallConfidence: 0,
        warnings: [`No text response from Claude for ${fileName}`],
      };
    }
    return parseAIResponse(textBlock.text, documentType, fileName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      documentId: "",
      documentType,
      fields: [],
      overallConfidence: 0,
      warnings: [`Anthropic SDK parsing failed for ${fileName}: ${msg}`],
    };
  }
}

// ============================================================
// Response Parser
// ============================================================

/**
 * Parse the AI's raw text response into structured ParseResult.
 */
function parseAIResponse(
  rawText: string,
  documentType: DocumentType,
  fileName: string
): ParseResult {
  const warnings: string[] = [];
  let overallConfidence = 0;

  // Extract JSON — handle potential markdown fencing
  let jsonStr = rawText;
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  // Extract confidence line
  const confidenceMatch = rawText.match(/CONFIDENCE:\s*(\d+)/);
  if (confidenceMatch) {
    overallConfidence = parseInt(confidenceMatch[1]);
  }

  // Extract warnings line
  const warningsMatch = rawText.match(/WARNINGS:\s*(.+)/);
  if (warningsMatch && warningsMatch[1].toLowerCase() !== "none") {
    warnings.push(...warningsMatch[1].split(",").map((w) => w.trim()));
  }

  // Parse the JSON
  let parsedData: Record<string, unknown>;
  try {
    parsedData = JSON.parse(jsonStr);
  } catch {
    return {
      documentId: "",
      documentType,
      fields: [],
      overallConfidence: 0,
      warnings: [`Failed to parse AI response as JSON from ${fileName}`],
    };
  }

  // Convert to ParsedField array
  const fields: ParsedField[] = [];

  function flattenFields(
    obj: Record<string, unknown>,
    prefix: string = ""
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      const fieldName = prefix ? `${prefix}.${key}` : key;

      if (typeof value === "object" && !Array.isArray(value)) {
        flattenFields(value as Record<string, unknown>, key);
      } else {
        fields.push({
          fieldName,
          value: value as string | number | boolean,
          confidence: overallConfidence,
          source: fileName,
        });
      }
    }
  }

  flattenFields(parsedData);

  return {
    documentId: "",
    documentType,
    fields,
    overallConfidence,
    warnings,
  };
}

// ============================================================
// Multi-Document Merge
// ============================================================

/**
 * Merge parsed fields from multiple documents into a single intake update.
 * Higher confidence wins when there's a conflict.
 */
export function mergeParseResults(
  results: ParseResult[]
): { merged: Record<string, unknown>; confidence: number; fieldsNeedingReview: string[] } {
  const fieldMap = new Map<string, { value: unknown; confidence: number; source: string }>();
  const conflicts: string[] = [];

  for (const result of results) {
    for (const field of result.fields) {
      const existing = fieldMap.get(field.fieldName);

      if (!existing) {
        fieldMap.set(field.fieldName, {
          value: field.value,
          confidence: field.confidence,
          source: field.source,
        });
      } else if (existing.value !== field.value) {
        if (field.confidence > existing.confidence) {
          fieldMap.set(field.fieldName, {
            value: field.value,
            confidence: field.confidence,
            source: field.source,
          });
        }
        conflicts.push(
          `${field.fieldName}: "${existing.value}" (${existing.source}) vs "${field.value}" (${field.source})`
        );
      }
    }
  }

  // Build the merged object, handling nested fields (e.g., "tspTradBalances.G")
  const merged: Record<string, unknown> = {};
  for (const [fieldName, { value }] of fieldMap) {
    if (fieldName.includes(".")) {
      const [parent, child] = fieldName.split(".");
      if (!merged[parent]) merged[parent] = {};
      (merged[parent] as Record<string, unknown>)[child] = value;
    } else {
      merged[fieldName] = value;
    }
  }

  const avgConfidence =
    results.length > 0
      ? Math.round(
          results.reduce((sum, r) => sum + r.overallConfidence, 0) / results.length
        )
      : 0;

  const fieldsNeedingReview: string[] = [...conflicts];
  for (const [fieldName, { confidence }] of fieldMap) {
    if (confidence < PARSE_CONFIG.confidenceThreshold) {
      fieldsNeedingReview.push(`${fieldName} (low confidence: ${confidence}%)`);
    }
  }

  return { merged, confidence: avgConfidence, fieldsNeedingReview };
}
