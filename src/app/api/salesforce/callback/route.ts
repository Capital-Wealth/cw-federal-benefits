import { NextRequest } from "next/server";

/**
 * GET /api/salesforce/callback — OAuth callback for Vision's report builder
 *
 * This handles the OAuth redirect from Salesforce after the Connected App
 * authorization flow. Vision's app (cw-federal-report-builder.vercel.app)
 * uses this to exchange the auth code for tokens.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code) {
    return Response.json({ error: "No authorization code received" }, { status: 400 });
  }

  // Exchange auth code for tokens
  const tokenResponse = await fetch(
    "https://login.salesforce.com/services/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.SF_CONSUMER_KEY || "",
        client_secret: process.env.SF_CONSUMER_SECRET || "",
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || "https://cw-federal-report-builder.vercel.app"}/api/salesforce/callback`,
      }),
    }
  );

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    return Response.json(
      { error: "Token exchange failed", details: err },
      { status: 502 }
    );
  }

  const tokens = await tokenResponse.json();

  return Response.json({
    access_token: tokens.access_token,
    instance_url: tokens.instance_url,
    refresh_token: tokens.refresh_token,
  });
}
