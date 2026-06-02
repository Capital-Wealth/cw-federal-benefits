/**
 * Live Plan token verification.
 *
 * Tokens are minted by Apex (FederalBenefitsController.openLivePlan).
 * Format: base64url(payload) + "." + hex(HMAC-SHA256(secret, base64url-payload))
 *
 * Payload schema:
 *   intakeId  Federal_Benefits_Intake__c.Id   (REQUIRED — the only stable identity)
 *   userId    SF User.Id of the advisor        (optional — change-history attribution)
 *   userName  Display name                     (optional — change-history attribution)
 *   orgId     SF Org.Id                         (optional — sanity check)
 *   exp       Unix-seconds expiry              (optional — when omitted the token never expires)
 *
 * TWO token shapes verify here:
 *   1. Legacy short-lived token — carries userId + 60-min exp (still expires while present).
 *   2. Stateless permanent token — signs ONLY { intakeId }, so the same intake always
 *      yields the identical URL. No exp, no per-user fields. This is the stable-link model.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface LivePlanSession {
  intakeId: string;
  userId?: string;
  userName?: string;
  orgId?: string;
  exp?: number;
}

const REQUIRED_SECRET = "LIVE_PLAN_SECRET";

function getSecret(): string {
  const s = process.env[REQUIRED_SECRET];
  if (!s) {
    throw new Error(
      `Missing ${REQUIRED_SECRET} env var. Configure it in Vercel to match the SF custom metadata Federal_Benefits_Setting.Default.Live_Plan_Secret__c.`,
    );
  }
  return s;
}

function base64UrlDecode(input: string): Buffer {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function verifyLivePlanToken(token: string): LivePlanSession {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid token format");
  }
  const [payloadB64, sigHex] = parts;

  // Verify signature against the BASE64URL string Apex signed (not the decoded JSON).
  const expectedSig = createHmac("sha256", getSecret()).update(payloadB64, "utf8").digest("hex");
  const sigBuf = Buffer.from(sigHex, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error("Token signature mismatch");
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as LivePlanSession;
  // intakeId is the only required claim. userId/exp are optional so a stateless
  // permanent token (signs only { intakeId }) verifies and never expires.
  if (!payload.intakeId) {
    throw new Error("Token payload missing intakeId");
  }

  // Expiry is enforced only when present (legacy short-lived tokens). A stateless
  // permanent token omits exp and therefore never expires.
  if (payload.exp != null) {
    const nowSec = Math.floor(Date.now() / 1000); // epoch SECONDS, matching Apex
    if (payload.exp < nowSec) {
      throw new Error("Token expired — re-open Live Plan from Salesforce");
    }
  }

  return payload;
}
