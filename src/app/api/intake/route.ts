import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/intake — Create a new intake session
 *
 * Called by advisor from Salesforce or admin dashboard.
 * Creates a Supabase session, generates a secure upload URL,
 * and returns the token for the client.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { clientName, clientEmail, sfLeadId, sfContactId, advisorId } = body;

  if (!clientName || !clientEmail) {
    return Response.json(
      { error: "clientName and clientEmail are required" },
      { status: 400 }
    );
  }

  const token = uuidv4();
  const supabase = createServiceClient();

  // Create intake session in Supabase
  const { data, error } = await supabase
    .from("intake_sessions")
    .insert({
      token,
      client_name: clientName,
      client_email: clientEmail,
      sf_lead_id: sfLeadId || null,
      sf_contact_id: sfContactId || null,
      advisor_id: advisorId || null,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create intake session:", error);
    return Response.json(
      { error: "Failed to create intake session" },
      { status: 500 }
    );
  }

  // Log the creation
  await supabase.from("audit_log").insert({
    session_id: data.id,
    action: "create",
    actor: advisorId ? `advisor:${advisorId}` : "system",
    details: { clientName, clientEmail },
  });

  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://benefits.capitalwealth.com"}/portal/${token}`;

  return Response.json({
    sessionId: data.id,
    token,
    portalUrl,
    expiresAt: data.expires_at,
  });
}

/**
 * GET /api/intake?token=xxx — Get session status
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return Response.json({ error: "token is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from("intake_sessions")
    .select("id, client_name, status, created_at, expires_at")
    .eq("token", token)
    .single();

  if (error || !session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  // Check expiration
  if (new Date(session.expires_at) < new Date()) {
    return Response.json({ error: "Session expired" }, { status: 410 });
  }

  // Get uploaded documents
  const { data: documents } = await supabase
    .from("documents")
    .select("id, file_name, document_type, uploaded_at, parsed")
    .eq("session_id", session.id);

  return Response.json({
    session,
    documents: documents || [],
  });
}
