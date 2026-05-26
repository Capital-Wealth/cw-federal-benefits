/**
 * Case Design — Edge CRUD endpoints.
 * POST creates a Case_Design_Edge__c under the parent Case Design Id from the route.
 * PATCH/DELETE require an `id` in the body and never accept Case_Design__c reassignment.
 * Fields are allowlisted to the builder-safe subset of CaseDesignEdge.
 */
import type { NextRequest } from "next/server";
import { edges } from "@/lib/case-design/sf-client";
import type { CaseDesignEdge } from "@/lib/case-design/types";

const ALLOWED: (keyof CaseDesignEdge)[] = [
  "From_Position__c",
  "To_Position__c",
  "Method__c",
  "Method_Label_Override__c",
  "Partial_Amount__c",
  "Gross_Amount__c",
  "Federal_Tax__c",
  "State_Tax__c",
  "Tax_Payment_Source__c",
  "Timing_Note__c",
  "Stage__c",
  "Status__c",
];

function pick(body: Partial<CaseDesignEdge>): Partial<CaseDesignEdge> {
  const safe: Partial<CaseDesignEdge> = {};
  for (const k of ALLOWED) {
    if (k in body) (safe as Record<string, unknown>)[k] = body[k] as unknown;
  }
  return safe;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<CaseDesignEdge>;
  const safe = pick(body);
  try {
    const newId = await edges.create(id, safe);
    return Response.json({ id: newId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create edge";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const body = (await req.json()) as Partial<CaseDesignEdge> & { id?: string };
  if (!body.id) {
    return Response.json({ error: "Missing 'id' in body" }, { status: 400 });
  }
  if ("Case_Design__c" in body) {
    return Response.json({ error: "Case_Design__c may not be updated" }, { status: 400 });
  }
  const safe = pick(body);
  try {
    await edges.update(body.id, safe);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update edge";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const body = (await req.json()) as { id?: string };
  if (!body.id) {
    return Response.json({ error: "Missing 'id' in body" }, { status: 400 });
  }
  try {
    await edges.remove(body.id);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete edge";
    return Response.json({ error: msg }, { status: 500 });
  }
}
