import { NextResponse, type NextRequest } from "next/server";
import { createGoogleOAuthClient } from "../../../../src/lib/googleSearchConsoleAuth";
import { clearOAuthState, getAppSession, upsertGoogleTokens } from "../../../../src/lib/appSession";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const callbackUrl = new URL(request.url);
  const dashboardUrl = new URL("/dashboard/integrations/google-search-console", request.url);

  try {
    const code = callbackUrl.searchParams.get("code");
    const state = callbackUrl.searchParams.get("state");
    const session = getAppSession(request);

    if (!session) {
      throw new Error("Missing or expired app session. Start the Google connection again.");
    }
    if (!code) {
      throw new Error("Missing Google authorization code.");
    }
    if (!state || state !== session.oauth_state) {
      throw new Error("Invalid Google OAuth state.");
    }

    const client = createGoogleOAuthClient(request);
    const { tokens } = await client.getToken(code);

    // Tokens are stored only after this request is associated with a database-backed user/session.
    upsertGoogleTokens(session.user_id, tokens);
    clearOAuthState(session.id);

    dashboardUrl.searchParams.set("connected", "1");
    return NextResponse.redirect(dashboardUrl);
  } catch (error) {
    dashboardUrl.searchParams.set("error", error instanceof Error ? error.message : "Google OAuth callback failed.");
    return NextResponse.redirect(dashboardUrl);
  }
}
