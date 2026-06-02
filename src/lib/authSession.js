import crypto from "node:crypto";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, getSessionSecret, isProduction } from "../config.js";
import { createSession, createUser, deleteSession, getSession, getUser, updateSession } from "./authDatabase.js";

function sign(value) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function encodeCookieValue(sessionId) {
  return `${sessionId}.${sign(sessionId)}`;
}

function decodeCookieValue(value) {
  if (!value) {
    return null;
  }

  const [sessionId, signature] = value.split(".");
  if (!sessionId || !signature) {
    return null;
  }

  const expected = sign(sessionId);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  return sessionId;
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex === -1) {
          return [part, ""];
        }
        return [part.slice(0, separatorIndex), decodeURIComponent(part.slice(separatorIndex + 1))];
      }),
  );
}

function buildCookie(value, { maxAge = SESSION_TTL_SECONDS } = {}) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (isProduction()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function clearCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction() ? "; Secure" : ""}`;
}

export async function attachSession(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = decodeCookieValue(cookies[SESSION_COOKIE_NAME]);
    const session = await getSession(sessionId);

    req.authSession = session;
    req.authUser = session ? await getUser(session.userId) : null;
    req.ensureAuthSession = async () => ensureAuthSession(req, res);
    req.saveAuthSession = async () => saveAuthSession(req);
    req.destroyAuthSession = async () => destroyAuthSession(req, res);

    next();
  } catch (error) {
    next(error);
  }
}

export async function ensureAuthSession(req, res) {
  if (req.authSession && req.authUser) {
    return req.authSession;
  }

  const user = await createUser();
  const session = await createSession({ userId: user.id, data: {}, ttlSeconds: SESSION_TTL_SECONDS });
  req.authUser = user;
  req.authSession = session;
  res.setHeader("Set-Cookie", buildCookie(encodeCookieValue(session.id)));
  return session;
}

export async function saveAuthSession(req) {
  if (!req.authSession) {
    return null;
  }
  req.authSession = await updateSession(req.authSession, SESSION_TTL_SECONDS);
  return req.authSession;
}

export async function destroyAuthSession(req, res) {
  if (req.authSession?.id) {
    await deleteSession(req.authSession.id);
  }
  req.authSession = null;
  req.authUser = null;
  res.setHeader("Set-Cookie", clearCookie());
}
