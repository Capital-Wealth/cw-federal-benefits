import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

/**
 * GET /api/rmm/session?token=xxx
 *
 * Loads the Retirement_Intake__c record by upload token.
 * Returns pre-filled data from the linked Account/Contact.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  const conn = await getSFConnection();

  // Find the intake record
  const result = await conn.query(
    `SELECT Id, Name, Status__c, Intake_Date__c, Contact__c,
            Planned_Retirement_Age__c, Is_Federal_Employee__c
     FROM Retirement_Intake__c
     WHERE Upload_Token__c = '${token}'
     LIMIT 1`
  );

  if (result.records.length === 0) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const record = result.records[0] as Record<string, unknown>;

  // Check expiration (7 days)
  const intakeDate = record.Intake_Date__c as string;
  if (intakeDate) {
    const expires = new Date(intakeDate);
    expires.setDate(expires.getDate() + 7);
    if (expires < new Date()) {
      return Response.json({ error: "Session expired" }, { status: 410 });
    }
  }

  // Pre-fill from the linked Account (Person Account)
  let prefill: Record<string, unknown> = {};
  const contactId = record.Contact__c as string;
  if (contactId) {
    try {
      const contactResult = await conn.query(
        `SELECT FirstName, LastName, Email, Birthdate, MailingState,
                Account.PersonEmail, Account.Name
         FROM Contact WHERE Id = '${contactId}' LIMIT 1`
      );
      if (contactResult.records.length > 0) {
        const c = contactResult.records[0] as Record<string, unknown>;
        prefill = {
          firstName: c.FirstName,
          lastName: c.LastName,
          email: c.Email,
          dateOfBirth: c.Birthdate,
          state: c.MailingState,
        };
      }
    } catch { /* silent */ }
  }

  // Look up next meeting
  let nextMeeting = null;
  if (contactId) {
    try {
      const meetingResult = await conn.query(
        `SELECT Id, Name, Meeting_Date__c, Meeting_Type__c
         FROM Meeting__c
         WHERE Contact__c = '${contactId}' AND Meeting_Date__c >= TODAY
         ORDER BY Meeting_Date__c ASC LIMIT 1`
      );
      if (meetingResult.records.length > 0) {
        const m = meetingResult.records[0] as Record<string, unknown>;
        nextMeeting = { date: m.Meeting_Date__c, type: m.Meeting_Type__c || "Appointment" };
      }
    } catch { /* silent */ }
  }

  return Response.json({
    intakeId: record.Id,
    intakeName: record.Name,
    status: record.Status__c,
    prefill,
    nextMeeting,
  });
}
