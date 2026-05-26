/**
 * Case Design — Position CRUD endpoints.
 * POST creates a Case_Design_Position__c under the parent Case Design Id from the route.
 * PATCH/DELETE require an `id` in the body and never accept Case_Design__c reassignment.
 * Fields are allowlisted to the builder-safe subset of CaseDesignPosition.
 */
import type { NextRequest } from "next/server";
import { positions } from "@/lib/case-design/sf-client";
import type { CaseDesignPosition } from "@/lib/case-design/types";

const ALLOWED: (keyof CaseDesignPosition)[] = [
  "Section__c",
  "Role__c",
  "Stage__c",
  "Source_Asset__c",
  "Source_Vault_Document_Id__c",
  "Source_Vault_Document_Name__c",
  "Owner_Label__c",
  "Account_Type__c",
  "Account_Type_Other__c",
  "Custodian__c",
  "Product_Detail__c",
  "Account_Number_Last4__c",
  "Inception_Date_Text__c",
  "Amount__c",
  "Account_Value__c",
  "Surrender_Value__c",
  "Cash_Value__c",
  "Death_Benefit__c",
  "Annual_Fee_Pct__c",
  "Annual_Fee_Display__c",
  "Fee_Is_Approximate__c",
  "Contribution_Note__c",
  "Position_X__c",
  "Position_Y__c",
  "Replaces_Position__c",
];

function pick(body: Partial<CaseDesignPosition>): Partial<CaseDesignPosition> {
  const safe: Partial<CaseDesignPosition> = {};
  for (const k of ALLOWED) {
    if (k in body) (safe as Record<string, unknown>)[k] = body[k] as unknown;
  }
  return safe;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<CaseDesignPosition>;
  const safe = pick(body);
  try {
    const newId = await positions.create(id, safe);
    return Response.json({ id: newId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create position";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const body = (await req.json()) as Partial<CaseDesignPosition> & { id?: string };
  if (!body.id) {
    return Response.json({ error: "Missing 'id' in body" }, { status: 400 });
  }
  if ("Case_Design__c" in body) {
    return Response.json({ error: "Case_Design__c may not be updated" }, { status: 400 });
  }
  const safe = pick(body);
  try {
    await positions.update(body.id, safe);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update position";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const body = (await req.json()) as { id?: string };
  if (!body.id) {
    return Response.json({ error: "Missing 'id' in body" }, { status: 400 });
  }
  try {
    await positions.remove(body.id);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete position";
    return Response.json({ error: msg }, { status: 500 });
  }
}
