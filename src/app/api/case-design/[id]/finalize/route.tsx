/**
 * POST /api/case-design/[id]/finalize
 *
 * Orchestrates: render PDF → upload as ContentVersion (multi-linked to
 * Case Design + Opp + Account + Household) → stamp Status__c='Finalized',
 * Finalized_At__c, PDF_ContentVersion_Id__c → stamp the Opp's
 * Stage_Date_Stamp_Case_Design__c if not already set.
 *
 * Does NOT change Opportunity.StageName — that's a manual advisor step
 * (each RT process has different downstream stages and CW doesn't want
 * automated jumps on this transition).
 */

import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { loadCaseDesign, updateCaseDesignParent, uploadCaseDesignPDF } from "@/lib/case-design/sf-client";
import { getSFConnection } from "@/lib/salesforce/connector";
import { CaseDesignPDF } from "@/lib/case-design/pdf";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    const bundle = await loadCaseDesign(id);
    if (!bundle) return Response.json({ error: "Case Design not found" }, { status: 404 });
    if (bundle.parent.Status__c === "Locked") {
      return Response.json({ error: "Case Design is already locked" }, { status: 400 });
    }

    // Minimum-viable validation: at least one source and one destination
    const sources = bundle.positions.filter((p) => p.Role__c === "Source");
    const destinations = bundle.positions.filter((p) => p.Role__c === "Destination");
    if (sources.length === 0) {
      return Response.json({ error: "Add at least one source account before finalizing." }, { status: 400 });
    }
    if (destinations.length === 0 && bundle.parent.Plan_Type__c?.includes("LPOA") !== true) {
      return Response.json({
        error: "Add at least one destination account, or set Plan Type to LPOA for an in-place engagement.",
      }, { status: 400 });
    }

    const conn = await getSFConnection();
    const opp = await conn.query<{ Name: string; Account: { Name?: string } | null; Stage_Date_Stamp_Case_Design__c: string | null }>(
      `SELECT Name, Account.Name, Stage_Date_Stamp_Case_Design__c
       FROM Opportunity WHERE Id = '${bundle.parent.Opportunity__c}' LIMIT 1`
    );
    const householdLabel = opp.records[0]?.Account?.Name || opp.records[0]?.Name || "Client";
    const stageAlreadyStamped = opp.records[0]?.Stage_Date_Stamp_Case_Design__c;

    const pdfBuffer = await renderToBuffer(<CaseDesignPDF bundle={bundle} householdLabel={householdLabel} />);
    const fileName = `${householdLabel.replace(/[^A-Za-z0-9 &-]/g, "_")} ${bundle.parent.Document_Title__c || "Money Map"} ${new Date().toISOString().slice(0, 10)}`;

    const upload = await uploadCaseDesignPDF(id, pdfBuffer as Buffer, fileName);

    await updateCaseDesignParent(id, {
      Status__c: "Finalized",
      Finalized_At__c: new Date().toISOString(),
      PDF_ContentVersion_Id__c: upload.contentVersionId,
    });

    if (!stageAlreadyStamped) {
      try {
        await conn.sobject("Opportunity").update({
          Id: bundle.parent.Opportunity__c,
          Stage_Date_Stamp_Case_Design__c: new Date().toISOString().slice(0, 10),
        });
      } catch {
        // non-fatal; advisor can still advance the stage manually
      }
    }

    return Response.json({
      ok: true,
      contentVersionId: upload.contentVersionId,
      contentDocumentId: upload.contentDocumentId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Finalize failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
