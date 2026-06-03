import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import type { CallCareSubmission } from "@/lib/callcare/fields";

const ID_REGEX = /^[a-zA-Z0-9]{15,18}$/;

/** Append "Label: value" only when value is non-empty. */
function line(label: string, value: unknown): string {
  const v = typeof value === "string" ? value.trim() : value;
  if (v === null || v === undefined || v === "" || v === false) return "";
  return `${label}: ${v === true ? "Yes" : v}\n`;
}

/** Build the structured Description block logged onto the Task. */
function buildDescription(s: CallCareSubmission): string {
  let body = "CALLCARE CALL LOG\n";
  body += line("Outcome", s.connected ? "Connected" : "Not connected");
  body += line("Disposition", s.disposition);
  body += line("Call time", s.callTime);

  const qualifying =
    line("Age", s.age) +
    line("Working status", s.workingStatus) +
    line("Married", s.married) +
    line("Spouse age", s.spouseAge) +
    line("Current advisor", s.currentAdvisor) +
    line("Asset location", s.assetLocation) +
    line("Investable assets", s.investableAssets) +
    line("Main concern", s.mainConcern) +
    line("Goal of the money", s.moneyGoal) +
    line("Questions / concerns", s.questions);
  if (qualifying) body += `\n— Qualifying —\n${qualifying}`;

  if (s.disposition === "Appointment Booked") {
    const appt =
      line("Date", s.apptDate) +
      line("Time", s.apptTime) +
      line("Modality", s.modality) +
      line("Advisor", s.advisor);
    if (appt) body += `\n— Appointment —\n${appt}`;
  }

  if (s.notes && s.notes.trim()) body += `\n— Notes —\n${s.notes.trim()}\n`;

  body += "\nLogged via CallCare per-lead form.";
  return body;
}

/**
 * POST /api/callcare/submit
 * Body: CallCareSubmission. Logs a completed Call Task on the Lead.
 * Uses only standard Task fields — no custom-field dependency.
 */
export async function POST(request: NextRequest) {
  let s: CallCareSubmission;
  try {
    s = (await request.json()) as CallCareSubmission;
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }

  if (!s.token || !ID_REGEX.test(s.token)) {
    return Response.json({ error: "Invalid link." }, { status: 400 });
  }

  try {
    const conn = await getSFConnection();

    // Confirm the lead exists + grab its owner so the activity lands on the rep.
    const leadRes = await conn.query<{ Id: string; OwnerId: string; Name: string }>(
      `SELECT Id, OwnerId, Name FROM Lead WHERE Id = '${s.token}' LIMIT 1`
    );
    if (!leadRes.records.length) {
      return Response.json({ error: "Lead not found." }, { status: 404 });
    }
    const lead = leadRes.records[0];

    // ActivityDate (date-only) derived from the call time; CompletedDateTime is
    // auto-stamped by SF when Status flips to Completed → time-to-first-touch.
    const callDate = s.callTime ? new Date(s.callTime) : new Date();
    const activityDate = isNaN(callDate.getTime())
      ? new Date().toISOString().slice(0, 10)
      : callDate.toISOString().slice(0, 10);

    const subject = `CallCare — ${s.disposition || (s.connected ? "Connected" : "Call")}`;

    const task: Record<string, unknown> = {
      WhoId: lead.Id,
      OwnerId: lead.OwnerId,
      Subject: subject.slice(0, 255),
      Status: "Completed",
      Priority: "Normal",
      CallType: "Outbound",
      CallDisposition: (s.disposition || "").slice(0, 255),
      ActivityDate: activityDate,
      Description: buildDescription(s),
    };

    // Assign to the lead owner so the activity lands on the rep's timeline.
    // The prod integration user may lack "transfer" rights to set OwnerId on
    // another user — if that's why the create fails, retry owned by the
    // integration user (still on the Lead's timeline via WhoId).
    let result = await conn.sobject("Task").create(task);
    if (!result.success) {
      delete task.OwnerId;
      result = await conn.sobject("Task").create(task);
    }
    if (!result.success) {
      return Response.json(
        { error: `Failed to log call: ${JSON.stringify(result.errors)}` },
        { status: 500 }
      );
    }

    return Response.json({ success: true, taskId: result.id, lead: lead.Name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("CallCare submit error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
