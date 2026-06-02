const REQUIRED_GOOGLE_GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

type GoogleEnv = {
  NEXT_PUBLIC_APP_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  GOOGLE_GSC_SCOPE: string;
};

function stripMatchingQuotes(value: string): string {
  let normalized = value.trim();

  for (const [openingQuote, closingQuote] of [
    ['"', '"'],
    ["'", "'"],
    ['\\"', '\\"'],
    ["\\'", "\\'"],
  ] as const) {
    if (normalized.startsWith(openingQuote) && normalized.endsWith(closingQuote)) {
      normalized = normalized.slice(openingQuote.length, -closingQuote.length).trim();
      break;
    }
  }

  return normalized;
}

function normalizeEnvValue(name: keyof GoogleEnv, value: string): string {
  let normalized = value.trim();
  const assignmentPrefix = `${name}=`;

  if (normalized.startsWith(assignmentPrefix)) {
    normalized = normalized.slice(assignmentPrefix.length).trim();
  }

  normalized = stripMatchingQuotes(normalized);

  return normalized;
}

function requireEnv(name: keyof GoogleEnv): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return normalizeEnvValue(name, value);
}

function assertValidUrl(name: keyof GoogleEnv, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL. Current normalized value: ${JSON.stringify(value)}.`);
  }

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production.`);
  }
}

export function getGoogleEnv(): GoogleEnv {
  const env = {
    NEXT_PUBLIC_APP_URL: requireEnv("NEXT_PUBLIC_APP_URL"),
    GOOGLE_CLIENT_ID: requireEnv("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: requireEnv("GOOGLE_CLIENT_SECRET"),
    GOOGLE_REDIRECT_URI: requireEnv("GOOGLE_REDIRECT_URI"),
    GOOGLE_GSC_SCOPE: requireEnv("GOOGLE_GSC_SCOPE"),
  };

  assertValidUrl("NEXT_PUBLIC_APP_URL", env.NEXT_PUBLIC_APP_URL);
  assertValidUrl("GOOGLE_REDIRECT_URI", env.GOOGLE_REDIRECT_URI);

  if (env.GOOGLE_GSC_SCOPE !== REQUIRED_GOOGLE_GSC_SCOPE) {
    throw new Error(`GOOGLE_GSC_SCOPE must be ${REQUIRED_GOOGLE_GSC_SCOPE}.`);
  }

  return env;
}

export { REQUIRED_GOOGLE_GSC_SCOPE };
