import { NextRequest, NextResponse } from "next/server";
import { getGoogleEnv, getNormalizedGoogleEnvValue } from "../../../../src/lib/env";
import { getRequestUserId } from "../../../../src/lib/auth/currentUser";
import { upsertGoogleTokenForUser } from "../../../../src/lib/db/googleTokens";
import { exchangeCodeForGoogleToken, getExpiryDate, isValidOAuthState } from "../../../../src/lib/google/oauth";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "google_oauth_state";

function getSafeAppUrl(fallbackOrigin: string): string {
  const configuredAppUrl = getNormalizedGoogleEnvValue("NEXT_PUBLIC_APP_URL");
  if (!configuredAppUrl) {
    return fallbackOrigin;
  }

  try {
    return new URL(configuredAppUrl).toString();
  } catch {
    return fallbackOrigin;
  }
}

function redirectToDashboard(request: NextRequest, status: "connected" | "error", message?: string): NextResponse {
  const fallbackOrigin = new URL(request.url).origin;
  const appUrl = getSafeAppUrl(fallbackOrigin);
  const url = new URL("/dashboard/integrations/google-search-console", appUrl);
  url.searchParams.set("google", status);
  if (message) {
    url.searchParams.set("message", message);
  }
  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
    const userId = getRequestUserId(request);

    if (!code) {
      throw new Error("Missing Google authorization code.");
    }
    if (!isValidOAuthState(state, expectedState)) {
      throw new Error("Invalid Google OAuth state.");
    }
    if (!userId) {
      throw new Error("No authenticated app user was found for this OAuth callback.");
    }

    const env = getGoogleEnv();
    const token = await exchangeCodeForGoogleToken(code);
    if (!token.refresh_token) {
      throw new Error("Google did not return a refresh token. Reconnect with consent to grant offline access.");
    }

    await upsertGoogleTokenForUser(userId, {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expiry_date: getExpiryDate(token.expires_in),
      scope: token.scope || env.GOOGLE_GSC_SCOPE,
      token_type: token.token_type || "Bearer",
    });

    return redirectToDashboard(request, "connected");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google OAuth callback failed.";
    return redirectToDashboard(request, "error", message);
  }
}
