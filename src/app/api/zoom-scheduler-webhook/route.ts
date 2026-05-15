/**
 * POST /api/zoom-scheduler-webhook
 *
 * Receives Zoom Scheduler events and writes them to Salesforce in real time.
 * Replaces the 15-min polling cron at ~/cw-zoom-sms/scripts/sync_scheduler_to_sf.py.
 *
 * Subscribed events:
 *   - scheduler.event.created   → upsert Meeting__c + create Task + update Lead
 *   - scheduler.event.updated   → re-upsert (same logic; idempotent)
 *   - scheduler.event.cancelled → mark Meeting__c.Status__c = "Canceled - Prospect Choice"
 *   - endpoint.url_validation   → HMAC echo so Zoom can verify endpoint ownership
 *
 * Auth: HMAC-SHA256 over "v0:{timestamp}:{rawBody}" using ZOOM_WEBHOOK_SECRET_TOKEN.
 */

import { NextRequest } from "next/server";
import {
  verifyZoomSignature,
  buildUrlValidationResponse,
} from "@/lib/zoom/webhook";
import {
  applySchedulerEvent,
  type SchedulerEvent,
} from "@/lib/zoom/scheduler-sync";

export const runtime = "nodejs"; // jsforce + node:crypto need node runtime
export const dynamic = "force-dynamic";

interface ZoomPayload {
  event: string;
  event_ts?: number;
  payload?: {
    plainToken?: string;
    object?: SchedulerEvent;
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret) {
    return Response.json(
      { error: "ZOOM_WEBHOOK_SECRET_TOKEN not configured" },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  let parsed: ZoomPayload;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  // 1) URL validation handshake — no signature on this one; verify the secret
  //    by echoing the HMAC of plainToken back to Zoom.
  if (parsed.event === "endpoint.url_validation") {
    const plainToken = parsed.payload?.plainToken;
    if (!plainToken) {
      return Response.json({ error: "no plainToken" }, { status: 400 });
    }
    return Response.json(buildUrlValidationResponse(plainToken, secret));
  }

  // 2) Every other event must be signature-verified.
  const sig = request.headers.get("x-zm-signature");
  const ts = request.headers.get("x-zm-request-timestamp");
  if (!verifyZoomSignature(rawBody, ts, sig, secret)) {
    return Response.json({ error: "signature mismatch" }, { status: 401 });
  }

  const ev = parsed.payload?.object;
  if (!ev || !ev.event_id) {
    return Response.json({ ok: true, ignored: "no scheduler event payload" });
  }

  let kind: "created" | "updated" | "cancelled" | null = null;
  if (parsed.event === "scheduler.event.created") kind = "created";
  else if (parsed.event === "scheduler.event.updated") kind = "updated";
  else if (parsed.event === "scheduler.event.cancelled") kind = "cancelled";
  else {
    return Response.json({ ok: true, ignored: `event ${parsed.event}` });
  }

  try {
    const outcome = await applySchedulerEvent(ev, kind);
    return Response.json({ ok: true, event: parsed.event, outcome });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Log so it surfaces in Vercel logs; return 500 so Zoom retries.
    console.error("[zoom-scheduler-webhook] handler failed:", msg, err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ status: "ok", route: "zoom-scheduler-webhook" });
}
