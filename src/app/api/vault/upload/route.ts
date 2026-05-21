import { NextRequest } from "next/server";
import { getSessionByToken, storeDocument, audit } from "@/lib/vault/store";
import { sniff, isAllowed } from "@/lib/vault/mime";
import { sha256Hex } from "@/lib/vault/crypto";

const MAX_BYTES = 50 * 1024 * 1024; // 50MB hard cap (spec §5.4)

/**
 * POST /api/vault/upload — encrypted upload pipeline.
 *
 * Pipeline (mirrors SECURE_PORTAL_SPEC.md §4.2 / §5.4):
 *   1. Authn: valid, unexpired session token
 *   2. Size cap
 *   3. Magic-byte MIME validation (NOT trusting client Content-Type)
 *   4. [prod: AV scan in quarantine] — demo marks scanStatus=clean after sniff
 *   5. AES-256-GCM envelope-encrypt the bytes, store the sealed blob
 *   6. Append-only audit event
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "local";
  const form = await request.formData();
  const file = form.get("file") as File | null;
  const token = form.get("token") as string | null;

  if (!file || !token) {
    return Response.json({ error: "file and token are required" }, { status: 400 });
  }

  const session = getSessionByToken(token);
  if (!session) {
    audit({ actor: "unknown", action: "upload.denied", ip, detail: { reason: "invalid_or_expired_token", tokenHash: sha256Hex(token) } });
    return Response.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large (50MB max)" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Magic-byte validation — the true file type, not the claimed one
  const result = sniff(buf);
  if (!result.ok || !isAllowed(result.detected)) {
    audit({
      actor: session.clientEmail,
      action: "upload.rejected",
      ip,
      detail: { sessionTokenHash: session.tokenHash, fileName: file.name, claimedMime: file.type, detected: result.detected, reason: result.reason },
    });
    return Response.json(
      { error: result.reason || "File type not allowed", detected: result.detected, claimed: file.type },
      { status: 415 }
    );
  }

  const doc = storeDocument(session, buf, file.name, result.detected!, ip);

  return Response.json({
    id: doc.id,
    fileName: doc.fileName,
    detectedMime: doc.mime,
    claimedMime: file.type,
    sizeBytes: doc.sizeBytes,
    sha256: doc.sha256,
    scanStatus: doc.scanStatus,
    encrypted: "AES-256-GCM (envelope: per-doc DEK wrapped by master key)",
  });
}
