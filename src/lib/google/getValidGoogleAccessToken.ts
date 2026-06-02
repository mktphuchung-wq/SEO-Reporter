import { getGoogleEnv } from "../env";
import { getGoogleTokenForUser, updateGoogleTokenForUser } from "../db/googleTokens";
import { getExpiryDate, refreshGoogleAccessToken } from "./oauth";

const EXPIRY_SAFETY_WINDOW_MS = 60 * 1000;

export async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const token = await getGoogleTokenForUser(userId);
  if (!token) {
    throw new Error("Google Search Console is not connected for this user.");
  }

  if (token.expiry_date > Date.now() + EXPIRY_SAFETY_WINDOW_MS) {
    return token.access_token;
  }

  const refreshed = await refreshGoogleAccessToken(token.refresh_token);
  const env = getGoogleEnv();
  const updated = await updateGoogleTokenForUser(userId, {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || token.refresh_token,
    expiry_date: getExpiryDate(refreshed.expires_in),
    scope: refreshed.scope || token.scope || env.GOOGLE_GSC_SCOPE,
    token_type: refreshed.token_type || token.token_type || "Bearer",
  });

  return updated.access_token;
}
