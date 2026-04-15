import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";
import { createIntake, updateIntake } from "@/lib/salesforce/connector";
import { getAppUrl, SF_CONFIG } from "@/config";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/dashboard/invite
 *
 * Creates an intake record in Salesforce and sends a secure upload
 * email to the client. Everything stays in Salesforce — no external storage.
 *
 * Body: { clientName: string, clientEmail: string }
 */
export async function POST(request: NextRequest) {
  const { clientName, clientEmail } = await request.json();

  if (!clientName || !clientEmail) {
    return Response.json({ error: "clientName and clientEmail required" }, { status: 400 });
  }

  const token = uuidv4();
  const appUrl = getAppUrl();
  const portalUrl = `${appUrl}/portal/${token}`;

  // 7-day expiration
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Create the SF intake record with upload token
  let sfIntakeId: string | null = null;
  try {
    const conn = await getSFConnection();
    const result = await conn.sobject(SF_CONFIG.objectName).create({
      Status__c: "Link Sent",
      Intake_Date__c: new Date().toISOString().split("T")[0],
      Upload_Token__c: token,
      Upload_Expires_At__c: expiresAt.toISOString(),
      Document_Upload_URL__c: portalUrl,
      Client_Name__c: clientName,
      Client_Email__c: clientEmail,
    });

    if (!result.success) {
      throw new Error(JSON.stringify(result.errors));
    }
    sfIntakeId = result.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Failed to create intake: " + msg }, { status: 500 });
  }

  // Send email to client via Salesforce
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

Your documents are encrypted and stored securely. Only your assigned advisor can access them.

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
            emailSubject: "Capital Wealth — Secure Document Upload for Your Retirement Money Map",
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
  }

  // Get the FBI record name
  let intakeName = sfIntakeId || "pending";
  try {
    const conn = await getSFConnection();
    const record = await conn.sobject(SF_CONFIG.objectName).retrieve(sfIntakeId!);
    intakeName = record.Name as string;
  } catch { /* use ID */ }

  return Response.json({
    success: true,
    intakeName,
    sfIntakeId,
    portalUrl,
    emailSent,
    message: emailSent
      ? `Invitation emailed to ${clientEmail}`
      : `Intake created. Copy this link and send manually: ${portalUrl}`,
  });
}
