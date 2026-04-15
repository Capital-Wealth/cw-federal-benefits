import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import { createIntake, updateIntake } from "@/lib/salesforce/connector";
import { getSFConnection } from "@/lib/salesforce/connector";
import { getAppUrl } from "@/config";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/dashboard/invite
 *
 * Creates an intake session and sends a secure upload email to the client.
 *
 * Body: { clientName: string, clientEmail: string }
 *
 * Flow:
 * 1. Creates Federal_Benefits_Intake__c record in SF
 * 2. Creates session in Supabase
 * 3. Sends email to client via Salesforce (uses SF email service)
 * 4. Returns the intake details to the dashboard
 */
export async function POST(request: NextRequest) {
  const { clientName, clientEmail } = await request.json();

  if (!clientName || !clientEmail) {
    return Response.json({ error: "clientName and clientEmail required" }, { status: 400 });
  }

  const token = uuidv4();
  const appUrl = getAppUrl();
  const portalUrl = `${appUrl}/portal/${token}`;

  // 1. Create SF record
  let sfIntakeId: string | null = null;
  try {
    sfIntakeId = await createIntake({
      status: "Draft",
      intakeDate: new Date().toISOString().split("T")[0],
    });
  } catch (err) {
    console.error("SF intake creation failed:", err);
  }

  // 2. Create Supabase session
  const supabase = createServiceClient();
  const { data: session, error: sessionError } = await supabase
    .from("intake_sessions")
    .insert({
      token,
      client_name: clientName,
      client_email: clientEmail,
      sf_intake_id: sfIntakeId,
      status: "active",
    })
    .select()
    .single();

  if (sessionError) {
    console.error("Supabase session creation failed:", sessionError);
    return Response.json({ error: "Failed to create session" }, { status: 500 });
  }

  // 3. Update SF record with portal URL
  if (sfIntakeId) {
    try {
      await updateIntake(sfIntakeId, {
        status: "Link Sent",
        documentUploadUrl: portalUrl,
        supabaseFolderId: token,
      });
    } catch (err) {
      console.error("SF URL update failed:", err);
    }
  }

  // 4. Send email to client via Salesforce
  let emailSent = false;
  try {
    const conn = await getSFConnection();

    const emailBody = `Dear ${clientName},

Your advisor at Capital Wealth Advisors has invited you to securely upload your federal benefits documents for your Retirement Money Map analysis.

Click the link below to access your secure upload portal:

${portalUrl}

Please upload any of the following documents you have available:
- Leave and Earnings Statement (LES)
- SF-50 (Notification of Personnel Action)
- TSP Statement (Thrift Savings Plan)
- DD-214 (if applicable)
- Social Security Statement
- Personal Benefits Statement

Your documents are encrypted in transit and at rest. Only your assigned advisor can access them.

This link expires in 7 days. If you have any questions, please contact your advisor directly.

Thank you,
Capital Wealth Advisors`;

    await conn.request({
      method: "POST",
      url: "/services/data/v66.0/actions/standard/emailSimple",
      body: JSON.stringify({
        inputs: [
          {
            emailAddresses: clientEmail,
            emailSubject: "Capital Wealth — Secure Document Upload for Your Retirement Analysis",
            emailBody,
            senderType: "OrgWideEmailAddress",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    emailSent = true;
  } catch (err) {
    console.error("SF email send failed:", err);
    // Try fallback — still return success since the link was created
    emailSent = false;
  }

  // 5. Audit log
  await supabase.from("audit_log").insert({
    session_id: session.id,
    action: "invite",
    actor: "advisor",
    details: { clientName, clientEmail, sfIntakeId, emailSent, portalUrl },
  });

  // Get the FBI record name for the response
  let intakeName = sfIntakeId || "pending";
  if (sfIntakeId) {
    try {
      const conn = await getSFConnection();
      const record = await conn.sobject("Federal_Benefits_Intake__c").retrieve(sfIntakeId);
      intakeName = record.Name as string;
    } catch { /* use ID */ }
  }

  return Response.json({
    success: true,
    intakeName,
    sfIntakeId,
    portalUrl,
    emailSent,
    message: emailSent
      ? `Invitation emailed to ${clientEmail}`
      : `Intake created. Email could not be sent — share this link manually: ${portalUrl}`,
  });
}
