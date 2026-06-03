/**
 * Live Plan — Federal Benefit Comparison (dynamic web app).
 *
 * Auth: short-lived HMAC token minted by Apex, passed as ?session=…
 * Auth model is intentionally simple for v0.5 — full SF SSO via Connected App
 * lands in v1.0.
 */

import { notFound } from "next/navigation";
import { verifyLivePlanToken } from "@/lib/plan/token";
import { getSFConnection } from "@/lib/salesforce/connector";
import { createServiceClient } from "@/lib/supabase/client";
import { SF_CONFIG } from "@/config";
import LivePlanClient from "./LivePlanClient";

interface PageProps {
  params: Promise<{ intakeId: string }>;
  searchParams: Promise<{ session?: string }>;
}

async function loadIntake(intakeId: string) {
  const conn = await getSFConnection();
  const record = await conn.sobject(SF_CONFIG.objectName).retrieve(intakeId);
  if (!record || !record.Id) return null;

  // Pull linked Contact for name + DOB + address
  let clientName: string | null = null;
  // Prefer the FBI's own Date_of_Birth__c (what the inline editor saves and the
  // integration user can read); fall back to the linked Contact's Birthdate.
  let dateOfBirth: string | null = (record.Date_of_Birth__c as string) ?? null;
  let address: string | null = null;
  if (record.Contact__c) {
    const result = await conn.query(
      `SELECT Name, Birthdate, MailingStreet, MailingCity, MailingState, MailingPostalCode FROM Contact WHERE Id = '${record.Contact__c}' LIMIT 1`,
    );
    if (result.records.length > 0) {
      const c = result.records[0] as Record<string, unknown>;
      clientName = (c.Name as string) ?? null;
      if (!dateOfBirth) dateOfBirth = (c.Birthdate as string) ?? null;
      const street = (c.MailingStreet as string) ?? "";
      const city = (c.MailingCity as string) ?? "";
      const state = (c.MailingState as string) ?? "";
      const zip = (c.MailingPostalCode as string) ?? "";
      const cityStateZip = [city, state].filter(Boolean).join(", ") + (zip ? ` ${zip}` : "");
      address = [street, cityStateZip].filter((s) => s.trim()).join(", ") || null;
    }
  }

  // Vault overrides (advisor saves persist here — no Salesforce FLS limits).
  // These win over Salesforce so live edits show up at the same link.
  try {
    const supabase = createServiceClient();
    const { data: vault } = await supabase
      .from("intake_data")
      .select("data, date_of_birth, mailing_address, client_name")
      .eq("intake_id", intakeId)
      .maybeSingle();
    if (vault) {
      const vd = ((vault.data as Record<string, unknown>) || {});
      Object.assign(record as Record<string, unknown>, vd); // SF-keyed overrides (incl. Date_of_Birth__c)
      const vDob = (vault.date_of_birth as string) || (vd.Date_of_Birth__c as string);
      if (vDob) dateOfBirth = vDob;
      const vAddr = (vault.mailing_address as string) || (vd._address as string);
      if (vAddr) address = vAddr;
      const vName = (vault.client_name as string) || (vd._clientName as string);
      if (vName) clientName = vName;
    }
  } catch {
    /* Vault is optional — fall back to Salesforce values */
  }

  return { record, clientName, dateOfBirth, address, contactId: (record.Contact__c as string) ?? null };
}

export default async function LivePlanPage({ params, searchParams }: PageProps) {
  const { intakeId } = await params;
  const { session } = await searchParams;

  if (!session) {
    return (
      <ErrorScreen
        title="Authentication required"
        body="Open Live Plan from the Salesforce record. Direct links are not supported."
      />
    );
  }

  let payload;
  try {
    payload = verifyLivePlanToken(session);
  } catch (e) {
    return (
      <ErrorScreen
        title="Invalid or expired session"
        body={e instanceof Error ? e.message : "Re-open Live Plan from Salesforce."}
      />
    );
  }

  if (payload.intakeId !== intakeId) {
    return (
      <ErrorScreen
        title="Token / record mismatch"
        body="The session token does not match this intake. Re-open Live Plan from the right record."
      />
    );
  }

  const data = await loadIntake(intakeId);
  if (!data) notFound();

  return (
    <LivePlanClient
      session={payload}
      initialIntake={data.record as Record<string, unknown>}
      clientName={data.clientName}
      dateOfBirth={data.dateOfBirth}
      address={data.address}
      contactId={data.contactId}
    />
  );
}

function ErrorScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#16253C] text-white p-8">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-serif text-[#FDD25E] mb-4">{title}</h1>
        <p className="text-base text-[#cad4e2]">{body}</p>
      </div>
    </div>
  );
}
