/**
 * Case Design Salesforce client — full CRUD on the parent + 4 child objects,
 * plus household-document discovery (via ContentDocumentLink on the Opp's
 * Account + Household) and PDF deposit (ContentVersion + multi-link).
 *
 * Uses the shared connector at @/lib/salesforce/connector for OAuth.
 */

import { getSFConnection } from "@/lib/salesforce/connector";
import type {
  AccountType,
  CaseDesignBundle,
  CaseDesignParent,
  CaseDesignSection,
  CaseDesignPosition,
  CaseDesignEdge,
  CaseDesignAnnotation,
} from "./types";
import {
  accountTypeBucket as bucketOf,
  type AccountBucket as Bucket,
} from "./auto-layout";

/**
 * Salesforce Ids are 15 or 18 chars of `[A-Za-z0-9]`. Anything else cannot be
 * a real Id, so we reject it before interpolating into SOQL. This is the
 * single guard for every SOQL we issue — no other layer validates the path
 * param before it reaches the query string.
 */
function safeId(id: string): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9]{15,18}$/.test(id)) {
    throw new Error(`Invalid Salesforce Id: ${JSON.stringify(id)}`);
  }
  return id;
}

const PARENT_FIELDS = [
  "Id", "Name", "Account__c", "Account__r.Name",
  "Opportunity__c", "Status__c", "Plan_Date__c", "Document_Title__c",
  "Plan_Type__c", "Has_Roth_Conversion__c", "Notes__c",
  "PDF_ContentVersion_Id__c", "PDF_Vault_Document_Id__c",
  "Finalized_At__c", "Presented_At__c", "Locked_At__c",
  "Total_Source_Value__c", "Total_Destination_Value__c",
].join(", ");

const SECTION_FIELDS = [
  "Id", "Name", "Case_Design__c", "Label__c", "Section_Type__c",
  "Page_Number__c", "Sort_Order__c", "Style__c",
].join(", ");

const POSITION_FIELDS = [
  "Id", "Name", "Case_Design__c", "Section__c", "Role__c", "Stage__c",
  "Source_Asset__c", "Source_Vault_Document_Id__c", "Source_Vault_Document_Name__c",
  "Owner_Label__c", "Account_Type__c", "Account_Type_Other__c", "Custodian__c",
  "Product_Detail__c", "Account_Number_Last4__c", "Inception_Date_Text__c",
  "Amount__c", "Account_Value__c", "Surrender_Value__c", "Cash_Value__c", "Death_Benefit__c",
  "Annual_Fee_Pct__c", "Annual_Fee_Display__c", "Fee_Is_Approximate__c",
  "Contribution_Note__c", "Position_X__c", "Position_Y__c", "Replaces_Position__c",
].join(", ");

const EDGE_FIELDS = [
  "Id", "Name", "Case_Design__c", "From_Position__c", "To_Position__c",
  "Method__c", "Method_Label_Override__c", "Partial_Amount__c",
  "Gross_Amount__c", "Federal_Tax__c", "State_Tax__c",
  "Tax_Payment_Source__c", "Timing_Note__c", "Stage__c", "Status__c",
].join(", ");

const ANNOTATION_FIELDS = [
  "Id", "Name", "Case_Design__c", "Text__c", "Style__c",
  "Section__c", "Anchor_Position__c", "Anchor_Edge__c",
  "Page_Number__c", "Sort_Order__c",
].join(", ");

// ---------- parent ----------

export async function loadCaseDesign(id: string): Promise<CaseDesignBundle | null> {
  const conn = await getSFConnection();
  const [parentRows, sections, positions, edges, annotations] = await Promise.all([
    conn.query<CaseDesignParent>(
      `SELECT ${PARENT_FIELDS} FROM Case_Design__c WHERE Id = '${safeId(id)}' LIMIT 1`
    ),
    conn.query<CaseDesignSection>(
      `SELECT ${SECTION_FIELDS} FROM Case_Design_Section__c
       WHERE Case_Design__c = '${safeId(id)}'
       ORDER BY Page_Number__c, Sort_Order__c NULLS LAST, Name`
    ),
    conn.query<CaseDesignPosition>(
      `SELECT ${POSITION_FIELDS} FROM Case_Design_Position__c
       WHERE Case_Design__c = '${safeId(id)}'
       ORDER BY Role__c, Owner_Label__c, Name`
    ),
    conn.query<CaseDesignEdge>(
      `SELECT ${EDGE_FIELDS} FROM Case_Design_Edge__c
       WHERE Case_Design__c = '${safeId(id)}'
       ORDER BY Stage__c NULLS FIRST, Name`
    ),
    conn.query<CaseDesignAnnotation>(
      `SELECT ${ANNOTATION_FIELDS} FROM Case_Design_Annotation__c
       WHERE Case_Design__c = '${safeId(id)}'
       ORDER BY Page_Number__c, Sort_Order__c NULLS LAST, Name`
    ),
  ]);
  if (parentRows.records.length === 0) return null;
  // Flatten Account__r.Name onto the parent so the client can read it as a
  // top-level `Account_Name__c` (jsforce returns relationships as nested
  // objects; the type expects a flat shape).
  const rawParent = parentRows.records[0] as CaseDesignParent & {
    Account__r?: { Name?: string | null } | null;
  };
  const parent: CaseDesignParent = {
    ...rawParent,
    Account_Name__c: rawParent.Account__r?.Name ?? null,
  };
  return {
    parent,
    sections: sections.records,
    positions: positions.records,
    edges: edges.records,
    annotations: annotations.records,
  };
}

export async function updateCaseDesignParent(
  id: string,
  patch: Partial<CaseDesignParent>
): Promise<void> {
  const conn = await getSFConnection();
  await conn.sobject("Case_Design__c").update({ Id: id, ...patch });
}

// ---------- child CRUD (generic) ----------

type ChildObject =
  | { type: "Section"; sf: "Case_Design_Section__c" }
  | { type: "Position"; sf: "Case_Design_Position__c" }
  | { type: "Edge"; sf: "Case_Design_Edge__c" }
  | { type: "Annotation"; sf: "Case_Design_Annotation__c" };

async function createChild(obj: ChildObject["sf"], data: Record<string, unknown>): Promise<string> {
  const conn = await getSFConnection();
  const res = await conn.sobject(obj).create(data);
  if (!("success" in res) || !res.success) {
    throw new Error(`Failed to create ${obj}: ${JSON.stringify(res)}`);
  }
  return res.id as string;
}

async function updateChild(obj: ChildObject["sf"], id: string, data: Record<string, unknown>): Promise<void> {
  const conn = await getSFConnection();
  await conn.sobject(obj).update({ Id: id, ...data });
}

async function deleteChild(obj: ChildObject["sf"], id: string): Promise<void> {
  const conn = await getSFConnection();
  await conn.sobject(obj).destroy(id);
}

// ---------- typed child wrappers ----------

export const sections = {
  create: (caseDesignId: string, data: Partial<CaseDesignSection>) =>
    createChild("Case_Design_Section__c", { Case_Design__c: caseDesignId, ...data }),
  update: (id: string, patch: Partial<CaseDesignSection>) =>
    updateChild("Case_Design_Section__c", id, patch),
  remove: (id: string) => deleteChild("Case_Design_Section__c", id),
};

export const positions = {
  create: (caseDesignId: string, data: Partial<CaseDesignPosition>) =>
    createChild("Case_Design_Position__c", { Case_Design__c: caseDesignId, ...data }),
  update: (id: string, patch: Partial<CaseDesignPosition>) =>
    updateChild("Case_Design_Position__c", id, patch),
  remove: (id: string) => deleteChild("Case_Design_Position__c", id),
};

export const edges = {
  create: (caseDesignId: string, data: Partial<CaseDesignEdge>) =>
    createChild("Case_Design_Edge__c", { Case_Design__c: caseDesignId, ...data }),
  update: (id: string, patch: Partial<CaseDesignEdge>) =>
    updateChild("Case_Design_Edge__c", id, patch),
  remove: (id: string) => deleteChild("Case_Design_Edge__c", id),
};

export const annotations = {
  create: (caseDesignId: string, data: Partial<CaseDesignAnnotation>) =>
    createChild("Case_Design_Annotation__c", { Case_Design__c: caseDesignId, ...data }),
  update: (id: string, patch: Partial<CaseDesignAnnotation>) =>
    updateChild("Case_Design_Annotation__c", id, patch),
  remove: (id: string) => deleteChild("Case_Design_Annotation__c", id),
};

// ---------- household / Vault docs ----------

export interface HouseholdDocument {
  contentDocumentId: string;
  contentVersionId: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdDate: string;
  linkedEntityName: string;
}

/**
 * Resolve a Case Design back to its household and list all ContentDocuments
 * linked to the Opp's Account + Household. This is the "Vault sidebar" source.
 *
 * Today the CW Vault client portal at /vault/[token] writes to a demo file
 * store, but production uploads land as SF Files; this function picks up
 * either. As the Vault portal migrates to SF Files (next workstream), the
 * advisor sees client uploads automatically.
 */
export async function loadHouseholdDocs(caseDesignId: string): Promise<HouseholdDocument[]> {
  const conn = await getSFConnection();

  const cd = await conn.query<{ Account__c: string | null; Opportunity__c: string | null }>(
    `SELECT Account__c, Opportunity__c FROM Case_Design__c WHERE Id = '${safeId(caseDesignId)}' LIMIT 1`
  );
  if (cd.records.length === 0) return [];

  let accountId = cd.records[0].Account__c;
  let householdId: string | null = null;
  let accountName = "Account";

  if (accountId) {
    const acc = await conn.query<{ Name: string; Household__c: string | null }>(
      `SELECT Name, Household__c FROM Account WHERE Id = '${safeId(accountId)}' LIMIT 1`
    );
    if (acc.records.length > 0) {
      accountName = acc.records[0].Name;
      householdId = acc.records[0].Household__c;
    }
  } else if (cd.records[0].Opportunity__c) {
    const opp = await conn.query<{ AccountId: string; Account: { Name?: string; Household__c?: string } | null }>(
      `SELECT AccountId, Account.Name, Account.Household__c FROM Opportunity WHERE Id = '${safeId(cd.records[0].Opportunity__c)}' LIMIT 1`
    );
    if (opp.records.length > 0) {
      accountId = opp.records[0].AccountId;
      householdId = opp.records[0].Account?.Household__c ?? null;
      accountName = opp.records[0].Account?.Name ?? "Account";
    }
  }

  if (!accountId) return [];

  const linkedIds = [accountId, householdId].filter(Boolean) as string[];
  if (linkedIds.length === 0) return [];

  const links = await conn.query<{
    ContentDocument: {
      Id: string;
      Title: string;
      ContentSize: number;
      CreatedDate: string;
      LatestPublishedVersionId: string;
      LatestPublishedVersion: { PathOnClient?: string; FileType?: string } | null;
    };
    LinkedEntityId: string;
  }>(
    `SELECT ContentDocument.Id, ContentDocument.Title, ContentDocument.ContentSize,
            ContentDocument.CreatedDate, ContentDocument.LatestPublishedVersionId,
            ContentDocument.LatestPublishedVersion.PathOnClient,
            ContentDocument.LatestPublishedVersion.FileType,
            LinkedEntityId
     FROM ContentDocumentLink
     WHERE LinkedEntityId IN ('${linkedIds.map(safeId).join("','")}')
     ORDER BY ContentDocument.CreatedDate DESC`
  );

  const seen = new Set<string>();
  const out: HouseholdDocument[] = [];
  for (const row of links.records) {
    const doc = row.ContentDocument;
    if (!doc || seen.has(doc.Id)) continue;
    seen.add(doc.Id);
    out.push({
      contentDocumentId: doc.Id,
      contentVersionId: doc.LatestPublishedVersionId,
      title: doc.Title,
      fileName: doc.LatestPublishedVersion?.PathOnClient ?? doc.Title,
      fileType: doc.LatestPublishedVersion?.FileType ?? "FILE",
      fileSize: doc.ContentSize ?? 0,
      createdDate: doc.CreatedDate,
      linkedEntityName: row.LinkedEntityId === accountId ? accountName : "Household",
    });
  }
  return out;
}

// ---------- PDF deposit ----------

/**
 * Upload a Case Design PDF to Salesforce as a ContentVersion + link to the
 * Opp, the Opp's Account, the Household, and the Case_Design record itself.
 * Returns the ContentVersion id + ContentDocument id; persist the CV id on
 * Case_Design__c.PDF_ContentVersion_Id__c.
 */
export async function uploadCaseDesignPDF(
  caseDesignId: string,
  pdfBuffer: Buffer,
  fileName: string
): Promise<{ contentVersionId: string; contentDocumentId: string }> {
  const conn = await getSFConnection();

  const cd = await conn.query<{ Account__c: string | null; Opportunity__c: string | null }>(
    `SELECT Account__c, Opportunity__c FROM Case_Design__c WHERE Id = '${safeId(caseDesignId)}' LIMIT 1`
  );
  if (cd.records.length === 0) throw new Error("Case Design not found");

  let accountId: string | null = cd.records[0].Account__c;
  let householdId: string | null = null;
  const oppId = cd.records[0].Opportunity__c;

  if (accountId) {
    const acc = await conn.query<{ Household__c: string | null }>(
      `SELECT Household__c FROM Account WHERE Id = '${safeId(accountId)}' LIMIT 1`
    );
    householdId = acc.records[0]?.Household__c ?? null;
  } else if (oppId) {
    const opp = await conn.query<{ AccountId: string; Account: { Household__c?: string } | null }>(
      `SELECT AccountId, Account.Household__c FROM Opportunity WHERE Id = '${safeId(oppId)}' LIMIT 1`
    );
    accountId = opp.records[0]?.AccountId ?? null;
    householdId = opp.records[0]?.Account?.Household__c ?? null;
  }

  const cv = await conn.sobject("ContentVersion").create({
    Title: fileName,
    PathOnClient: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`,
    VersionData: pdfBuffer.toString("base64"),
    Description: `Case Design — ${caseDesignId} — generated ${new Date().toISOString()}`,
    FirstPublishLocationId: caseDesignId,
  });
  if (!cv.success) throw new Error(`CV create failed: ${JSON.stringify(cv.errors)}`);
  const cvId = cv.id as string;
  const cvRow = (await conn.sobject("ContentVersion").retrieve(cvId)) as { ContentDocumentId?: string };
  const contentDocumentId = cvRow.ContentDocumentId as string;

  const targets = [oppId, accountId, householdId].filter(
    (x): x is string => typeof x === "string" && x.length > 0
  );
  for (const t of targets) {
    try {
      await conn.sobject("ContentDocumentLink").create({
        ContentDocumentId: contentDocumentId,
        LinkedEntityId: t,
        ShareType: "V",
        Visibility: "AllUsers",
      });
    } catch {
      // duplicate link is fine (e.g. FirstPublishLocationId already linked it)
    }
  }

  return { contentVersionId: cvId, contentDocumentId };
}

// ---------- Meeting 1 Intake Asset (source autocomplete) ----------

export interface MeetingIntakeAsset {
  Id: string;
  Name: string;
  Asset_Owner__c: string | null;
  Category__c: string | null;
  Company__c: string | null;
  Investment_Type__c: string | null;
  Tax_Status__c: string | null;
  Balance__c: number | null;
  Market_Value__c: number | null;
  Cash_Value__c: number | null;
  Death_Benefit__c: number | null;
}

export async function loadHouseholdAssets(caseDesignId: string): Promise<MeetingIntakeAsset[]> {
  const conn = await getSFConnection();
  const cd = await conn.query<{ Account__c: string | null; Opportunity__c: string | null }>(
    `SELECT Account__c, Opportunity__c FROM Case_Design__c WHERE Id = '${safeId(caseDesignId)}' LIMIT 1`
  );
  if (cd.records.length === 0) return [];

  let accountId: string | null = cd.records[0].Account__c;
  if (!accountId && cd.records[0].Opportunity__c) {
    const opp = await conn.query<{ AccountId: string }>(
      `SELECT AccountId FROM Opportunity WHERE Id = '${safeId(cd.records[0].Opportunity__c)}' LIMIT 1`
    );
    accountId = opp.records[0]?.AccountId ?? null;
  }
  if (!accountId) return [];

  // Meeting_1_Intake records are tied to Account; pull all their assets
  const intakes = await conn.query<{ Id: string }>(
    `SELECT Id FROM Meeting_1_Intake__c WHERE Account__c = '${safeId(accountId)}'`
  );
  if (intakes.records.length === 0) return [];
  const intakeIds = intakes.records.map((r) => `'${r.Id}'`).join(",");

  const assets = await conn.query<MeetingIntakeAsset>(
    `SELECT Id, Name, Asset_Owner__c, Category__c, Company__c, Investment_Type__c,
            Tax_Status__c, Balance__c, Market_Value__c, Cash_Value__c, Death_Benefit__c
     FROM Meeting_1_Intake_Asset__c
     WHERE Meeting_1_Intake__c IN (${intakeIds})
     ORDER BY Balance__c DESC NULLS LAST`
  );
  return assets.records;
}

// ---------- Auto-fill (Meeting 1 Intake OR Complete Opportunities) ----------

/**
 * A single auto-fill suggestion that maps cleanly onto a draft
 * Case_Design_Position__c (Role=Source). `origin` says where the row came
 * from so the UI can surface it in the success toast.
 */
export interface AutoFillSourceSuggestion {
  origin: "meeting1-intake" | "opportunity";
  external_id: string;
  Owner_Label__c: string;
  Account_Type__c: AccountType;
  Custodian__c: string;
  Product_Detail__c: string | null;
  Amount__c: number | null;
  Cash_Value__c: number | null;
  Death_Benefit__c: number | null;
  Source_Asset__c: string | null;
}

interface AutoFillResult {
  origin: "meeting1-intake" | "opportunity" | "none";
  sources: AutoFillSourceSuggestion[];
  household_account_id: string | null;
}

/**
 * Resolve the Case Design's household, then return a ranked list of source
 * suggestions. Meeting 1 Intake assets take priority when present; otherwise
 * we fall back to the household's Complete Opportunities so a household
 * without a Meeting 1 record still gets a useful starting canvas.
 */
export async function loadAutoFillSources(caseDesignId: string): Promise<AutoFillResult> {
  const conn = await getSFConnection();
  const cd = await conn.query<{ Account__c: string | null; Opportunity__c: string | null }>(
    `SELECT Account__c, Opportunity__c FROM Case_Design__c WHERE Id = '${safeId(caseDesignId)}' LIMIT 1`
  );
  if (cd.records.length === 0) return { origin: "none", sources: [], household_account_id: null };

  let accountId: string | null = cd.records[0].Account__c;
  if (!accountId && cd.records[0].Opportunity__c) {
    const opp = await conn.query<{ AccountId: string }>(
      `SELECT AccountId FROM Opportunity WHERE Id = '${safeId(cd.records[0].Opportunity__c)}' LIMIT 1`
    );
    accountId = opp.records[0]?.AccountId ?? null;
  }
  if (!accountId) return { origin: "none", sources: [], household_account_id: null };

  // Walk Account__c → Person Accounts under the household (covers spouse
  // accounts). The household ID itself may also own intake/opps directly.
  const personAccounts = await conn.query<{ Id: string; FirstName: string | null; LastName: string | null }>(
    `SELECT Id, FirstName, LastName FROM Account
     WHERE (Id = '${safeId(accountId)}' OR Household__c = '${safeId(accountId)}')
     AND IsPersonAccount = true`
  );
  const accountIdList = [
    accountId,
    ...personAccounts.records.map((p) => p.Id).filter((id) => id !== accountId),
  ];
  const accountInClause = accountIdList.map((id) => `'${safeId(id)}'`).join(",");
  // Quick lookup: Account Id → FirstName for owner-label resolution.
  const firstNameByAcct = new Map<string, string>();
  for (const p of personAccounts.records) {
    if (p.FirstName) firstNameByAcct.set(p.Id, p.FirstName);
  }

  // --- 1) Meeting 1 Intake (preferred) ---
  const intakes = await conn.query<{ Id: string }>(
    `SELECT Id FROM Meeting_1_Intake__c WHERE Account__c IN (${accountInClause})`
  );
  if (intakes.records.length > 0) {
    const intakeIds = intakes.records.map((r) => `'${r.Id}'`).join(",");
    const assets = await conn.query<MeetingIntakeAsset>(
      `SELECT Id, Name, Asset_Owner__c, Category__c, Company__c, Investment_Type__c,
              Tax_Status__c, Balance__c, Market_Value__c, Cash_Value__c, Death_Benefit__c
       FROM Meeting_1_Intake_Asset__c
       WHERE Meeting_1_Intake__c IN (${intakeIds})
       ORDER BY Balance__c DESC NULLS LAST`
    );
    if (assets.records.length > 0) {
      return {
        origin: "meeting1-intake",
        household_account_id: accountId,
        sources: assets.records.map((a) => ({
          origin: "meeting1-intake" as const,
          external_id: a.Id,
          Owner_Label__c: a.Asset_Owner__c?.trim() || "Client",
          Account_Type__c: inferAccountTypeFromIntake(a),
          Custodian__c: a.Company__c?.trim() || "—",
          Product_Detail__c: a.Investment_Type__c ?? null,
          Amount__c: a.Balance__c ?? a.Market_Value__c ?? null,
          Cash_Value__c: a.Cash_Value__c ?? null,
          Death_Benefit__c: a.Death_Benefit__c ?? null,
          Source_Asset__c: a.Id,
        })),
      };
    }
  }

  // --- 2) Fallback: Complete Opportunities on the household ---
  // `Source_Case_Design__c = null` excludes Opps already created BY a Case
  // Design — those would loop us. `StageName = 'Complete'` keeps it to funded
  // accounts (real current portfolio), not in-pipeline prospects.
  const opps = await conn.query<{
    Id: string;
    Name: string;
    AccountId: string;
    Account: { FirstName: string | null; LastName: string | null; Name: string } | null;
    Amount: number | null;
    RecordType: { Name: string } | null;
  }>(
    `SELECT Id, Name, AccountId, Account.FirstName, Account.LastName, Account.Name,
            Amount, RecordType.Name
     FROM Opportunity
     WHERE AccountId IN (${accountInClause})
       AND StageName = 'Complete'
       AND Source_Case_Design__c = null
     ORDER BY Amount DESC NULLS LAST
     LIMIT 40`
  );
  if (opps.records.length === 0) {
    return { origin: "none", sources: [], household_account_id: accountId };
  }

  return {
    origin: "opportunity",
    household_account_id: accountId,
    sources: opps.records.map((o) => {
      const ownerFirst =
        o.Account?.FirstName?.trim() ||
        firstNameByAcct.get(o.AccountId) ||
        (o.Account?.Name?.split(" ")[0] ?? "Client");
      const parsed = parseOpportunityName(o.Name ?? "", o.RecordType?.Name ?? "");
      return {
        origin: "opportunity" as const,
        external_id: o.Id,
        Owner_Label__c: ownerFirst,
        Account_Type__c: parsed.account_type,
        Custodian__c: parsed.custodian,
        Product_Detail__c: parsed.product_detail,
        Amount__c: o.Amount,
        Cash_Value__c: null,
        Death_Benefit__c: null,
        Source_Asset__c: null,
      };
    }),
  };
}

/**
 * Bulk-create Source positions from auto-fill suggestions. Idempotent at the
 * caller level — the route handler refuses to fill a Case Design that already
 * has positions, so this is safe to call without checking inside.
 */
export async function bulkCreateSourcePositions(
  caseDesignId: string,
  suggestions: AutoFillSourceSuggestion[],
): Promise<string[]> {
  const conn = await getSFConnection();
  const cdId = safeId(caseDesignId);
  const ids: string[] = [];
  for (const s of suggestions) {
    const rec: Partial<CaseDesignPosition> & { Case_Design__c: string } = {
      Case_Design__c: cdId,
      Role__c: "Source",
      Owner_Label__c: s.Owner_Label__c,
      Account_Type__c: s.Account_Type__c,
      Custodian__c: s.Custodian__c,
      Product_Detail__c: s.Product_Detail__c,
      Amount__c: s.Amount__c,
      Cash_Value__c: s.Cash_Value__c,
      Death_Benefit__c: s.Death_Benefit__c,
      Source_Asset__c: s.Source_Asset__c,
    };
    const res = await conn.sobject("Case_Design_Position__c").create(rec as Record<string, unknown>);
    if (!("success" in res) || !res.success) {
      throw new Error(`Auto-fill: failed to create position: ${JSON.stringify(res)}`);
    }
    ids.push(res.id as string);
  }
  return ids;
}

/* ---------------- Auto-fill helpers ---------------- */

function inferAccountTypeFromIntake(a: MeetingIntakeAsset): AccountType {
  const t = (a.Investment_Type__c || a.Category__c || "").toLowerCase();
  if (t.includes("roth ira")) return "Roth IRA";
  if (t.includes("roth")) return "Roth";
  if (t.includes("inherited")) return "Inherited IRA";
  if (t.includes("simple ira")) return "Simple IRA";
  if (t.includes("sep")) return "SEP IRA";
  if (t.includes("ira")) return "IRA";
  if (t.includes("401")) return "401k";
  if (t.includes("403")) return "403b";
  if (t.includes("hsa")) return "HSA";
  if (t.includes("whole life")) return "Whole Life";
  if (t.includes("iul")) return "IUL";
  if (t.includes("variable annuity")) return "Variable Annuity";
  if (t.includes("fixed indexed") || t.includes("fia")) return "Fixed Indexed Annuity";
  if (t.includes("savings")) return "Bank Savings";
  if (t.includes("cash")) return "Cash";
  if (t.includes("crypto")) return "Crypto";
  return "Other";
}

/**
 * CW Opportunities are conventionally named "<First> <Last> <descriptor>" —
 * e.g. "John Porter FIA IRA", "Cristi Porter NQ Brokerage". This parses the
 * descriptor into a draft Account_Type__c + Custodian__c. The advisor still
 * confirms in the edit panel, but a structured starting point beats blank.
 */
function parseOpportunityName(name: string, recordTypeName: string): {
  account_type: AccountType;
  custodian: string;
  product_detail: string | null;
} {
  const n = name || "";

  // Account type — order matters; check specific tokens before general ones.
  let account_type: AccountType = "IRA";
  if (/\binherited\s+ira\b/i.test(n)) account_type = "Inherited IRA";
  else if (/\broth\s+ira\b/i.test(n)) account_type = "Roth IRA";
  else if (/\broth\s+403b\b/i.test(n)) account_type = "Roth 403b";
  else if (/\bsimple\s+ira\b/i.test(n)) account_type = "Simple IRA";
  else if (/\bsep\s+ira\b/i.test(n)) account_type = "SEP IRA";
  else if (/\bnq-?tod\b/i.test(n)) account_type = "NQ-TOD";
  else if (/\btrust\s+nq\b/i.test(n)) account_type = "Trust NQ";
  else if (/\biul\b/i.test(n)) account_type = "IUL";
  else if (/\bwhole\s+life\b/i.test(n)) account_type = "Whole Life";
  else if (/\bvariable\s+annuity\b/i.test(n)) account_type = "Variable Annuity";
  else if (/\b(fia|fixed\s+indexed)\b/i.test(n) && recordTypeName === "Annuity")
    account_type = "Fixed Indexed Annuity";
  else if (/\b401k\b/i.test(n)) account_type = "401k";
  else if (/\b403b\b/i.test(n)) account_type = "403b";
  else if (/\bhsa\b/i.test(n)) account_type = "HSA";
  else if (/\broth\b/i.test(n)) account_type = "Roth";
  else if (/\b(nq|brokerage)\b/i.test(n)) account_type = "NQ";
  else if (/\bira\b/i.test(n)) account_type = "IRA";
  else if (recordTypeName === "Annuity") account_type = "Fixed Indexed Annuity";
  else if (recordTypeName === "Life") account_type = "IUL";

  // Custodian — well-known carriers in the CW pipeline.
  const carriers: Array<[RegExp, string]> = [
    [/\ballianz\b/i, "Allianz"],
    [/\bmidland\b/i, "Midland National"],
    [/\bathene\b/i, "Athene"],
    [/\bf\s*&\s*g\b/i, "F&G"],
    [/\bnationwide\b/i, "Nationwide"],
    [/\bnorth\s+american\b/i, "North American"],
    [/\bamerican\s+equity\b/i, "American Equity"],
    [/\bsymetra\b/i, "Symetra"],
    [/\bglobal\s+atlantic\b/i, "Global Atlantic"],
    [/\bfidelity\b/i, "Fidelity"],
    [/\b(charles\s+)?schwab\b/i, "Charles Schwab"],
    [/\bvanguard\b/i, "Vanguard"],
    [/\bpershing\b/i, "Pershing"],
    [/\bassetmark\b/i, "AssetMark"],
    [/\btrust\s*company\s*of\s*america\b/i, "TCA"],
  ];
  let custodian = "—";
  for (const [rx, label] of carriers) {
    if (rx.test(n)) {
      custodian = label;
      break;
    }
  }
  if (custodian === "—" && recordTypeName === "AUM") custodian = "AssetMark";

  return {
    account_type,
    custodian,
    product_detail: n.trim() || null,
  };
}

// ---------- Suggested destinations + consolidation edges ----------

/**
 * Group the existing Source positions on a Case Design by Owner + tax bucket
 * and create one consolidated Destination + a fan-in of edges for each
 * consolidation group. This is the "tell me the story" pass — the advisor
 * opens the builder and immediately sees:
 *   - Johnathan's 4 Retirement accts → one "Johnathan FIA IRA" target,
 *     four Rollover arrows.
 *   - Johnathan's 4 Roths → one Roth IRA target, four Rollover arrows.
 *   - Johnathan's NQ → one NQ Brokerage target, TOA arrow.
 *   - Cristi's 2 Roths → one Roth IRA target, two Rollover arrows.
 * Existing Annuities (Allianz etc.) and Life Insurance policies are left
 * standalone (no destination, no edge) — those typically stay in place.
 *
 * Idempotent: refuses to run if any destinations or edges already exist.
 */
type ConsolidationKind = "Retirement" | "Roth" | "Non-Qualified";

interface ConsolidationPlan {
  owner: string;
  kind: ConsolidationKind;
  sourceIds: string[];
  totalAmount: number;
  destinationTemplate: {
    Owner_Label__c: string;
    Account_Type__c: AccountType;
    Custodian__c: string;
    Product_Detail__c: string;
    Amount__c: number;
  };
  edgeMethod: "Rollover" | "TOA";
}

interface SuggestionResult {
  status: "ok" | "skipped-existing" | "skipped-no-sources";
  destinationsCreated: number;
  edgesCreated: number;
  groups: number;
}

export async function suggestDestinationsAndEdges(
  caseDesignId: string,
): Promise<SuggestionResult> {
  const bundle = await loadCaseDesign(caseDesignId);
  if (!bundle) throw new Error("Case Design not found");
  if (bundle.parent.Status__c !== "Draft") {
    throw new Error(
      `Suggest only runs on Draft Case Designs (status: ${bundle.parent.Status__c})`,
    );
  }

  const sources = bundle.positions.filter((p) => p.Role__c === "Source");
  if (sources.length === 0) {
    return {
      status: "skipped-no-sources",
      destinationsCreated: 0,
      edgesCreated: 0,
      groups: 0,
    };
  }
  const existingDestinations = bundle.positions.filter(
    (p) => p.Role__c === "Destination",
  );
  if (existingDestinations.length > 0 || bundle.edges.length > 0) {
    return {
      status: "skipped-existing",
      destinationsCreated: 0,
      edgesCreated: 0,
      groups: 0,
    };
  }

  // --- Build the consolidation plan ----------------------------------------
  // Owner → Kind → source positions
  const grouped = new Map<string, Map<ConsolidationKind, CaseDesignPosition[]>>();
  for (const p of sources) {
    const owner = (p.Owner_Label__c || "Client").trim() || "Client";
    const kind = consolidationKindFor(bucketOf(p.Account_Type__c));
    if (!kind) continue; // Annuities / Life / Cash / Other — left standalone
    if (!grouped.has(owner)) grouped.set(owner, new Map());
    const byKind = grouped.get(owner)!;
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind)!.push(p);
  }

  const plans: ConsolidationPlan[] = [];
  for (const [owner, byKind] of grouped.entries()) {
    for (const [kind, items] of byKind.entries()) {
      if (items.length === 0) continue;
      const total = items.reduce(
        (s, p) => s + (p.Amount__c ?? p.Account_Value__c ?? 0),
        0,
      );
      const template = destinationTemplateFor(owner, kind, total);
      const edgeMethod = kind === "Non-Qualified" ? "TOA" : "Rollover";
      plans.push({
        owner,
        kind,
        sourceIds: items.map((p) => p.Id),
        totalAmount: total,
        destinationTemplate: template,
        edgeMethod,
      });
    }
  }

  if (plans.length === 0) {
    return {
      status: "ok",
      destinationsCreated: 0,
      edgesCreated: 0,
      groups: 0,
    };
  }

  // --- Create destinations + edges in SF ----------------------------------
  const conn = await getSFConnection();
  const cdId = safeId(caseDesignId);

  let destinationsCreated = 0;
  let edgesCreated = 0;
  for (const plan of plans) {
    const destBody: Partial<CaseDesignPosition> & { Case_Design__c: string } = {
      Case_Design__c: cdId,
      Role__c: "Destination",
      Owner_Label__c: plan.destinationTemplate.Owner_Label__c,
      Account_Type__c: plan.destinationTemplate.Account_Type__c,
      Custodian__c: plan.destinationTemplate.Custodian__c,
      Product_Detail__c: plan.destinationTemplate.Product_Detail__c,
      Amount__c: plan.destinationTemplate.Amount__c,
    };
    const destRes = await conn
      .sobject("Case_Design_Position__c")
      .create(destBody as Record<string, unknown>);
    if (!("success" in destRes) || !destRes.success) {
      throw new Error(
        `Suggest: failed to create destination: ${JSON.stringify(destRes)}`,
      );
    }
    const destinationId = destRes.id as string;
    destinationsCreated += 1;

    for (const sourceId of plan.sourceIds) {
      const edgeBody: Partial<CaseDesignEdge> & { Case_Design__c: string } = {
        Case_Design__c: cdId,
        From_Position__c: sourceId,
        To_Position__c: destinationId,
        Method__c: plan.edgeMethod,
        Status__c: "Planned",
      };
      const edgeRes = await conn
        .sobject("Case_Design_Edge__c")
        .create(edgeBody as Record<string, unknown>);
      if (!("success" in edgeRes) || !edgeRes.success) {
        throw new Error(
          `Suggest: failed to create edge: ${JSON.stringify(edgeRes)}`,
        );
      }
      edgesCreated += 1;
    }
  }

  return {
    status: "ok",
    destinationsCreated,
    edgesCreated,
    groups: plans.length,
  };
}

function consolidationKindFor(b: Bucket): ConsolidationKind | null {
  if (b === "Retirement") return "Retirement";
  if (b === "Roth") return "Roth";
  if (b === "Non-Qualified") return "Non-Qualified";
  return null;
}

function destinationTemplateFor(
  owner: string,
  kind: ConsolidationKind,
  total: number,
): ConsolidationPlan["destinationTemplate"] {
  switch (kind) {
    case "Retirement":
      return {
        Owner_Label__c: owner,
        Account_Type__c: "Fixed Indexed Annuity",
        Custodian__c: "AssetMark",
        Product_Detail__c: `${owner} FIA IRA — Consolidation`,
        Amount__c: total,
      };
    case "Roth":
      return {
        Owner_Label__c: owner,
        Account_Type__c: "Roth IRA",
        Custodian__c: "AssetMark",
        Product_Detail__c: `${owner} Roth IRA — Consolidation`,
        Amount__c: total,
      };
    case "Non-Qualified":
      return {
        Owner_Label__c: owner,
        Account_Type__c: "NQ",
        Custodian__c: "AssetMark",
        Product_Detail__c: `${owner} NQ Brokerage — Consolidation`,
        Amount__c: total,
      };
  }
}
