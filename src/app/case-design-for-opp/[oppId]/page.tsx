/**
 * /case-design-for-opp/[oppId] — entry route fired by the SF formula
 * "Open Case Design Builder" hyperlink on an Opportunity record.
 *
 * Finds the most recent Draft Case Design for the Opp (or creates one) and
 * 302s the advisor to /case-design/[caseDesignId]. Avoids the LWC Quick
 * Action plumbing entirely — works with any layout / RT, no Lightning App
 * Builder dependency.
 */

import { redirect } from "next/navigation";
import { getSFConnection } from "@/lib/salesforce/connector";

export const dynamic = "force-dynamic";

export default async function CaseDesignForOppPage({
  params,
}: {
  params: Promise<{ oppId: string }>;
}) {
  const { oppId } = await params;

  if (!/^[A-Za-z0-9]{15,18}$/.test(oppId)) {
    return (
      <main className="max-w-xl mx-auto p-12 text-center">
        <h1 className="text-xl font-semibold">Invalid Opportunity Id</h1>
        <p className="mt-3 text-zinc-600">
          The Id in the URL doesn&apos;t look like a Salesforce Id. Re-open the
          link from the Opportunity record.
        </p>
      </main>
    );
  }

  const conn = await getSFConnection();

  const existing = await conn.query<{ Id: string }>(
    `SELECT Id FROM Case_Design__c
     WHERE Opportunity__c = '${oppId}' AND Status__c = 'Draft'
     ORDER BY CreatedDate DESC LIMIT 1`
  );

  let caseDesignId: string;
  if (existing.records.length > 0) {
    caseDesignId = existing.records[0].Id;
  } else {
    const oppRows = await conn.query<{ Id: string }>(
      `SELECT Id FROM Opportunity WHERE Id = '${oppId}' LIMIT 1`
    );
    if (oppRows.records.length === 0) {
      return (
        <main className="max-w-xl mx-auto p-12 text-center">
          <h1 className="text-xl font-semibold">Opportunity not found</h1>
          <p className="mt-3 text-zinc-600">
            <code className="bg-zinc-100 px-1 rounded">{oppId}</code> doesn&apos;t
            resolve in Salesforce, or your user can&apos;t read it.
          </p>
        </main>
      );
    }
    const created = await conn.sobject("Case_Design__c").create({
      Opportunity__c: oppId,
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
