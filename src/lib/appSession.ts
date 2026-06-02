import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Credentials } from "google-auth-library";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "seo_reporter_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const DB_PATH = process.env.SEO_REPORTER_DATABASE_PATH || path.join(process.cwd(), ".data", "seo-reporter.sqlite");

type SessionRow = {
  id: string;
  user_id: string;
  oauth_state: string | null;
  expires_at: string;
};

type GoogleConnectionRow = {
  tokens_json: string;
};

let database: DatabaseSync | null = null;

function getDatabase() {
  if (database) {
    return database;
  }

  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      oauth_state TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS google_connections (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      tokens_json TEXT NOT NULL,
      connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return database;
}

function isoFromNow(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

function getSessionId(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE)?.value;
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function getOrCreateAppSession(request: NextRequest): { session: SessionRow; isNew: boolean } {
  const db = getDatabase();
  const existingId = getSessionId(request);
  const now = new Date().toISOString();

  if (existingId) {
    const session = db
      .prepare("SELECT id, user_id, oauth_state, expires_at FROM sessions WHERE id = ? AND expires_at > ?")
      .get(existingId, now) as SessionRow | undefined;

    if (session) {
      db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(isoFromNow(SESSION_TTL_MS), session.id);
      return { session: { ...session, expires_at: isoFromNow(SESSION_TTL_MS) }, isNew: false };
    }
  }

  const userId = randomUUID();
  const sessionId = randomBytes(32).toString("base64url");
  const expiresAt = isoFromNow(SESSION_TTL_MS);

  db.prepare("INSERT INTO users (id) VALUES (?)").run(userId);
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(sessionId, userId, expiresAt);

  return {
    session: { id: sessionId, user_id: userId, oauth_state: null, expires_at: expiresAt },
    isNew: true,
  };
}

export function getAppSession(request: NextRequest): SessionRow | null {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return null;
  }

  const session = getDatabase()
    .prepare("SELECT id, user_id, oauth_state, expires_at FROM sessions WHERE id = ? AND expires_at > ?")
    .get(sessionId, new Date().toISOString()) as SessionRow | undefined;

  return session ?? null;
}

export function setOAuthState(sessionId: string, state: string) {
  getDatabase().prepare("UPDATE sessions SET oauth_state = ? WHERE id = ?").run(state, sessionId);
}

export function clearOAuthState(sessionId: string) {
  getDatabase().prepare("UPDATE sessions SET oauth_state = NULL WHERE id = ?").run(sessionId);
}

export function upsertGoogleTokens(userId: string, tokens: Credentials) {
  getDatabase()
    .prepare(`
      INSERT INTO google_connections (user_id, tokens_json, connected_at, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        tokens_json = excluded.tokens_json,
        updated_at = CURRENT_TIMESTAMP
    `)
    .run(userId, JSON.stringify(tokens));
}

export function getGoogleTokens(userId: string): Credentials | null {
  const row = getDatabase()
    .prepare("SELECT tokens_json FROM google_connections WHERE user_id = ?")
    .get(userId) as GoogleConnectionRow | undefined;

  if (!row) {
    return null;
  }

  return JSON.parse(row.tokens_json) as Credentials;
}
