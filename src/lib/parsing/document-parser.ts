/**
 * AI Document Parser for Federal Benefits Intake
 *
 * Uses the Claude CLI (`claude -p`) to parse documents through the user's
 * existing Max plan OAuth — no separate API key needed.
 *
 * For images/PDFs: saves to a temp file, passes the path to Claude CLI.
 * Claude's vision reads the document and extracts structured field data.
 */

import { execSync } from "child_process";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { DocumentType, ParseResult, ParsedField } from "@/types";
import { PARSE_CONFIG } from "@/config";

// ============================================================
// Document-Type-Specific Extraction Prompts
// ============================================================

const EXTRACTION_PROMPTS: Record<DocumentType, string> = {
  LES: `You are analyzing a federal employee Leave and Earnings Statement (LES).
Extract these fields exactly. Return ONLY a JSON object with these keys (use null for any field not found):

{
  "currentAnnualSalary": number (annual base pay — multiply biweekly gross by 26 if needed),
  "retirementSystem": "FERS" | "CSRS" | "xFERS" (from retirement plan code: K=FERS, 1=CSRS, C/CY=CSRS Offset/xFERS),
  "lesRetirementDeduction": number (biweekly retirement deduction),
  "lesSsOasdi": number (biweekly OASDI/Social Security deduction),
  "lesFederalTax": number (biweekly federal tax withheld),
  "lesStateTax": number (biweekly state tax withheld),
  "lesDental": number (biweekly dental premium),
  "lesVision": number (biweekly vision premium),
  "lesFsa": number (biweekly FSA deduction),
  "lesMedicare": number (biweekly Medicare deduction),
  "lesAllotment": number (biweekly allotment total),
  "lesOther1": number (any other biweekly deduction 1),
  "lesOther2": number (any other biweekly deduction 2),
  "fegliBiweeklyPremium": number (biweekly FEGLI premium),
  "fehbBiweeklyPremium": number (biweekly FEHB/health insurance premium),
  "sickLeaveHoursToDate": number (cumulative sick leave hours balance),
  "isPostalEmployee": boolean (true if agency is USPS)
}`,

  SF50: `You are analyzing a federal Standard Form 50 (SF-50) — Notification of Personnel Action.
Extract these fields exactly. Return ONLY a JSON object with these keys (use null for any field not found):

{
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
  "ssFersMonthlyBenefit": number (estimated monthly benefit at age 62),
  "ssFersStartAge": 62,
  "ssCsrsMonthlyBenefit": number (same value — used for CSRS offset calc too),
  "ssCsrsStartAge": 62
}

If the statement shows benefits at multiple ages (62, 67, 70), use the age-62 figure.`,

  Other: `You are analyzing a federal employee document related to retirement benefits.
Extract any relevant fields you can identify. Return ONLY a JSON object with field names matching the federal benefits intake form (camelCase). Use null for fields you cannot determine. Common fields include salary, service dates, retirement system, TSP balances, insurance coverage, and Social Security estimates.`,
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
  // Determine file extension
  const extMap: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/tiff": ".tiff",
  };
  const ext = extMap[fileType];
  if (!ext) {
    return {
      documentId: "",
      documentType,
      fields: [],
      overallConfidence: 0,
      warnings: [`File type ${fileType} not supported for AI parsing. Upload PDF or image.`],
    };
  }

  // Write to temp file
  const tempDir = join(tmpdir(), "cw-federal-parse");
  mkdirSync(tempDir, { recursive: true });
  const tempPath = join(tempDir, `parse-${Date.now()}${ext}`);

  try {
    writeFileSync(tempPath, fileBuffer);

    const prompt = EXTRACTION_PROMPTS[documentType] + PARSE_SUFFIX;

    // Call Claude CLI with the file — uses existing Max plan OAuth
    // claude -p reads from stdin, and can also read files passed as arguments
    const rawText = execSync(
      `cat "${tempPath}" | claude -p "Analyze this ${documentType} document. ${prompt.replace(/"/g, '\\"')}"`,
      {
        encoding: "utf-8",
        timeout: PARSE_CONFIG.timeoutMs,
        maxBuffer: PARSE_CONFIG.maxBufferBytes,
        env: { ...process.env, LANG: "en_US.UTF-8" },
      }
    ).trim();

    return parseAIResponse(rawText, documentType, fileName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      documentId: "",
      documentType,
      fields: [],
      overallConfidence: 0,
      warnings: [`Claude CLI parsing failed for ${fileName}: ${msg}`],
    };
  } finally {
    // Clean up temp file
    try { unlinkSync(tempPath); } catch { /* ignore */ }
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
