/**
 * Case Design — Section CRUD endpoints.
 * POST creates a Case_Design_Section__c under the parent Case Design Id from the route.
 * PATCH/DELETE require an `id` in the body and never accept Case_Design__c reassignment.
 * Fields are allowlisted to the builder-safe subset of CaseDesignSection.
 */
import type { NextRequest } from "next/server";
import { sections } from "@/lib/case-design/sf-client";
import type { CaseDesignSection } from "@/lib/case-design/types";

const CREATE_ALLOWED: (keyof CaseDesignSection)[] = [
  "Label__c",
  "Section_Type__c",
  "Page_Number__c",
  "Sort_Order__c",
  "Style__c",
];

const UPDATE_ALLOWED: (keyof CaseDesignSection)[] = [
  "Label__c",
  "Section_Type__c",
  "Page_Number__c",
  "Sort_Order__c",
  "Style__c",
];

function pick(
  body: Partial<CaseDesignSection>,
  allowed: (keyof CaseDesignSection)[]
): Partial<CaseDesignSection> {
  const safe: Partial<CaseDesignSection> = {};
  for (const k of allowed) {
    if (k in body) (safe as Record<string, unknown>)[k] = body[k] as unknown;
  }
  return safe;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<CaseDesignSection>;
  const safe = pick(body, CREATE_ALLOWED);
  try {
    const newId = await sections.create(id, safe);
    return Response.json({ id: newId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create section";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const body = (await req.json()) as Partial<CaseDesignSection> & { id?: string };
  if (!body.id) {
    return Response.json({ error: "Missing 'id' in body" }, { status: 400 });
  }
  if ("Case_Design__c" in body) {
    return Response.json({ error: "Case_Design__c may not be updated" }, { status: 400 });
  }
  const safe = pick(body, UPDATE_ALLOWED);
  try {
    await sections.update(body.id, safe);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update section";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const body = (await req.json()) as { id?: string };
  if (!body.id) {
    return Response.json({ error: "Missing 'id' in body" }, { status: 400 });
  }
  try {
    await sections.remove(body.id);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete section";
    return Response.json({ error: msg }, { status: 500 });
  }
}
