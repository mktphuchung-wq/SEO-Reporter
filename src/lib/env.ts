const REQUIRED_GOOGLE_GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const DEFAULT_GOOGLE_GSC_SCOPE = REQUIRED_GOOGLE_GSC_SCOPE;

type GoogleEnv = {
  NEXT_PUBLIC_APP_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  GOOGLE_GSC_SCOPE: string;
};

const URL_ENV_NAMES: Array<keyof GoogleEnv> = ["NEXT_PUBLIC_APP_URL", "GOOGLE_REDIRECT_URI"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripMatchingQuotes(value: string): string {
  let normalized = value.trim();

  for (const [openingQuote, closingQuote] of [
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
    ['\\"', '\\"'],
    ["\\'", "\\'"],
    ["\\`", "\\`"],
  ] as const) {
    if (normalized.startsWith(openingQuote) && normalized.endsWith(closingQuote)) {
      normalized = normalized.slice(openingQuote.length, -closingQuote.length).trim();
      break;
    }
  }

  return normalized;
}

function stripEnvAssignment(name: keyof GoogleEnv, value: string): string {
  const assignmentPattern = new RegExp(`^(?:export\\s+)?${escapeRegExp(name)}\\s*=\\s*`);
  return value.replace(assignmentPattern, "").trim();
}

function unescapeCommonEnvUrlCharacters(value: string): string {
  return value.replace(/\\\//g, "/").replace(/&amp;/g, "&");
}

function extractUrlValue(name: keyof GoogleEnv, value: string): string {
  if (!URL_ENV_NAMES.includes(name)) {
    return value;
  }

  const normalized = unescapeCommonEnvUrlCharacters(value);
  const urlMatch = normalized.match(/https?:\/\/[^\s"'`\\<>),;]+/);
  return urlMatch?.[0] ?? normalized;
}

function normalizeEnvValue(name: keyof GoogleEnv, value: string): string {
  let normalized = value.trim();

  for (let index = 0; index < 3; index += 1) {
    normalized = stripMatchingQuotes(normalized);
    normalized = stripEnvAssignment(name, normalized);
  }

  normalized = stripMatchingQuotes(normalized);
  normalized = extractUrlValue(name, normalized);

  return normalized;
}

export function getNormalizedGoogleEnvValue(name: keyof GoogleEnv): string | null {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return null;
  }

  return normalizeEnvValue(name, value);
}

function requireEnv(name: keyof GoogleEnv): string {
  const value = getNormalizedGoogleEnvValue(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assertValidUrl(name: keyof GoogleEnv, value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL. Current normalized value: ${JSON.stringify(value)}.`);
  }

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production.`);
  }

  return url;
}

function getOptionalValidUrl(name: keyof GoogleEnv): URL | null {
  const value = getNormalizedGoogleEnvValue(name);
  if (!value) {
    return null;
  }

  try {
    return assertValidUrl(name, value);
  } catch {
    return null;
  }
}

function getAppUrl(redirectUri: URL): string {
  const configuredAppUrl = getOptionalValidUrl("NEXT_PUBLIC_APP_URL");
  if (configuredAppUrl) {
    return configuredAppUrl.toString();
  }

  return redirectUri.origin;
}

export function getGoogleEnv(): GoogleEnv {
  const redirectUri = requireEnv("GOOGLE_REDIRECT_URI");
  const validatedRedirectUri = assertValidUrl("GOOGLE_REDIRECT_URI", redirectUri);

  const env = {
    NEXT_PUBLIC_APP_URL: getAppUrl(validatedRedirectUri),
    GOOGLE_CLIENT_ID: requireEnv("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: requireEnv("GOOGLE_CLIENT_SECRET"),
    GOOGLE_REDIRECT_URI: validatedRedirectUri.toString(),
    GOOGLE_GSC_SCOPE: getNormalizedGoogleEnvValue("GOOGLE_GSC_SCOPE") || DEFAULT_GOOGLE_GSC_SCOPE,
  };

  if (env.GOOGLE_GSC_SCOPE !== REQUIRED_GOOGLE_GSC_SCOPE) {
    throw new Error(`GOOGLE_GSC_SCOPE must be ${REQUIRED_GOOGLE_GSC_SCOPE}.`);
  }

  return env;
}

export { REQUIRED_GOOGLE_GSC_SCOPE };
