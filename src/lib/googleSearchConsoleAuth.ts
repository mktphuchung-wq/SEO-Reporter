import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { NextRequest } from "next/server";

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export function getGoogleRedirectUri(request: NextRequest): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }

  return new URL("/api/google/callback", request.url).toString();
}

export function createGoogleOAuthClient(request: NextRequest): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
  }

  return new google.auth.OAuth2(clientId, clientSecret, getGoogleRedirectUri(request));
}
