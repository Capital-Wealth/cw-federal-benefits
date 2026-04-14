import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import { parseDocument, mergeParseResults } from "@/lib/parsing/document-parser";
import { updateIntake } from "@/lib/salesforce/connector";
import { SUPABASE_CONFIG } from "@/config";
import type { DocumentType, FederalBenefitsIntake } from "@/types";

/**
 * POST /api/parse — Parse uploaded documents and update Salesforce
 *
 * Body: { token: string, documentIds?: string[] }
 *
 * If documentIds is provided, parse only those documents.
 * Otherwise, parse all unparsed documents for the session.
 *
 * Flow:
 * 1. Pull documents from Supabase storage
 * 2. Send each to Claude vision API for extraction
 * 3. Merge extracted fields across documents
 * 4. Update the Federal_Benefits_Intake__c record in Salesforce
 * 5. Update session and document status
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, documentIds } = body as {
    token: string;
    documentIds?: string[];
  };

  if (!token) {
    return Response.json({ error: "token is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1. Verify session
  const { data: session, error: sessionError } = await supabase
    .from("intake_sessions")
    .select("id, sf_intake_id, status")
    .eq("token", token)
    .single();

  if (sessionError || !session) {
    return Response.json({ error: "Invalid session" }, { status: 401 });
  }

  // 2. Get documents to parse
  let query = supabase
    .from("documents")
    .select("id, file_name, file_type, document_type, storage_path, parsed")
    .eq("session_id", session.id);

  if (documentIds && documentIds.length > 0) {
    query = query.in("id", documentIds);
  } else {
    query = query.eq("parsed", false);
  }

  const { data: documents, error: docError } = await query;

  if (docError || !documents || documents.length === 0) {
    return Response.json(
      { error: "No documents to parse", details: docError?.message },
      { status: 404 }
    );
  }

  // 3. Parse each document
  const parseResults = [];
  const errors = [];

  for (const doc of documents) {
    try {
      // Download from Supabase storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(SUPABASE_CONFIG.storageBucket)
        .download(doc.storage_path);

      if (downloadError || !fileData) {
        errors.push(`Failed to download ${doc.file_name}: ${downloadError?.message}`);
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());

      // Parse with Claude
      const result = await parseDocument(
        buffer,
        doc.file_type,
        doc.document_type as DocumentType,
        doc.file_name
      );
      result.documentId = doc.id;

      parseResults.push(result);

      // Mark document as parsed
      await supabase
        .from("documents")
        .update({
          parsed: true,
          parsed_at: new Date().toISOString(),
          confidence: result.overallConfidence,
          parsed_fields: result.fields,
        })
        .eq("id", doc.id);

      // Audit log
      await supabase.from("audit_log").insert({
        session_id: session.id,
        document_id: doc.id,
        action: "parse",
        actor: "ai",
        details: {
          documentType: doc.document_type,
          fieldsExtracted: result.fields.length,
          confidence: result.overallConfidence,
          warnings: result.warnings,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to parse ${doc.file_name}: ${msg}`);
    }
  }

  if (parseResults.length === 0) {
    return Response.json(
      { error: "All documents failed to parse", errors },
      { status: 422 }
    );
  }

  // 4. Merge all parsed fields
  const { merged, confidence, fieldsNeedingReview } =
    mergeParseResults(parseResults);

  // 5. Update Salesforce
  let sfUpdateResult = null;
  if (session.sf_intake_id) {
    try {
      // Add metadata fields
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

      await updateIntake(session.sf_intake_id, intakeUpdate);
      sfUpdateResult = { success: true, intakeId: session.sf_intake_id };

      // Audit the SF update
      await supabase.from("audit_log").insert({
        session_id: session.id,
        action: "sf_update",
        actor: "ai",
        details: {
          intakeId: session.sf_intake_id,
          fieldsUpdated: Object.keys(merged).length,
          confidence,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sfUpdateResult = { success: false, error: msg };
      errors.push(`Salesforce update failed: ${msg}`);
    }
  }

  // 6. Update session status
  await supabase
    .from("intake_sessions")
    .update({ status: "parsed" })
    .eq("id", session.id);

  return Response.json({
    parsed: parseResults.length,
    failed: errors.length,
    confidence,
    fieldsExtracted: Object.keys(merged).length,
    fieldsNeedingReview,
    salesforce: sfUpdateResult,
    errors: errors.length > 0 ? errors : undefined,
  });
}
