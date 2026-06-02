import { NextRequest, NextResponse } from "next/server";
import { ensureRequestUserId } from "../../../../src/lib/auth/currentUser";
import { buildGoogleOAuthUrl, generateOAuthState } from "../../../../src/lib/google/oauth";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "google_oauth_state";
const STATE_MAX_AGE_SECONDS = 10 * 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const state = generateOAuthState();
    const authUrl = buildGoogleOAuthUrl(state);
    const response = NextResponse.redirect(authUrl);

    ensureRequestUserId(request, response);
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: STATE_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start Google OAuth." },
      { status: 400 },
    );
  }
}
