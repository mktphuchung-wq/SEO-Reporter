import crypto from "node:crypto";
import { getGoogleEnv } from "../env";

export type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function isValidOAuthState(receivedState: string | null, expectedState: string | undefined): boolean {
  if (!receivedState || !expectedState) {
    return false;
  }

  const received = Buffer.from(receivedState);
  const expected = Buffer.from(expectedState);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function buildGoogleOAuthUrl(state: string): string {
  const env = getGoogleEnv();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", env.GOOGLE_GSC_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForGoogleToken(code: string): Promise<GoogleTokenResponse> {
  const env = getGoogleEnv();
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await response.json()) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Failed to exchange Google authorization code.");
  }
  if (!data.access_token) {
    throw new Error("Google token response did not include an access token.");
  }

  return data;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const env = getGoogleEnv();
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await response.json()) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Failed to refresh Google access token.");
  }
  if (!data.access_token) {
    throw new Error("Google refresh response did not include an access token.");
  }

  return data;
}

export function getExpiryDate(expiresInSeconds?: number): number {
  return Date.now() + (expiresInSeconds ?? 3600) * 1000;
}
