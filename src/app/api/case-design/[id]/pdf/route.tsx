/**
 * POST /api/case-design/[id]/pdf — render the Case Design to a PDF on demand.
 *
 * Returns application/pdf bytes. The Generate PDF button in the builder calls
 * this and triggers a browser download. Does NOT upload to Salesforce or
 * change Status; that's the finalize route's job.
 */

import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { loadCaseDesign } from "@/lib/case-design/sf-client";
import { getSFConnection } from "@/lib/salesforce/connector";
import { CaseDesignPDF } from "@/lib/case-design/pdf";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const bundle = await loadCaseDesign(id);
    if (!bundle) return Response.json({ error: "Case Design not found" }, { status: 404 });

    const householdLabel = await resolveHouseholdLabel(
      bundle.parent.Account__c,
      bundle.parent.Opportunity__c
    );

    const buffer = await renderToBuffer(<CaseDesignPDF bundle={bundle} householdLabel={householdLabel} />);
    const fileName = `${householdLabel.replace(/[^A-Za-z0-9 &-]/g, "_")} ${bundle.parent.Document_Title__c || "Money Map"}.pdf`;

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${fileName}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF generation failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

async function resolveHouseholdLabel(
  accountId: string | null,
  oppId: string | null
): Promise<string> {
  try {
    const conn = await getSFConnection();
    if (accountId) {
      const r = await conn.query<{ Name: string }>(
        `SELECT Name FROM Account WHERE Id = '${accountId}' LIMIT 1`
      );
      if (r.records[0]?.Name) return r.records[0].Name;
    }
    if (oppId) {
      const r = await conn.query<{ Name: string; Account: { Name?: string } | null }>(
        `SELECT Name, Account.Name FROM Opportunity WHERE Id = '${oppId}' LIMIT 1`
      );
      return r.records[0]?.Account?.Name || r.records[0]?.Name || "Client";
    }
  } catch {
    // fall through
  }
  return "Client";
}
