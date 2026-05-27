/**
 * Case Design — Generate from Vault.
 *
 * Reads parsed Vault data (Retirement_Intake__c + Federal_Benefits_Intake__c)
 * for the household, applies CMT-driven mapping + eligibility rules, creates
 * Source positions + consolidated Destinations + edges in one shot.
 *
 * No hardcoded mappings or rules — everything is driven by three Custom
 * Metadata Types deployed in Phase A:
 *   - Case_Design_Vault_Mapping__mdt    : Vault field → Source position
 *   - Case_Design_Eligibility_Rule__mdt : age/employment → can-move / KEEP
 *   - Case_Design_Destination_Template__mdt : per-bucket destination defaults
 *
 * Design contract (see architecture gist):
 *   - Vault > Meeting 1 > Closed Opps precedence
 *   - Idempotent: refuses on non-Draft or when positions/edges already exist
 *   - Vault confidence < threshold → flag, not silent
 *   - Age math: today - DOB; in-service rollover allowed at 59½ even if Requires_Separation
 *   - KEEP badge with templated lock reason when blocked
 */

import { getSFConnection } from "@/lib/salesforce/connector";
import type { Connection } from "jsforce";
import type {
  AccountType,
  CaseDesignBundle,
  CaseDesignPosition,
  CaseDesignEdge,
} from "./types";

const safeIdRe = /^[A-Za-z0-9]{15,18}$/;
function safeId(id: string): string {
  if (!safeIdRe.test(id)) throw new Error(`Invalid SF Id: ${JSON.stringify(id)}`);
  return id;
}

// ---------- CMT types (mirroring SF schema) ----------

interface CmtVaultMapping {
  DeveloperName: string;
  Source_Object__c: string;
  Source_Field__c: string | null;
  Aggregate_Fields__c: string | null;
  Account_Type__c: string;
  Default_Custodian__c: string | null;
  Default_Product_Detail__c: string | null;
  Owner_Source__c: "Self" | "Spouse" | "Joint";
  Min_Balance__c: number | null;
  Notes_Template__c: string | null;
  Active__c: boolean;
  Sort_Order__c: number | null;
}

interface CmtEligibilityRule {
  DeveloperName: string;
  Account_Type__c: string;
  Custodian_Match__c: string | null;
  Always_Eligible__c: boolean;
  Min_Age_To_Rollover__c: number | null;
  Requires_Separation__c: boolean;
  Standalone_When_Locked__c: boolean;
  Lock_Reason_Template__c: string | null;
  Eligible_Edge_Method__c: string | null;
  Eligible_Bucket__c: string | null;
  Active__c: boolean;
  Low_Confidence_Threshold__c: number | null;
  Sort_Order__c: number | null;
}

interface CmtDestinationTemplate {
  DeveloperName: string;
  Trigger_Bucket__c: string;
  Owner_Source__c: "From_Source_Owner" | "Static_Joint";
  Dest_Account_Type__c: string;
  Dest_Custodian__c: string;
  Dest_Product_Detail_Template__c: string | null;
  Active__c: boolean;
  Sort_Order__c: number | null;
}

interface AllCmts {
  vaultMappings: CmtVaultMapping[];
  eligibilityRules: CmtEligibilityRule[];
  destinationTemplates: CmtDestinationTemplate[];
}

// ---------- Vault intake types (minimal — only the fields we read) ----------

interface VaultRow {
  Id: string;
  Contact__c: string;
  AI_Parse_Confidence__c: number | null;
  AI_Parsed_Date__c: string | null;
  Fields_Needing_Review__c: string | null;
  // dynamic — any field on either intake object
  [key: string]: unknown;
}

interface VaultBundle {
  general: Map<string, VaultRow>; // ContactId → latest General Vault row
  federal: Map<string, VaultRow>; // ContactId → latest Federal Vault row
}

interface PersonAccountInfo {
  AccountId: string;
  ContactId: string;
  FirstName: string | null;
  LastName: string | null;
  Birthdate: string | null;
  EmploymentStatus: string | null;
  SpouseName: string | null;
  EmployerName: string | null;
}

// ---------- Public types ----------

export type EligibilityStage =
  | "Eligible Now"
  | "Locked Until 59½"
  | "Locked Until Separation"
  | "Standalone — Keep"
  | "Eligibility Unknown";

export interface GenerationResult {
  status: "ok" | "skipped-existing" | "skipped-non-draft" | "skipped-no-vault";
  sourcesCreated: number;
  destinationsCreated: number;
  edgesCreated: number;
  keepCount: number;
  lowConfidenceCount: number;
  fieldsNeedingReview: string;
  math: {
    totalSourceValue: number;
    totalDestinationValue: number;
    lockedValue: number;
    byOwner: Array<{ owner: string; total: number; count: number }>;
    byBucket: Array<{ bucket: string; total: number; count: number }>;
  };
  reasonIfSkipped?: string;
}

// ---------- CMT cache ----------
//
// CMT records are static config — query once per module load, hold in
// memory. Server-side Next.js routes share this scope, so a deploy resets it.

let cmtCache: { fetched: number; data: AllCmts } | null = null;
const CMT_CACHE_TTL_MS = 10 * 60_000; // 10 minutes

export async function loadCaseDesignCMTs(force = false): Promise<AllCmts> {
  if (!force && cmtCache && Date.now() - cmtCache.fetched < CMT_CACHE_TTL_MS) {
    return cmtCache.data;
  }
  const conn = await getSFConnection();
  const [vm, er, dt] = await Promise.all([
    conn.query<CmtVaultMapping>(
      `SELECT DeveloperName, Source_Object__c, Source_Field__c, Aggregate_Fields__c,
              Account_Type__c, Default_Custodian__c, Default_Product_Detail__c,
              Owner_Source__c, Min_Balance__c, Notes_Template__c, Active__c, Sort_Order__c
       FROM Case_Design_Vault_Mapping__mdt
       WHERE Active__c = true
       ORDER BY Sort_Order__c NULLS LAST, DeveloperName`,
    ),
    conn.query<CmtEligibilityRule>(
      `SELECT DeveloperName, Account_Type__c, Custodian_Match__c, Always_Eligible__c,
              Min_Age_To_Rollover__c, Requires_Separation__c, Standalone_When_Locked__c,
              Lock_Reason_Template__c, Eligible_Edge_Method__c, Eligible_Bucket__c,
              Active__c, Low_Confidence_Threshold__c, Sort_Order__c
       FROM Case_Design_Eligibility_Rule__mdt
       WHERE Active__c = true
       ORDER BY Sort_Order__c NULLS LAST, DeveloperName`,
    ),
    conn.query<CmtDestinationTemplate>(
      `SELECT DeveloperName, Trigger_Bucket__c, Owner_Source__c, Dest_Account_Type__c,
              Dest_Custodian__c, Dest_Product_Detail_Template__c, Active__c, Sort_Order__c
       FROM Case_Design_Destination_Template__mdt
       WHERE Active__c = true
       ORDER BY Sort_Order__c NULLS LAST, DeveloperName`,
    ),
  ]);
  cmtCache = {
    fetched: Date.now(),
    data: {
      vaultMappings: vm.records,
      eligibilityRules: er.records,
      destinationTemplates: dt.records,
    },
  };
  return cmtCache.data;
}

// ---------- Household resolution ----------

async function loadHouseholdPersonAccounts(
  conn: Connection,
  householdAccountId: string,
): Promise<PersonAccountInfo[]> {
  // Walk Account → Person Accounts (Account.Household__c = householdId) AND
  // include the householdId itself in case it IS a Person Account.
  const rows = await conn.query<{
    Id: string;
    PersonContactId: string | null;
    FirstName: string | null;
    LastName: string | null;
    PersonBirthdate: string | null;
    IsPersonAccount: boolean;
  }>(
    `SELECT Id, PersonContactId, FirstName, LastName, PersonBirthdate, IsPersonAccount
     FROM Account
     WHERE (Id = '${safeId(householdAccountId)}' OR Household__c = '${safeId(householdAccountId)}')
     AND IsPersonAccount = true`,
  );
  return rows.records
    .filter((r) => r.PersonContactId)
    .map((r) => ({
      AccountId: r.Id,
      ContactId: r.PersonContactId as string,
      FirstName: r.FirstName,
      LastName: r.LastName,
      Birthdate: r.PersonBirthdate,
      EmploymentStatus: null,
      SpouseName: null,
      EmployerName: null,
    }));
}

// ---------- Vault loaders ----------

async function loadVaultIntakes(
  conn: Connection,
  contactIds: string[],
  vaultMappings: CmtVaultMapping[],
): Promise<VaultBundle> {
  // Compute the set of fields we need on each Vault object from the CMT
  // mappings, so we only SELECT what's actually used. Saves bytes + survives
  // future Vault-schema additions without hardcoding.
  const generalFields = new Set<string>(["Id", "Contact__c", "AI_Parse_Confidence__c", "AI_Parsed_Date__c", "Fields_Needing_Review__c", "Date_of_Birth__c", "Employment_Status__c", "Employer__c", "Spouse_Name__c", "Spouse_DOB__c", "Spouse_Annual_Income__c"]);
  const federalFields = new Set<string>(["Id", "Contact__c", "AI_Parse_Confidence__c", "AI_Parsed_Date__c", "Fields_Needing_Review__c", "Date_of_Birth__c", "Spouse_DOB__c", "Spouse_Retirement_Savings__c"]);
  for (const m of vaultMappings) {
    if (!m.Active__c) continue;
    const target = m.Source_Object__c === "Federal_Benefits_Intake__c" ? federalFields : generalFields;
    if (m.Source_Field__c) target.add(m.Source_Field__c);
    if (m.Aggregate_Fields__c) {
      for (const f of m.Aggregate_Fields__c.split(",").map((s) => s.trim())) {
        if (f) target.add(f);
      }
    }
  }

  if (contactIds.length === 0) {
    return { general: new Map(), federal: new Map() };
  }
  const contactInClause = contactIds.map((id) => `'${safeId(id)}'`).join(",");

  async function safeVaultQuery(soql: string): Promise<{ records: VaultRow[] }> {
    try {
      const r = await conn.query<VaultRow>(soql);
      return { records: r.records };
    } catch {
      return { records: [] };
    }
  }
  const [genRows, fedRows] = await Promise.all([
    safeVaultQuery(
      `SELECT ${Array.from(generalFields).join(", ")}
       FROM Retirement_Intake__c
       WHERE Contact__c IN (${contactInClause})
       ORDER BY AI_Parsed_Date__c DESC NULLS LAST, LastModifiedDate DESC`,
    ),
    safeVaultQuery(
      `SELECT ${Array.from(federalFields).join(", ")}
       FROM Federal_Benefits_Intake__c
       WHERE Contact__c IN (${contactInClause})
       ORDER BY AI_Parsed_Date__c DESC NULLS LAST, LastModifiedDate DESC`,
    ),
  ]);

  const general = new Map<string, VaultRow>();
  for (const r of genRows.records) {
    if (!general.has(r.Contact__c)) general.set(r.Contact__c, r);
  }
  const federal = new Map<string, VaultRow>();
  for (const r of fedRows.records) {
    if (!federal.has(r.Contact__c)) federal.set(r.Contact__c, r);
  }
  return { general, federal };
}

// ---------- Helpers ----------

function ageFromBirthdate(iso: string | null, today = new Date()): number | null {
  if (!iso) return null;
  const dob = new Date(iso);
  if (isNaN(dob.getTime())) return null;
  const yearsDiff = today.getFullYear() - dob.getFullYear();
  const monthsDiff = today.getMonth() - dob.getMonth();
  const daysDiff = today.getDate() - dob.getDate();
  let age = yearsDiff;
  if (monthsDiff < 0 || (monthsDiff === 0 && daysDiff < 0)) age -= 1;
  // Half-year precision for the 59½ threshold
  return age + monthsDiff / 12 + daysDiff / 365.25;
}

function unlockDate(birthIso: string | null, minAge: number): string | null {
  if (!birthIso) return null;
  const dob = new Date(birthIso);
  if (isNaN(dob.getTime())) return null;
  const target = new Date(dob);
  const wholeYears = Math.floor(minAge);
  const months = Math.round((minAge - wholeYears) * 12);
  target.setFullYear(target.getFullYear() + wholeYears);
  target.setMonth(target.getMonth() + months);
  return target.toISOString().slice(0, 10);
}

function applyTemplate(
  template: string | null,
  ctx: Record<string, string | number | null | undefined>,
): string | null {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = ctx[k];
    return v == null ? "" : String(v);
  });
}

function ownerLabelFor(
  mappingOwner: "Self" | "Spouse" | "Joint",
  person: PersonAccountInfo,
  spouseName: string | null,
): string {
  if (mappingOwner === "Joint") return "Joint";
  if (mappingOwner === "Spouse") return spouseName?.trim() || "Spouse";
  return person.FirstName?.trim() || person.LastName?.trim() || "Client";
}

// ---------- Eligibility evaluation ----------

interface EligibilityVerdict {
  stage: EligibilityStage;
  edgeMethod: string | null;
  bucket: string | null;
  lockReason: string | null;
  keep: boolean; // render KEEP badge
}

function evaluateEligibility(
  position: { Account_Type__c: AccountType; Custodian__c: string | null },
  rules: CmtEligibilityRule[],
  age: number | null,
  employmentStatus: string | null,
  birthIso: string | null,
): EligibilityVerdict {
  // Find best-matching rule: same Account_Type__c. If Custodian_Match__c set,
  // it must equal position.Custodian__c (lets TSP rules win over generic IRA).
  const candidates = rules
    .filter((r) => r.Active__c && r.Account_Type__c === position.Account_Type__c)
    .sort((a, b) => {
      // Custodian-specific rules win over generic
      const aSpecific = a.Custodian_Match__c ? 0 : 1;
      const bSpecific = b.Custodian_Match__c ? 0 : 1;
      if (aSpecific !== bSpecific) return aSpecific - bSpecific;
      return (a.Sort_Order__c ?? 9999) - (b.Sort_Order__c ?? 9999);
    });
  const rule = candidates.find(
    (r) => !r.Custodian_Match__c || r.Custodian_Match__c === position.Custodian__c,
  );

  if (!rule) {
    // No CMT rule — graceful default: standalone keep, advisor classifies.
    return {
      stage: "Eligibility Unknown",
      edgeMethod: null,
      bucket: null,
      lockReason: "No eligibility rule found for this account type — advisor to classify",
      keep: true,
    };
  }

  if (rule.Always_Eligible__c) {
    return {
      stage: "Eligible Now",
      edgeMethod: rule.Eligible_Edge_Method__c,
      bucket: rule.Eligible_Bucket__c,
      lockReason: null,
      keep: false,
    };
  }

  // Age + separation gate
  const minAge = rule.Min_Age_To_Rollover__c ?? 59.5;
  const isEmployed = employmentStatus?.toLowerCase() === "employed";
  const ageMet = age != null && age >= minAge;

  if (ageMet) {
    // At/above age threshold, in-service rollover allowed even when
    // Requires_Separation__c is true (standard TSP/401k 59½ rule).
    return {
      stage: "Eligible Now",
      edgeMethod: rule.Eligible_Edge_Method__c,
      bucket: rule.Eligible_Bucket__c,
      lockReason: null,
      keep: false,
    };
  }

  if (!rule.Requires_Separation__c) {
    // Not separation-gated and age not met — locked by age.
    if (rule.Standalone_When_Locked__c) {
      return {
        stage: "Locked Until 59½",
        edgeMethod: null,
        bucket: null,
        lockReason: applyTemplate(rule.Lock_Reason_Template__c, {
          min_age: minAge,
          unlock_date: unlockDate(birthIso, minAge) ?? "TBD",
        }),
        keep: true,
      };
    }
    return {
      stage: "Locked Until 59½",
      edgeMethod: null,
      bucket: null,
      lockReason: null,
      keep: false,
    };
  }

  // Separation-required + age not met → eligible only if separated
  if (!isEmployed) {
    return {
      stage: "Eligible Now",
      edgeMethod: rule.Eligible_Edge_Method__c,
      bucket: rule.Eligible_Bucket__c,
      lockReason: null,
      keep: false,
    };
  }

  // Active employee, age not met → locked until separation OR 59½
  if (rule.Standalone_When_Locked__c) {
    return {
      stage: "Locked Until Separation",
      edgeMethod: null,
      bucket: null,
      lockReason: applyTemplate(rule.Lock_Reason_Template__c, {
        min_age: minAge,
        unlock_date: unlockDate(birthIso, minAge) ?? "TBD",
      }),
      keep: true,
    };
  }
  return {
    stage: "Locked Until Separation",
    edgeMethod: null,
    bucket: null,
    lockReason: null,
    keep: false,
  };
}

// ---------- Main orchestrator ----------

interface PendingSource {
  ownerLabel: string;
  contactId: string;
  account_type: AccountType;
  custodian: string;
  product_detail: string | null;
  amount: number;
  contribution_note: string | null;
  vault_origin: "Retirement_Intake__c" | "Federal_Benefits_Intake__c";
  vault_row_id: string;
  source_field_or_aggregate: string;
  ai_confidence: number | null;
  verdict: EligibilityVerdict;
}

export async function generateFromVault(
  caseDesignId: string,
  bundle: CaseDesignBundle,
): Promise<GenerationResult> {
  // --- Pre-flight ---
  if (bundle.parent.Status__c !== "Draft") {
    return makeSkipResult(
      "skipped-non-draft",
      `Generate only runs on Draft Case Designs (status: ${bundle.parent.Status__c})`,
    );
  }
  if (bundle.positions.length > 0 || bundle.edges.length > 0) {
    return makeSkipResult(
      "skipped-existing",
      "Case Design already has positions or edges; refusing to overwrite",
    );
  }
  const householdAccountId = bundle.parent.Account__c;
  if (!householdAccountId) {
    return makeSkipResult(
      "skipped-no-vault",
      "Case Design has no Account__c — cannot resolve household",
    );
  }

  const conn = await getSFConnection();
  const cmts = await loadCaseDesignCMTs();
  if (cmts.vaultMappings.length === 0) {
    return makeSkipResult(
      "skipped-no-vault",
      "No active Case_Design_Vault_Mapping__mdt records — Phase A not deployed?",
    );
  }

  // --- Resolve household ---
  const persons = await loadHouseholdPersonAccounts(conn, householdAccountId);
  if (persons.length === 0) {
    return makeSkipResult(
      "skipped-no-vault",
      "No Person Accounts found under this household",
    );
  }
  const contactIds = persons.map((p) => p.ContactId);

  // --- Load Vault rows + hydrate person info from Vault demographics ---
  const vaults = await loadVaultIntakes(conn, contactIds, cmts.vaultMappings);
  const fieldsNeedingReview: string[] = [];
  for (const person of persons) {
    const gen = vaults.general.get(person.ContactId);
    const fed = vaults.federal.get(person.ContactId);
    person.EmploymentStatus =
      (gen?.Employment_Status__c as string | null) ?? person.EmploymentStatus;
    person.EmployerName = (gen?.Employer__c as string | null) ?? person.EmployerName;
    person.SpouseName = (gen?.Spouse_Name__c as string | null) ?? person.SpouseName;
    if (!person.Birthdate) {
      person.Birthdate =
        (gen?.Date_of_Birth__c as string | null) ??
        (fed?.Date_of_Birth__c as string | null);
    }
    if (gen?.Fields_Needing_Review__c) fieldsNeedingReview.push(String(gen.Fields_Needing_Review__c));
    if (fed?.Fields_Needing_Review__c) fieldsNeedingReview.push(String(fed.Fields_Needing_Review__c));
  }

  // --- Build pending sources from CMT mappings × person × vault row ---
  const pending: PendingSource[] = [];
  let lowConfidenceCount = 0;
  for (const person of persons) {
    const age = ageFromBirthdate(person.Birthdate);
    for (const mapping of cmts.vaultMappings) {
      const vault =
        mapping.Source_Object__c === "Federal_Benefits_Intake__c"
          ? vaults.federal.get(person.ContactId)
          : vaults.general.get(person.ContactId);
      if (!vault) continue;
      // Compute amount: single field OR sum of aggregate fields
      let amount = 0;
      let aggregateLabel = "";
      if (mapping.Aggregate_Fields__c) {
        const fields = mapping.Aggregate_Fields__c.split(",").map((s) => s.trim());
        for (const f of fields) {
          const v = vault[f];
          if (typeof v === "number") amount += v;
        }
        aggregateLabel = mapping.Aggregate_Fields__c;
      } else if (mapping.Source_Field__c) {
        const v = vault[mapping.Source_Field__c];
        if (typeof v === "number") amount = v;
        aggregateLabel = mapping.Source_Field__c;
      }
      const minBalance = mapping.Min_Balance__c ?? 100;
      if (amount < minBalance) continue;

      // Resolve template tokens
      const ctx = {
        Owner: ownerLabelFor(mapping.Owner_Source__c, person, person.SpouseName),
        Employer: person.EmployerName || "TBD",
        AccountType: mapping.Account_Type__c,
        Amount: amount,
      };
      const custodian = applyTemplate(mapping.Default_Custodian__c, ctx) || "TBD";
      const product_detail = applyTemplate(mapping.Default_Product_Detail__c, ctx);
      const contribution_note = applyTemplate(mapping.Notes_Template__c, ctx);
      const account_type = mapping.Account_Type__c as AccountType;
      const ownerLabel = ctx.Owner;

      // Evaluate eligibility
      const verdict = evaluateEligibility(
        { Account_Type__c: account_type, Custodian__c: custodian },
        cmts.eligibilityRules,
        age,
        person.EmploymentStatus,
        person.Birthdate,
      );

      // Confidence tagging
      const conf = (vault.AI_Parse_Confidence__c as number | null) ?? null;
      const rule = cmts.eligibilityRules.find(
        (r) => r.Active__c && r.Account_Type__c === account_type,
      );
      const threshold = rule?.Low_Confidence_Threshold__c ?? 0.5;
      if (conf != null && conf < threshold) lowConfidenceCount += 1;

      pending.push({
        ownerLabel,
        contactId: person.ContactId,
        account_type,
        custodian,
        product_detail,
        amount,
        contribution_note,
        vault_origin: mapping.Source_Object__c as PendingSource["vault_origin"],
        vault_row_id: vault.Id,
        source_field_or_aggregate: aggregateLabel,
        ai_confidence: conf,
        verdict,
      });
    }
  }

  if (pending.length === 0) {
    return makeSkipResult(
      "skipped-no-vault",
      "Vault rows exist but no balance fields exceeded the Min_Balance threshold",
    );
  }

  // --- Insert Sources, then group by (owner, bucket) for Destinations + Edges ---
  const cdId = safeId(caseDesignId);
  const sourceIdsCreated: string[] = [];
  const sourceIndex = new Map<number, string>(); // pending-index → new SF Id

  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    const rec: Partial<CaseDesignPosition> & { Case_Design__c: string } = {
      Case_Design__c: cdId,
      Role__c: "Source",
      Owner_Label__c: p.ownerLabel,
      Account_Type__c: p.account_type,
      Custodian__c: p.custodian,
      Product_Detail__c: p.product_detail,
      Amount__c: p.amount,
      Contribution_Note__c: p.contribution_note,
      Stage__c: p.verdict.stage,
    };
    const res = await conn
      .sobject("Case_Design_Position__c")
      .create(rec as Record<string, unknown>);
    if (!("success" in res) || !res.success) {
      throw new Error(`Failed to create source position: ${JSON.stringify(res)}`);
    }
    sourceIdsCreated.push(res.id as string);
    sourceIndex.set(i, res.id as string);
  }

  // Group eligible sources by (owner, bucket) to build destinations
  type GroupKey = string; // "owner||bucket"
  const groups = new Map<
    GroupKey,
    { owner: string; bucket: string; pendingIdxs: number[]; total: number; edgeMethod: string }
  >();
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    if (p.verdict.stage !== "Eligible Now") continue;
    if (!p.verdict.bucket || !p.verdict.edgeMethod) continue;
    const key = `${p.ownerLabel}||${p.verdict.bucket}`;
    const g = groups.get(key);
    if (g) {
      g.pendingIdxs.push(i);
      g.total += p.amount;
    } else {
      groups.set(key, {
        owner: p.ownerLabel,
        bucket: p.verdict.bucket,
        pendingIdxs: [i],
        total: p.amount,
        edgeMethod: p.verdict.edgeMethod,
      });
    }
  }

  let destinationsCreated = 0;
  let edgesCreated = 0;
  for (const g of groups.values()) {
    const tpl = cmts.destinationTemplates.find(
      (t) => t.Active__c && t.Trigger_Bucket__c === g.bucket,
    );
    if (!tpl) continue; // no template for this bucket → leave sources standalone (no edge)
    const destOwner = tpl.Owner_Source__c === "Static_Joint" ? "Joint" : g.owner;
    const destProductDetail = applyTemplate(tpl.Dest_Product_Detail_Template__c, {
      Owner: destOwner,
      Bucket: g.bucket,
      SourceCount: g.pendingIdxs.length,
      Total: g.total,
    });
    const destRec: Partial<CaseDesignPosition> & { Case_Design__c: string } = {
      Case_Design__c: cdId,
      Role__c: "Destination",
      Owner_Label__c: destOwner,
      Account_Type__c: tpl.Dest_Account_Type__c as AccountType,
      Custodian__c: tpl.Dest_Custodian__c,
      Product_Detail__c: destProductDetail,
      Amount__c: g.total,
      Stage__c: "Eligible Now",
    };
    const destRes = await conn
      .sobject("Case_Design_Position__c")
      .create(destRec as Record<string, unknown>);
    if (!("success" in destRes) || !destRes.success) {
      throw new Error(`Failed to create destination: ${JSON.stringify(destRes)}`);
    }
    const destId = destRes.id as string;
    destinationsCreated += 1;
    for (const srcIdx of g.pendingIdxs) {
      const srcId = sourceIndex.get(srcIdx);
      if (!srcId) continue;
      const edge: Partial<CaseDesignEdge> & { Case_Design__c: string } = {
        Case_Design__c: cdId,
        From_Position__c: srcId,
        To_Position__c: destId,
        Method__c: g.edgeMethod as CaseDesignEdge["Method__c"],
        Status__c: "Planned",
      };
      const edgeRes = await conn
        .sobject("Case_Design_Edge__c")
        .create(edge as Record<string, unknown>);
      if (!("success" in edgeRes) || !edgeRes.success) {
        throw new Error(`Failed to create edge: ${JSON.stringify(edgeRes)}`);
      }
      edgesCreated += 1;
    }
  }

  // --- Math + summary ---
  const totalSourceValue = pending.reduce((s, p) => s + p.amount, 0);
  const lockedValue = pending
    .filter((p) => p.verdict.keep)
    .reduce((s, p) => s + p.amount, 0);
  const totalDestinationValue = Array.from(groups.values()).reduce(
    (s, g) => s + g.total,
    0,
  );

  const byOwnerMap = new Map<string, { total: number; count: number }>();
  const byBucketMap = new Map<string, { total: number; count: number }>();
  for (const p of pending) {
    const o = byOwnerMap.get(p.ownerLabel) ?? { total: 0, count: 0 };
    o.total += p.amount;
    o.count += 1;
    byOwnerMap.set(p.ownerLabel, o);
    const bucket = p.verdict.bucket || "Standalone";
    const b = byBucketMap.get(bucket) ?? { total: 0, count: 0 };
    b.total += p.amount;
    b.count += 1;
    byBucketMap.set(bucket, b);
  }
  const byOwner = Array.from(byOwnerMap.entries())
    .map(([owner, v]) => ({ owner, ...v }))
    .sort((a, b) => b.total - a.total);
  const byBucket = Array.from(byBucketMap.entries())
    .map(([bucket, v]) => ({ bucket, ...v }))
    .sort((a, b) => b.total - a.total);

  const result: GenerationResult = {
    status: "ok",
    sourcesCreated: sourceIdsCreated.length,
    destinationsCreated,
    edgesCreated,
    keepCount: pending.filter((p) => p.verdict.keep).length,
    lowConfidenceCount,
    fieldsNeedingReview: fieldsNeedingReview.join("\n\n---\n\n").slice(0, 32_000),
    math: {
      totalSourceValue,
      totalDestinationValue,
      lockedValue,
      byOwner,
      byBucket,
    },
  };

  // Stamp the audit fields on the parent
  try {
    await conn.sobject("Case_Design__c").update({
      Id: cdId,
      Generated_From_Vault_At__c: new Date().toISOString(),
      Generation_Summary__c: JSON.stringify(result).slice(0, 32_000),
    });
  } catch {
    // Best-effort — generation already succeeded.
  }

  return result;
}

function makeSkipResult(
  status: GenerationResult["status"],
  reason: string,
): GenerationResult {
  return {
    status,
    sourcesCreated: 0,
    destinationsCreated: 0,
    edgesCreated: 0,
    keepCount: 0,
    lowConfidenceCount: 0,
    fieldsNeedingReview: "",
    math: {
      totalSourceValue: 0,
      totalDestinationValue: 0,
      lockedValue: 0,
      byOwner: [],
      byBucket: [],
    },
    reasonIfSkipped: reason,
  };
}
