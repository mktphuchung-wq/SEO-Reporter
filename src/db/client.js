import pg from "pg";

const { Pool } = pg;

let pool;
let poolConfigSignature;

const CONNECTION_URL_ENV_NAMES = ["DATABASE_URL"];

function stripMatchingQuotes(value) {
  let normalized = value.trim();
  for (const [openingQuote, closingQuote] of [
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
  ]) {
    if (normalized.startsWith(openingQuote) && normalized.endsWith(closingQuote)) {
      normalized = normalized.slice(openingQuote.length, -closingQuote.length).trim();
      break;
    }
  }
  return normalized;
}

function normalizeConnectionStringValue(name, value) {
  let normalized = String(value || "").trim();
  for (let index = 0; index < 3; index += 1) {
    normalized = stripMatchingQuotes(normalized);
    normalized = normalized.replace(new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*`), "").trim();
  }
  return stripMatchingQuotes(normalized);
}

function getConfiguredConnectionString() {
  for (const name of CONNECTION_URL_ENV_NAMES) {
    const value = process.env[name];
    if (value && String(value).trim()) {
      return { name, value: normalizeConnectionStringValue(name, value) };
    }
  }
  return null;
}

function getSupabaseProjectRefFromEnv() {
  const explicitRef = String(process.env.SUPABASE_PROJECT_REF || "").trim();
  if (explicitRef) {
    return explicitRef;
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  if (!supabaseUrl) {
    return "";
  }

  try {
    const url = new URL(supabaseUrl);
    const [projectRef] = url.hostname.split(".");
    return projectRef || "";
  } catch {
    return "";
  }
}

function isSupabasePoolerUrl(url) {
  return url.hostname.endsWith(".pooler.supabase.com");
}

function applySupabasePoolerUsernameFix(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }

  if (!isSupabasePoolerUrl(url) || url.username !== "postgres") {
    return connectionString;
  }

  const projectRef = getSupabaseProjectRefFromEnv();
  if (!projectRef) {
    return connectionString;
  }

  url.username = `postgres.${projectRef}`;
  return url.toString();
}

function getDatabaseConnectionString() {
  const configured = getConfiguredConnectionString();
  if (!configured) {
    throw new Error("DATABASE_URL is not configured. Set it to your Supabase Postgres connection string before using database-backed report jobs.");
  }

  return applySupabasePoolerUsernameFix(configured.value);
}

function shouldUseSsl(connectionString) {
  const sslMode = String(process.env.PGSSLMODE || "").toLowerCase();
  if (["disable", "false", "0"].includes(sslMode)) {
    return false;
  }
  return process.env.NODE_ENV === "production" || Boolean(connectionString.includes("supabase")) || ["require", "prefer"].includes(sslMode);
}

function buildPoolConfig() {
  const connectionString = getDatabaseConnectionString();
  return {
    connectionString,
    max: Number.parseInt(process.env.PG_POOL_MAX || "3", 10),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
  };
}

function getPool() {
  const config = buildPoolConfig();
  const signature = `${config.connectionString}|${config.max}|${config.idleTimeoutMillis}|${config.connectionTimeoutMillis}|${Boolean(config.ssl)}`;

  if (!pool || signature !== poolConfigSignature) {
    pool = new Pool(config);
    poolConfigSignature = signature;
  }

  return pool;
}

function hasSupabasePoolerUserMismatch() {
  const configured = getConfiguredConnectionString();
  if (!configured) {
    return false;
  }

  try {
    const url = new URL(configured.value);
    return isSupabasePoolerUrl(url) && url.username === "postgres" && !getSupabaseProjectRefFromEnv();
  } catch {
    return false;
  }
}

function isPasswordAuthenticationError(error) {
  return error?.code === "28P01" || /password authentication failed/i.test(String(error?.message || ""));
}

function withDatabaseErrorContext(error) {
  if (!isPasswordAuthenticationError(error)) {
    return error;
  }

  const hints = ["Postgres password authentication failed."];
  if (hasSupabasePoolerUserMismatch()) {
    hints.push("Supabase pooler URLs require a username in the form postgres.<project-ref>; set SUPABASE_PROJECT_REF (or SUPABASE_URL) so the app can normalize it automatically, or update the connection string directly.");
  }
  hints.push("Verify the database password and percent-encode special characters in the password portion of the connection string.");

  error.message = hints.join(" ");
  return error;
}

export function query(text, params) {
  return getPool()
    .query(text, params)
    .catch((error) => {
      throw withDatabaseErrorContext(error);
    });
}
