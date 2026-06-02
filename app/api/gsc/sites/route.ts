import { google } from "googleapis";
import { NextResponse, type NextRequest } from "next/server";
import { createGoogleOAuthClient } from "../../../../src/lib/googleSearchConsoleAuth";
import { getAppSession, getGoogleTokens } from "../../../../src/lib/appSession";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = getAppSession(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const tokens = getGoogleTokens(session.user_id);
    if (!tokens) {
      return NextResponse.json({ error: "Google Search Console is not connected." }, { status: 401 });
    }

    const auth = createGoogleOAuthClient(request);
    auth.setCredentials(tokens);
    const webmasters = google.webmasters({ version: "v3", auth });
    const response = await webmasters.sites.list();
    const sites = (response.data.siteEntry || [])
      .filter((site) => site.siteUrl && site.permissionLevel && site.permissionLevel !== "siteUnverifiedUser")
      .map((site) => ({ siteUrl: site.siteUrl, permissionLevel: site.permissionLevel }))
      .sort((a, b) => String(a.siteUrl).localeCompare(String(b.siteUrl)));

    return NextResponse.json({ sites });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Google Search Console sites." },
      { status: 500 },
    );
  }
}
