import dotenv from "dotenv";

dotenv.config();

export const GOOGLE_GSC_SCOPE =
  process.env.GOOGLE_GSC_SCOPE || "https://www.googleapis.com/auth/webmasters.readonly";

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "seo_reporter_session";
export const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 8);
export const TOKEN_REFRESH_WINDOW_MS = Number(process.env.TOKEN_REFRESH_WINDOW_MS || 5 * 60 * 1000);

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret && isProduction()) {
    throw new Error("Missing SESSION_SECRET for production session cookies.");
  }
  return secret || "dev-session-secret-change-me";
}

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REDIRECT_URI.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scope: GOOGLE_GSC_SCOPE,
  };
}

export function hasProductionDatabaseConfig() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function assertProductionDatabaseConfig() {
  if (isProduction() && !hasProductionDatabaseConfig()) {
    throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN for production auth/session/token storage.");
  }
}
