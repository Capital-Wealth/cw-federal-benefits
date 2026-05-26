/**
 * POST /api/case-design/[id]/confirm
 *
 * "Confirm & Create Opportunities" — the terminal action.
 *
 * For each Destination position in the Case Design, creates a NEW Opportunity
 * record on the same Account. Each child Opp's record type is derived from
 * the destination's Account_Type (FIA/VA → Annuity, IUL/Whole Life → Life,
 * everything else → AUM). All child Opps point back to the parent
 * Case_Design__c via Opportunity.Source_Case_Design__c.
 *
 * Also: renders the final PDF, uploads it as ContentVersion (multi-linked to
 * Case Design + parent Opp + Account + Household), stamps the parent Opp's
 * Stage_Date_Stamp_Case_Design__c, and locks the Case Design (Status=Locked,
 * Locked_At=now, Finalized_At=now if not already set).
 */

import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  loadCaseDesign,
  updateCaseDesignParent,
  uploadCaseDesignPDF,
} from "@/lib/case-design/sf-client";
import { getSFConnection } from "@/lib/salesforce/connector";
import { CaseDesignPDF } from "@/lib/case-design/pdf";
import type { AccountType, CaseDesignPosition } from "@/lib/case-design/types";

const OPP_RT_ANNUITY = "012Dm000000xClCIAU";
const OPP_RT_LIFE = "012Dm000000xE9gIAE";
const OPP_RT_AUM = "012Dm000000xE9qIAE";

function recordTypeFor(accountType: AccountType): string {
  if (accountType === "Fixed Indexed Annuity" || accountType === "Variable Annuity") {
    return OPP_RT_ANNUITY;
  }
  if (
    accountType === "IUL" ||
    accountType === "Whole Life" ||
    accountType === "Whole Life (Paid Up)"
  ) {
    return OPP_RT_LIFE;
  }
  return OPP_RT_AUM;
}

function opportunityNameFor(p: CaseDesignPosition): string {
  const acctLabel =
    p.Account_Type__c === "Other" && p.Account_Type_Other__c
      ? p.Account_Type_Other__c
      : p.Account_Type__c;
  const productOrAccount = p.Product_Detail__c || acctLabel;
  const parts = [p.Owner_Label__c, p.Custodian__c, productOrAccount].filter(Boolean);
  return parts.join(" ").slice(0, 120);
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    const bundle = await loadCaseDesign(id);
    if (!bundle) return Response.json({ error: "Case Design not found" }, { status: 404 });
    if (bundle.parent.Status__c === "Locked") {
      return Response.json({ error: "Case Design is already locked" }, { status: 400 });
    }

    const destinations = bundle.positions.filter((p) => p.Role__c === "Destination");
    const sources = bundle.positions.filter((p) => p.Role__c === "Source");
    const planTypes = (bundle.parent.Plan_Type__c || "").split(";").filter(Boolean);
    const isLpoaOnly = planTypes.length > 0 && planTypes.every((pt) => pt === "LPOA");

    if (sources.length === 0) {
      return Response.json(
        { error: "Add at least one source account before confirming." },
        { status: 400 }
      );
    }
    if (destinations.length === 0 && !isLpoaOnly) {
      return Response.json(
        {
          error:
            "Add at least one destination, or set Plan Type to LPOA only for an in-place engagement.",
        },
        { status: 400 }
      );
    }

    const conn = await getSFConnection();

    // Resolve the Account context. Account-started Case Designs have Account__c
    // set directly; legacy Opp-started ones fall back to the Opp's AccountId.
    let accountId: string | null = bundle.parent.Account__c;
    let ownerId: string | null = null;
    let leadSource: string | null = null;
    let householdLabel = "Client";
    let stageAlreadyStamped: string | null = null;

    if (accountId) {
      const accRows = await conn.query<{ Name: string; OwnerId: string }>(
        `SELECT Name, OwnerId FROM Account WHERE Id = '${accountId}' LIMIT 1`
      );
      if (accRows.records.length === 0) {
        return Response.json({ error: "Account not found" }, { status: 404 });
      }
      householdLabel = accRows.records[0].Name;
      ownerId = accRows.records[0].OwnerId;
    }

    if (bundle.parent.Opportunity__c) {
      const oppRows = await conn.query<{
        Id: string;
        Name: string;
        AccountId: string;
        OwnerId: string;
        LeadSource: string | null;
        Account: { Name?: string; Household__c?: string } | null;
        Stage_Date_Stamp_Case_Design__c: string | null;
      }>(
        `SELECT Id, Name, AccountId, OwnerId, LeadSource, Account.Name, Account.Household__c,
                Stage_Date_Stamp_Case_Design__c
         FROM Opportunity WHERE Id = '${bundle.parent.Opportunity__c}' LIMIT 1`
      );
      if (oppRows.records.length > 0) {
        const parentOpp = oppRows.records[0];
        if (!accountId) accountId = parentOpp.AccountId;
        if (!ownerId) ownerId = parentOpp.OwnerId;
        leadSource = parentOpp.LeadSource;
        if (!bundle.parent.Account__c) {
          householdLabel = parentOpp.Account?.Name || parentOpp.Name || householdLabel;
        }
        stageAlreadyStamped = parentOpp.Stage_Date_Stamp_Case_Design__c;
      }
    }

    if (!accountId) {
      return Response.json(
        { error: "Case Design has no Account or Opportunity — cannot create child Opps." },
        { status: 400 }
      );
    }

    const createdOpps: { destinationId: string; opportunityId: string; name: string }[] = [];
    const closeDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    for (const d of destinations) {
      const oppPayload: Record<string, unknown> = {
        Name: opportunityNameFor(d),
        AccountId: accountId,
        StageName: "Opportunity",
        CloseDate: closeDate,
        Amount: d.Amount__c ?? null,
        RecordTypeId: recordTypeFor(d.Account_Type__c),
        Source_Case_Design__c: id,
      };
      if (ownerId) oppPayload.OwnerId = ownerId;
      if (leadSource) oppPayload.LeadSource = leadSource;

      const oppRes = await conn.sobject("Opportunity").create(oppPayload);
      if (!("success" in oppRes) || !oppRes.success) {
        throw new Error(
          `Failed to create Opportunity for destination ${d.Name}: ${JSON.stringify(oppRes)}`
        );
      }
      createdOpps.push({
        destinationId: d.Id,
        opportunityId: oppRes.id as string,
        name: oppPayload.Name as string,
      });
    }

    const pdfBuffer = await renderToBuffer(
      <CaseDesignPDF bundle={bundle} householdLabel={householdLabel} />
    );
    const fileName = `${householdLabel.replace(/[^A-Za-z0-9 &-]/g, "_")} ${
      bundle.parent.Document_Title__c || "Money Map"
    } ${new Date().toISOString().slice(0, 10)}`;
    const upload = await uploadCaseDesignPDF(id, pdfBuffer as Buffer, fileName);

    const now = new Date().toISOString();
    await updateCaseDesignParent(id, {
      Status__c: "Locked",
      Locked_At__c: now,
      Finalized_At__c: bundle.parent.Finalized_At__c ?? now,
      PDF_ContentVersion_Id__c: upload.contentVersionId,
    });

    if (bundle.parent.Opportunity__c && !stageAlreadyStamped) {
      try {
        await conn.sobject("Opportunity").update({
          Id: bundle.parent.Opportunity__c,
          Stage_Date_Stamp_Case_Design__c: new Date().toISOString().slice(0, 10),
        });
      } catch {
        // non-fatal
      }
    }

    return Response.json({
      ok: true,
      contentVersionId: upload.contentVersionId,
      contentDocumentId: upload.contentDocumentId,
      childOpportunities: createdOpps,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Confirm failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
