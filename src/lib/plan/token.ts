/**
 * Live Plan token verification.
 *
 * Tokens are minted by Apex (FederalBenefitsController.openLivePlan).
 * Format: base64url(payload) + "." + hex(HMAC-SHA256(secret, base64url-payload))
 *
 * Payload schema:
 *   intakeId  Federal_Benefits_Intake__c.Id
 *   userId    SF User.Id of the advisor
 *   userName  Display name (used for change-history attribution)
 *   orgId     SF Org.Id (sanity check we're hitting the right org)
 *   exp       Unix-seconds expiry (60 minutes from mint)
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface LivePlanSession {
  intakeId: string;
  userId: string;
  userName: string;
  orgId: string;
  exp: number;
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
  if (!payload.intakeId || !payload.userId || !payload.exp) {
    throw new Error("Token payload missing required fields");
  }

  // Expiry: epoch SECONDS in Apex; compare in seconds.
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp < nowSec) {
    throw new Error("Token expired — re-open Live Plan from Salesforce");
  }

  return payload;
}
