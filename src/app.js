import express from "express";
import dotenv from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import session from "express-session";
import { google } from "googleapis";
import { renderHomePage as renderDashboardHomePage } from "./pages/homePage.js";
import { renderNewReportPage } from "./pages/newReportPage.js";
import { renderSettingsPage } from "./pages/settingsPage.js";
import { renderReportsPage } from "./pages/reportsPage.js";
import { renderHtmlReport } from "./renderHtmlReport.js";
import { escapeHtml } from "./ui/html.js";
import { filterVerifiedGscSiteEntries, listGscSites, normalizeGscSiteEntries } from "./datasources/gscApi.js";
import { query as dbQuery } from "./db/client.js";
import {
  getReportJob,
  listRecentReportJobs,
  saveReportJob,
} from "./db/reportJobs.js";
import { generateReportFromInput } from "./services/reportGenerator.js";

dotenv.config();

const app = express();
const OUTPUT_DIR = path.resolve("output");
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("Missing required SESSION_SECRET in production. Set SESSION_SECRET to a strong random value.");
}

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret-change-me";
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GOOGLE_PROFILE_SCOPES = ["openid", "email", "profile"];
const MAX_TRACKED_KEYWORDS = Number.parseInt(process.env.MAX_TRACKED_KEYWORDS || "100", 10);
const GOOGLE_OAUTH_CALLBACK_PATH = "/auth/callback";
const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
const GOOGLE_TOKENS_COOKIE = "google_oauth_tokens";
const GOOGLE_OAUTH_STATE_MAX_AGE_MS = 1000 * 60 * 10;
const GOOGLE_TOKENS_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

const PRESET_STORAGE_PATH = path.resolve(process.env.PRESET_STORAGE_PATH || ".data/presets.json");
const PRESET_FIELDS = ["siteUrl", "searchType", "reportPeriod", "startDate", "endDate", "pageContains", "trackedKeywords", "enableAiInsights"];

app.set("trust proxy", 1);
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getRequestOrigin(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function buildRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  if (isProduction()) {
    throw new Error("Missing required GOOGLE_REDIRECT_URI in production. Set it to your authorized Google OAuth callback URL.");
  }
  return new URL(GOOGLE_OAUTH_CALLBACK_PATH, getRequestOrigin(req)).toString();
}

function generateOAuthState() {
  return crypto.randomBytes(32).toString("base64url");
}

function isValidOAuthState(receivedState, expectedState) {
  if (!receivedState || !expectedState) {
    return false;
  }

  const received = Buffer.from(String(receivedState));
  const expected = Buffer.from(String(expectedState));
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function setOAuthStateCookie(res, state) {
  res.cookie(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: GOOGLE_OAUTH_STATE_MAX_AGE_MS,
  });
}

function clearOAuthStateCookie(res) {
  res.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
  });
}

function getCookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge,
  };
}

function getTokenEncryptionKey() {
  return crypto.createHash("sha256").update(SESSION_SECRET).digest();
}

function encryptGoogleTokens(tokens) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getTokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map((value) => value.toString("base64url")).join(".");
}

function decryptGoogleTokens(value) {
  if (!value) {
    return null;
  }

  try {
    const [encodedIv, encodedAuthTag, encodedEncrypted] = String(value).split(".");
    if (!encodedIv || !encodedAuthTag || !encodedEncrypted) {
      return null;
    }

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getTokenEncryptionKey(), Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encodedEncrypted, "base64url")), decipher.final()]);
    const tokens = JSON.parse(decrypted.toString("utf8"));

    return tokens && typeof tokens === "object" && tokens.access_token ? tokens : null;
  } catch {
    return null;
  }
}

function readGoogleTokensCookie(req) {
  return decryptGoogleTokens(parseCookieHeader(req.headers.cookie)[GOOGLE_TOKENS_COOKIE]);
}

function getGoogleTokens(req) {
  return req.session?.googleTokens || readGoogleTokensCookie(req);
}

function setGoogleTokens(req, res, tokens) {
  req.session.googleTokens = tokens;
  res.cookie(GOOGLE_TOKENS_COOKIE, encryptGoogleTokens(tokens), getCookieOptions(GOOGLE_TOKENS_MAX_AGE_MS));
}

function clearGoogleTokens(req, res) {
  req.session.googleTokens = null;
  res.clearCookie(GOOGLE_TOKENS_COOKIE, getCookieOptions(0));
}

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, cookie) => {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex === -1) {
      return cookies;
    }

    const name = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();
    if (!name) {
      return cookies;
    }

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
    return cookies;
  }, {});
}

function createOAuthClient(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = buildRedirectUri(req);
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthorizedClient(req) {
  const tokens = getGoogleTokens(req);
  if (!tokens) {
    return null;
  }
  const client = createOAuthClient(req);
  client.setCredentials(tokens);
  return client;
}

function safeGoogleApiError(error) {
  return {
    status: error?.code || error?.status || error?.response?.status || null,
    message: error instanceof Error ? error.message : "Google API request failed.",
  };
}



function decodeBase64UrlJson(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function getEmailFromIdToken(idToken) {
  const [, payload] = String(idToken || "").split(".");
  const parsed = decodeBase64UrlJson(payload);
  return parsed?.email ? String(parsed.email).trim().toLowerCase() : "";
}

async function fetchGoogleUserProfile(authClient, tokens = {}) {
  const tokenEmail = getEmailFromIdToken(tokens.id_token);
  if (tokenEmail) {
    return { email: tokenEmail, name: tokenEmail };
  }

  const oauth2 = google.oauth2({ version: "v2", auth: authClient });
  const response = await oauth2.userinfo.get();
  const email = String(response.data.email || "").trim().toLowerCase();
  const name = String(response.data.name || response.data.given_name || email || "").trim();
  if (!email) {
    throw new Error("Google account email was not available from the OAuth profile.");
  }
  return { email, name };
}

function clearInternalUser(req) {
  req.session.user = null;
}

function requireAllowedSessionUser(req, res, next) {
  if (!req.session?.user) {
    if (hasAccessAllowlist() && req.path !== "/") {
      res.status(403).type("html").send(renderInternalAccessDeniedPage());
      return;
    }
    next();
    return;
  }

  if (isEmailAllowed(req.session.user.email)) {
    next();
    return;
  }

  clearGoogleTokens(req, res);
  clearInternalUser(req);
  res.status(403).type("html").send(renderInternalAccessDeniedPage());
}

async function loadSitesForSession(req) {
  const authClient = getAuthorizedClient(req);
  if (!authClient) {
    return [];
  }
  return listGscSites({ authClient });
}

async function loadSitesResultForSession(req) {
  try {
    return {
      sites: await loadSitesForSession(req),
      googleApiError: null,
    };
  } catch (error) {
    return {
      sites: [],
      googleApiError: safeGoogleApiError(error),
    };
  }
}

async function buildGscSitesDebugPayload(req) {
  const tokens = getGoogleTokens(req);
  const authenticated = Boolean(tokens);

  if (!authenticated) {
    return {
      authenticated: false,
      hasAccessToken: false,
      hasRefreshToken: false,
      scope: null,
      rawSiteEntryCount: 0,
      rawSiteEntries: [],
      filteredSiteEntryCount: 0,
      filteredSiteEntries: [],
    };
  }

  try {
    const authClient = getAuthorizedClient(req);
    const webmasters = google.webmasters({ version: "v3", auth: authClient });
    const response = await webmasters.sites.list();
    const rawSiteEntries = normalizeGscSiteEntries(response.data.siteEntry || []);
    const filteredSiteEntries = filterVerifiedGscSiteEntries(rawSiteEntries);

    return {
      authenticated: true,
      hasAccessToken: Boolean(tokens.access_token),
      hasRefreshToken: Boolean(tokens.refresh_token),
      scope: tokens.scope || null,
      rawSiteEntryCount: rawSiteEntries.length,
      rawSiteEntries,
      filteredSiteEntryCount: filteredSiteEntries.length,
      filteredSiteEntries,
    };
  } catch (error) {
    return {
      authenticated: true,
      hasAccessToken: Boolean(tokens.access_token),
      hasRefreshToken: Boolean(tokens.refresh_token),
      scope: tokens.scope || null,
      googleApiError: safeGoogleApiError(error),
    };
  }
}


const REPORT_PERIOD_LABELS = {
  "7d": "1 week",
  "30d": "1 month",
  "90d": "3 months",
  "180d": "6 months",
  custom: "Custom date range",
};

function selected(value, expected) {
  return value === expected ? "selected" : "";
}

function checked(value) {
  return value ? "checked" : "";
}

function isEnvEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}


function parseListEnv(value) {
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getAllowedEmails() {
  return new Set(parseListEnv(process.env.ALLOWED_EMAILS));
}

function getAllowedDomains() {
  return new Set(parseListEnv(process.env.ALLOWED_DOMAINS).map((domain) => domain.replace(/^@/, "")));
}

function hasAccessAllowlist() {
  return getAllowedEmails().size > 0 || getAllowedDomains().size > 0;
}

function isEmailAllowed(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return false;
  }

  const allowedEmails = getAllowedEmails();
  const allowedDomains = getAllowedDomains();
  if (allowedEmails.size === 0 && allowedDomains.size === 0) {
    return true;
  }

  const domain = normalizedEmail.split("@").pop();
  return allowedEmails.has(normalizedEmail) || allowedDomains.has(domain);
}

function renderInternalAccessDeniedPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Access denied</title>
  <style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f9f0df;color:#12232e;margin:0;display:grid;min-height:100vh;place-items:center}.card{max-width:620px;background:#fff;border:1px solid #d7dfdc;border-radius:14px;padding:28px;box-shadow:0 20px 50px rgba(18,35,46,.12)}h1{margin-top:0;color:#7f1d1d}.btn{display:inline-block;margin-top:16px;padding:10px 14px;border-radius:8px;background:#2c6e49;color:#fff;text-decoration:none;font-weight:700}</style>
</head>
<body>
  <main class="card">
    <h1>Access denied</h1>
    <p>This account is not allowed to access this internal app.</p>
    <a class="btn" href="/auth/logout">Use a different Google account</a>
  </main>
</body>
</html>`;
}

function findSitePermission(sites, siteUrl) {
  return sites.find((site) => site.siteUrl === siteUrl)?.permissionLevel || "";
}


function isEmptyDataError(error) {
  return error?.code === "EMPTY_GSC_DATA";
}

function buildEmptyDataWarning(error, fallbackInput = {}) {
  const context = error?.emptyDataContext || {};
  const range = context.range || {};
  const pageContains = context.pageContains || fallbackInput.pageContains || "";

  return [
    "No GSC data matched the selected filters.",
    `Property: ${context.property || fallbackInput.siteUrl || "—"}`,
    `Range: ${range.start || fallbackInput.startDate || "—"} -> ${range.end || fallbackInput.endDate || "—"}`,
    `Search type: ${context.searchType || fallbackInput.searchType || "web"}`,
    `Page contains: ${pageContains || "None"}`,
    `Rows returned: page=${context.pageRowCount ?? 0}, keyword=${context.keywordRowCount ?? 0}`,
    "Next steps: confirm the selected GSC property has data for this period; try search type 'web'; widen the report period/custom date range; remove or loosen the Page contains filter; then generate the report again.",
  ].join("\n");
}


function redactSensitiveValue(message) {
  let safeMessage = String(message || "");
  for (const value of [process.env.DATABASE_URL, process.env.SUPABASE_SECRET_KEY, process.env.GOOGLE_CLIENT_SECRET, process.env.OPENROUTER_API_KEY]) {
    if (value) {
      safeMessage = safeMessage.split(value).join("[redacted]");
    }
  }
  return safeMessage;
}

function safeErrorMessage(error, fallback = "An error occurred.") {
  return redactSensitiveValue(error instanceof Error ? error.message : fallback);
}

function safeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function normalizePresetInput(input = {}) {
  return {
    siteUrl: String(input.siteUrl || "").trim(),
    searchType: ["web", "image", "video", "news"].includes(input.searchType) ? input.searchType : "web",
    reportType: ["monthly", "quarterly", "custom"].includes(input.reportType) ? input.reportType : "custom",
    reportPeriod: Object.prototype.hasOwnProperty.call(REPORT_PERIOD_LABELS, input.reportPeriod) ? input.reportPeriod : "30d",
    startDate: String(input.startDate || "").trim(),
    endDate: String(input.endDate || "").trim(),
    pageContains: String(input.pageContains || "").trim(),
    trackedKeywords: String(input.trackedKeywords || ""),
    enableAiInsights: input.enableAiInsights === true || input.enableAiInsights === "1" || input.enableAiInsights === "on",
  };
}

function isPreset(value) {
  return value && typeof value === "object" && PRESET_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(value, field));
}

async function readPresetStore() {
  try {
    const raw = await fs.readFile(PRESET_STORAGE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.presets)) {
      return { presets: [] };
    }

    return {
      presets: parsed.presets.filter(isPreset).map((preset) => ({
        ...normalizePresetInput(preset),
        id: String(preset.id || crypto.randomUUID()),
        name: String(preset.name || preset.siteUrl || "Untitled preset"),
        createdAt: preset.createdAt || new Date().toISOString(),
        updatedAt: preset.updatedAt || preset.createdAt || new Date().toISOString(),
      })),
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { presets: [] };
    }
    throw error;
  }
}

async function writePresetStore(store) {
  await fs.mkdir(path.dirname(PRESET_STORAGE_PATH), { recursive: true });
  await fs.writeFile(PRESET_STORAGE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function listPresets() {
  const store = await readPresetStore();
  return store.presets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function savePreset(input) {
  const preset = normalizePresetInput(input);
  if (!preset.siteUrl) {
    throw new Error("Please select a GSC property before saving a preset.");
  }

  const store = await readPresetStore();
  const now = new Date().toISOString();
  const requestedName = String(input.presetName || "").trim();
  const name = requestedName || `${preset.siteUrl} preset`;
  const existingIndex = store.presets.findIndex((storedPreset) => storedPreset.siteUrl === preset.siteUrl && storedPreset.name === name);
  const nextPreset = {
    ...(existingIndex >= 0 ? store.presets[existingIndex] : { id: crypto.randomUUID(), createdAt: now }),
    ...preset,
    name,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    store.presets[existingIndex] = nextPreset;
  } else {
    store.presets.push(nextPreset);
  }

  await writePresetStore(store);
  return nextPreset;
}

function findLatestPresetForSite(presets, siteUrl) {
  if (!siteUrl) {
    return null;
  }

  return presets
    .filter((preset) => preset.siteUrl === siteUrl)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] || null;
}

function rememberPresetInSession(req, preset) {
  req.session.selectedSiteUrl = preset.siteUrl;
  req.session.reportType = preset.reportType || "custom";
  req.session.reportPeriod = preset.reportPeriod;
  req.session.pageContains = preset.pageContains;
  req.session.trackedKeywords = preset.trackedKeywords;
  req.session.searchType = preset.searchType;
  req.session.startDate = preset.startDate;
  req.session.endDate = preset.endDate;
  req.session.enableAiInsights = preset.enableAiInsights;
}

function startGoogleAuth(req, res) {
  try {
    const client = createOAuthClient(req);
    const state = generateOAuthState();
    req.session.oauthState = state;
    setOAuthStateCookie(res, state);
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [GSC_SCOPE, ...GOOGLE_PROFILE_SCOPES],
      state,
    });
    res.redirect(url);
  } catch (error) {
    res.status(400).send(`Auth config error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function finishGoogleAuth(req, res) {
  try {
    if (!req.query.code) {
      throw new Error("Missing authorization code.");
    }

    const expectedState = parseCookieHeader(req.headers.cookie)[GOOGLE_OAUTH_STATE_COOKIE] || req.session.oauthState;
    if (!isValidOAuthState(req.query.state, expectedState)) {
      throw new Error("Invalid OAuth state.");
    }

    const client = createOAuthClient(req);
    const { tokens } = await client.getToken(String(req.query.code));
    client.setCredentials(tokens);
    const user = await fetchGoogleUserProfile(client, tokens);
    if (!isEmailAllowed(user.email)) {
      clearGoogleTokens(req, res);
      clearInternalUser(req);
      req.session.oauthState = null;
      clearOAuthStateCookie(res);
      res.status(403).type("html").send(renderInternalAccessDeniedPage());
      return;
    }

    req.session.user = user;
    setGoogleTokens(req, res, tokens);
    req.session.oauthState = null;
    clearOAuthStateCookie(res);
    res.redirect("/");
  } catch (error) {
    req.session.oauthState = null;
    clearOAuthStateCookie(res);
    res.status(400).send(`OAuth callback failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

app.get("/auth/google", startGoogleAuth);
app.get("/auth/callback", finishGoogleAuth);
app.get("/api/google/connect", startGoogleAuth);
app.get("/api/google/callback", finishGoogleAuth);
app.get("/dashboard/integrations/google-search-console", (_req, res) => res.redirect("/"));

app.get("/auth/logout", (req, res) => {
  clearGoogleTokens(req, res);
  clearInternalUser(req);
  req.session.oauthState = null;
  res.redirect("/");
});

app.get("/health/db", async (_req, res) => {
  try {
    await dbQuery("select 1 as ok");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: safeErrorMessage(error, "Database health check failed."),
    });
  }
});

app.use(requireAllowedSessionUser);

app.get("/", async (req, res) => {
  const { sites, googleApiError } = await loadSitesResultForSession(req);
  const presets = await listPresets().catch(() => []);
  const requestedSiteUrl = req.query.siteUrl || req.session.selectedSiteUrl || "";
  const latestPreset = findLatestPresetForSite(presets, requestedSiteUrl);
  res.type("html").send(
    renderDashboardHomePage({
      sites,
      authenticated: Boolean(getGoogleTokens(req)),
      user: req.session.user,
      googleApiError,
      presets,
      success: req.query.presetSaved ? "Preset saved." : "",
      defaultValues: {
        ...(latestPreset || {}),
        selectedSiteUrl: req.session.selectedSiteUrl,
        reportType: req.session.reportType,
        reportPeriod: req.session.reportPeriod,
        pageContains: req.session.pageContains,
        trackedKeywords: req.session.trackedKeywords,
        searchType: req.session.searchType,
      },
    }),
  );
});

app.get("/reports/new", async (req, res) => {
  const { sites, googleApiError } = await loadSitesResultForSession(req);
  res.type("html").send(
    renderNewReportPage({
      sites,
      authenticated: Boolean(getGoogleTokens(req)),
      user: req.session.user,
      googleApiError,
      defaultValues: {
        selectedSiteUrl: req.session.selectedSiteUrl,
        reportType: req.session.reportType,
        reportPeriod: req.session.reportPeriod,
        pageContains: req.session.pageContains,
        trackedKeywords: req.session.trackedKeywords,
        searchType: req.session.searchType,
        enableAiInsights: req.session.enableAiInsights,
      },
    }),
  );
});

function buildEnvHealth() {
  return {
    GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    GOOGLE_REDIRECT_URI: Boolean(process.env.GOOGLE_REDIRECT_URI),
    SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY),
  };
}

app.get("/settings", (req, res) => {
  res.type("html").send(
    renderSettingsPage({
      authenticated: Boolean(getGoogleTokens(req)),
      user: req.session.user,
      sessionActive: Boolean(req.session),
      debugRoutesEnabled: isEnvEnabled(process.env.ENABLE_DEBUG_ROUTES),
      envHealth: buildEnvHealth(),
    }),
  );
});

app.post("/presets", async (req, res) => {
  try {
    const preset = await savePreset(req.body);
    rememberPresetInSession(req, preset);
    res.redirect(`/?${new URLSearchParams({ siteUrl: preset.siteUrl, presetSaved: "1" }).toString()}`);
  } catch (error) {
    const { sites, googleApiError } = await loadSitesResultForSession(req);
    const presets = await listPresets().catch(() => []);
    res.status(400).type("html").send(
      renderDashboardHomePage({
        sites,
        authenticated: Boolean(getGoogleTokens(req)),
        user: req.session.user,
        googleApiError,
        presets,
        defaultValues: req.body,
        error: error instanceof Error ? error.message : "Preset save failed.",
      }),
    );
  }
});

app.get("/debug/gsc-sites", async (req, res) => {
  if (!isEnvEnabled(process.env.ENABLE_DEBUG_ROUTES)) {
    res.status(404).type("text").send("Not found");
    return;
  }
  res.json(await buildGscSitesDebugPayload(req));
});

app.get("/download/keyword-csv", (req, res) => {
  const exportPayload = req.session?.keywordCsvExport;

  if (!exportPayload?.csv) {
    res.status(404).type("text").send("No keyword CSV export is available. Generate a report first.");
    return;
  }

  res
    .status(200)
    .set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportPayload.filename || "keyword-insights.csv"}"`,
    })
    .send(exportPayload.csv);
});

function validateReportRequest(body = {}, authClient = null) {
  const sourceType = body.sourceType || "gsc";
  if (sourceType === "gsc" && !authClient && !body.gscKeyFile && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("Authenticate with Google first or provide service account key file.");
  }
  if (sourceType === "gsc" && !body.siteUrl) {
    throw new Error("Please select a GSC property before generating report.");
  }
  if (sourceType === "looker" && !body.lookerCsvPath) {
    throw new Error("Please provide a Looker CSV path.");
  }
  return sourceType;
}

function rememberReportRequestInSession(sessionObject, body, { reportType, reportPeriod, pageContains, trackedKeywordsInput } = {}) {
  if (!sessionObject) {
    return;
  }

  sessionObject.selectedSiteUrl = body.siteUrl || sessionObject.selectedSiteUrl;
  sessionObject.reportType = reportType;
  sessionObject.reportPeriod = reportPeriod;
  sessionObject.pageContains = pageContains;
  sessionObject.trackedKeywords = trackedKeywordsInput;
  sessionObject.searchType = body.searchType || "web";
  sessionObject.enableAiInsights = body.enableAiInsights === true || body.enableAiInsights === "1" || body.enableAiInsights === "on";
}

async function generateReportFromBody({ body, authClient, sessionObject, onProgress = () => {}, reportDownloadUrl = "" }) {
  const sourceType = validateReportRequest(body, authClient);
  const reportType = ["monthly", "quarterly", "custom"].includes(body.reportType) ? body.reportType : "custom";
  const reportPeriod = body.reportPeriod || "30d";
  const pageContains = String(body.pageContains || "").trim();
  const trackedKeywordsInput = body.trackedKeywords || "";
  rememberReportRequestInSession(sessionObject, body, { reportType, reportPeriod, pageContains, trackedKeywordsInput });

  const result = await generateReportFromInput({
    input: { ...body, sourceType, reportType, reportPeriod, pageContains },
    authClient,
    onProgress,
    reportDownloadUrl,
  });

  if (sessionObject && result.keywordCsv) {
    sessionObject.keywordCsvExport = {
      csv: result.keywordCsv,
      filename: `keyword-insights-${Date.now()}.csv`,
    };
  }

  return result;
}

function formatJobTimestamp(value) {
  if (!value) {
    return "—";
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

function slugifyFilenamePart(value, fallback = "report") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function buildReportDownloadFilename(job) {
  const property = slugifyFilenamePart(job.property_url, "seo-report");
  const searchType = slugifyFilenamePart(job.search_type || "web", "web");
  const range = job.start_date || job.end_date ? `${job.start_date || "start"}-to-${job.end_date || "end"}` : job.report_period || "report";
  return `${property}-${searchType}-${slugifyFilenamePart(range, "report")}.html`;
}

function renderReportActionBar(job) {
  const encodedId = encodeURIComponent(job.id);
  return `<div class="saved-report-actions" role="region" aria-label="Saved report actions">
    <strong>Report saved</strong>
    <a href="/reports/${encodedId}/download">Download HTML + CSS + Script</a>
    <a href="/reports/${encodedId}/status">Status</a>
    <a href="/reports">History</a>
  </div>
  <style>
    .saved-report-actions{position:sticky;top:0;z-index:9999;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:rgba(16,32,39,.96);color:#fff;padding:10px 16px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18)}
    .saved-report-actions a{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:7px 11px;color:#fff;text-decoration:none;font-weight:800;background:rgba(255,255,255,.08)}
    .saved-report-actions a:hover{background:rgba(255,255,255,.18)}
    @media print{.saved-report-actions{display:none}}
  </style>`;
}

function injectReportActionBar(reportHtml, job) {
  const actionBar = renderReportActionBar(job);
  if (String(reportHtml || "").includes("</body>")) {
    return String(reportHtml).replace("</body>", `${actionBar}</body>`);
  }
  return `${actionBar}${reportHtml || ""}`;
}


const MAX_REPORT_PAYLOAD_BYTES = Number.parseInt(process.env.MAX_REPORT_PAYLOAD_BYTES || "250000", 10);

function renderSafeSaveErrorPage(message = "Unable to save report.") {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Save report failed</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#edf3ea;color:#12232e;margin:0}.shell{width:min(760px,94vw);margin:40px auto}.card{background:#fff;border:1px solid #d7dfdc;border-radius:14px;padding:22px}.btn{display:inline-block;padding:10px 14px;border-radius:8px;background:#2c6e49;color:#fff;text-decoration:none;font-weight:700}</style></head><body><main class="shell"><section class="card"><h1>Could not save report</h1><p>${escapeHtml(message)}</p><p>No database credentials or secrets were exposed. Please retry or contact an administrator if the issue continues.</p><p><a class="btn" href="/reports/new">Generate Preview</a></p></section></main></body></html>`;
}

function decodeReportPayload(encodedPayload = "") {
  const payloadText = String(encodedPayload || "").trim();
  if (!payloadText) {
    throw new Error("Missing report payload.");
  }
  if (Buffer.byteLength(payloadText, "utf8") > MAX_REPORT_PAYLOAD_BYTES) {
    throw new Error("Report payload is too large to save safely. Generate a smaller filtered preview and try again.");
  }
  let jsonText;
  try {
    jsonText = Buffer.from(payloadText, "base64").toString("utf8");
  } catch {
    throw new Error("Report payload could not be decoded.");
  }
  if (Buffer.byteLength(jsonText, "utf8") > MAX_REPORT_PAYLOAD_BYTES) {
    throw new Error("Report payload is too large to save safely. Generate a smaller filtered preview and try again.");
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Report payload is not valid JSON.");
  }
  validateCompactReportPayload(parsed);
  return parsed;
}

function validateCompactReportPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Report payload is invalid.");
  }
  if (!payload.sourceInfo || typeof payload.sourceInfo !== "object") {
    throw new Error("Report payload is missing source information.");
  }
  if (!payload.selectedPeriodOverview || !payload.performance3MonthComparison) {
    throw new Error("Report payload is missing report analytics.");
  }
}

function normalizeSavedReportJsonForRender(reportJson = {}) {
  if (reportJson.insights) {
    return {
      insights: reportJson.insights,
      sourceInfo: reportJson.sourceInfo || reportJson.insights.sourceInfo || {},
      keywordInsights: reportJson.keywordInsights || {},
    };
  }

  return {
    insights: {
      generatedAt: reportJson.generatedAt || "",
      dataSpan: reportJson.dataSpan || null,
      dataSpanSource: reportJson.dataSpanSource || "none",
      selectedPeriodOverview: reportJson.selectedPeriodOverview || {},
      performance3MonthComparison: reportJson.performance3MonthComparison || {},
      last30Contribution: reportJson.last30Contribution || {},
      contentOpportunitySnapshot: reportJson.contentOpportunitySnapshot || {},
      urlMovement30Days: reportJson.urlMovement30Days || {},
      url6MonthInsights: {},
      dataAvailabilityNotes: reportJson.dataAvailabilityNotes || [],
    },
    sourceInfo: {
      ...(reportJson.sourceInfo || {}),
      filters: reportJson.filters || reportJson.sourceInfo?.filters || {},
    },
    keywordInsights: reportJson.keywordOpportunities || { aiInsights: reportJson.aiInsights },
  };
}

function renderSavedReportHtml(job) {
  if (job.report_json) {
    return renderHtmlReport(normalizeSavedReportJsonForRender(job.report_json));
  }
  return job.report_html || "";
}

function getReportStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (["completed"].includes(normalized)) return "green";
  if (["queued"].includes(normalized)) return "orange";
  if (["running"].includes(normalized)) return "blue";
  if (["failed", "error"].includes(normalized)) return "red";
  return "gray";
}

function renderReportStatusPage(job) {
  const isActive = ["queued", "running"].includes(job.status);
  const statusTone = getReportStatusTone(job.status);
  const createdAt = job.created_at || job.createdAt;
  const updatedAt = job.updated_at || job.updatedAt;
  const errorMessage = job.error_message || job.error;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Report status</title>
  ${isActive ? '<meta http-equiv="refresh" content="3" />' : ""}
  <style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#edf3ea;color:#12232e;margin:0}.shell{width:min(760px,94vw);margin:40px auto}.card{background:#fff;border:1px solid #d7dfdc;border-radius:14px;padding:22px}.badge{display:inline-block;border-radius:999px;padding:6px 10px;font-weight:700}.badge.green{background:#dcfce7;color:#15803d}.badge.orange{background:#ffedd5;color:#c2410c}.badge.blue{background:#dbeafe;color:#1d4ed8}.badge.red{background:#fee2e2;color:#b91c1c}.badge.gray{background:#e2e8f0;color:#475569}.bar{height:14px;background:#d7dfdc;border-radius:999px;overflow:hidden;margin:16px 0}.bar span{display:block;height:100%;background:#2c6e49}.error{white-space:pre-wrap;background:#fee2e2;border:1px solid #fca5a5;color:#7f1d1d;border-radius:8px;padding:10px}.actions{display:flex;gap:10px;flex-wrap:wrap}.btn{display:inline-block;padding:10px 14px;border-radius:8px;background:#2c6e49;color:#fff;text-decoration:none;font-weight:700}.btn.secondary{background:#fff;color:#2c6e49;border:1px solid #2c6e49}</style>
</head>
<body>
  <main class="shell">
    <section class="card">
      <h1>Report status</h1>
      <p>Job <code>${escapeHtml(job.id)}</code></p>
      <p><span class="badge ${escapeHtml(statusTone)}">${escapeHtml(job.status)}</span></p>
      <div class="bar" aria-label="Progress"><span style="width:${escapeHtml(job.progress)}%"></span></div>
      <p><strong>Progress:</strong> ${escapeHtml(job.progress)}%</p>
      <p><strong>Created:</strong> ${escapeHtml(formatJobTimestamp(createdAt))}</p>
      <p><strong>Updated:</strong> ${escapeHtml(formatJobTimestamp(updatedAt))}</p>
      ${job.status === "failed" ? `<div class="error">${escapeHtml(errorMessage || "Report generation failed.")}</div>` : ""}
      <div class="actions">
        ${job.status === "completed" ? `<a class="btn" href="/reports/${encodeURIComponent(job.id)}/view">View saved report</a><a class="btn secondary" href="/reports">Saved Reports</a><a class="btn secondary" href="/reports/${encodeURIComponent(job.id)}/download">Download HTML + CSS + Script</a>` : ""}
        ${isActive ? '<span>Refreshing every 3 seconds…</span>' : ""}
        <a class="btn secondary" href="/reports">Saved Reports</a>
        <a class="btn secondary" href="/">Back to builder</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function renderReportListPage(jobs) {
  const rows = jobs
    .map((job) => {
      const encodedId = encodeURIComponent(job.id);
      const filters = job.filters || job.report_json?.filters || {};
      const ai = job.ai_insights || job.report_json?.aiInsights || job.report_json?.keywordOpportunities?.aiInsights || {};
      const aiLabel = ai.available ? "Enabled / available" : (ai.message === "AI insight not requested." ? "Not enabled" : "Unavailable");
      return `<tr><td>${escapeHtml(formatJobTimestamp(job.completed_at || job.created_at))}</td><td>${escapeHtml(job.property_url || job.source_info?.property || "—")}</td><td>${escapeHtml(job.start_date || job.source_info?.range?.start || "—")} → ${escapeHtml(job.end_date || job.source_info?.range?.end || "—")}</td><td>${escapeHtml(job.report_period || filters.reportPeriod || "custom")}</td><td>${escapeHtml(job.page_contains || filters.pageContains || "None")}</td><td>${escapeHtml(aiLabel)}</td><td><a href="/reports/${encodedId}/view">View</a></td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Saved Reports</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#edf3ea;color:#12232e;margin:0}.shell{width:min(1100px,94vw);margin:40px auto}.card{background:#fff;border:1px solid #d7dfdc;border-radius:14px;padding:22px;overflow:auto}.btn{display:inline-block;padding:10px 14px;border-radius:8px;background:#2c6e49;color:#fff;text-decoration:none;font-weight:700}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border-bottom:1px solid #d7dfdc;padding:10px;text-align:left}th{font-size:.85rem;text-transform:uppercase;color:#53615c}</style></head>
<body><main class="shell"><section class="card"><h1>Saved Reports</h1><p>Only reports explicitly saved from a generated preview appear here.</p><p><a class="btn" href="/reports/new">Generate Preview</a></p>${jobs.length ? `<table><thead><tr><th>Saved</th><th>Property</th><th>Date range</th><th>Report period</th><th>Page filter</th><th>AI</th><th>View</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>No saved reports found for this signed-in user yet.</p>"}</section></main></body></html>`;
}

app.post("/reports", async (_req, res) => {
  res.status(410).type("html").send(renderSafeSaveErrorPage("Async report jobs are disabled for preview-first persistence. Use Generate Preview, then click Save Report on the generated report page."));
});

app.post("/reports/save", async (req, res) => {
  try {
    const reportPayload = decodeReportPayload(req.body?.reportPayload);
    const user = req.session?.user || {};
    const job = await saveReportJob({
      userEmail: user.email || null,
      userName: user.name || null,
      reportPayload,
      reportHtml: null,
    });
    res.redirect(`/reports/${encodeURIComponent(job.id)}/view`);
  } catch (error) {
    const isPayloadError = /payload|JSON|analytics|source information/i.test(String(error?.message || ""));
    const message = isPayloadError ? safeErrorMessage(error, "Unable to save report.") : "Unable to save report to the database. Please retry or contact an administrator if the issue continues.";
    res.status(isPayloadError ? 400 : 500).type("html").send(renderSafeSaveErrorPage(message));
  }
});

app.get("/reports", async (req, res) => {
  try {
    const jobs = await listRecentReportJobs({ userEmail: req.session?.user?.email || null, limit: 30 });
    res.type("html").send(renderReportListPage(jobs));
  } catch (error) {
    res.status(500).type("html").send(`<p>${escapeHtml(safeErrorMessage(error, "Unable to load report history."))}</p><p><a href="/">Back to builder</a></p>`);
  }
});

app.get("/reports/:id/status", async (req, res) => {
  try {
    const job = await getReportJob(req.params.id);
    if (!job) {
      res.status(404).type("text").send("Report job not found.");
      return;
    }
    res.type("html").send(renderReportStatusPage(job));
  } catch (error) {
    res.status(500).type("text").send(safeErrorMessage(error, "Unable to load report job."));
  }
});

app.get("/reports/:id/view", async (req, res) => {
  try {
    const job = await getReportJob(req.params.id);
    if (!job) {
      res.status(404).type("text").send("Report job not found.");
      return;
    }
    if (job.status === "failed") {
      res.status(500).type("html").send(`<p>${escapeHtml(job.error_message || "Report generation failed.")}</p><p><a href="/reports/${encodeURIComponent(job.id)}/status">Back to status</a></p>`);
      return;
    }
    if (job.status !== "completed" || (!job.report_json && !job.report_html)) {
      res.redirect(`/reports/${encodeURIComponent(job.id)}/status`);
      return;
    }
    res.type("html").send(injectReportActionBar(renderSavedReportHtml(job), job));
  } catch (error) {
    res.status(500).type("text").send(safeErrorMessage(error, "Unable to load report job."));
  }
});

app.get("/reports/:id/download", async (req, res) => {
  try {
    const job = await getReportJob(req.params.id);
    if (!job) {
      res.status(404).type("text").send("Report job not found.");
      return;
    }
    if (job.status !== "completed" || (!job.report_json && !job.report_html)) {
      res.status(409).type("text").send("Report is not ready for download yet.");
      return;
    }

    res
      .status(200)
      .set({
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildReportDownloadFilename(job)}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      })
      .send(renderSavedReportHtml(job));
  } catch (error) {
    res.status(500).type("text").send(safeErrorMessage(error, "Unable to download report job."));
  }
});

app.use("/reports", express.static(OUTPUT_DIR));

app.post("/generate", async (req, res) => {
  try {
    const authClient = getAuthorizedClient(req);
    const { reportHtml } = await generateReportFromBody({ body: req.body, authClient, sessionObject: req.session });
    res.type("html").send(reportHtml);
  } catch (error) {
    const sites = await loadSitesForSession(req).catch(() => []);
    const emptyData = isEmptyDataError(error);
    res.status(400).type("html").send(
      renderNewReportPage({
        sites,
        authenticated: Boolean(getGoogleTokens(req)),
        user: req.session.user,
        defaultValues: req.body,
        error: emptyData ? "" : safeErrorMessage(error, "Report generation failed."),
        warning: emptyData ? buildEmptyDataWarning(error, req.body) : "",
      }),
    );
  }
});

export default app;

