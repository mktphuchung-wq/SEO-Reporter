import express from "express";
import dotenv from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import session from "express-session";
import { google } from "googleapis";
import { buildSeoInsights } from "./analytics.js";
import { generateGeminiSeoInsights } from "./ai/geminiInsights.js";
import { buildSeoAlerts, getSeoAlertConfig, hasHighSeverityAlerts, sendSeoAlertSummary } from "./alerts/seoAlerts.js";
import { loadReportData } from "./dataLoader.js";
import { renderHtmlReport } from "./renderHtmlReport.js";
import { renderHomePage as renderDashboardHomePage } from "./pages/homePage.js";
import { renderNewReportPage } from "./pages/newReportPage.js";
import { renderSettingsPage } from "./pages/settingsPage.js";
import { renderReportsPage } from "./pages/reportsPage.js";
import { buildKeywordInsightsCsv } from "./exporters/csvExport.js";
import { filterVerifiedGscSiteEntries, listGscSites, normalizeGscSiteEntries } from "./datasources/gscApi.js";
import {
  buildComparableRanges,
  buildCtrOpportunities,
  buildHighImpressionKeywordMovements,
  buildKeywordWinners,
  buildNearPageOneKeywords,
  buildTrackedKeywordMovements,
  parseTrackedKeywords,
} from "./keywordAnalytics.js";
import { parseDate } from "./lib/time.js";
import { createReportJob, getReportJob, updateReportJob } from "./jobs/reportJobs.js";

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

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

function getMaxTrackedKeywords() {
  return Number.isFinite(MAX_TRACKED_KEYWORDS) && MAX_TRACKED_KEYWORDS > 0 ? MAX_TRACKED_KEYWORDS : 100;
}

function limitTrackedKeywords(keywords) {
  return keywords.slice(0, getMaxTrackedKeywords());
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

function countDaysInclusive(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end.isBefore(start, "day")) {
    return 30;
  }
  return end.diff(start, "day") + 1;
}

function findSitePermission(sites, siteUrl) {
  return sites.find((site) => site.siteUrl === siteUrl)?.permissionLevel || "";
}


function isEmptyDataError(error) {
  return error?.code === "EMPTY_GSC_DATA";
}

function createEmptyGscDataError({ sourceInfo, input }) {
  const range = sourceInfo?.range || { start: input.startDate || "—", end: input.endDate || "—" };
  const filters = sourceInfo?.filters || {};
  const diagnostics = sourceInfo?.diagnostics || {};
  const error = new Error("No GSC data rows matched the selected filters.");
  error.code = "EMPTY_GSC_DATA";
  error.emptyDataContext = {
    property: sourceInfo?.property || input.siteUrl || "—",
    range,
    searchType: diagnostics.searchType || filters.searchType || input.searchType || "web",
    pageContains: filters.pageContains || input.pageContains || "",
    pageContainsApplied: Boolean(diagnostics.pageContainsApplied),
    pageRowCount: diagnostics.pageRowCount || 0,
    keywordRowCount: diagnostics.keywordRowCount || 0,
  };
  return error;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function normalizePresetInput(input = {}) {
  return {
    siteUrl: String(input.siteUrl || "").trim(),
    searchType: ["web", "image", "video", "news"].includes(input.searchType) ? input.searchType : "web",
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

app.use(requireAllowedSessionUser);
app.use("/reports", express.static(OUTPUT_DIR));

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
        reportPeriod: req.session.reportPeriod,
        pageContains: req.session.pageContains,
        trackedKeywords: req.session.trackedKeywords,
        searchType: req.session.searchType,
        enableSeoAlerts: req.session.enableSeoAlerts,
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
        reportPeriod: req.session.reportPeriod,
        pageContains: req.session.pageContains,
        trackedKeywords: req.session.trackedKeywords,
        searchType: req.session.searchType,
        enableAiInsights: req.session.enableAiInsights,
      },
    }),
  );
});

app.get("/reports", (req, res) => {
  res.type("html").send(renderReportsPage({ authenticated: Boolean(getGoogleTokens(req)), user: req.session.user }));
});

function buildEnvHealth() {
  return {
    GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    GOOGLE_REDIRECT_URI: Boolean(process.env.GOOGLE_REDIRECT_URI),
    SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
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

function rememberReportRequestInSession(sessionObject, body, { reportPeriod, pageContains, trackedKeywordsInput, enableSeoAlerts } = {}) {
  if (!sessionObject) {
    return;
  }

  sessionObject.selectedSiteUrl = body.siteUrl || sessionObject.selectedSiteUrl;
  sessionObject.reportPeriod = reportPeriod;
  sessionObject.pageContains = pageContains;
  sessionObject.trackedKeywords = trackedKeywordsInput;
  sessionObject.searchType = body.searchType || "web";
  sessionObject.enableSeoAlerts = enableSeoAlerts;
}

async function generateReportFromBody({ body, authClient, sessionObject, onProgress = () => {} }) {
  const sourceType = validateReportRequest(body, authClient);
  onProgress(8);

  const reportPeriod = body.reportPeriod || "30d";
  const pageContains = String(body.pageContains || "").trim();
  const trackedKeywordsInput = body.trackedKeywords || "";
  const enableAiInsights = Boolean(body.enableAiInsights);
  const enableSeoAlerts = Boolean(body.enableSeoAlerts) || isEnvEnabled(process.env.SEO_ALERTS_ENABLED);

  rememberReportRequestInSession(sessionObject, body, { reportPeriod, pageContains, trackedKeywordsInput, enableSeoAlerts });

  const input = {
    sourceType,
    siteUrl: body.siteUrl,
    lookerCsvPath: body.lookerCsvPath,
    contentCsvPath: body.contentCsvPath,
    searchType: body.searchType,
    reportPeriod,
    pageContains,
    startDate: body.startDate,
    endDate: body.endDate,
    gscKeyFile: body.gscKeyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS,
    authClient,
  };

  const { rows, keywordRows, contentRows, sourceInfo } = await loadReportData(input);
  onProgress(38);
  if (sourceType === "gsc" && rows.length === 0) {
    throw createEmptyGscDataError({ sourceInfo, input });
  }

  const insights = buildSeoInsights({
    rows,
    contentRows,
    endDate: sourceInfo.range?.end,
  });
  onProgress(55);

  const periodDays = countDaysInclusive(sourceInfo.range?.start, sourceInfo.range?.end);
  const { currentRange, previousRange } = buildComparableRanges(sourceInfo.range?.end, periodDays);
  currentRange.start = sourceInfo.range?.start || currentRange.start;
  currentRange.end = sourceInfo.range?.end || currentRange.end;
  const trackedKeywords = limitTrackedKeywords(parseTrackedKeywords(trackedKeywordsInput));
  const trackedKeywordMovements = buildTrackedKeywordMovements({ keywordRows, trackedKeywords, currentRange, previousRange });
  const highImpressionDrops = buildHighImpressionKeywordMovements({ keywordRows, currentRange, previousRange });
  const nearPageOneKeywords = buildNearPageOneKeywords({ keywordRows, currentRange });
  const keywordWinners = buildKeywordWinners({ keywordRows, currentRange, previousRange });
  const ctrOpportunities = buildCtrOpportunities({ keywordRows, currentRange });
  const seoAlerts = buildSeoAlerts({ highImpressionDrops, trackedKeywordMovements, ctrOpportunities });
  onProgress(72);

  if (enableSeoAlerts && hasHighSeverityAlerts(seoAlerts)) {
    try {
      await sendSeoAlertSummary({
        alerts: seoAlerts,
        sourceInfo,
        config: getSeoAlertConfig(),
      });
    } catch (error) {
      console.warn("Failed to send SEO alert summary.", error instanceof Error ? error.message : error);
    }
  }

  const geminiInsights = enableAiInsights
    ? await generateGeminiSeoInsights({
        sourceInfo,
        periodCards: insights.periodCards,
        trackedKeywordMovements,
        highImpressionDrops,
        nearPageOneKeywords,
        keywordWinners,
        ctrOpportunities,
        url6MonthInsights: insights.url6MonthInsights,
      })
    : { available: false, message: "AI insight not requested." };
  onProgress(86);

  const keywordInsights = {
    trackedKeywords,
    trackedKeywordMovements,
    highImpressionDrops,
    nearPageOneKeywords,
    keywordWinners,
    ctrOpportunities,
    currentRange,
    previousRange,
    geminiInsights,
  };
  const keywordCsv = buildKeywordInsightsCsv(keywordInsights);
  if (sessionObject) {
    sessionObject.keywordCsvExport = {
      csv: keywordCsv,
      filename: `keyword-insights-${Date.now()}.csv`,
    };
  }

  const reportHtml = renderHtmlReport({
    insights,
    sourceInfo: {
      ...sourceInfo,
      filters: {
        ...(sourceInfo.filters || {}),
        reportPeriod,
        reportPeriodLabel: REPORT_PERIOD_LABELS[reportPeriod] || REPORT_PERIOD_LABELS.custom,
        pageContains,
        searchType: input.searchType || "web",
        trackedKeywordCount: trackedKeywords.length,
        trackedKeywordLimit: getMaxTrackedKeywords(),
        seoAlertCount: seoAlerts.length,
        highSeveritySeoAlertCount: seoAlerts.filter((alert) => alert.severity === "high").length,
      },
      diagnostics: {
        ...(sourceInfo.diagnostics || {}),
        pageRowCount: sourceInfo.diagnostics?.pageRowCount ?? rows.length,
        keywordRowCount: sourceInfo.diagnostics?.keywordRowCount ?? keywordRows.length,
      },
    },
    keywordInsights: {
      trackedKeywords,
      trackedKeywordMovements,
      highImpressionDrops,
      nearPageOneKeywords,
      keywordWinners,
      ctrOpportunities,
      currentRange,
      previousRange,
      geminiInsights,
      seoAlerts,
    },
  });

  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, `seo-report-${Date.now()}.html`);
    await fs.writeFile(outputPath, reportHtml, "utf8");
  } catch (_error) {
    // Ignore write errors on serverless environments with ephemeral filesystem.
  }

  onProgress(100);
  return { reportHtml, keywordCsv };
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
      <p><strong>Created:</strong> ${escapeHtml(job.createdAt)}</p>
      <p><strong>Updated:</strong> ${escapeHtml(job.updatedAt)}</p>
      ${job.status === "failed" ? `<div class="error">${escapeHtml(job.error || "Report generation failed.")}</div>` : ""}
      <div class="actions">
        ${job.status === "completed" ? `<a class="btn" href="/reports/${encodeURIComponent(job.id)}/view">View completed report</a>` : ""}
        ${isActive ? '<span>Refreshing every 3 seconds…</span>' : ""}
        <a class="btn secondary" href="/">Back to builder</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function startReportJob(job, { body, authClient, sessionObject }) {
  setImmediate(() => {
    updateReportJob(job.id, { status: "running", progress: 5 });
    generateReportFromBody({
      body,
      authClient,
      sessionObject,
      onProgress: (progress) => updateReportJob(job.id, { progress, status: "running" }),
    })
      .then(({ reportHtml }) => {
        updateReportJob(job.id, { status: "completed", progress: 100, resultHtml: reportHtml, error: null });
      })
      .catch((error) => {
        const emptyData = isEmptyDataError(error);
        updateReportJob(job.id, {
          status: "failed",
          progress: 100,
          error: emptyData ? buildEmptyDataWarning(error, body) : error instanceof Error ? error.message : "Report generation failed.",
        });
      });
  });
}

app.post("/reports", async (req, res) => {
  try {
    const authClient = getAuthorizedClient(req);
    validateReportRequest(req.body, authClient);
    const job = createReportJob();
    startReportJob(job, { body: { ...req.body }, authClient, sessionObject: req.session });
    res.redirect(`/reports/${encodeURIComponent(job.id)}/status`);
  } catch (error) {
    const sites = await loadSitesForSession(req).catch(() => []);
    const emptyData = isEmptyDataError(error);
    res.status(400).type("html").send(
      renderNewReportPage({
        sites,
        authenticated: Boolean(getGoogleTokens(req)),
        user: req.session.user,
        defaultValues: req.body,
        error: emptyData ? "" : error instanceof Error ? error.message : "Report generation failed.",
        warning: emptyData ? buildEmptyDataWarning(error, req.body) : "",
      }),
    );
  }
});

app.get("/reports/:id/status", (req, res) => {
  const job = getReportJob(req.params.id);
  if (!job) {
    res.status(404).type("text").send("Report job not found. In-memory jobs may be lost on serverless cold starts.");
    return;
  }
  res.type("html").send(renderReportStatusPage(job));
});

app.get("/reports/:id/view", (req, res) => {
  const job = getReportJob(req.params.id);
  if (!job) {
    res.status(404).type("text").send("Report job not found. In-memory jobs may be lost on serverless cold starts.");
    return;
  }
  if (job.status !== "completed" || !job.resultHtml) {
    res.redirect(`/reports/${encodeURIComponent(job.id)}/status`);
    return;
  }
  res.type("html").send(job.resultHtml);
});

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
        error: emptyData ? "" : error instanceof Error ? error.message : "Report generation failed.",
        warning: emptyData ? buildEmptyDataWarning(error, req.body) : "",
      }),
    );
  }
});

export default app;

