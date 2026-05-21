/**
 * Vault encryption — AES-256-GCM envelope encryption.
 *
 * Demonstrates the production pattern from SECURE_PORTAL_SPEC.md §2:
 *   - Each document gets a unique random Data Encryption Key (DEK).
 *   - The document is encrypted with its DEK using AES-256-GCM.
 *   - The DEK is then wrapped (encrypted) with a Master Key.
 *
 * In PRODUCTION the Master Key lives in AWS KMS and the wrap/unwrap is a
 * KMS Encrypt/Decrypt call — the plaintext master key never touches the app.
 * In this DEMO the master key is a local 32-byte secret (env or generated file)
 * so the flow runs with zero cloud dependencies. The envelope structure is
 * identical; only the key custodian changes.
 */

import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce
const TAG_BYTES = 16; // GCM auth tag

export interface SealedBlob {
  /** Wrapped (master-key-encrypted) per-document DEK, base64 */
  wrappedDek: string;
  /** IV used to wrap the DEK, base64 */
  dekIv: string;
  /** Auth tag from wrapping the DEK, base64 */
  dekTag: string;
  /** IV used to encrypt the document, base64 */
  iv: string;
  /** Auth tag from encrypting the document, base64 */
  tag: string;
  /** Ciphertext of the document, base64 */
  ciphertext: string;
}

/** AES-256-GCM encrypt `plaintext` under `key`. Returns iv/tag/ciphertext. */
function gcmEncrypt(key: Buffer, plaintext: Buffer): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, ciphertext };
}

/** AES-256-GCM decrypt. Throws if the auth tag fails (tamper detection). */
function gcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer): Buffer {
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Seal a document: generate a fresh DEK, encrypt the document with it,
 * then wrap the DEK with the master key. (Envelope encryption.)
 */
export function seal(masterKey: Buffer, document: Buffer): SealedBlob {
  if (masterKey.length !== KEY_BYTES) {
    throw new Error(`Master key must be ${KEY_BYTES} bytes, got ${masterKey.length}`);
  }
  const dek = crypto.randomBytes(KEY_BYTES);

  // Encrypt the document under its own DEK
  const doc = gcmEncrypt(dek, document);

  // Wrap the DEK under the master key (KMS Encrypt in prod)
  const wrap = gcmEncrypt(masterKey, dek);

  return {
    wrappedDek: wrap.ciphertext.toString("base64"),
    dekIv: wrap.iv.toString("base64"),
    dekTag: wrap.tag.toString("base64"),
    iv: doc.iv.toString("base64"),
    tag: doc.tag.toString("base64"),
    ciphertext: doc.ciphertext.toString("base64"),
  };
}

/** Open a sealed document: unwrap the DEK with the master key, then decrypt. */
export function open(masterKey: Buffer, blob: SealedBlob): Buffer {
  // Unwrap the DEK (KMS Decrypt in prod)
  const dek = gcmDecrypt(
    masterKey,
    Buffer.from(blob.dekIv, "base64"),
    Buffer.from(blob.dekTag, "base64"),
    Buffer.from(blob.wrappedDek, "base64")
  );

  // Decrypt the document under its DEK
  return gcmDecrypt(
    dek,
    Buffer.from(blob.iv, "base64"),
    Buffer.from(blob.tag, "base64"),
    Buffer.from(blob.ciphertext, "base64")
  );
}

/** SHA-256 hex of a buffer — content integrity fingerprint stored alongside. */
export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** SHA-256 hex of a string — used to store magic-link tokens as hashes, never raw. */
export function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/** Generate a URL-safe random token (magic link). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

const TAG_TOTAL = TAG_BYTES; // referenced for documentation completeness
export const CRYPTO_PARAMS = { ALGO, KEY_BYTES, IV_BYTES, TAG_BYTES: TAG_TOTAL } as const;
