/**
 * Case Design — Annotation CRUD endpoints.
 * POST creates a Case_Design_Annotation__c under the parent Case Design Id from the route.
 * PATCH/DELETE require an `id` in the body and never accept Case_Design__c reassignment.
 * Fields are allowlisted to the builder-safe subset of CaseDesignAnnotation.
 */
import type { NextRequest } from "next/server";
import { annotations } from "@/lib/case-design/sf-client";
import type { CaseDesignAnnotation } from "@/lib/case-design/types";

const ALLOWED: (keyof CaseDesignAnnotation)[] = [
  "Text__c",
  "Style__c",
  "Section__c",
  "Anchor_Position__c",
  "Anchor_Edge__c",
  "Page_Number__c",
  "Sort_Order__c",
];

function pick(body: Partial<CaseDesignAnnotation>): Partial<CaseDesignAnnotation> {
  const safe: Partial<CaseDesignAnnotation> = {};
  for (const k of ALLOWED) {
    if (k in body) (safe as Record<string, unknown>)[k] = body[k] as unknown;
  }
  return safe;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<CaseDesignAnnotation>;
  const safe = pick(body);
  try {
    const newId = await annotations.create(id, safe);
    return Response.json({ id: newId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create annotation";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const body = (await req.json()) as Partial<CaseDesignAnnotation> & { id?: string };
  if (!body.id) {
    return Response.json({ error: "Missing 'id' in body" }, { status: 400 });
  }
  if ("Case_Design__c" in body) {
    return Response.json({ error: "Case_Design__c may not be updated" }, { status: 400 });
  }
  const safe = pick(body);
  try {
    await annotations.update(body.id, safe);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update annotation";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const body = (await req.json()) as { id?: string };
  if (!body.id) {
    return Response.json({ error: "Missing 'id' in body" }, { status: 400 });
  }
  try {
    await annotations.remove(body.id);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete annotation";
    return Response.json({ error: msg }, { status: 500 });
  }
}
