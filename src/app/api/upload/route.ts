import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import { uploadToSalesforce } from "@/lib/salesforce/files";
import { getAppUrl, UPLOAD_CONFIG, SF_CONFIG } from "@/config";
import type { DocumentType } from "@/types";

/**
 * POST /api/upload — Upload a document for an intake session
 *
 * Documents go directly to Salesforce Files (ContentVersion),
 * linked to the Federal_Benefits_Intake__c record.
 * No external storage — everything stays in Salesforce.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const token = formData.get("token") as string | null;
  const documentType = (formData.get("documentType") as DocumentType) || "Other";

  if (!file || !token) {
    return Response.json({ error: "file and token are required" }, { status: 400 });
  }

  // Validate file type
  if (!UPLOAD_CONFIG.allowedMimeTypes.includes(file.type)) {
    return Response.json(
      { error: "File type not allowed. Please upload PDF, JPEG, PNG, or Word documents." },
      { status: 400 }
    );
  }

  // Max file size
  if (file.size > UPLOAD_CONFIG.maxFileSizeBytes) {
    return Response.json({ error: "File too large. Maximum size is 50MB." }, { status: 400 });
  }

  // Look up the intake record by upload token — check both Federal and non-Federal objects
  const conn = await getSFConnection();

  // Try Federal first
  let intakeId: string | null = null;
  let intakeDate: string | null = null;
  let intakeObject: string = SF_CONFIG.objectName;

  const federalResult = await conn.query(
    `SELECT Id, Status__c, Intake_Date__c FROM ${SF_CONFIG.objectName} WHERE Supabase_Folder_ID__c = '${token}' LIMIT 1`
  );

  if (federalResult.records.length > 0) {
    const record = federalResult.records[0] as Record<string, unknown>;
    intakeId = record.Id as string;
    intakeDate = record.Intake_Date__c as string;
  } else {
    // Try non-Federal (Retirement_Intake__c) via Apex REST service
    try {
      const rmmResult = await conn.request({
        method: "GET",
        url: `/services/apexrest/rmm-intake?token=${encodeURIComponent(token)}`,
        headers: { "Content-Type": "application/json" },
      }) as Record<string, unknown>;

      if (rmmResult.valid && rmmResult.intakeId) {
        intakeId = rmmResult.intakeId as string;
        intakeObject = "Retirement_Intake__c";
      }
    } catch {
      // RMM service not available — fall through to error
    }
  }

  if (!intakeId) {
    return Response.json({ error: "Invalid upload token" }, { status: 401 });
  }

  // Check expiration — 7 days from intake date
  if (intakeDate) {
    const expires = new Date(intakeDate);
    expires.setDate(expires.getDate() + 7);
    if (expires < new Date()) {
      return Response.json({ error: "Upload link has expired" }, { status: 410 });
    }
  }

  // Upload to Salesforce Files
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const { contentVersionId } = await uploadToSalesforce(
      intakeId,
      buffer,
      file.name,
      file.type,
      documentType
    );

    // Update status to Docs Uploaded
    try {
      await conn.sobject(intakeObject).update({
        Id: intakeId,
        Status__c: "Docs Uploaded",
      } as { Id: string });
    } catch {
      // Status update may fail if fields aren't visible (schema cache) — upload still succeeded
    }

    // Auto-trigger AI parsing in the background — pass the intake object type
    // so /api/parse knows whether to run the federal or general pipeline.
    const appUrl = getAppUrl();
    fetch(`${appUrl}/api/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intakeId, intakeObject }),
    }).catch((err) => {
      console.error("Background parse trigger failed:", err);
    });

    return Response.json({
      contentVersionId,
      fileName: file.name,
      documentType,
      parsing: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Upload failed: " + msg }, { status: 500 });
  }
}
