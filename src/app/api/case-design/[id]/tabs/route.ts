/**
 * Case Design — Tab CRUD endpoints.
 * POST creates a Case_Design_Tab__c under the parent Case Design Id from the route.
 * PATCH/DELETE require an `id` in the body and never accept Case_Design__c reassignment.
 * Fields are allowlisted to the builder-safe subset of CaseDesignTab.
 */
import type { NextRequest } from "next/server";
import { tabs } from "@/lib/case-design/sf-client";
import type { CaseDesignTab } from "@/lib/case-design/types";

const ALLOWED: (keyof CaseDesignTab)[] = [
  "Label__c",
  "Tab_Date__c",
  "Page_Number__c",
  "Sort_Order__c",
];

function pick(body: Partial<CaseDesignTab>): Partial<CaseDesignTab> {
  const safe: Partial<CaseDesignTab> = {};
  for (const k of ALLOWED) {
    if (k in body) (safe as Record<string, unknown>)[k] = body[k] as unknown;
  }
  return safe;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<CaseDesignTab>;
  const safe = pick(body);
  // Label__c is required=true on Case_Design_Tab__c; seed a placeholder so an
  // empty value never reaches SF as REQUIRED_FIELD_MISSING.
  const label = typeof safe.Label__c === "string" ? safe.Label__c.trim() : "";
  if (!label) safe.Label__c = "New Tab";
  try {
    const newId = await tabs.create(id, safe);
    return Response.json({ id: newId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create tab";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const body = (await req.json()) as Partial<CaseDesignTab> & { id?: string };
  if (!body.id) {
    return Response.json({ error: "Missing 'id' in body" }, { status: 400 });
  }
  if ("Case_Design__c" in body) {
    return Response.json({ error: "Case_Design__c may not be updated" }, { status: 400 });
  }
  const safe = pick(body);
  try {
    await tabs.update(body.id, safe);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update tab";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const body = (await req.json()) as { id?: string };
  if (!body.id) {
    return Response.json({ error: "Missing 'id' in body" }, { status: 400 });
  }
  try {
    await tabs.remove(body.id);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete tab";
    return Response.json({ error: msg }, { status: 500 });
  }
}
