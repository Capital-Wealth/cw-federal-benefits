import type { NextRequest } from "next/server";
import { loadCaseDesign, updateCaseDesignParent } from "@/lib/case-design/sf-client";
import type { CaseDesignParent } from "@/lib/case-design/types";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bundle = await loadCaseDesign(id);
  if (!bundle) {
    return Response.json({ error: "Case Design not found" }, { status: 404 });
  }
  return Response.json(bundle);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const patch = (await req.json()) as Partial<CaseDesignParent>;

  // Allowlist the fields a builder client is permitted to update on the parent.
  const allowed: (keyof CaseDesignParent)[] = [
    "Status__c",
    "Plan_Date__c",
    "Document_Title__c",
    "Plan_Type__c",
    "Notes__c",
    "PDF_ContentVersion_Id__c",
    "PDF_Vault_Document_Id__c",
    "Finalized_At__c",
    "Presented_At__c",
    "Locked_At__c",
  ];
  const safe: Partial<CaseDesignParent> = {};
  for (const k of allowed) {
    if (k in patch) (safe as Record<string, unknown>)[k] = patch[k] as unknown;
  }

  await updateCaseDesignParent(id, safe);
  return Response.json({ ok: true });
}
