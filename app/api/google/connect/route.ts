import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createGoogleOAuthClient, GSC_SCOPE } from "../../../../src/lib/googleSearchConsoleAuth";
import {
  getOrCreateAppSession,
  getSessionCookieName,
  getSessionCookieOptions,
  setOAuthState,
} from "../../../../src/lib/appSession";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { session, isNew } = getOrCreateAppSession(request);
    const state = randomBytes(32).toString("base64url");
    setOAuthState(session.id, state);

    const client = createGoogleOAuthClient(request);
    const authUrl = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [GSC_SCOPE],
      state,
    });

    const response = NextResponse.redirect(authUrl);
    if (isNew) {
      response.cookies.set(getSessionCookieName(), session.id, getSessionCookieOptions());
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start Google OAuth." },
      { status: 400 },
    );
  }
}
