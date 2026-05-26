/**
 * /case-design-for-account/[accountId] — entry route fired by the SF formula
 * "Open Case Design Builder" hyperlink on an Account (Household) record.
 *
 * Finds the most recent Draft Case Design tied to this Account (with no Opp
 * yet) or creates one, then 302s the advisor to /case-design/[caseDesignId].
 * Case Design starts at the household level — no Opportunity is created
 * until the advisor clicks "Confirm & Create Opps".
 */

import { redirect } from "next/navigation";
import { getSFConnection } from "@/lib/salesforce/connector";

export const dynamic = "force-dynamic";

export default async function CaseDesignForAccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;

  if (!/^[A-Za-z0-9]{15,18}$/.test(accountId)) {
    return (
      <main className="max-w-xl mx-auto p-12 text-center">
        <h1 className="text-xl font-semibold">Invalid Account Id</h1>
        <p className="mt-3 text-zinc-600">
          The Id in the URL doesn&apos;t look like a Salesforce Id. Re-open
          the link from the Account record.
        </p>
      </main>
    );
  }

  const conn = await getSFConnection();

  const existing = await conn.query<{ Id: string }>(
    `SELECT Id FROM Case_Design__c
     WHERE Account__c = '${accountId}' AND Opportunity__c = NULL AND Status__c = 'Draft'
     ORDER BY CreatedDate DESC LIMIT 1`
  );

  let caseDesignId: string;
  if (existing.records.length > 0) {
    caseDesignId = existing.records[0].Id;
  } else {
    const accRows = await conn.query<{ Id: string }>(
      `SELECT Id FROM Account WHERE Id = '${accountId}' LIMIT 1`
    );
    if (accRows.records.length === 0) {
      return (
        <main className="max-w-xl mx-auto p-12 text-center">
          <h1 className="text-xl font-semibold">Account not found</h1>
          <p className="mt-3 text-zinc-600">
            <code className="bg-zinc-100 px-1 rounded">{accountId}</code>{" "}
            doesn&apos;t resolve in Salesforce, or your user can&apos;t read it.
          </p>
        </main>
      );
    }
    const created = await conn.sobject("Case_Design__c").create({
      Account__c: accountId,
      Status__c: "Draft",
      Plan_Date__c: new Date().toISOString().slice(0, 10),
      Document_Title__c: "Retirement Money Map",
    });
    if (!("success" in created) || !created.success) {
      throw new Error(`Failed to create Case Design: ${JSON.stringify(created)}`);
    }
    caseDesignId = created.id as string;
  }

  redirect(`/case-design/${caseDesignId}`);
}
