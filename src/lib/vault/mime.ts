/**
 * Magic-byte MIME validation — per SECURE_PORTAL_SPEC.md §5.4.
 *
 * We validate the actual file signature (magic bytes), NOT the client-supplied
 * Content-Type or the file extension, both of which are trivially spoofable.
 * Only an allow-list of document types is accepted; executables, scripts, and
 * archives are rejected by default.
 */

export interface SniffResult {
  ok: boolean;
  detected: string | null;
  reason?: string;
}

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/tiff"]);

/** Inspect leading bytes to determine the true file type. */
export function sniff(buf: Buffer): SniffResult {
  if (buf.length < 4) {
    return { ok: false, detected: null, reason: "File too small to validate" };
  }

  // PDF: 25 50 44 46  ("%PDF")
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return { ok: true, detected: "application/pdf" };
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ok: true, detected: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { ok: true, detected: "image/png" };
  }

  // TIFF: 49 49 2A 00 (LE) or 4D 4D 00 2A (BE)
  if (
    (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
    (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)
  ) {
    return { ok: true, detected: "image/tiff" };
  }

  // Common dangerous signatures — reject explicitly with a clear reason
  // MZ (Windows PE/exe)
  if (buf[0] === 0x4d && buf[1] === 0x5a) {
    return { ok: false, detected: "application/x-msdownload", reason: "Executable files are not permitted" };
  }
  // PK (zip/office-xml/jar) — blocked in demo allow-list
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    return { ok: false, detected: "application/zip", reason: "Archive/Office files are not permitted in this demo (PDF/JPG/PNG/TIFF only)" };
  }
  // #! shebang script
  if (buf[0] === 0x23 && buf[1] === 0x21) {
    return { ok: false, detected: "text/x-shellscript", reason: "Script files are not permitted" };
  }

  return { ok: false, detected: null, reason: "Unrecognized or disallowed file type" };
}

export function isAllowed(detected: string | null): boolean {
  return detected !== null && ALLOWED.has(detected);
}

export const ALLOWED_TYPES = Array.from(ALLOWED);
