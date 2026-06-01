/**
 * Salesforce Files — upload, list, and download documents.
 *
 * All client documents are stored as ContentVersion records in SF,
 * linked to the Federal_Benefits_Intake__c record via ContentDocumentLink.
 * No external storage systems — everything stays in Salesforce.
 */

import { getSFConnection } from "./connector";
import { SF_CONFIG } from "@/config";
import type { DocumentType } from "@/types";

/**
 * Upload a file to Salesforce and link it to an intake record.
 * Returns the ContentVersion ID.
 */
export async function uploadToSalesforce(
  intakeId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  documentType: DocumentType
): Promise<{ contentVersionId: string; contentDocumentId: string }> {
  const conn = await getSFConnection();

  // Create ContentVersion with the file data
  const base64Data = fileBuffer.toString("base64");
  const result = await conn.sobject("ContentVersion").create({
    Title: `${documentType} — ${fileName}`,
    PathOnClient: fileName,
    VersionData: base64Data,
    Description: `Document type: ${documentType}. Uploaded for intake record.`,
  });

  if (!result.success) {
    throw new Error(`Failed to upload file: ${JSON.stringify(result.errors)}`);
  }

  const contentVersionId = result.id;

  // Get the ContentDocumentId
  const cv = await conn.sobject("ContentVersion").retrieve(contentVersionId);
  const contentDocumentId = cv.ContentDocumentId as string;

  // Link the file to the FBI record
  const linkResult = await conn.sobject("ContentDocumentLink").create({
    ContentDocumentId: contentDocumentId,
    LinkedEntityId: intakeId,
    ShareType: "V", // Viewer
    Visibility: "AllUsers",
  });

  if (!linkResult.success) {
    throw new Error(`Failed to link file: ${JSON.stringify(linkResult.errors)}`);
  }

  return { contentVersionId, contentDocumentId };
}

/**
 * List all documents attached to an intake record.
 */
export async function listIntakeDocuments(intakeId: string): Promise<
  {
    contentVersionId: string;
    contentDocumentId: string;
    title: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    createdDate: string;
    documentType: string;
  }[]
> {
  const conn = await getSFConnection();

  const result = await conn.query(`
    SELECT ContentDocument.LatestPublishedVersionId,
           ContentDocument.Id,
           ContentDocument.Title,
           ContentDocument.LatestPublishedVersion.PathOnClient,
           ContentDocument.LatestPublishedVersion.FileType,
           ContentDocument.ContentSize,
           ContentDocument.CreatedDate,
           ContentDocument.Description
    FROM ContentDocumentLink
    WHERE LinkedEntityId = '${intakeId}'
    ORDER BY ContentDocument.CreatedDate DESC
  `);

  return result.records.map((r: Record<string, unknown>) => {
    const doc = r.ContentDocument as Record<string, unknown>;
    const version = doc.LatestPublishedVersion as Record<string, unknown> | null;
    const description = (doc.Description as string) || "";
    const typeMatch = description.match(/Document type: (\w+)/);

    return {
      contentVersionId: doc.LatestPublishedVersionId as string,
      contentDocumentId: doc.Id as string,
      title: doc.Title as string,
      fileName: version?.PathOnClient as string || doc.Title as string,
      fileType: version?.FileType as string || "unknown",
      fileSize: doc.ContentSize as number || 0,
      createdDate: doc.CreatedDate as string,
      documentType: typeMatch ? typeMatch[1] : "Other",
    };
  });
}

/**
 * Download a file from Salesforce by ContentVersion ID.
 * Returns the raw file buffer and metadata.
 */
export async function downloadFromSalesforce(
  contentVersionId: string
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  const conn = await getSFConnection();

  // Get metadata
  const cv = await conn.sobject("ContentVersion").retrieve(contentVersionId);
  const fileName = cv.PathOnClient as string;
  const fileType = cv.FileType as string;

  // Download the binary data. NOTE: jsforce's conn.request() decodes the body
  // as a UTF-8 string, which silently corrupts binary files (PDFs render blank,
  // and the parser was being fed garbage bytes). Fetch the raw bytes directly
  // off the instance URL with the live access token so the buffer is the true
  // binary content.
  const res = await fetch(
    `${conn.instanceUrl}/services/data/v66.0/sobjects/ContentVersion/${contentVersionId}/VersionData`,
    { headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "*/*" } }
  );
  if (!res.ok) {
    throw new Error(`Failed to download VersionData ${contentVersionId}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  // Map SF FileType to MIME type
  const mimeMap: Record<string, string> = {
    PDF: "application/pdf",
    JPG: "image/jpeg",
    JPEG: "image/jpeg",
    PNG: "image/png",
    TIFF: "image/tiff",
    DOC: "application/msword",
    DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };

  return {
    buffer,
    fileName,
    mimeType: mimeMap[fileType?.toUpperCase()] || "application/octet-stream",
  };
}
