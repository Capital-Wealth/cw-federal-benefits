import { NextRequest } from "next/server";
import { verifyLivePlanToken } from "@/lib/plan/token";
import { getSFConnection } from "@/lib/salesforce/connector";

/**
 * POST /api/plan/generate-pdf
 *
 * Triggers the same /api/salesforce/generate + /api/report/pdf pipeline the
 * SF "Generate Federal Benefit Comparison" button uses, then attaches the
 * PDF to the SF record. Auth = Live Plan token.
 *
 * Implementation note: instead of duplicating the entire calc + PDF pipeline
 * here, we proxy to the existing report builder which already reads the FBI
 * record (we just saved it) via /api/records.
 */

const REPORT_BUILDER_URL = process.env.REPORT_BUILDER_URL || "https://cw-federal-report-builder.vercel.app";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const token = body.token as string | undefined;
  const intakeId = body.intakeId as string | undefined;
  if (!token || !intakeId) {
    return Response.json({ error: "missing token or intakeId" }, { status: 400 });
  }

  let session;
  try {
    session = verifyLivePlanToken(token);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "auth failed" }, { status: 401 });
  }
  if (session.intakeId !== intakeId) {
    return Response.json({ error: "intakeId / token mismatch" }, { status: 403 });
  }

  // Step 1 — calc engine reads the just-saved FBI and returns input + results
  const calcRes = await fetch(`${REPORT_BUILDER_URL}/api/salesforce/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recordId: intakeId }),
  });
  if (!calcRes.ok) {
    return Response.json(
      { error: `Calc step failed (${calcRes.status})`, detail: await calcRes.text() },
      { status: 502 },
    );
  }
  const calc = (await calcRes.json()) as {
    employeeName?: string;
    input: unknown;
    results: unknown;
  };

  // Step 2 — render PDF
  const pdfRes = await fetch(`${REPORT_BUILDER_URL}/api/report/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: calc.input, result: calc.results }),
  });
  if (!pdfRes.ok) {
    return Response.json(
      { error: `PDF step failed (${pdfRes.status})`, detail: await pdfRes.text() },
      { status: 502 },
    );
  }
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

  // Step 3 — upload to SF + multi-link
  const employeeName = calc.employeeName ?? "Federal Employee";
  const fileName = `${employeeName} - Benefit Gap Analysis`;

  const conn = await getSFConnection();

  const cv = await conn.sobject("ContentVersion").create({
    Title: fileName,
    PathOnClient: fileName + ".pdf",
    VersionData: pdfBuffer.toString("base64"),
    Description: `Benefit Gap Analysis — Live Plan locked at ${new Date().toISOString()}`,
    FirstPublishLocationId: intakeId,
  });
  if (!cv.success) {
    return Response.json({ error: "SF upload failed", detail: cv.errors }, { status: 500 });
  }
  const cvId = cv.id;

  const cvRow = (await conn.sobject("ContentVersion").retrieve(cvId)) as {
    ContentDocumentId?: string;
  };
  const contentDocumentId = cvRow.ContentDocumentId;

  // Link to Contact + Account + Household
  if (contentDocumentId) {
    const fbi = await conn
      .sobject("Federal_Benefits_Intake__c")
      .retrieve(intakeId) as { Contact__c?: string };
    const contactId = fbi.Contact__c;
    const targets: string[] = [];
    if (contactId) {
      targets.push(contactId);
      const c = await conn.sobject("Contact").retrieve(contactId) as { AccountId?: string };
      if (c.AccountId) targets.push(c.AccountId);
      // Household via FinServ__PrimaryContact__c
      const hhRes = await conn.query(
        `SELECT Id FROM Account WHERE FinServ__PrimaryContact__c = '${contactId}'`,
      );
      for (const h of hhRes.records as { Id?: string }[]) {
        if (h.Id) targets.push(h.Id);
      }
    }
    for (const t of targets) {
      try {
        await conn.sobject("ContentDocumentLink").create({
          ContentDocumentId: contentDocumentId,
          LinkedEntityId: t,
          ShareType: "V",
          Visibility: "AllUsers",
        });
      } catch {
        // duplicate links are fine
      }
    }
  }

  // Step 4 — flag FBI complete
  try {
    await conn.sobject("Federal_Benefits_Intake__c").update({
      Id: intakeId,
      Status__c: "Complete",
      FedRetire_Report_Generated__c: true,
      FedRetire_Report_Date__c: new Date().toISOString(),
    } as { Id: string });
  } catch {
    // non-fatal
  }

  return Response.json({
    success: true,
    contentVersionId: cvId,
    contentDocumentId,
    fileName,
    employeeName,
  });
}
