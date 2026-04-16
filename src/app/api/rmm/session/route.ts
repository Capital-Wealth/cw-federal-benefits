import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SF_ID_REGEX = /^[a-zA-Z0-9]{15,18}$/;

/**
 * GET /api/rmm/session?token=xxx
 *
 * Loads the Retirement_Intake__c record by upload token.
 * Returns pre-filled data from the linked Account/Contact.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  if (!UUID_REGEX.test(token)) {
    return Response.json({ error: "Invalid token format" }, { status: 400 });
  }

  const conn = await getSFConnection();

  // Find the intake record — parameterized via jsforce .find() to prevent SOQL injection
  const records = await conn
    .sobject("Retirement_Intake__c")
    .find(
      { Upload_Token__c: token },
      [
        "Id",
        "Name",
        "Status__c",
        "Intake_Date__c",
        "Contact__c",
        "Planned_Retirement_Age__c",
        "Is_Federal_Employee__c",
      ]
    )
    .limit(1)
    .execute();

  if (records.length === 0) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const record = records[0] as Record<string, unknown>;

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
    if (!SF_ID_REGEX.test(contactId)) {
      console.error(`Invalid Contact ID format: ${contactId}`);
    } else {
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
      } catch (err) {
        console.error("Failed to load contact prefill:", err);
      }
    }
  }

  // Look up next meeting
  let nextMeeting = null;
  if (contactId && SF_ID_REGEX.test(contactId)) {
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
    } catch (err) {
      console.error("Failed to load next meeting:", err);
    }
  }

  return Response.json({
    intakeId: record.Id,
    intakeName: record.Name,
    status: record.Status__c,
    prefill,
    nextMeeting,
  });
}
