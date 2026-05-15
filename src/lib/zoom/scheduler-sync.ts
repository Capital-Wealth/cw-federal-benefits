/**
 * Zoom Scheduler → Salesforce sync logic.
 *
 * Called from the /api/zoom-scheduler-webhook route on every
 * scheduler.event.{created,updated,cancelled} event. Mirrors the Apex
 * logic the polling cron used to generate (see ~/cw-zoom-sms/scripts/
 * sync_scheduler_to_sf.py) — same Lead update + Task insert + Meeting__c
 * upsert keyed on Zoom_Scheduler_Event_Id__c.
 *
 * Webhook is the system of record now. The cron is fallback only.
 */

import { getSFConnection } from "@/lib/salesforce/connector";

// Federal Benefits Webinar 5.14.26 — child of Federal Benefits 2026.
// Other Scheduler schedule types are out of scope for v1; add here when ready.
export const WEBINAR_CAMPAIGN_ID = "701VS00000eWrYVYA0";
export const TARGET_SUMMARIES = new Set(["Federal Benefits 30 Minute Phone Call"]);
export const MEETING_TYPE = "(0.5) Screening Call";
export const MEETING_STATUS_BOOKED = "Meeting Set";
export const MEETING_STATUS_CANCELLED = "Canceled - Prospect Choice";
export const TASK_SUBJECT_PREFIX = "Federal Benefits 30-Min Meeting";

// Advisor email → { SF User Id, display name }.
// Ann Werts is external (no SF user) → her bookings fall back to Chad as Task owner.
export const ADVISORS_BY_EMAIL: Record<
  string,
  { sfUserId: string; displayName: string }
> = {
  "jcohen@capitalwealth.com": {
    sfUserId: "005VS000009ooqsYAA",
    displayName: "Josh Cohen",
  },
  "caustin@capitalwealth.com": {
    sfUserId: "005VS000002pzzbYAA",
    displayName: "Chad Austin",
  },
  "awerts@capitalwealth.com": {
    sfUserId: "005VS000002pzzbYAA",
    displayName: "Ann Werts",
  },
};

// Zoom Scheduler emits attendee emails like "<userId>@scheduler.zoom.us"
// for the host; we also accept the host's real CW email if present.
function findAdvisor(attendees: SchedulerAttendee[]): {
  sfUserId: string;
  displayName: string;
} | null {
  for (const a of attendees) {
    if (a.booker) continue;
    const email = (a.email || "").toLowerCase();
    if (ADVISORS_BY_EMAIL[email]) return ADVISORS_BY_EMAIL[email];
  }
  // Fall back: match display_name (less reliable, used only if email scheme changes)
  for (const a of attendees) {
    if (a.booker) continue;
    const name = (a.display_name || "").trim();
    const hit = Object.values(ADVISORS_BY_EMAIL).find(
      (v) => v.displayName === name
    );
    if (hit) return hit;
  }
  return null;
}

export interface SchedulerAttendee {
  booker?: boolean;
  email?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  created?: string;
}

export interface SchedulerEvent {
  event_id: string;
  schedule_id?: string;
  summary?: string;
  status?: string;
  start_date_time: string;
  end_date_time?: string;
  attendees?: SchedulerAttendee[];
}

export type SyncOutcome =
  | { action: "ignored"; reason: string }
  | { action: "missing_lead"; email: string; name: string }
  | {
      action: "applied";
      leadId: string;
      meetingId: string | null;
      taskId: string | null;
      created: boolean;
    }
  | { action: "cancelled"; leadId: string; meetingId: string | null };

function mtDate(utcIso: string): string {
  // Convert UTC ISO datetime to America/Denver date (YYYY-MM-DD).
  // For May 2026 MT is UTC-6 (MDT); good enough for ActivityDate granularity.
  const d = new Date(utcIso);
  const shifted = new Date(d.getTime() - 6 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Apply a single scheduler event to Salesforce. Idempotent — safe to call
 * multiple times for the same event_id.
 */
export async function applySchedulerEvent(
  ev: SchedulerEvent,
  eventType: "created" | "updated" | "cancelled"
): Promise<SyncOutcome> {
  if (!ev.summary || !TARGET_SUMMARIES.has(ev.summary)) {
    return { action: "ignored", reason: `summary "${ev.summary}" not in scope` };
  }
  const booker = (ev.attendees || []).find((a) => a.booker && a.email);
  if (!booker || !booker.email) {
    return { action: "ignored", reason: "no booker email on event" };
  }
  const advisor = findAdvisor(ev.attendees || []) ?? {
    sfUserId: "005VS000002pzzbYAA", // Chad as fallback
    displayName: "Unknown (fallback Chad)",
  };

  const conn = await getSFConnection();
  const bookerEmail = booker.email.toLowerCase();
  const bookerName = (booker.display_name || "").trim();

  // Lead lookup
  const leadQ = await conn.query<{ Id: string; Email: string | null }>(
    `SELECT Id, Email FROM Lead WHERE Email = '${bookerEmail.replace(/'/g, "\\'")}' LIMIT 1`
  );
  if (!leadQ.records.length) {
    return { action: "missing_lead", email: bookerEmail, name: bookerName };
  }
  const leadId = leadQ.records[0].Id;

  // ---- Cancellation path ----
  if (eventType === "cancelled") {
    const mtgQ = await conn.query<{ Id: string }>(
      `SELECT Id FROM Meeting__c WHERE Zoom_Scheduler_Event_Id__c = '${ev.event_id}' LIMIT 1`
    );
    let meetingId: string | null = null;
    if (mtgQ.records.length) {
      meetingId = mtgQ.records[0].Id;
      await conn.sobject("Meeting__c").update({
        Id: meetingId,
        Status__c: MEETING_STATUS_CANCELLED,
      });
    }
    return { action: "cancelled", leadId, meetingId };
  }

  // ---- Create / update path ----
  const startUtc = ev.start_date_time;
  const mtgDate = mtDate(startUtc);

  // Lead field update — idempotent (same values on repeat)
  await conn.sobject("Lead").update({
    Id: leadId,
    Discovery_Meeting_Date__c: startUtc,
    Meeting_Date__c: mtgDate,
    Meeting_Confirmed__c: true,
    Meeting_Tasks_Created__c: true,
    Mtg_Scheduled_Date_Stamp__c: new Date().toISOString().slice(0, 10),
  });

  // Meeting__c upsert by external id
  const mtgRecord = {
    Zoom_Scheduler_Event_Id__c: ev.event_id,
    Meeting_Date__c: mtgDate,
    Meeting_Type__c: MEETING_TYPE,
    Status__c: MEETING_STATUS_BOOKED,
    OwnerId: advisor.sfUserId,
    Who_is_Hosting_this_Meeting__c: advisor.sfUserId,
    Meeting_Owner__c: advisor.sfUserId,
    Campaign_Source_Lookup__c: WEBINAR_CAMPAIGN_ID,
    Additional_Attendees__c: `${bookerName} <${bookerEmail}>`,
    Pre_Meeting_Notes__c:
      `Zoom Scheduler event id: ${ev.event_id}\n` +
      `Meeting time (UTC): ${startUtc}\n` +
      `Booked: ${booker.created || "?"}\n` +
      `Advisor (Zoom round-robin): ${advisor.displayName}\n` +
      `Source: Federal Benefits webinar webhook (event=${eventType})`,
  };
  const upsertResult = await conn
    .sobject("Meeting__c")
    .upsert(mtgRecord, "Zoom_Scheduler_Event_Id__c");
  // jsforce upsert returns { id, success, errors, created? }
  const meetingId =
    (upsertResult as { id?: string }).id || null;
  const meetingCreated = Boolean(
    (upsertResult as { created?: boolean }).created
  );

  // Task — find existing by Lead + ActivityDate to dedupe
  let taskId: string | null = null;
  const existing = await conn.query<{ Id: string }>(
    `SELECT Id FROM Task WHERE WhoId = '${leadId}' AND ActivityDate = ${mtgDate} ` +
      `AND Subject LIKE '${TASK_SUBJECT_PREFIX}%' LIMIT 1`
  );
  if (!existing.records.length) {
    const taskResult = await conn.sobject("Task").create({
      WhoId: leadId,
      OwnerId: advisor.sfUserId,
      Subject: `${TASK_SUBJECT_PREFIX} — ${advisor.displayName}`,
      ActivityDate: mtgDate,
      Status: "Not Started",
      Priority: "Normal",
      Type: "Call",
      Description:
        `Federal Benefits 30-Min Phone Meeting (Zoom Scheduler webhook)\n` +
        `Meeting time (UTC): ${startUtc}\n` +
        `Advisor (Zoom round-robin): ${advisor.displayName}\n` +
        `Zoom Scheduler event id: ${ev.event_id}\n` +
        `Booked: ${booker.created || "?"}`,
    });
    if ((taskResult as { success: boolean }).success) {
      taskId = (taskResult as { id: string }).id;
    }
  } else {
    taskId = existing.records[0].Id;
  }

  return {
    action: "applied",
    leadId,
    meetingId,
    taskId,
    created: meetingCreated,
  };
}
