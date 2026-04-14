import { NextRequest } from "next/server";
import { SF_CONFIG, getAppUrl } from "@/config";

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
    SF_CONFIG.oauthTokenUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: SF_CONFIG.consumerKey || "",
        client_secret: SF_CONFIG.consumerSecret || "",
        redirect_uri: `${getAppUrl()}/api/salesforce/callback`,
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
