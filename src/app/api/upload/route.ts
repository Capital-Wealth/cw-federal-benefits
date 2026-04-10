import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import type { DocumentType } from "@/types";

/**
 * POST /api/upload — Upload a document for an intake session
 *
 * Accepts multipart/form-data with:
 * - file: the document
 * - token: session token
 * - documentType: LES, TSP_Statement, SF50, DD214, PSB, SS_Statement, Other
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const token = formData.get("token") as string | null;
  const documentType = (formData.get("documentType") as DocumentType) || "Other";

  if (!file || !token) {
    return Response.json(
      { error: "file and token are required" },
      { status: 400 }
    );
  }

  // Validate file type (PDF, images, common doc formats)
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (!allowedTypes.includes(file.type)) {
    return Response.json(
      { error: "File type not allowed. Please upload PDF, JPEG, PNG, or Word documents." },
      { status: 400 }
    );
  }

  // Max 50MB
  if (file.size > 50 * 1024 * 1024) {
    return Response.json(
      { error: "File too large. Maximum size is 50MB." },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Verify session
  const { data: session, error: sessionError } = await supabase
    .from("intake_sessions")
    .select("id, status, expires_at")
    .eq("token", token)
    .single();

  if (sessionError || !session) {
    return Response.json({ error: "Invalid session token" }, { status: 401 });
  }

  if (new Date(session.expires_at) < new Date()) {
    return Response.json({ error: "Session expired" }, { status: 410 });
  }

  // Upload to Supabase Storage
  const storagePath = `${token}/${Date.now()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("federal-docs")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    return Response.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }

  // Record in documents table
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      session_id: session.id,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      document_type: documentType,
      storage_path: storagePath,
    })
    .select()
    .single();

  if (docError) {
    console.error("Document record error:", docError);
    return Response.json(
      { error: "Failed to record document" },
      { status: 500 }
    );
  }

  // Audit log
  await supabase.from("audit_log").insert({
    session_id: session.id,
    document_id: doc.id,
    action: "upload",
    actor: "client",
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0] || null,
    details: {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      documentType,
    },
  });

  // Update session status
  await supabase
    .from("intake_sessions")
    .update({ status: "uploaded" })
    .eq("id", session.id);

  return Response.json({
    documentId: doc.id,
    fileName: file.name,
    documentType,
    uploadedAt: doc.uploaded_at,
  });
}
