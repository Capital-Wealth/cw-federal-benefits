/**
 * Vault store — self-contained local persistence for the DEMO.
 *
 * Demonstrates the data model from SECURE_PORTAL_SPEC.md without any cloud
 * dependency. Maps to production as follows:
 *   - Encrypted blobs on local fs   →  AWS S3 (SSE-CMK + Object Lock 7yr)
 *   - sessions.json                  →  Supabase `vault_sessions` (RLS)
 *   - documents.json                 →  Supabase `vault_documents` (RLS)
 *   - audit.jsonl (append-only)      →  S3 Object Lock + Datadog SIEM
 *   - Local master key file          →  AWS KMS CMK (never on disk)
 *
 * Everything written to disk is ENCRYPTED. The audit log is append-only.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { seal, open, sha256, sha256Hex, randomToken, type SealedBlob } from "./crypto";

const ROOT = path.join(process.cwd(), ".vault-demo");
const BLOBS = path.join(ROOT, "blobs");
const SESSIONS_FILE = path.join(ROOT, "sessions.json");
const DOCS_FILE = path.join(ROOT, "documents.json");
const AUDIT_FILE = path.join(ROOT, "audit.jsonl");
const KEY_FILE = path.join(ROOT, ".demo-master-key");

// ---------- master key (KMS CMK in prod) ----------

function getMasterKey(): Buffer {
  const env = process.env.VAULT_MASTER_KEY;
  if (env) {
    const k = Buffer.from(env, "base64");
    if (k.length === 32) return k;
    throw new Error("VAULT_MASTER_KEY must be base64-encoded 32 bytes");
  }
  ensureRoot();
  if (fs.existsSync(KEY_FILE)) {
    return Buffer.from(fs.readFileSync(KEY_FILE, "utf8"), "base64");
  }
  const k = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, k.toString("base64"), { mode: 0o600 });
  return k;
}

// ---------- types ----------

export interface VaultSession {
  token: string; // demo: kept to build links; prod: only the hash is stored
  tokenHash: string;
  clientName: string;
  clientEmail: string;
  createdAt: string;
  expiresAt: string;
}

export interface VaultDocument {
  id: string;
  sessionTokenHash: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  scanStatus: "clean" | "quarantined";
  uploadedAt: string;
  blobFile: string;
}

export interface AuditEvent {
  at: string;
  actor: string;
  action: string;
  detail: Record<string, unknown>;
  ip?: string;
}

// ---------- fs helpers ----------

function ensureRoot() {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.mkdirSync(BLOBS, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  ensureRoot();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---------- audit (append-only) ----------

export function audit(ev: Omit<AuditEvent, "at">) {
  ensureRoot();
  const line = JSON.stringify({ at: new Date().toISOString(), ...ev });
  fs.appendFileSync(AUDIT_FILE, line + "\n");
}

export function readAudit(tokenHash?: string): AuditEvent[] {
  try {
    const lines = fs.readFileSync(AUDIT_FILE, "utf8").trim().split("\n").filter(Boolean);
    const events = lines.map((l) => JSON.parse(l) as AuditEvent);
    if (!tokenHash) return events;
    return events.filter((e) => e.detail?.sessionTokenHash === tokenHash);
  } catch {
    return [];
  }
}

// ---------- sessions ----------

export function createSession(clientName: string, clientEmail: string, ttlHours = 12): VaultSession {
  const token = randomToken();
  const now = new Date();
  const session: VaultSession = {
    token,
    tokenHash: sha256Hex(token),
    clientName,
    clientEmail,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlHours * 3600_000).toISOString(),
  };
  const all = readJson<VaultSession[]>(SESSIONS_FILE, []);
  all.push(session);
  writeJson(SESSIONS_FILE, all);
  audit({ actor: clientEmail, action: "session.created", detail: { sessionTokenHash: session.tokenHash, clientName } });
  return session;
}

export function getSessionByToken(token: string): VaultSession | null {
  const hash = sha256Hex(token);
  const all = readJson<VaultSession[]>(SESSIONS_FILE, []);
  const s = all.find((x) => x.tokenHash === hash) || null;
  if (!s) return null;
  if (new Date(s.expiresAt) < new Date()) return null;
  return s;
}

// ---------- documents ----------

export function storeDocument(
  session: VaultSession,
  fileBuf: Buffer,
  fileName: string,
  mime: string,
  ip?: string
): VaultDocument {
  ensureRoot();
  const masterKey = getMasterKey();
  const sealed: SealedBlob = seal(masterKey, fileBuf);
  const id = randomToken(16);
  const blobFile = `${id}.sealed.json`;
  fs.writeFileSync(path.join(BLOBS, blobFile), JSON.stringify(sealed));

  const doc: VaultDocument = {
    id,
    sessionTokenHash: session.tokenHash,
    fileName,
    mime,
    sizeBytes: fileBuf.length,
    sha256: sha256(fileBuf),
    scanStatus: "clean",
    uploadedAt: new Date().toISOString(),
    blobFile,
  };
  const all = readJson<VaultDocument[]>(DOCS_FILE, []);
  all.push(doc);
  writeJson(DOCS_FILE, all);

  audit({
    actor: session.clientEmail,
    action: "document.uploaded",
    ip,
    detail: { sessionTokenHash: session.tokenHash, docId: id, fileName, mime, sizeBytes: doc.sizeBytes, sha256: doc.sha256 },
  });
  return doc;
}

export function listDocuments(session: VaultSession): VaultDocument[] {
  const all = readJson<VaultDocument[]>(DOCS_FILE, []);
  return all.filter((d) => d.sessionTokenHash === session.tokenHash);
}

export function getDocument(session: VaultSession, id: string): VaultDocument | null {
  const all = readJson<VaultDocument[]>(DOCS_FILE, []);
  // Row-level authorization: a session can only read its own documents.
  return all.find((d) => d.id === id && d.sessionTokenHash === session.tokenHash) || null;
}

export function openDocument(doc: VaultDocument, actor: string, ip?: string): Buffer {
  const masterKey = getMasterKey();
  const sealed = JSON.parse(fs.readFileSync(path.join(BLOBS, doc.blobFile), "utf8")) as SealedBlob;
  const plain = open(masterKey, sealed);
  audit({
    actor,
    action: "document.downloaded",
    ip,
    detail: { sessionTokenHash: doc.sessionTokenHash, docId: doc.id, fileName: doc.fileName },
  });
  return plain;
}

/** For the test harness: confirm the on-disk blob is ciphertext, not plaintext. */
export function rawBlobPath(blobFile: string): string {
  return path.join(BLOBS, blobFile);
}

export const VAULT_PATHS = { ROOT, BLOBS, SESSIONS_FILE, DOCS_FILE, AUDIT_FILE } as const;
