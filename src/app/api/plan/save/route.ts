import { NextRequest } from "next/server";
import { verifyLivePlanToken } from "@/lib/plan/token";
import { getSFConnection } from "@/lib/salesforce/connector";
import { SF_CONFIG } from "@/config";

/**
 * POST /api/plan/save
 *
 * Body:
 *   token                short-lived HMAC token (from ?session=)
 *   intakeId             Federal_Benefits_Intake__c.Id
 *   state                full editable state (used to PATCH the FBI)
 *   changes              [{ field, oldValue, newValue }]  — used for the audit log
 *   computedAnnualAnnuity  number  — recomputed at save time, stored on each Plan_Change__c
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
    return Response.json(
      { error: e instanceof Error ? e.message : "auth failed" },
      { status: 401 },
    );
  }
  if (session.intakeId !== body.intakeId) {
    return Response.json({ error: "intakeId / token mismatch" }, { status: 403 });
  }

  const conn = await getSFConnection();

  // Build the SF update — only ship fields the editor controls.
  const update: Record<string, unknown> = { Id: body.intakeId };
  for (const f of EDITABLE_FIELDS) {
    if (f in body.state) update[f] = body.state[f];
  }
  // Date of Birth is editable inline. Persist it to the FBI's own
  // Date_of_Birth__c (the field the integration user can read/write — avoids
  // the Contact FLS gap) so it round-trips and the report can compute age.
  if (body.dateOfBirth !== undefined) {
    update.Date_of_Birth__c = body.dateOfBirth || null;
  }

  try {
    await conn.sobject(SF_CONFIG.objectName).update(update as { Id: string });
  } catch (e) {
    return Response.json(
      { error: "SF update failed: " + (e instanceof Error ? e.message : String(e)) },
      { status: 500 },
    );
  }

  // Mailing address is cosmetic (report cover only). Write it to the linked
  // Contact best-effort — never fail the save if the Contact isn't reachable.
  if (body.address !== undefined && body.address) {
    try {
      const rec = (await conn
        .sobject(SF_CONFIG.objectName)
        .retrieve(body.intakeId)) as { Contact__c?: string };
      if (rec.Contact__c) {
        await conn.sobject("Contact").update({ Id: rec.Contact__c, MailingStreet: body.address });
      }
    } catch {
      /* non-fatal — address has no calc impact */
    }
  }

  // Insert change-history rows — one per changed field.
  if (body.changes && body.changes.length > 0) {
    const now = new Date().toISOString();
    const rows = body.changes.map((c) => ({
      Intake__c: body.intakeId,
      Field_Api_Name__c: c.field,
      Old_Value__c: c.oldValue == null ? null : String(c.oldValue).slice(0, 255),
      New_Value__c: c.newValue == null ? null : String(c.newValue).slice(0, 255),
      Edited_By__c: session.userId ?? null, // null with a stateless (no-user) token; nillable User lookup
      Edited_At__c: now,
      Computed_Annual_Annuity__c: body.computedAnnualAnnuity,
      Source__c: "Live Plan",
    }));
    try {
      await conn.sobject("Federal_Benefits_Plan_Change__c").create(rows);
    } catch (e) {
      // Non-fatal — the FBI update already succeeded
      console.error("Plan change log insert failed:", e);
    }
  }

  return Response.json({
    success: true,
    savedAt: new Date().toISOString(),
    changes: body.changes?.length ?? 0,
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
