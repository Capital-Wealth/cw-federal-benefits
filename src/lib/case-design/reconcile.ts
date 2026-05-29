/**
 * Money-Map Data Confidence / Source Reconciliation engine.
 *
 * GOAL: guarantee that every number on a client-facing money map traces back to
 * a parsed source. We aggregate ALL household data sources, extract structured
 * figures (LLM for the unstructured ones), reconcile them against the money-map
 * positions, and surface conflicts / gaps so the advisor can resolve them
 * before Finalize / Present.
 *
 * Five sources (see aggregateSources):
 *   1. Zoom notes        — Meeting_Notes__c rich text   → UNSTRUCTURED, LLM-extract
 *   2. Uploaded docs     — ContentDocumentLink PDFs       → UNSTRUCTURED, vision-extract
 *   3. Meeting 1 Intake  — Meeting_1_Intake_Asset__c       → STRUCTURED
 *   4. Vault             — Retirement/Federal_Benefits_Intake__c → STRUCTURED
 *   5. Current positions — existing Case_Design_Position__c (the map itself)
 *
 * No hardcoded household data. The only domain constants are a documented
 * custodian-alias map and the documented reconciliation tolerance / parse
 * threshold (see CONSTANTS below) — nothing else.
 *
 * The Anthropic vision path mirrors src/lib/parsing/document-parser.ts exactly
 * (same SDK client construction, same PARSER_MODEL string, same document/image
 * content blocks). The model constant is re-declared here with the same value
 * — we do NOT introduce a different model.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getSFConnection } from "@/lib/salesforce/connector";
import { downloadFromSalesforce } from "@/lib/salesforce/files";
import {
  loadCaseDesign,
  loadHouseholdDocs,
  type HouseholdDocument,
} from "./sf-client";
import { accountTypeBucket } from "./auto-layout";
import type { CaseDesignPosition, AccountType } from "./types";

// ============================================================
// Anthropic client (mirrors document-parser.ts)
// ============================================================

const anthropic = new Anthropic();
/** Same value as document-parser.ts PARSER_MODEL — do NOT diverge the model. */
const PARSER_MODEL = "claude-opus-4-7";

// ============================================================
// Documented constants (the ONLY magic numbers in this module)
// ============================================================

const CONSTANTS = {
  /**
   * Two figures "agree" when their absolute dollar difference is within the
   * larger of $1 or 0.5% of the bigger figure. This absorbs rounding /
   * as-of-date drift without masking a real discrepancy.
   */
  toleranceAbs: 1,
  tolerancePct: 0.005,
  /**
   * A parsed document (vision) is only trusted as a real source when its
   * confidence is at or above this threshold (0-100). Below it, the document
   * is reported as `Unparsed` so the advisor knows it wasn't reconciled.
   */
  parseConfidenceThreshold: 60,
  /** Structured sources carry full confidence unless an AI_Parse_Confidence overrides it. */
  structuredConfidence: 100,
  /** Notes-extracted figures default low until the LLM raises them per-figure. */
  notesDefaultConfidence: 55,
} as const;

/**
 * Custodian aliases — normalize the many ways the same carrier is written so
 * an Edward Jones intake figure matches an "E.J." note. Keys/values are
 * lowercased; the canonical value is what we compare on. Documented + small on
 * purpose — extend here, never inline.
 */
const CUSTODIAN_ALIASES: Record<string, string> = {
  "e.j.": "edward jones",
  "ej": "edward jones",
  "edward jones": "edward jones",
  "schwab": "charles schwab",
  "charles schwab": "charles schwab",
  "chas schwab": "charles schwab",
  "vanguard": "vanguard",
  "fido": "fidelity",
  "fidelity": "fidelity",
  "tca": "tca",
  "trust company of america": "tca",
};

// ============================================================
// Public types
// ============================================================

export type SourceType =
  | "Zoom Notes"
  | "Uploaded Statement"
  | "Meeting 1 Intake"
  | "Vault"
  | "Discovery Form"
  | "Manual";

export interface SourceFigure {
  owner: string | null;
  custodian: string | null;
  accountType: string | null;
  balance: number | null;
  asOfText: string | null;
  /** 0-100. */
  confidence: number;
  sourceType: SourceType;
  sourceRecordId: string | null;
  sourceDocumentName: string | null;
  /** Verbatim quote the figure was extracted from (notes/statements); null for structured rows. */
  verbatimQuote: string | null;
}

export type FindingType =
  | "Match"
  | "Conflict"
  | "Unsupported"
  | "Missing"
  | "Unparsed";

export interface ReconciliationFinding {
  type: FindingType;
  /** Set for Match / Conflict / Unsupported (which position the finding is about). */
  positionId?: string;
  /** Normalized account key (owner|custodian|bucket). */
  accountKey: string;
  /** The map's value for this position (Conflict / Unsupported / Match). */
  mapValue?: number | null;
  /** Every source figure that maps to this account key. */
  sourceValues: SourceFigure[];
  /** Human-readable, advisor-actionable message. */
  message: string;
}

export interface ReconciliationReport {
  generatedAt: string;
  /** 0-100, dollar-weighted coverage of SOURCE positions. */
  coveragePct: number;
  hasUnresolvedConflicts: boolean;
  figures: SourceFigure[];
  findings: ReconciliationFinding[];
  unparsedDocuments: { id: string; title: string }[];
}

// ============================================================
// Normalization
// ============================================================

function normalizeCustodian(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s,]+/g, " ");
  if (!s || s === "—" || s === "-") return "";
  return CUSTODIAN_ALIASES[s] ?? s;
}

/**
 * Common nickname → formal first-name pairs, so an intake that says "Joe"
 * reconciles against a position owned by "Joseph". Documented + small on
 * purpose (same philosophy as CUSTODIAN_ALIASES) — extend here, never inline.
 * Keys/values lowercased; both directions collapse to the formal value.
 */
const OWNER_NICKNAMES: Record<string, string> = {
  joe: "joseph",
  joey: "joseph",
  bob: "robert",
  rob: "robert",
  bill: "william",
  will: "william",
  liz: "elizabeth",
  beth: "elizabeth",
  becca: "rebecca",
  becky: "rebecca",
  mike: "michael",
  jim: "james",
  jimmy: "james",
  tom: "thomas",
  dave: "david",
  dan: "daniel",
  chris: "christopher",
  steve: "steven",
  rick: "richard",
  rich: "richard",
  kate: "katherine",
  katie: "katherine",
};

/**
 * First-name token, lowercased, nickname-collapsed. "Joseph Giebel" → "joseph",
 * "Joe" → "joseph". "Joint"/"Trust" pass through whole.
 */
function normalizeOwner(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "";
  const first = s.split(/\s+/)[0];
  return OWNER_NICKNAMES[first] ?? first;
}

/**
 * Bucket an account-type label. Structured rows give us a real AccountType;
 * free-text notes give arbitrary strings — map the common ones, else fall back
 * to the raw lowercased label so at least exact-string matches still group.
 */
function bucketForLabel(label: string | null | undefined): string {
  const s = (label ?? "").trim();
  if (!s) return "unknown";
  // Try the strict AccountType bucketer first (covers the SF picklist values).
  const known = accountTypeBucket(s as AccountType);
  // accountTypeBucket returns "Other" for unrecognized — only trust it when the
  // label is actually a recognized picklist token, otherwise keep raw text.
  if (known !== "Other") return known.toLowerCase();
  const lc = s.toLowerCase();
  if (/roth/.test(lc)) return "roth";
  if (/\b(401|403|ira|tsp|sep|simple|retirement|pension)\b/.test(lc)) return "retirement";
  if (/\b(nq|brokerage|taxable|non-?qualified)\b/.test(lc)) return "non-qualified";
  if (/\b(annuity|fia|fixed indexed|variable)\b/.test(lc)) return "annuities";
  if (/\b(life|iul|whole life)\b/.test(lc)) return "life insurance";
  if (/\b(cash|savings|hsa|bank)\b/.test(lc)) return "cash & equivalents";
  return lc;
}

/** owner|custodian|bucket — the join key for reconciliation. */
export function accountKey(
  owner: string | null | undefined,
  custodian: string | null | undefined,
  accountTypeLabel: string | null | undefined,
): string {
  return [
    normalizeOwner(owner),
    normalizeCustodian(custodian),
    bucketForLabel(accountTypeLabel),
  ].join("|");
}

function withinTolerance(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  const tol = Math.max(CONSTANTS.toleranceAbs, CONSTANTS.tolerancePct * Math.max(Math.abs(a), Math.abs(b)));
  return diff <= tol;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ============================================================
// Aggregation
// ============================================================

const safeIdRe = /^[A-Za-z0-9]{15,18}$/;
function safeId(id: string): string {
  if (!safeIdRe.test(id)) throw new Error(`Invalid Salesforce Id: ${JSON.stringify(id)}`);
  return id;
}

interface RawNote {
  recordId: string;
  type: string | null;
  text: string;
}

export interface AggregatedSources {
  /** STRUCTURED figures, already mapped (Meeting 1 Intake + Vault). */
  structuredFigures: SourceFigure[];
  /** Position figures (the money map itself), as SourceFigure for completeness. */
  positions: CaseDesignPosition[];
  /** Unstructured note blobs for the LLM notes-extractor. */
  notes: RawNote[];
  /** Household documents (PDFs/images) for vision extraction. */
  documents: HouseholdDocument[];
  /** Resolved household account id (for diagnostics). */
  accountId: string | null;
}

/**
 * Query all five sources for the Case Design's household. Structured sources
 * (Meeting 1 Intake, Vault) are mapped to SourceFigure here; the unstructured
 * ones (notes, documents) are returned raw for the extractors.
 */
export async function aggregateSources(caseDesignId: string): Promise<AggregatedSources> {
  const conn = await getSFConnection();
  const cdId = safeId(caseDesignId);

  // Resolve the household account + the person accounts beneath it.
  const cd = await conn.query<{ Account__c: string | null; Opportunity__c: string | null }>(
    `SELECT Account__c, Opportunity__c FROM Case_Design__c WHERE Id = '${cdId}' LIMIT 1`,
  );
  let accountId: string | null = cd.records[0]?.Account__c ?? null;
  if (!accountId && cd.records[0]?.Opportunity__c) {
    const opp = await conn.query<{ AccountId: string }>(
      `SELECT AccountId FROM Opportunity WHERE Id = '${safeId(cd.records[0].Opportunity__c)}' LIMIT 1`,
    );
    accountId = opp.records[0]?.AccountId ?? null;
  }

  const structuredFigures: SourceFigure[] = [];
  const notes: RawNote[] = [];

  // Existing positions on the map.
  const bundle = await loadCaseDesign(cdId);
  const positions = bundle?.positions ?? [];

  // Household documents (PDFs/images linked to Account + Household).
  const documents = await loadHouseholdDocs(cdId);

  if (accountId) {
    const acctId = safeId(accountId);
    // All accounts under the household (covers spouse / joint person accounts).
    const accountIdsRes = await conn.query<{ Id: string }>(
      `SELECT Id FROM Account WHERE Id = '${acctId}' OR Household__c = '${acctId}'`,
    );
    const accountIds = Array.from(new Set([accountId, ...accountIdsRes.records.map((r) => r.Id)]));
    const acctInClause = accountIds.map((id) => `'${safeId(id)}'`).join(",");

    // --- 3) Meeting 1 Intake (STRUCTURED) ---
    const intakes = await conn.query<{ Id: string }>(
      `SELECT Id FROM Meeting_1_Intake__c WHERE Account__c IN (${acctInClause})`,
    );
    if (intakes.records.length > 0) {
      const intakeIn = intakes.records.map((r) => `'${r.Id}'`).join(",");
      const assets = await conn.query<{
        Id: string;
        Asset_Owner__c: string | null;
        Company__c: string | null;
        Tax_Status__c: string | null;
        Balance__c: number | null;
        Death_Benefit__c: number | null;
        Category__c: string | null;
      }>(
        `SELECT Id, Asset_Owner__c, Company__c, Tax_Status__c, Balance__c, Death_Benefit__c, Category__c
         FROM Meeting_1_Intake_Asset__c WHERE Meeting_1_Intake__c IN (${intakeIn})`,
      );
      for (const a of assets.records) {
        if (a.Balance__c == null && a.Death_Benefit__c == null) continue;
        structuredFigures.push({
          owner: a.Asset_Owner__c,
          custodian: a.Company__c,
          accountType: a.Tax_Status__c || a.Category__c,
          balance: a.Balance__c ?? a.Death_Benefit__c ?? null,
          asOfText: null,
          confidence: CONSTANTS.structuredConfidence,
          sourceType: "Meeting 1 Intake",
          sourceRecordId: a.Id,
          sourceDocumentName: "Meeting 1 Intake",
          verbatimQuote: null,
        });
      }
    }

    // --- 1) Zoom notes (UNSTRUCTURED) ---
    const meetings = await conn.query<{ Id: string }>(
      `SELECT Id FROM Meeting__c WHERE Account__c IN (${acctInClause})`,
    );
    if (meetings.records.length > 0) {
      const meetingIn = meetings.records.map((r) => `'${r.Id}'`).join(",");
      // Notes__c is a rich-text (long text) field — SOQL cannot filter on it
      // ("field 'Notes__c' can not be filtered in a query call"), so we fetch
      // all notes for the household's meetings and drop empty ones in JS below.
      const noteRows = await conn.query<{ Id: string; Type__c: string | null; Notes__c: string | null }>(
        `SELECT Id, Type__c, Notes__c FROM Meeting_Notes__c
         WHERE Meeting__c IN (${meetingIn})`,
      );
      for (const n of noteRows.records) {
        const text = stripHtml(n.Notes__c ?? "");
        if (text.length < 8) continue;
        notes.push({ recordId: n.Id, type: n.Type__c, text });
      }
    }

    // --- 4) Vault (STRUCTURED) — mirror generate-from-vault household resolution ---
    const personRows = await conn.query<{ PersonContactId: string | null }>(
      `SELECT PersonContactId FROM Account
       WHERE (Id = '${acctId}' OR Household__c = '${acctId}') AND IsPersonAccount = true`,
    );
    const contactIds = personRows.records
      .map((r) => r.PersonContactId)
      .filter((x): x is string => !!x);
    if (contactIds.length > 0) {
      structuredFigures.push(...(await loadVaultFigures(conn, contactIds)));
    }
  }

  return { structuredFigures, positions, notes, documents, accountId };
}

/**
 * Pull Vault retirement/federal intakes for the household's contacts and emit
 * one SourceFigure per balance-bearing field. We read a conservative,
 * well-known field set (balances + custodian-ish labels) so a missing field
 * never empties the whole query (mirrors generate-from-vault's safe approach).
 */
async function loadVaultFigures(
  conn: Awaited<ReturnType<typeof getSFConnection>>,
  contactIds: string[],
): Promise<SourceFigure[]> {
  const inClause = contactIds.map((id) => `'${safeId(id)}'`).join(",");
  const out: SourceFigure[] = [];

  // Aggregate TSP balances (the dominant federal balance) + IRA/other rollover
  // fields when present. Fields chosen to exist on Federal_Benefits_Intake__c.
  const tspFields = [
    "TSP_Trad_G_Balance__c", "TSP_Trad_C_Balance__c", "TSP_Trad_S_Balance__c",
    "TSP_Trad_I_Balance__c", "TSP_Trad_F_Balance__c", "TSP_Trad_L_Balance__c",
    "TSP_Roth_G_Balance__c", "TSP_Roth_C_Balance__c", "TSP_Roth_S_Balance__c",
    "TSP_Roth_I_Balance__c", "TSP_Roth_F_Balance__c", "TSP_Roth_L_Balance__c",
  ];
  async function safeQuery<T extends Record<string, unknown>>(soql: string): Promise<T[]> {
    try {
      const r = await conn.query<T>(soql);
      return r.records;
    } catch {
      return [];
    }
  }

  const fedRows = await safeQuery<Record<string, unknown>>(
    `SELECT Id, Contact__c, AI_Parse_Confidence__c, ${tspFields.join(", ")}
     FROM Federal_Benefits_Intake__c WHERE Contact__c IN (${inClause})
     ORDER BY AI_Parsed_Date__c DESC NULLS LAST`,
  );
  // One Vault row per contact (latest); sum traditional + roth into two figures.
  const seenContact = new Set<string>();
  for (const row of fedRows) {
    const contact = String(row.Contact__c ?? "");
    if (seenContact.has(contact)) continue;
    seenContact.add(contact);
    const conf = typeof row.AI_Parse_Confidence__c === "number"
      ? Math.round(row.AI_Parse_Confidence__c * 100)
      : CONSTANTS.structuredConfidence;
    const sumOf = (fields: string[]) =>
      fields.reduce((s, f) => s + (typeof row[f] === "number" ? (row[f] as number) : 0), 0);
    const trad = sumOf(tspFields.filter((f) => f.includes("Trad")));
    const roth = sumOf(tspFields.filter((f) => f.includes("Roth")));
    if (trad > 0) {
      out.push({
        owner: null, custodian: "TSP", accountType: "TSP", balance: trad, asOfText: null,
        confidence: conf, sourceType: "Vault", sourceRecordId: String(row.Id), sourceDocumentName: "Federal Vault Intake", verbatimQuote: null,
      });
    }
    if (roth > 0) {
      out.push({
        owner: null, custodian: "TSP", accountType: "Roth TSP", balance: roth, asOfText: null,
        confidence: conf, sourceType: "Vault", sourceRecordId: String(row.Id), sourceDocumentName: "Federal Vault Intake", verbatimQuote: null,
      });
    }
  }
  return out;
}

// ============================================================
// LLM extraction — notes (unstructured text)
// ============================================================

const NOTES_PROMPT = `You are reconciling a financial advisor's meeting notes against a money map. Extract EVERY account balance mentioned in the notes below.

Return ONLY a JSON array (no markdown, no prose). One object per distinct account balance:
[
  {
    "owner": string | null,        // whose account (first name if given, "Joint", "Trust", else null)
    "custodian": string | null,    // institution / carrier (e.g. "Vanguard", "Edward Jones", "Schwab")
    "accountType": string | null,  // e.g. "401k", "Roth IRA", "NQ Brokerage", "annuity"
    "balance": number | null,      // the dollar amount as a plain number, no $ or commas
    "asOfText": string | null,     // any date/recency phrasing tied to the balance
    "verbatimQuote": string,       // the exact sentence/fragment the balance came from
    "confidence": number           // 0-100, your confidence this is a real stated account balance
  }
]

RULES:
- Use null for any field you cannot determine. DO NOT INVENT numbers, owners, or custodians.
- Only extract balances that are explicitly stated. Do not estimate, sum, or infer.
- If no account balances are mentioned, return [].
- A figure that is clearly a projection, fee, premium, or income (not an account balance) should be skipped.`;

interface RawFigureJson {
  owner?: string | null;
  custodian?: string | null;
  accountType?: string | null;
  balance?: number | string | null;
  asOfText?: string | null;
  verbatimQuote?: string | null;
  confidence?: number | null;
}

function coerceFigures(parsed: unknown, fallback: Partial<SourceFigure>): SourceFigure[] {
  if (!Array.isArray(parsed)) return [];
  const out: SourceFigure[] = [];
  for (const item of parsed as RawFigureJson[]) {
    if (!item || typeof item !== "object") continue;
    const balanceRaw = item.balance;
    const balance =
      typeof balanceRaw === "number"
        ? balanceRaw
        : typeof balanceRaw === "string" && balanceRaw.trim() !== ""
          ? Number(balanceRaw.replace(/[$,\s]/g, ""))
          : null;
    if (balance == null || Number.isNaN(balance)) continue;
    const conf = typeof item.confidence === "number" ? clamp(item.confidence, 0, 100) : (fallback.confidence ?? CONSTANTS.notesDefaultConfidence);
    out.push({
      owner: item.owner ?? null,
      custodian: item.custodian ?? null,
      accountType: item.accountType ?? null,
      balance,
      asOfText: item.asOfText ?? null,
      confidence: conf,
      sourceType: fallback.sourceType ?? "Zoom Notes",
      sourceRecordId: fallback.sourceRecordId ?? null,
      sourceDocumentName: fallback.sourceDocumentName ?? null,
      verbatimQuote: typeof item.verbatimQuote === "string" ? item.verbatimQuote : null,
    });
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Pull the first JSON array out of an LLM text response (tolerates code fences). */
function extractJsonArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
}

export async function extractFromNotes(
  notesText: string,
  meta: { sourceRecordId: string | null; sourceDocumentName: string | null; sourceType?: SourceType } = {
    sourceRecordId: null,
    sourceDocumentName: null,
  },
): Promise<SourceFigure[]> {
  if (!notesText || notesText.trim().length < 8) return [];
  try {
    const res = await anthropic.messages.create({
      model: PARSER_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${NOTES_PROMPT}\n\n--- NOTES ---\n${notesText.slice(0, 60_000)}` }],
        },
      ],
    });
    const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) return [];
    return coerceFigures(extractJsonArray(textBlock.text), {
      sourceType: meta.sourceType ?? "Zoom Notes",
      sourceRecordId: meta.sourceRecordId,
      sourceDocumentName: meta.sourceDocumentName,
      confidence: CONSTANTS.notesDefaultConfidence,
    });
  } catch {
    return [];
  }
}

// ============================================================
// LLM extraction — statements (vision, mirrors parseDocument path)
// ============================================================

const STATEMENT_PROMPT = `You are analyzing a brokerage or retirement account statement. Extract EVERY account and its balance shown.

Return ONLY a JSON array (no markdown, no prose). One object per account:
[
  {
    "owner": string | null,        // account registration / owner name
    "custodian": string | null,    // institution (e.g. "Vanguard", "Fidelity", "Edward Jones")
    "accountType": string | null,  // tax type / account type (e.g. "Traditional IRA", "Roth IRA", "401(k)", "Individual / NQ brokerage")
    "balance": number | null,      // ending / current total account value as a plain number
    "asOfText": string | null,     // statement period / as-of date
    "verbatimQuote": string,       // the label + value text you read it from
    "confidence": number           // 0-100, your confidence in this account+balance reading
  }
]

RULES:
- Use null for unknowns. DO NOT INVENT numbers. Only report values printed on the statement.
- Report the total/ending value per account, not individual holdings or transactions.
- If this is not an account statement (no balances), return [].`;

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export async function extractFromStatement(file: {
  buffer: Buffer;
  mimeType: string;
  documentName: string;
  sourceRecordId: string | null;
}): Promise<SourceFigure[]> {
  const isPdf = file.mimeType === "application/pdf";
  const isImage = (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.mimeType);
  if (!isPdf && !isImage) return [];

  // Same document/image content-block construction as document-parser.ts.
  const docBlock = isPdf
    ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: file.buffer.toString("base64") },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: file.mimeType as (typeof SUPPORTED_IMAGE_TYPES)[number],
          data: file.buffer.toString("base64"),
        },
      };
  try {
    const res = await anthropic.messages.create({
      model: PARSER_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [docBlock, { type: "text", text: STATEMENT_PROMPT }],
        },
      ],
    });
    const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) return [];
    return coerceFigures(extractJsonArray(textBlock.text), {
      sourceType: "Uploaded Statement",
      sourceRecordId: file.sourceRecordId,
      sourceDocumentName: file.documentName,
      confidence: CONSTANTS.parseConfidenceThreshold,
    });
  } catch {
    return [];
  }
}

// ============================================================
// Reconciliation
// ============================================================

/** Best dollar value for a position: explicit Amount wins, else Account Value. */
function positionDollar(p: CaseDesignPosition): number {
  return p.Amount__c ?? p.Account_Value__c ?? 0;
}

/**
 * Reconcile money-map positions against the aggregated source figures.
 *
 * For each SOURCE-role position:
 *   - figures matching its accountKey agree within tolerance  → Match
 *   - figures disagree                                        → Conflict
 *   - no matching figure                                      → Unsupported
 * Figures matching no position                                → Missing
 * Documents discovered but not parsed / below threshold       → Unparsed
 */
export function reconcile(
  positions: CaseDesignPosition[],
  figures: SourceFigure[],
  unparsedDocs: { id: string; title: string }[],
): ReconciliationReport {
  const sourcePositions = positions.filter((p) => p.Role__c === "Source");

  // Index figures by accountKey. Below-threshold parsed figures are dropped from
  // matching (their documents already surface as Unparsed).
  const usableFigures = figures.filter((f) => f.balance != null);
  const figuresByKey = new Map<string, SourceFigure[]>();
  for (const f of usableFigures) {
    const key = accountKey(f.owner, f.custodian, f.accountType);
    const arr = figuresByKey.get(key) ?? [];
    arr.push(f);
    figuresByKey.set(key, arr);
  }

  const findings: ReconciliationFinding[] = [];
  const matchedFigureKeys = new Set<string>();
  let matchedDollars = 0;
  let totalSourceDollars = 0;

  for (const pos of sourcePositions) {
    const key = accountKey(pos.Owner_Label__c, pos.Custodian__c, pos.Account_Type__c);
    const mapValue = positionDollar(pos);
    totalSourceDollars += mapValue;
    const matches = figuresByKey.get(key) ?? [];

    if (matches.length === 0) {
      findings.push({
        type: "Unsupported",
        positionId: pos.Id,
        accountKey: key,
        mapValue,
        sourceValues: [],
        message: `${ownerLabel(pos)} ${pos.Account_Type__c} at ${pos.Custodian__c} (${money(mapValue)}) has no matching source. Attach a statement, intake, or note that confirms this balance.`,
      });
      continue;
    }
    matchedFigureKeys.add(key);

    // Distinct figure values (after tolerance clustering) decide match vs conflict.
    const distinct = distinctValues(matches.map((m) => m.balance as number));
    const allAgreeWithMap = matches.every((m) => withinTolerance(m.balance as number, mapValue));
    const figuresAgree = distinct.length === 1;

    if (figuresAgree && allAgreeWithMap) {
      const conf = Math.max(...matches.map((m) => m.confidence));
      matchedDollars += mapValue;
      findings.push({
        type: "Match",
        positionId: pos.Id,
        accountKey: key,
        mapValue,
        sourceValues: matches,
        message: `${ownerLabel(pos)} ${pos.Account_Type__c} at ${pos.Custodian__c} (${money(mapValue)}) confirmed by ${matches.length} source${matches.length === 1 ? "" : "s"} (confidence ${conf}%).`,
      });
    } else {
      const valueList = distinctWithMap(mapValue, distinct);
      findings.push({
        type: "Conflict",
        positionId: pos.Id,
        accountKey: key,
        mapValue,
        sourceValues: matches,
        message: `${ownerLabel(pos)} ${pos.Account_Type__c} at ${pos.Custodian__c} has conflicting values: ${valueList}. Pick the correct figure to resolve.`,
      });
    }
  }

  // Figures with no matching SOURCE position → Missing.
  for (const [key, arr] of figuresByKey.entries()) {
    if (matchedFigureKeys.has(key)) continue;
    // Skip figures that map onto a destination/standalone position key (already on the map elsewhere).
    const onMap = positions.some(
      (p) => accountKey(p.Owner_Label__c, p.Custodian__c, p.Account_Type__c) === key,
    );
    if (onMap) continue;
    const top = arr[0];
    findings.push({
      type: "Missing",
      accountKey: key,
      sourceValues: arr,
      message: `Source data mentions ${describeFigure(top)} (${arr.length} reference${arr.length === 1 ? "" : "s"}) but there is no matching account on the money map. Add it as a source, or confirm it is intentionally excluded.`,
    });
  }

  // Unparsed documents.
  for (const d of unparsedDocs) {
    findings.push({
      type: "Unparsed",
      accountKey: `doc|${d.id}`,
      sourceValues: [],
      message: `"${d.title}" could not be parsed with enough confidence. Open it and confirm its balances manually, or re-upload a clearer copy.`,
    });
  }

  const coveragePct = totalSourceDollars > 0 ? Math.round((100 * matchedDollars) / totalSourceDollars) : 0;
  const hasUnresolvedConflicts = findings.some((f) => f.type === "Conflict" || f.type === "Unsupported");

  return {
    generatedAt: new Date().toISOString(),
    coveragePct,
    hasUnresolvedConflicts,
    figures,
    findings,
    unparsedDocuments: unparsedDocs,
  };
}

// ---- reconcile helpers ----

function distinctValues(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (!out.some((u) => withinTolerance(u, v))) out.push(v);
  }
  return out.sort((a, b) => a - b);
}

function distinctWithMap(mapValue: number, distinct: number[]): string {
  const set = distinctValues([mapValue, ...distinct]);
  return set.map((v) => money(v)).join(" vs ");
}

function ownerLabel(p: CaseDesignPosition): string {
  return (p.Owner_Label__c || "").trim() || "Client";
}

function describeFigure(f: SourceFigure): string {
  const parts = [f.owner, f.accountType, f.custodian].filter(Boolean).join(" ");
  return `${parts || "an account"} ${money(f.balance ?? 0)}`.trim();
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

// ============================================================
// Orchestration
// ============================================================

/**
 * Full pipeline: aggregate → extract (notes + statements) → reconcile.
 * Returns the report (the API route persists it). Extraction failures are
 * swallowed per-source so one bad note/doc never sinks the whole run.
 */
export async function runReconciliation(caseDesignId: string): Promise<ReconciliationReport> {
  const agg = await aggregateSources(caseDesignId);

  const figures: SourceFigure[] = [...agg.structuredFigures];
  const unparsedDocs: { id: string; title: string }[] = [];

  // Notes (LLM extract, in parallel).
  const noteResults = await Promise.all(
    agg.notes.map((n) =>
      extractFromNotes(n.text, {
        sourceRecordId: n.recordId,
        sourceDocumentName: n.type ? `Meeting Notes — ${n.type}` : "Meeting Notes",
        sourceType: "Zoom Notes",
      }),
    ),
  );
  for (const r of noteResults) figures.push(...r);

  // Documents (vision extract, in parallel). Download + parse; below-threshold
  // or empty parses surface as Unparsed.
  const docResults = await Promise.all(
    agg.documents.map(async (d) => {
      try {
        const file = await downloadFromSalesforce(d.contentVersionId);
        const figs = await extractFromStatement({
          buffer: file.buffer,
          mimeType: file.mimeType,
          documentName: d.title,
          sourceRecordId: d.contentDocumentId,
        });
        const usable = figs.filter((f) => f.confidence >= CONSTANTS.parseConfidenceThreshold && f.balance != null);
        return { id: d.contentDocumentId, title: d.title, figures: usable, parsed: usable.length > 0 };
      } catch {
        return { id: d.contentDocumentId, title: d.title, figures: [] as SourceFigure[], parsed: false };
      }
    }),
  );
  for (const r of docResults) {
    if (r.parsed) figures.push(...r.figures);
    else unparsedDocs.push({ id: r.id, title: r.title });
  }

  return reconcile(agg.positions, figures, unparsedDocs);
}
