import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import { listIntakeDocuments, downloadFromSalesforce } from "@/lib/salesforce/files";
import { parseDocument, mergeParseResults } from "@/lib/parsing/document-parser";
import { updateIntake } from "@/lib/salesforce/connector";
import { SF_CONFIG } from "@/config";
import type { DocumentType, FederalBenefitsIntake } from "@/types";

/**
 * POST /api/parse — Parse uploaded documents and update Salesforce
 *
 * Body: { intakeId: string }
 *
 * Reads documents directly from Salesforce Files (ContentVersion),
 * parses each with Claude AI, merges the results, and writes
 * the extracted fields back to the Federal_Benefits_Intake__c record.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { intakeId } = body as { intakeId: string };

  if (!intakeId) {
    return Response.json({ error: "intakeId is required" }, { status: 400 });
  }

  // Get all documents attached to this intake
  const documents = await listIntakeDocuments(intakeId);

  if (documents.length === 0) {
    return Response.json({ error: "No documents found on this record" }, { status: 404 });
  }

  // Parse each document
  const parseResults = [];
  const errors = [];

  for (const doc of documents) {
    try {
      const { buffer, fileName, mimeType } = await downloadFromSalesforce(doc.contentVersionId);

      const result = await parseDocument(
        buffer,
        mimeType,
        doc.documentType as DocumentType,
        fileName
      );
      result.documentId = doc.contentVersionId;
      parseResults.push(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to parse ${doc.title}: ${msg}`);
    }
  }

  if (parseResults.length === 0) {
    return Response.json(
      { error: "All documents failed to parse", errors },
      { status: 422 }
    );
  }

  // Merge all parsed fields
  const { merged, confidence, fieldsNeedingReview } = mergeParseResults(parseResults);

  // Update the Salesforce record with extracted data
  try {
    const intakeUpdate: Partial<FederalBenefitsIntake> = {
      ...(merged as Partial<FederalBenefitsIntake>),
      status: "AI Parsed",
      aiParseConfidence: confidence,
      aiParsedDate: new Date().toISOString(),
      fieldsNeedingReview:
        fieldsNeedingReview.length > 0
          ? fieldsNeedingReview.join("\n")
          : undefined,
    };

    await updateIntake(intakeId, intakeUpdate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Salesforce update failed: ${msg}`);
  }

  return Response.json({
    parsed: parseResults.length,
    failed: errors.length,
    confidence,
    fieldsExtracted: Object.keys(merged).length,
    fieldsNeedingReview,
    errors: errors.length > 0 ? errors : undefined,
  });
}
