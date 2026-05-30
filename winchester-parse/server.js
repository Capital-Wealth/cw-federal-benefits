/**
 * CW Federal Document Parse Service — "perfect parsing" engine.
 *
 * Hosted on Winchester (this machine). Parses federal benefit documents with
 * the LOCAL `claude` CLI (Opus, Max-plan OAuth — no Anthropic API key, no
 * per-token cost). Exposed to the Vercel apps via a cloudflared tunnel.
 *
 * Why this exists: the prod parser called the metered Anthropic SDK, every
 * call threw, and the failure was swallowed — records came back "AI Parsed"
 * at confidence 0 with nothing populated (Gary Abeyta, FBI-0046).
 *
 * Perfect-parsing contract:
 *   1. EXTRACT-ONLY — the caller's prompt must ask for printed values only;
 *      we append a hard rule banning any calculation/derivation/inference.
 *   2. INDEPENDENT VERIFY — every document is parsed TWICE, blind. A field is
 *      ACCEPTED only when both passes return the identical value. Any
 *      disagreement (or present-in-one-pass-only) is FLAGGED, never written.
 *   3. EXPLICIT GAPS — absent values stay null and surface for advisor review;
 *      they are never guessed.
 *
 * POST /parse  { mime, docBase64, prompt }   (header: x-parse-secret)
 *   -> { accepted: {dotPath: value}, flagged: [{path, passA, passB}], passes: [A,B] }
 * GET  /health -> { ok: true }
 */

const http = require("node:http");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PARSE_PORT || 18795);
const SECRET = process.env.PARSE_SECRET || "";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "/Users/thorsnode/.local/bin/claude";
const MODEL = process.env.PARSE_MODEL || "opus";
const CALL_TIMEOUT_MS = Number(process.env.PARSE_CALL_TIMEOUT_MS || 240_000);

const EXT_BY_MIME = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const STRICT_RULES = `

HARD RULES (a transcription engine, not an estimator):
- Transcribe values exactly as printed on the document.
- You MAY add up or annualize line items that are EXPLICITLY printed on THIS
  page when the instructions ask for a sum/total (e.g. summing printed
  biweekly earnings lines). Report only the result of printed values.
- If a requested value is NOT printed and cannot be reached by summing printed
  line items, return null for it (do NOT omit the key). NEVER estimate, infer,
  derive from an assumption/formula, or use outside knowledge — e.g. do NOT
  compute a Social Security age-62 figure from an FRA amount; if 62 is not
  printed, it is null.
- Return ONLY a single valid JSON object. No markdown, no prose, no notes.`;

/** Run one blind extraction pass through the local claude CLI. */
function runPass(docPath, prompt, label) {
  return new Promise((resolve, reject) => {
    const fullPrompt =
      `Read the document at ${docPath} and extract the requested fields.\n\n` +
      prompt +
      STRICT_RULES;
    execFile(
      CLAUDE_BIN,
      [
        "--print",
        "--model",
        MODEL,
        "--allowedTools",
        "Read",
        "--output-format",
        "text",
        fullPrompt,
      ],
      { timeout: CALL_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, cwd: path.dirname(docPath) },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`${label} failed: ${err.message} ${stderr || ""}`));
        const obj = extractJson(stdout);
        if (!obj) return reject(new Error(`${label}: no JSON in response: ${String(stdout).slice(0, 200)}`));
        resolve(obj);
      }
    );
  });
}

function extractJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** Flatten nested objects to dot-paths; arrays compared by JSON. */
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

/** Two values "agree" for perfect-parse purposes. */
function agrees(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Accept only fields both passes agree on AND that are non-null. Flag the rest. */
function reconcile(a, b) {
  const fa = flatten(a), fb = flatten(b);
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  const accepted = {};
  const flagged = [];
  for (const key of keys) {
    const va = key in fa ? fa[key] : null;
    const vb = key in fb ? fb[key] : null;
    if (va == null && vb == null) continue; // genuinely absent in both — nothing to write
    if (agrees(va, vb) && va != null) accepted[key] = va;
    else flagged.push({ path: key, passA: va, passB: vb });
  }
  return { accepted, flagged };
}

function send(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, model: MODEL });
  if (req.method !== "POST" || req.url !== "/parse") return send(res, 404, { error: "not found" });

  if (!SECRET) return send(res, 500, { error: "PARSE_SECRET not configured on the service" });
  const given = req.headers["x-parse-secret"];
  // constant-time compare to avoid leaking the secret via timing
  const ok =
    typeof given === "string" &&
    given.length === SECRET.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(SECRET));
  if (!ok) return send(res, 401, { error: "bad secret" });

  let raw = "";
  req.on("data", (c) => {
    raw += c;
    if (raw.length > 48 * 1024 * 1024) req.destroy(); // 48MB cap
  });
  req.on("end", async () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: "invalid JSON body" });
    }
    const { mime, docBase64, prompt } = body || {};
    const ext = EXT_BY_MIME[mime];
    if (!ext) return send(res, 415, { error: `unsupported mime: ${mime}` });
    if (!docBase64 || !prompt) return send(res, 400, { error: "mime, docBase64, prompt all required" });

    const work = fs.mkdtempSync(path.join(os.tmpdir(), "cwparse-"));
    const docPath = path.join(work, `doc.${ext}`);
    try {
      fs.writeFileSync(docPath, Buffer.from(docBase64, "base64"));
      // Two INDEPENDENT blind passes, run concurrently.
      const [a, b] = await Promise.all([
        runPass(docPath, prompt, "passA"),
        runPass(docPath, prompt, "passB"),
      ]);
      const { accepted, flagged } = reconcile(a, b);
      send(res, 200, { accepted, flagged, passes: [a, b] });
    } catch (err) {
      send(res, 502, { error: err instanceof Error ? err.message : String(err) });
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[cw-federal-parse] listening on 127.0.0.1:${PORT} (model=${MODEL}, secret=${SECRET ? "set" : "MISSING"})`);
});
