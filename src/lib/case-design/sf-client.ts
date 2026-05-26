/**
 * Case Design Salesforce client — full CRUD on the parent + 4 child objects,
 * plus household-document discovery (via ContentDocumentLink on the Opp's
 * Account + Household) and PDF deposit (ContentVersion + multi-link).
 *
 * Uses the shared connector at @/lib/salesforce/connector for OAuth.
 */

import { getSFConnection } from "@/lib/salesforce/connector";
import type {
  CaseDesignBundle,
  CaseDesignParent,
  CaseDesignSection,
  CaseDesignPosition,
  CaseDesignEdge,
  CaseDesignAnnotation,
} from "./types";

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
  "Id", "Name", "Account__c", "Opportunity__c", "Status__c", "Plan_Date__c", "Document_Title__c",
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
  return {
    parent: parentRows.records[0],
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
