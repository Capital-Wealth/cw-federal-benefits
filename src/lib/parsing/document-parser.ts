/**
 * AI Document Parser for Federal Benefits Intake
 *
 * Sends each document to the Winchester parse service (winchester-parse/) over
 * a Cloudflare tunnel. That service drives the local `claude` CLI (Opus,
 * Max-plan OAuth — no Anthropic API key, no per-token cost) and runs TWO blind
 * passes, returning only fields both agree on (`accepted`); disagreements come
 * back `flagged`. We replaced the in-process Anthropic SDK call because every
 * SDK call was throwing and the error was being swallowed — intakes came back
 * "AI Parsed" at confidence 0 with nothing populated (Gary Abeyta, FBI-0046).
 *
 * Critical for FERS high-3 accuracy: the LES prompt is structured to extract
 * EVERY retirement-creditable earnings line item, not just base pay. For
 * LEOs / Firefighters / ATC, availability pay (AUO, LEAP, standby) counts
 * toward high-3 and is up to 25% of basic pay — missing it makes the
 * computed annuity ~25% too low. See feedback_les_availability_pay_high3.md.
 */

import type { DocumentType, ParseResult, ParsedField } from "@/types";
import { PARSE_CONFIG, PARSE_SERVICE } from "@/config";

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
  "tspFundBalances": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number } (WHOLE-ACCOUNT balance in each fund — traditional and Roth COMBINED, exactly as the statement's fund-allocation/balance table prints it. This is usually all the statement gives per fund.),
  "tspTraditionalTotal": number (total of ALL traditional / pre-tax sources combined: employee traditional + agency matching + agency automatic 1% + any tax-deferred rollover),
  "tspRothTotal": number (total Roth balance, including Roth basis),
  "tspTradBalances": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number } (ONLY if the statement explicitly prints per-fund balances split by traditional source; otherwise null — do NOT guess the split),
  "tspRothBalances": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number } (ONLY if explicitly split by Roth source per fund; otherwise null),
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

Use null for any fund or field you cannot read — NEVER write 0 for a value that is simply not shown. (The system derives the per-fund traditional/Roth split from tspFundBalances + the two totals; you only need to transcribe what is printed.)`,

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
  "tspFundBalances": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number } (if a TSP statement: WHOLE-ACCOUNT balance per fund, traditional+Roth combined, as printed; null otherwise),
  "tspTraditionalTotal": number (if a TSP statement: total of all traditional/pre-tax sources — employee + match + auto 1% + tax-deferred rollover),
  "tspRothTotal": number (if a TSP statement: total Roth balance),
  "tspTradBalances": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number } (only if explicitly split per fund by traditional source; else null — never guess),
  "tspRothBalances": { "L": number, "G": number, "F": number, "C": number, "S": number, "I": number } (only if explicitly split per fund by Roth source; else null — never guess),
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

// ============================================================
// Core Parsing Function
// ============================================================

/**
 * Parse a document via the Winchester parse service (two blind passes,
 * verified). Returns a ParseResult whose `fields` are the agreed values
 * (confidence 100) and whose `warnings` carry every flagged disagreement, so
 * the advisor sees exactly what the two passes could not confirm — and a total
 * failure can never again masquerade as a clean empty parse.
 */
export async function parseDocument(
  fileBuffer: Buffer,
  fileType: string,
  documentType: DocumentType,
  fileName: string
): Promise<ParseResult> {
  const supportedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const isPdf = fileType === "application/pdf";
  const isImage = supportedImageTypes.includes(fileType);

  if (!isPdf && !isImage) {
    return {
      documentId: "",
      documentType,
      fields: [],
      overallConfidence: 0,
      warnings: [`File type ${fileType} not supported for AI parsing. Upload PDF or image.`],
    };
  }

  try {
    const res = await fetch(`${PARSE_SERVICE.url}/parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-parse-secret": PARSE_SERVICE.secret,
      },
      body: JSON.stringify({
        mime: fileType,
        docBase64: fileBuffer.toString("base64"),
        prompt: EXTRACTION_PROMPTS[documentType],
      }),
      signal: AbortSignal.timeout(PARSE_SERVICE.timeoutMs),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        documentId: "",
        documentType,
        fields: [],
        overallConfidence: 0,
        warnings: [`Parse service ${res.status} for ${fileName}: ${detail.slice(0, 200)}`],
      };
    }

    const data = (await res.json()) as {
      accepted?: Record<string, unknown>;
      flagged?: { path: string; passA: unknown; passB: unknown }[];
    };
    const accepted = data.accepted ?? {};
    const flagged = data.flagged ?? [];

    // Agreed, non-null values become the fields the merge step writes to SF.
    const fields: ParsedField[] = Object.entries(accepted)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([fieldName, value]) => ({
        fieldName,
        value: value as string | number | boolean,
        confidence: 100,
        source: fileName,
      }));

    // Every disagreement is surfaced for advisor review, never silently dropped.
    const warnings = flagged.map(
      (f) =>
        `${f.path}: passes disagree (A=${JSON.stringify(f.passA)}, B=${JSON.stringify(f.passB)}) — verify with client`
    );

    const total = fields.length + flagged.length;
    const overallConfidence = total === 0 ? 0 : Math.round((fields.length / total) * 100);

    return { documentId: "", documentType, fields, overallConfidence, warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      documentId: "",
      documentType,
      fields: [],
      overallConfidence: 0,
      warnings: [`Parse service call failed for ${fileName}: ${msg}`],
    };
  }
}

// ============================================================
// TSP traditional/Roth per-fund split
// ============================================================

const TSP_FUNDS = ["G", "F", "C", "S", "I", "L"] as const;

/**
 * TSP statements print balances per FUND (whole account) and totals per SOURCE
 * (traditional vs Roth) — but almost never the per-fund × per-source cross
 * product the calc engine needs. Derive it: assume Roth is spread across the
 * funds in the SAME proportion as the whole account, i.e. each fund is
 * roth% = rothTotal / (tradTotal + rothTotal). So if the account is 5% Roth,
 * each fund's balance is 5% Roth / 95% traditional. This reconciles exactly —
 * the per-fund traditional pieces sum back to the traditional total and the
 * Roth pieces to the Roth total. Mutates `merged` in place; runs on every parse.
 */
function deriveTspRothSplit(merged: Record<string, unknown>): void {
  const fb = merged.tspFundBalances as Record<string, number> | undefined;
  const tradTotal = Number(merged.tspTraditionalTotal);
  const rothTotal = Number(merged.tspRothTotal);
  if (!fb || !Number.isFinite(tradTotal) || !Number.isFinite(rothTotal)) return;
  const total = tradTotal + rothTotal;
  if (total <= 0) return;
  const rothFrac = rothTotal / total;

  const trad = { ...(merged.tspTradBalances as Record<string, number> | undefined ?? {}) };
  const roth = { ...(merged.tspRothBalances as Record<string, number> | undefined ?? {}) };
  for (const f of TSP_FUNDS) {
    const bal = Number(fb[f]);
    if (!Number.isFinite(bal) || bal <= 0) continue;
    const rothPart = Math.round(bal * rothFrac * 100) / 100;
    roth[f] = rothPart;
    trad[f] = Math.round((bal - rothPart) * 100) / 100;
  }
  merged.tspTradBalances = trad;
  merged.tspRothBalances = roth;
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

  // Surface per-document parse warnings/errors (e.g. "… parsing failed: …")
  // FIRST. A doc whose extraction threw returns zero fields + a warning; if we
  // drop that warning the record looks "AI Parsed" at confidence 0 with no
  // explanation — which is exactly how Gary Abeyta's intake came back empty.
  // Propagating it means a silent total failure is now visible on the record.
  const docWarnings = results.flatMap((r) =>
    (r.warnings ?? []).map((w) => `[${r.documentType}] ${w}`)
  );

  const fieldsNeedingReview: string[] = [...docWarnings, ...conflicts];
  for (const [fieldName, { confidence }] of fieldMap) {
    if (confidence < PARSE_CONFIG.confidenceThreshold) {
      fieldsNeedingReview.push(`${fieldName} (low confidence: ${confidence}%)`);
    }
  }

  // Always derive the per-fund traditional/Roth split from the statement's
  // fund totals + source totals (statements rarely print the cross product).
  deriveTspRothSplit(merged);

  return { merged, confidence: avgConfidence, fieldsNeedingReview };
}
