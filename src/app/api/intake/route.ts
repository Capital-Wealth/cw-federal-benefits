import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import { listIntakeDocuments } from "@/lib/salesforce/files";
import { SF_CONFIG } from "@/config";

/**
 * GET /api/intake?token=xxx — Get session status
 *
 * Looks up the intake record by upload token.
 * Returns the record status and list of uploaded documents.
 * All data comes from Salesforce — no external dependencies.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return Response.json({ error: "token is required" }, { status: 400 });
  }

  const conn = await getSFConnection();

  // Find the intake record by upload token
  const result = await conn.query(
    `SELECT Id, Name, Status__c, Intake_Date__c
     FROM ${SF_CONFIG.objectName}
     WHERE Supabase_Folder_ID__c = '${token}'
     LIMIT 1`
  );

  if (result.records.length === 0) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const record = result.records[0] as Record<string, unknown>;

  // Check expiration — 7 days from intake date
  const intakeDate = record.Intake_Date__c as string;
  if (intakeDate) {
    const expires = new Date(intakeDate);
    expires.setDate(expires.getDate() + 7);
    if (expires < new Date()) {
      return Response.json({ error: "Session expired" }, { status: 410 });
    }
  }

  // Get uploaded documents from SF Files
  const documents = await listIntakeDocuments(record.Id as string);

  return Response.json({
    session: {
      id: record.Id,
      client_name: record.Name,
      status: record.Status__c,
    },
    documents: documents.map((d) => ({
      id: d.contentVersionId,
      file_name: d.fileName,
      document_type: d.documentType,
      parsed: false, // TODO: track per-document parse status
    })),
  });
}
