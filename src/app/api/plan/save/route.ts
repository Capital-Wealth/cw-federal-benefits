import { NextRequest } from "next/server";
import { verifyLivePlanToken } from "@/lib/plan/token";
import { getSFConnection } from "@/lib/salesforce/connector";
import { createServiceClient } from "@/lib/supabase/client";
import { SF_CONFIG } from "@/config";

/**
 * POST /api/plan/save
 *
 * Persistence model: the Vault (Supabase `intake_data`) is AUTHORITATIVE — it
 * has no Salesforce field-level-security limits, so advisor overrides always
 * stick. Salesforce is written BEST-EFFORT: if the integration user lacks write
 * FLS on a field, that write fails silently and the save still succeeds via the
 * Vault. The calc/PDF and the Live Plan read the Vault overrides back.
 *
 * Body: token, intakeId, state, changes, computedAnnualAnnuity, dateOfBirth?, address?
 */
export async function POST(request: NextRequest) {
  let body: {
    token: string;
    intakeId: string;
    state: Record<string, unknown>;
    changes: { field: string; oldValue: unknown; newValue: unknown }[];
    computedAnnualAnnuity: number;
    dateOfBirth?: string | null;
    address?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  let session;
  try {
    session = verifyLivePlanToken(body.token);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "auth failed" }, { status: 401 });
  }
  if (session.intakeId !== body.intakeId) {
    return Response.json({ error: "intakeId / token mismatch" }, { status: 403 });
  }

  // ---- 1) Vault (authoritative) — merge onto any existing override row ----
  let vaultSaved = false;
  let vaultError: string | null = null;
  try {
    const supabase = createServiceClient();
    const { data: existing } = await supabase
      .from("intake_data")
      .select("data")
      .eq("intake_id", body.intakeId)
      .maybeSingle();
    const prev = ((existing?.data as Record<string, unknown>) || {});
    const merged: Record<string, unknown> = { ...prev };
    for (const f of EDITABLE_FIELDS) {
      if (f in body.state) merged[f] = body.state[f];
    }
    if (body.dateOfBirth !== undefined) merged.Date_of_Birth__c = body.dateOfBirth || null;
    if (body.address !== undefined) merged._address = body.address || null;

    const row: Record<string, unknown> = {
      intake_id: body.intakeId,
      data: merged,
      updated_at: new Date().toISOString(),
    };
    if (body.dateOfBirth !== undefined) row.date_of_birth = body.dateOfBirth || null;
    if (body.address !== undefined) row.mailing_address = body.address || null;

    const { error } = await supabase.from("intake_data").upsert(row, { onConflict: "intake_id" });
    if (error) vaultError = error.message;
    else vaultSaved = true;
  } catch (e) {
    vaultError = e instanceof Error ? e.message : String(e);
  }

  // ---- 2) Salesforce (best-effort — never fails the save) ----
  let sfSynced = false;
  let sfError: string | null = null;
  try {
    const conn = await getSFConnection();
    const update: Record<string, unknown> = { Id: body.intakeId };
    for (const f of EDITABLE_FIELDS) {
      if (f in body.state) update[f] = body.state[f];
    }
    if (body.dateOfBirth !== undefined) update.Date_of_Birth__c = body.dateOfBirth || null;
    await conn.sobject(SF_CONFIG.objectName).update(update as { Id: string });
    sfSynced = true;

    // Mailing address → Contact (best-effort)
    if (body.address) {
      try {
        const rec = (await conn.sobject(SF_CONFIG.objectName).retrieve(body.intakeId)) as { Contact__c?: string };
        if (rec.Contact__c) await conn.sobject("Contact").update({ Id: rec.Contact__c, MailingStreet: body.address });
      } catch { /* non-fatal */ }
    }

    // Change-history log
    if (body.changes && body.changes.length > 0) {
      const now = new Date().toISOString();
      const rows = body.changes.map((c) => ({
        Intake__c: body.intakeId,
        Field_Api_Name__c: c.field,
        Old_Value__c: c.oldValue == null ? null : String(c.oldValue).slice(0, 255),
        New_Value__c: c.newValue == null ? null : String(c.newValue).slice(0, 255),
        Edited_By__c: session.userId ?? null,
        Edited_At__c: now,
        Computed_Annual_Annuity__c: body.computedAnnualAnnuity,
        Source__c: "Live Plan",
      }));
      try { await conn.sobject("Federal_Benefits_Plan_Change__c").create(rows); } catch { /* non-fatal */ }
    }
  } catch (e) {
    sfError = e instanceof Error ? e.message : String(e);
  }

  if (!vaultSaved) {
    return Response.json({ error: "Save failed (vault): " + vaultError }, { status: 500 });
  }
  return Response.json({
    success: true,
    savedAt: new Date().toISOString(),
    changes: body.changes?.length ?? 0,
    vaultSaved,
    sfSynced,
    sfError, // surfaced for visibility; SF sync is best-effort until write FLS is granted
  });
}

const EDITABLE_FIELDS = [
  "Service_Computation_Date__c",
  "Current_Annual_Salary__c",
  "Desired_Retirement_Date__c",
  "Sick_Leave_Hours_To_Date__c",
  "Retirement_System__c",
  "Survivor_Benefit_FERS__c",
  "Expected_Salary_Increase__c",
  "COLA_Adjustment__c",
  "TSP_Trad_G_Balance__c",
  "TSP_Trad_F_Balance__c",
  "TSP_Trad_C_Balance__c",
  "TSP_Trad_S_Balance__c",
  "TSP_Trad_I_Balance__c",
  "TSP_Trad_L_Balance__c",
  "TSP_Withdrawal_Age_Years__c",
  "SS_FERS_Monthly_Benefit__c",
  "SS_FERS_Start_Age__c",
  "FEHB_Biweekly_Premium__c",
  "FEHB_Annual_Increase__c",
];
