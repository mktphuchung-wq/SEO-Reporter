import { google } from "googleapis";
import { getGoogleOAuthConfig, TOKEN_REFRESH_WINDOW_MS } from "../config.js";
import { getGoogleTokens, upsertGoogleTokens } from "./authDatabase.js";

export function createGoogleOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildGoogleConnectUrl(state) {
  const { scope } = getGoogleOAuthConfig();
  const client = createGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [scope],
    state,
  });
}

export async function exchangeCodeForGoogleTokens(code) {
  const client = createGoogleOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

function tokensToGoogleCredentials(tokens) {
  return {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate,
    scope: tokens.scope,
    token_type: tokens.tokenType,
    id_token: tokens.idToken,
  };
}

export async function refreshGoogleTokens({ userId }) {
  const storedTokens = await getGoogleTokens(userId);
  if (!storedTokens?.refreshToken) {
    throw new Error("No Google refresh token found. Connect Google first.");
  }

  const client = createGoogleOAuthClient();
  client.setCredentials(tokensToGoogleCredentials(storedTokens));
  const { credentials } = await client.refreshAccessToken();
  return upsertGoogleTokens({ userId, tokens: credentials });
}

export async function getValidGoogleAccessToken({ userId }) {
  const storedTokens = await getGoogleTokens(userId);
  if (!storedTokens?.refreshToken) {
    throw new Error("Google account is not connected.");
  }

  const expiresAt = Number(storedTokens.expiryDate || 0);
  if (!storedTokens.accessToken || !expiresAt || expiresAt - Date.now() <= TOKEN_REFRESH_WINDOW_MS) {
    const refreshedTokens = await refreshGoogleTokens({ userId });
    return refreshedTokens.accessToken;
  }

  return storedTokens.accessToken;
}

export async function createGoogleAuthClientForUser(userId) {
  const storedTokens = await getGoogleTokens(userId);
  if (!storedTokens?.refreshToken) {
    return null;
  }

  await getValidGoogleAccessToken({ userId });
  const latestTokens = await getGoogleTokens(userId);
  const client = createGoogleOAuthClient();
  client.setCredentials(tokensToGoogleCredentials(latestTokens));
  return client;
}
