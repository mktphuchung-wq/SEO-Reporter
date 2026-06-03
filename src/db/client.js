import pg from "pg";

const { Pool } = pg;

let pool;

function shouldUseSsl() {
  const sslMode = String(process.env.PGSSLMODE || "").toLowerCase();
  if (["disable", "false", "0"].includes(sslMode)) {
    return false;
  }
  return process.env.NODE_ENV === "production" || Boolean(process.env.DATABASE_URL?.includes("supabase")) || ["require", "prefer"].includes(sslMode);
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Set it to your Supabase Postgres connection string before using database-backed report jobs.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number.parseInt(process.env.PG_POOL_MAX || "3", 10),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : false,
    });
  }

  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}
