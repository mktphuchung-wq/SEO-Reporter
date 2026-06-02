import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertProductionDatabaseConfig, hasProductionDatabaseConfig } from "../config.js";

const LOCAL_DB_PATH = path.resolve(process.env.LOCAL_AUTH_DB_PATH || ".data/auth-db.json");
const KEY_PREFIX = process.env.AUTH_DB_KEY_PREFIX || "seo-reporter";

function key(name) {
  return `${KEY_PREFIX}:${name}`;
}

function now() {
  return Date.now();
}

export function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
}

async function upstash(command) {
  assertProductionDatabaseConfig();
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`Auth database request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(`Auth database error: ${payload.error}`);
  }

  return payload.result;
}

async function readLocalDb() {
  try {
    const content = await fs.readFile(LOCAL_DB_PATH, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeLocalDb(db) {
  await fs.mkdir(path.dirname(LOCAL_DB_PATH), { recursive: true });
  const tempPath = `${LOCAL_DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tempPath, LOCAL_DB_PATH);
}

async function setJson(name, value, ttlSeconds) {
  assertProductionDatabaseConfig();
  const storageKey = key(name);
  const payload = JSON.stringify({ value, expiresAt: ttlSeconds ? now() + ttlSeconds * 1000 : null });

  if (hasProductionDatabaseConfig()) {
    if (ttlSeconds) {
      await upstash(["SET", storageKey, payload, "EX", ttlSeconds]);
    } else {
      await upstash(["SET", storageKey, payload]);
    }
    return;
  }

  const db = await readLocalDb();
  db[storageKey] = payload;
  await writeLocalDb(db);
}

async function getJson(name) {
  assertProductionDatabaseConfig();
  const storageKey = key(name);
  let payload;

  if (hasProductionDatabaseConfig()) {
    payload = await upstash(["GET", storageKey]);
  } else {
    const db = await readLocalDb();
    payload = db[storageKey];
  }

  if (!payload) {
    return null;
  }

  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (parsed.expiresAt && parsed.expiresAt <= now()) {
    await deleteJson(name);
    return null;
  }

  return parsed.value;
}

async function deleteJson(name) {
  assertProductionDatabaseConfig();
  const storageKey = key(name);

  if (hasProductionDatabaseConfig()) {
    await upstash(["DEL", storageKey]);
    return;
  }

  const db = await readLocalDb();
  delete db[storageKey];
  await writeLocalDb(db);
}

export async function createUser() {
  const user = {
    id: generateId("usr"),
    createdAt: new Date().toISOString(),
  };
  await setJson(`user:${user.id}`, user);
  return user;
}

export async function getUser(userId) {
  if (!userId) {
    return null;
  }
  return getJson(`user:${userId}`);
}

export async function createSession({ userId, data = {}, ttlSeconds }) {
  const session = {
    id: generateId("sess"),
    userId,
    data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setJson(`session:${session.id}`, session, ttlSeconds);
  return session;
}

export async function getSession(sessionId) {
  if (!sessionId) {
    return null;
  }
  return getJson(`session:${sessionId}`);
}

export async function updateSession(session, ttlSeconds) {
  const nextSession = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  await setJson(`session:${nextSession.id}`, nextSession, ttlSeconds);
  return nextSession;
}

export async function deleteSession(sessionId) {
  if (!sessionId) {
    return;
  }
  await deleteJson(`session:${sessionId}`);
}

export async function upsertGoogleTokens({ userId, tokens }) {
  if (!userId) {
    throw new Error("Missing userId for Google token storage.");
  }

  const existing = (await getGoogleTokens(userId)) || {};
  const stored = {
    ...existing,
    accessToken: tokens.access_token || existing.accessToken || null,
    refreshToken: tokens.refresh_token || existing.refreshToken || null,
    expiryDate: tokens.expiry_date || existing.expiryDate || null,
    scope: tokens.scope || existing.scope || null,
    tokenType: tokens.token_type || existing.tokenType || null,
    idToken: tokens.id_token || existing.idToken || null,
    updatedAt: new Date().toISOString(),
  };

  if (!stored.refreshToken) {
    throw new Error("Google did not return a refresh_token. Reconnect with prompt=consent and access_type=offline.");
  }

  await setJson(`tokens:google:${userId}`, stored);
  return stored;
}

export async function getGoogleTokens(userId) {
  if (!userId) {
    return null;
  }
  return getJson(`tokens:google:${userId}`);
}

export async function deleteGoogleTokens(userId) {
  if (!userId) {
    return;
  }
  await deleteJson(`tokens:google:${userId}`);
}
