/**
 * Zoom webhook verification + URL-validation helpers.
 *
 * Zoom signs every webhook POST with HMAC-SHA256:
 *   header  x-zm-signature        = "v0=<hex>"
 *   header  x-zm-request-timestamp = <unix-seconds>
 *   message = "v0:{timestamp}:{rawBody}"
 *   key     = ZOOM_WEBHOOK_SECRET_TOKEN
 *
 * When a webhook URL is first registered, Zoom POSTs an "endpoint.url_validation"
 * event containing a plainToken; we must echo it back with an encryptedToken
 * (HMAC-SHA256 of plainToken with the same secret).
 *
 * Docs: https://developers.zoom.us/docs/api/webhooks/
 */

import crypto from "crypto";

export function verifyZoomSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  secret: string
): boolean {
  if (!timestamp || !signature) return false;
  const message = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex")}`;
  // timingSafeEqual requires equal length
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildUrlValidationResponse(plainToken: string, secret: string) {
  const encryptedToken = crypto
    .createHmac("sha256", secret)
    .update(plainToken)
    .digest("hex");
  return { plainToken, encryptedToken };
}
