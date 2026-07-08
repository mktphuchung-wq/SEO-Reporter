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
import { renderUrlPerformancePage, renderUrlPerformanceResultsPage, renderUrlPerformanceValidationPage } from "./pages/urlPerformancePage.js";
import { renderNewTeamMemberForm, renderTeamMemberDetailPage, renderTeamMemberListPage } from "./pages/teamPage.js";
import { renderTeamMemberUrlListPage } from "./pages/teamMemberUrlListPage.js";
import { renderTeamPerformancePage } from "./pages/teamPerformancePage.js";
import { buildUrlCompareAiSummary, buildUrlPerformanceComparison, normalizeUrlCompareRequest } from "./urlPerformanceCompare.js";
import { renderHtmlReport } from "./renderHtmlReport.js";
import { escapeHtml } from "./ui/html.js";
import { fetchGscUrlPerformance, filterVerifiedGscSiteEntries, listGscSites, normalizeGscSiteEntries } from "./datasources/gscApi.js";
import { query as dbQuery } from "./db/client.js";
import { isMissingRelationError, renderMissingTeamSchemaMessage } from "./db/schemaGuards.js";
import {
  createReportJob,
  getReportJob,
  listRecentReportJobs,
  saveReportJob,
} from "./db/reportJobs.js";
import { generateReportFromInput } from "./services/reportGenerator.js";
import { processNextReportJobStep } from "./services/reportJobRunner.js";
import { generateOpenRouterUrlCompareSummary } from "./ai/openRouterInsights.js";

import { renderLayout } from "./ui/layout.js";
import { renderAlert, renderMetricCard, renderStatusBadge } from "./ui/components.js";
import { listTeamMembers, getTeamMember, createTeamMember, updateTeamMember } from "./db/teamMembers.js";
import { listUrlListsForMember, createUrlList, updateUrlList, parseAndNormalizeUrlList } from "./db/teamUrlLists.js";
import { createQuarterlyJob, createQuarterlyJobBatches, getQuarterlyJob, listQuarterlyJobs, getQuarterlyJobResults } from "./db/teamQuarterlyJobs.js";
import { listTeamPerformance } from "./db/team.js";
import { getMostRecentCompletedQuarter, getPreviousQuarterRange } from "./lib/reportPeriods.js";
import { runNextTeamQuarterlyBatch } from "./services/teamQuarterlyRunner.js";

dotenv.config();

const app = express();

const reportJobProcessLocks = new Set();

function userCanAccessReportJob(req, job) {
  const ownerEmail = String(job?.user_email || job?.userEmail || "").trim().toLowerCase();
  if (!ownerEmail) return true;
  const sessionEmail = String(req.session?.user?.email || "").trim().toLowerCase();
  return Boolean(sessionEmail && sessionEmail === ownerEmail);
}

function reportJobViewUrl(jobId) {
  return `/reports/jobs/${encodeURIComponent(jobId)}/view`;
}

function reportJobProcessUrl(jobId) {
  return `/reports/jobs/${encodeURIComponent(jobId)}/process-next`;
}

function reportJobStatusUrl(jobId) {
  return `/reports/jobs/${encodeURIComponent(jobId)}/status.json`;
}

function serializeReportJobStatus(job) {
  const jobId = String(job.id);
  return {
    ok: true,
    jobId,
    status: job.status || "queued",
    progress: Math.max(0, Math.min(100, Number.parseInt(job.progress || 0, 10) || 0)),
    currentStep: job.current_step || job.currentStep || "init",
    createdAt: job.created_at || job.createdAt || null,
    updatedAt: job.updated_at || job.updatedAt || null,
    completedAt: job.completed_at || job.completedAt || null,
    viewUrl: reportJobViewUrl(jobId),
    processUrl: reportJobProcessUrl(jobId),
    errorMessage: job.status === "failed" ? (job.error_message || job.error || "Report generation failed.") : null,
  };
}

function wantsReportJobJson(req) {
  return String(req.get("accept") || "").includes("application/json") || req.body?.ajax === true || req.body?.ajax === "1" || req.query?.ajax === "1";
}

function serializeProcessNextResponse(job, { ok = true, message = "Processed one report step." } = {}) {
  const status = job?.status || "queued";
  const payload = serializeReportJobStatus(job);
  return {
    ok: ok && status !== "failed",
    jobId: payload.jobId,
    status,
    progress: payload.progress,
    currentStep: payload.currentStep,
    hasMore: ["queued", "running"].includes(status),
    viewUrl: payload.viewUrl,
    message,
    ...(status === "failed" ? { error: payload.errorMessage || "Report generation failed." } : {}),
  };
}
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
const REPORT_GENERATE_TIME_BUDGET_MS = Number.parseInt(process.env.REPORT_GENERATE_TIME_BUDGET_MS || "240000", 10);
function normalizeReportJobInput(body = {}) {
  return {
    siteUrl: String(body.siteUrl || "").trim(),
    searchType: String(body.searchType || "web").trim() || "web",
    reportType: String(body.reportType || "custom").trim() || "custom",
    reportPeriod: String(body.reportPeriod || "30d").trim() || "30d",
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    pageContains: String(body.pageContains || "").trim(),
    trackedKeywords: String(body.trackedKeywords || "").trim(),
    enableAiInsights: Boolean(body.enableAiInsights),
  };
}
function validateReportJobInput(input = {}) {
  if (!input.siteUrl) throw new Error("Please select a GSC property before generating report.");
  return input;
}
async function createReportJobFromRequest(req) {
  const input = validateReportJobInput(normalizeReportJobInput(req.body));
  return createReportJob({ ...input, userEmail: req.session?.user?.email || null, userName: req.session?.user?.name || null, inputJson: input });
}


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
  const message = error instanceof Error ? error.message : "Google API request failed.";
  return {
    status: error?.code || error?.status || error?.response?.status || null,
    message: message
      .replace(/Bearer\s+[A-Za-z0-9._~+\-/]+=*/gi, "Bearer [redacted]")
      .replace(/ya29\.[A-Za-z0-9._~+\-/]+/gi, "[redacted-google-token]")
      .replace(/GOOGLE_[A-Z_]+=\S+/gi, "GOOGLE_SECRET=[redacted]")
      .slice(0, 300),
  };
}

async function mapWithConcurrency(items, concurrency, asyncFn) {
  const limit = Math.max(1, Number(concurrency) || 1);
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await asyncFn(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
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

function reportPeriodLabelForFilters(filters = {}) {
  if (filters.reportType === "monthly") return "monthly";
  if (filters.reportType === "quarterly") return "quarterly";
  return filters.reportPeriod || "custom";
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


function n(value) { return Number(value || 0).toLocaleString(); }
function teamLayout(req, { title, pageTitle, pageDescription, body, activeNav = "team" }) {
  return renderLayout({ title, pageTitle, pageDescription, body, activeNav, authenticated: Boolean(getGoogleTokens(req)), user: req.session.user });
}
function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map((h)=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`; }
function td(v) { return `<td>${v == null ? "" : v}</td>`; }
function csvEscape(value) { const s=String(value ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
function renderTeamDatabaseError(req, res, { title, pageTitle, activeNav = "team", status = 500 }, error) {
  const body = isMissingRelationError(error)
    ? renderMissingTeamSchemaMessage(error)
    : renderAlert({ type: "error", message: safeErrorMessage(error) });
  res.status(status).type("html").send(teamLayout(req, { title, pageTitle, activeNav, body }));
}

// TODO: Add admin-only team management and member self-service access controls after MVP RBAC exists.
app.get("/team", async (req, res) => {
  try {
    const members = await listTeamMembers();
    res.type("html").send(renderTeamMemberListPage({ members, authenticated: Boolean(getGoogleTokens(req)), user: req.session.user }));
  } catch (error) { renderTeamDatabaseError(req, res, { title: "Team error", pageTitle: "Team Members" }, error); }
});
app.get("/team/new", (req, res) => res.type("html").send(renderNewTeamMemberForm({ authenticated: Boolean(getGoogleTokens(req)), user: req.session.user })));
app.post("/team", async (req,res)=>{ try { const m=await createTeamMember(req.body); res.redirect(`/team/${m.id}`); } catch(error){ renderTeamDatabaseError(req, res, { title: "Add Team Member", pageTitle: "Add Team Member", status: 400 }, error); }});
app.get("/team/performance", async (req, res) => {
  try {
    const rowsData = await listTeamPerformance();
    res.type("html").send(renderTeamPerformancePage({ rowsData, authenticated: Boolean(getGoogleTokens(req)), user: req.session.user }));
  } catch (error) {
    if (isMissingRelationError(error)) {
      res.status(500).type("html").send(renderLayout({ title: "Team Performance", pageTitle: "Team Performance", activeNav: "team-performance", authenticated: Boolean(getGoogleTokens(req)), user: req.session.user, body: renderMissingTeamSchemaMessage(error) }));
      return;
    }
    renderTeamDatabaseError(req, res, { title: "Team Performance", pageTitle: "Team Performance", activeNav: "team-performance" }, error);
  }
});
app.get("/team/quarterly-jobs/:jobId/status", async (req,res)=>{ const job=await getQuarterlyJob(req.params.jobId); if(!job) return res.status(404).send("Not found"); const refresh=!["completed","failed"].includes(job.status)?'<meta http-equiv="refresh" content="3">':''; const body=`${refresh}<div class="card"><h2>${escapeHtml(job.quarter_label)}</h2><p>Đang xử lý batch URL, uống miếng trà chờ chút xíu...</p><div style="height:16px;background:#e2e8f0;border-radius:999px"><div style="height:16px;width:${Number(job.progress||0)}%;background:#176b87;border-radius:999px"></div></div><p>${n(job.completed_batches)} / ${n(job.total_batches)} batches · ${n(job.processed_urls)} / ${n(job.total_urls)} URLs · ${renderStatusBadge(job.status)}</p><form method="post" action="/team/quarterly-jobs/${job.id}/process-next"><button class="btn">Process next batch now</button></form>${job.status==='completed'?`<p><a class="btn" href="/team/quarterly-jobs/${job.id}/results">View results</a> <a class="btn btn-secondary" href="/team/quarterly-jobs/${job.id}.csv">Export CSV</a></p>`:""}</div>`; res.type("html").send(teamLayout(req,{title:"Quarterly Job Status",pageTitle:"Quarterly Job Status",body})); });
app.post("/team/quarterly-jobs/:jobId/process-next", async (req,res)=>{ try { const authClient=getAuthorizedClient(req); if(!authClient) return res.status(401).send("Authenticate Google first."); await runNextTeamQuarterlyBatch({jobId:req.params.jobId,authClient}); res.redirect(`/team/quarterly-jobs/${req.params.jobId}/status`); } catch(error){ res.status(500).type("html").send(teamLayout(req,{title:"Process batch",pageTitle:"Process batch",body:renderAlert({type:"error",message:safeErrorMessage(error)})})); }});
app.get("/team/quarterly-jobs/:jobId/results", async (req,res)=>{ const job=await getQuarterlyJob(req.params.jobId); if(!job) return res.status(404).send("Not found"); if(!["completed","partially_completed"].includes(job.status)) return res.redirect(`/team/quarterly-jobs/${job.id}/status`); const results=await getQuarterlyJobResults(job.id); const sum=results.reduce((a,r)=>{a.prev+=Number(r.previous_clicks||0);a.cur+=Number(r.current_clicks||0);a.pi+=Number(r.previous_impressions||0);a.ci+=Number(r.current_impressions||0);a[r.status]=(a[r.status]||0)+1;return a;},{prev:0,cur:0,pi:0,ci:0}); const cards=`<div class="metric-grid">${renderMetricCard({label:"Total URLs",value:n(results.length)})}${renderMetricCard({label:"Growing URLs",value:n(sum.Growing),tone:"green"})}${renderMetricCard({label:"Declining URLs",value:n(sum.Declining),tone:"red"})}${renderMetricCard({label:"New traffic",value:n(sum["New traffic"])})}${renderMetricCard({label:"Lost traffic",value:n(sum["Lost traffic"])})}${renderMetricCard({label:"Low CTR",value:n(sum["High impressions low CTR"])})}${renderMetricCard({label:"Total current clicks",value:n(sum.cur)})}${renderMetricCard({label:"Click delta",value:n(sum.cur-sum.prev)})}</div>`; const rows=results.map(r=>`<tr>${td(escapeHtml(r.url))}${td(n(r.previous_clicks))}${td(n(r.current_clicks))}${td(n(r.click_delta))}${td(n(r.previous_impressions))}${td(n(r.current_impressions))}${td(n(r.impression_delta))}${td(renderStatusBadge(r.status))}${td(escapeHtml(r.insight||""))}</tr>`); res.type("html").send(teamLayout(req,{title:"Quarterly Results",pageTitle:"Quarterly Results",body:`<div class="actions"><a class="btn btn-secondary" href="/team/quarterly-jobs/${job.id}.csv">Export CSV</a></div><br>${cards}<br>${table(["URL","Previous clicks","Current clicks","Click delta","Previous impressions","Current impressions","Impression delta","Status","Insight"],rows)}`})); });
app.get("/team/quarterly-jobs/:jobId.csv", async (req,res)=>{ const results=await getQuarterlyJobResults(req.params.jobId); const headers=["member_name","member_email","property_url","quarter_label","url","previous_clicks","current_clicks","click_delta","click_delta_percent","previous_impressions","current_impressions","impression_delta","impression_delta_percent","previous_ctr","current_ctr","previous_position","current_position","position_delta","status","insight"]; res.type("text/csv").attachment(`team-quarterly-${req.params.jobId}.csv`).send([headers.join(","),...results.map(r=>headers.map(h=>csvEscape(r[h])).join(","))].join("\n")); });
app.get("/team/:memberId", async (req,res)=>{ try { const [member, lists, jobs]=await Promise.all([getTeamMember(req.params.memberId),listUrlListsForMember(req.params.memberId),listQuarterlyJobs({memberId:req.params.memberId})]); if(!member) return res.status(404).send("Not found"); res.type("html").send(renderTeamMemberDetailPage({ member, lists, jobs, authenticated: Boolean(getGoogleTokens(req)), user: req.session.user })); } catch(error) { renderTeamDatabaseError(req, res, { title: "Team Member", pageTitle: "Team Member" }, error); } });
app.post("/team/:memberId", async (req,res)=>{ try { await updateTeamMember(req.params.memberId, req.body); res.redirect(`/team/${req.params.memberId}`); } catch(error) { renderTeamDatabaseError(req, res, { title: "Team Member", pageTitle: "Team Member", status: 400 }, error); } });
app.get("/team/:memberId/url-list", async (req,res)=>{ try { const lists=await listUrlListsForMember(req.params.memberId); res.type("html").send(renderTeamMemberUrlListPage({ lists, authenticated: Boolean(getGoogleTokens(req)), user: req.session.user })); } catch(error) { renderTeamDatabaseError(req, res, { title: "URL List", pageTitle: "URL List" }, error); } });
app.post("/team/:memberId/url-list", async (req,res)=>{ try { const parsed=parseAndNormalizeUrlList(req.body.urlsText); if(parsed.invalidRows.length) throw new Error(`${parsed.invalidRows.length} invalid URL(s).`); const lists=await listUrlListsForMember(req.params.memberId); const active=lists.find(l=>l.status==='active'); if(active) await updateUrlList(active.id,{name:req.body.listName,propertyUrl:req.body.propertyUrl,searchType:req.body.searchType,urls:parsed.urls}); else await createUrlList({memberId:req.params.memberId,name:req.body.listName,propertyUrl:req.body.propertyUrl,searchType:req.body.searchType,urls:parsed.urls}); await updateTeamMember(req.params.memberId,{defaultPropertyUrl:req.body.propertyUrl}); res.redirect(`/team/${req.params.memberId}`); } catch(error){ renderTeamDatabaseError(req, res, { title: "URL List", pageTitle: "URL List", status: 400 }, error); }});
app.post("/team/:memberId/run-quarterly", async (req,res)=>{ try { const lists=await listUrlListsForMember(req.params.memberId); const active=lists.find(l=>l.status==='active' && l.url_count>0); if(!active) throw new Error("Create an active URL list before running a quarterly report."); const current=getMostRecentCompletedQuarter(); const previous=getPreviousQuarterRange(current); const job=await createQuarterlyJob({memberId:req.params.memberId,urlListId:active.id,propertyUrl:active.property_url,searchType:active.search_type,quarter:{current,previous}}); await createQuarterlyJobBatches({jobId:job.id,urls:active.urls_json,batchSize:50}); res.redirect(`/team/quarterly-jobs/${job.id}/status`); } catch(error){ res.status(400).type("html").send(teamLayout(req,{title:"Run Quarterly",pageTitle:"Run Quarterly",body:renderAlert({type:"error",message:safeErrorMessage(error)})})); }});

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

app.get("/tools/url-performance", async (req, res) => {
  const { sites, googleApiError } = await loadSitesResultForSession(req);
  res.type("html").send(
    renderUrlPerformancePage({
      sites,
      authenticated: Boolean(getGoogleTokens(req)),
      user: req.session.user,
      googleApiError,
      defaultValues: {
        selectedSiteUrl: req.session.selectedSiteUrl,
        searchType: req.session.searchType,
      },
    }),
  );
});

app.post("/tools/url-performance", async (req, res) => {
  const authClient = getAuthorizedClient(req);
  const authenticated = Boolean(authClient);
  req.session.selectedSiteUrl = req.body.siteUrl || req.session.selectedSiteUrl;
  req.session.searchType = req.body.searchType || req.session.searchType;

  if (!authenticated) {
    res.status(401).type("html").send(
      renderUrlPerformancePage({
        sites: [],
        authenticated: false,
        user: req.session.user,
        error: "Authenticate Google first.",
        defaultValues: {
          selectedSiteUrl: req.session.selectedSiteUrl,
          searchType: req.session.searchType,
          urlList: req.body.urlList,
          enableAiSummary: req.body.enableAiSummary,
        },
      }),
    );
    return;
  }

  const normalized = normalizeUrlCompareRequest(req.body);
  const enableAiSummary = req.body.enableAiSummary === "on" || req.body.enableAiSummary === "true";
  const defaultValues = {
    selectedSiteUrl: req.session.selectedSiteUrl,
    siteUrl: req.body.siteUrl,
    searchType: req.session.searchType,
    urlList: req.body.urlList,
    enableAiSummary,
  };

  if (normalized.requestErrors.length || normalized.validRows.length === 0) {
    const { sites, googleApiError } = await loadSitesResultForSession(req);
    const result = {
      ...normalized,
      requestErrors: normalized.validRows.length === 0 && !normalized.requestErrors.length
        ? ["At least one valid URL is required before querying GSC."]
        : normalized.requestErrors,
    };

    res.status(400).type("html").send(
      renderUrlPerformanceValidationPage({
        sites,
        authenticated: true,
        user: req.session.user,
        googleApiError,
        result,
        defaultValues,
      }),
    );
    return;
  }

  const tasks = normalized.validRows.flatMap((row) =>
    normalized.compareWindows.map((compareWindow) => ({ row, compareWindow })),
  );

  const gscResults = await mapWithConcurrency(tasks, 3, async ({ row, compareWindow }) => {
    async function fetchPeriod(range) {
      try {
        return {
          ok: true,
          data: await fetchGscUrlPerformance({
            siteUrl: req.body.siteUrl,
            url: row.url,
            startDate: range.start,
            endDate: range.end,
            searchType: req.body.searchType || "web",
            authClient,
          }),
        };
      } catch (error) {
        return { ok: false, error: safeGoogleApiError(error) };
      }
    }

    const previousResult = await fetchPeriod(compareWindow.previousRange);
    const currentResult = await fetchPeriod(compareWindow.currentRange);
    const hasFetchError = !previousResult.ok || !currentResult.ok;

    return {
      rowNumber: row.rowNumber,
      url: row.url,
      windowKey: compareWindow.key,
      previous: previousResult.ok ? previousResult.data : undefined,
      current: currentResult.ok ? currentResult.data : undefined,
      error: hasFetchError ? { message: "GSC fetch failed for this URL/window." } : undefined,
    };
  });

  const comparison = buildUrlPerformanceComparison({
    validRows: normalized.validRows,
    compareWindows: normalized.compareWindows,
    gscResults,
  });

  const aiSummary = enableAiSummary
    ? await generateOpenRouterUrlCompareSummary(buildUrlCompareAiSummary({
      compareWindows: normalized.compareWindows,
      comparison,
      generatedAt: new Date(),
    }))
    : null;

  res.type("html").send(
    renderUrlPerformanceResultsPage({
      authenticated: true,
      user: req.session.user,
      result: normalized,
      comparison,
      defaultValues,
      aiSummary,
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
  const normalizedStatus = String(job.status || "queued").toLowerCase();
  const isActive = ["queued", "running"].includes(normalizedStatus);
  const statusTone = getReportStatusTone(normalizedStatus);
  const createdAt = job.created_at || job.createdAt;
  const updatedAt = job.updated_at || job.updatedAt;
  const errorMessage = job.error_message || job.error;
  const statusMessages = {
    queued: "Report is queued. Preparing the workspace...",
    running: job.current_step === "ai_insights" ? "Đang nhờ AI đọc insight từ dữ liệu tóm tắt..." : "Đang xử lý báo cáo từng bước, ăn miếng bánh uống miếng trà chờ chút xíu...",
    completed: "Report is ready",
    failed: "Report generation failed. Review the safe error message and try again.",
  };
  const progress = Math.max(0, Math.min(100, Number.parseInt(job.progress || 0, 10)));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Report status</title>
  <style>*{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 10% 0%,rgba(44,110,73,.16),transparent 28%),#edf3ea;color:#12232e;margin:0}.shell{width:min(760px,94vw);margin:40px auto}.card{background:rgba(255,255,255,.94);border:1px solid #d7dfdc;border-radius:20px;padding:24px;box-shadow:0 20px 50px rgba(18,35,46,.1)}.badge{display:inline-block;border-radius:999px;padding:6px 10px;font-weight:800;text-transform:capitalize}.badge.green{background:#dcfce7;color:#15803d}.badge.orange{background:#ffedd5;color:#c2410c}.badge.blue{background:#dbeafe;color:#1d4ed8}.badge.red{background:#fee2e2;color:#b91c1c}.badge.gray{background:#e2e8f0;color:#475569}.bar{height:14px;background:#d7dfdc;border-radius:999px;overflow:hidden;margin:16px 0}.bar span{display:block;height:100%;background:#2c6e49;transition:width .22s ease}.tea-loader{text-align:center;background:#f8fafc;border:1px solid #d7dfdc;border-radius:16px;padding:18px;margin:16px 0}.tea-scene{position:relative;display:inline-flex;align-items:end;gap:10px;font-size:3rem}.steam{position:absolute;top:-18px;width:7px;height:24px;border-radius:999px;background:linear-gradient(rgba(44,110,73,.45),rgba(44,110,73,0));animation:steam-rise 1.6s ease-in-out infinite}.steam.one{left:24px}.steam.two{left:43px;animation-delay:.25s}.steam.three{left:62px;animation-delay:.5s}.status-message{font-weight:800;color:#2c6e49}.dots span{display:inline-block;width:6px;height:6px;margin-left:4px;border-radius:999px;background:#2c6e49;animation:dot-bounce 1s ease-in-out infinite}.dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}.error{white-space:pre-wrap;background:#fee2e2;border:1px solid #fca5a5;color:#7f1d1d;border-radius:8px;padding:10px}.actions{display:flex;gap:10px;flex-wrap:wrap}.btn{display:inline-flex;padding:10px 14px;border-radius:999px;background:#2c6e49;color:#fff;text-decoration:none;font-weight:800;transition:transform .18s ease,background .18s ease}.btn:hover{transform:translateY(-1px);background:#23593b}.btn:active{transform:translateY(0)}.btn:focus-visible{outline:3px solid rgba(249,115,22,.35);outline-offset:2px}.btn.secondary{background:#fff;color:#2c6e49;border:1px solid #2c6e49}.btn[disabled]{opacity:.6;cursor:not-allowed}.auto-status{color:#475569;font-weight:700}.auto-status.ready{color:#15803d}.auto-status.error{color:#b91c1c}@keyframes steam-rise{0%,100%{opacity:.28;transform:translateY(7px) scale(.9)}50%{opacity:.8;transform:translateY(-4px) scale(1.05)}}@keyframes dot-bounce{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-5px);opacity:1}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}@media(max-width:620px){.shell{margin:18px auto}.card{padding:18px}.actions .btn{width:100%;justify-content:center}}</style>
</head>
<body>
  <main class="shell">
    <section class="card" id="reportStatusApp" data-job-id="${escapeHtml(job.id)}" data-status-url="${escapeHtml(reportJobStatusUrl(job.id))}" data-process-url="${escapeHtml(reportJobProcessUrl(job.id))}" data-view-url="${escapeHtml(reportJobViewUrl(job.id))}">
      <h1>Report status</h1>
      <p>Job <code>${escapeHtml(job.id)}</code></p>
      <p><span class="badge ${escapeHtml(statusTone)}" data-status-badge>${escapeHtml(normalizedStatus)}</span></p>
      ${isActive ? `<div class="tea-loader" role="status" aria-live="polite"><div class="tea-scene" aria-hidden="true"><span class="steam one"></span><span class="steam two"></span><span class="steam three"></span><span>☕</span><span>🍰</span></div><p class="status-message" data-status-message>${escapeHtml(statusMessages[normalizedStatus])}<span class="dots"><span></span><span></span><span></span></span></p><p>Trang này tự xử lý từng bước và cập nhật tiến trình tự động.</p><p class="auto-status" data-auto-status>Auto processing is running...</p></div>` : `<p class="status-message" data-status-message>${escapeHtml(statusMessages[normalizedStatus] || normalizedStatus)}</p><p class="auto-status ${normalizedStatus === "completed" ? "ready" : normalizedStatus === "failed" ? "error" : ""}" data-auto-status>${normalizedStatus === "completed" ? "Report is ready" : normalizedStatus === "failed" ? "Auto processing stopped." : ""}</p>`}
      <div class="bar" aria-label="Progress"><span data-progress-bar style="width:${escapeHtml(progress)}%"></span></div>
      <p><strong>Progress:</strong> <span data-progress-number>${escapeHtml(progress)}</span>%</p>
      <p><strong>Current step:</strong> <span data-current-step>${escapeHtml(job.current_step || "init")}</span></p>
      <p><strong>Created:</strong> ${escapeHtml(formatJobTimestamp(createdAt))}</p>
      <p><strong>Updated:</strong> <span data-updated-at>${escapeHtml(formatJobTimestamp(updatedAt))}</span></p>
      ${normalizedStatus === "failed" ? `<div class="error">${escapeHtml(errorMessage || "Report generation failed.")}</div>` : ""}
      <div class="actions">
        ${normalizedStatus === "completed" ? `<a class="btn" href="/reports/jobs/${encodeURIComponent(job.id)}/view">View Report</a><a class="btn secondary" href="/reports/${encodeURIComponent(job.id)}/download">Download HTML + CSS + Script</a>` : ""}
        ${isActive ? `<form method="post" action="/reports/jobs/${encodeURIComponent(job.id)}/process-next" style="margin:0"><button class="btn" data-manual-process-button type="submit">Process next step now</button></form>` : ""}
        <a class="btn secondary" href="/reports">Saved Reports</a>
        <a class="btn secondary" href="/">Back to builder</a>
      </div>
    </section>
  </main>
<script>
(function(){
  const root = document.getElementById("reportStatusApp");
  if (!root) return;
  const statusUrl = root.dataset.statusUrl;
  const processUrl = root.dataset.processUrl;
  const viewUrl = root.dataset.viewUrl;
  const badge = root.querySelector("[data-status-badge]");
  const bar = root.querySelector("[data-progress-bar]");
  const number = root.querySelector("[data-progress-number]");
  const step = root.querySelector("[data-current-step]");
  const updated = root.querySelector("[data-updated-at]");
  const message = root.querySelector("[data-status-message]");
  const autoStatus = root.querySelector("[data-auto-status]");
  const manualButton = root.querySelector("[data-manual-process-button]");
  let isProcessing = false;
  let stopped = false;
  let failures = 0;

  function tone(status){ return status === "completed" ? "green" : status === "queued" ? "orange" : status === "running" ? "blue" : status === "failed" ? "red" : "gray"; }
  function statusMessage(status, currentStep){
    if (status === "queued") return "Report is queued. Preparing the workspace...";
    if (status === "running") return currentStep === "ai_insights" ? "Đang nhờ AI đọc insight từ dữ liệu tóm tắt..." : "Đang xử lý báo cáo từng bước, ăn miếng bánh uống miếng trà chờ chút xíu...";
    if (status === "completed") return "Report is ready";
    if (status === "failed") return "Report generation failed. Review the safe error message and try again.";
    return status || "queued";
  }
  function updateUi(data){
    const status = data.status || "queued";
    if (badge) { badge.textContent = status; badge.className = "badge " + tone(status); }
    if (bar) bar.style.width = Math.max(0, Math.min(100, Number(data.progress || 0))) + "%";
    if (number) number.textContent = Math.max(0, Math.min(100, Number(data.progress || 0)));
    if (step) step.textContent = data.currentStep || "init";
    if (updated && data.updatedAt) updated.textContent = new Date(data.updatedAt).toLocaleString();
    if (message) message.childNodes[0].nodeValue = statusMessage(status, data.currentStep);
    if (autoStatus) {
      autoStatus.className = "auto-status" + (status === "completed" ? " ready" : status === "failed" ? " error" : "");
      autoStatus.textContent = status === "completed" ? "Report is ready" : status === "failed" ? (data.error || data.errorMessage || "Auto processing stopped.") : "Auto processing is running...";
    }
  }
  function delay(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
  async function loop(){
    if (stopped || isProcessing) return;
    isProcessing = true;
    if (manualButton) manualButton.disabled = true;
    try {
      const res = await fetch(processUrl, { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ ajax: true }) });
      const data = await res.json();
      updateUi(data);
      failures = 0;
      if (data.status === "completed") { stopped = true; await delay(1000); window.location.href = data.viewUrl || viewUrl; return; }
      if (data.status === "failed" || data.ok === false) { stopped = true; return; }
    } catch (error) {
      failures += 1;
      if (autoStatus) autoStatus.textContent = failures >= 5 ? "Auto processing paused. You can retry manually." : "Network hiccup. Retrying auto processing...";
      if (failures >= 5) { stopped = true; return; }
    } finally {
      isProcessing = false;
      if (manualButton) manualButton.disabled = false;
    }
    const baseDelay = failures > 0 ? 5000 : (document.hidden ? 9000 : 2500);
    await delay(baseDelay);
    loop();
  }
  document.addEventListener("visibilitychange", function(){ if (!document.hidden && !stopped) loop(); });
  if (statusUrl) fetch(statusUrl, { headers: { "Accept": "application/json" } }).then(r => r.ok ? r.json() : null).then(data => { if (data) updateUi(data); }).catch(function(){});
  if (["queued", "running"].includes((badge && badge.textContent || "").trim().toLowerCase())) loop();
})();
</script>
</body>
</html>`;
}


app.post("/reports", async (req, res) => {
  const job = await createReportJobFromRequest(req);
  res.redirect(`/reports/jobs/${encodeURIComponent(job.id)}/status`);
});

app.post("/reports/jobs", async (req, res) => {
  try {
    const job = await createReportJobFromRequest(req);
    res.redirect(`/reports/jobs/${encodeURIComponent(job.id)}/status`);
  } catch (error) {
    res.status(400).type("text").send(safeErrorMessage(error, "Unable to create report job."));
  }
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
    res.type("html").send(renderReportsPage({ jobs, user: req.session.user, authenticated: Boolean(getGoogleTokens(req)), activeNav: "reports" }));
  } catch (error) {
    res.status(500).type("html").send(`<p>${escapeHtml(safeErrorMessage(error, "Unable to load report history."))}</p><p><a href="/">Back to builder</a></p>`);
  }
});

app.get("/reports/jobs/:jobId/status.json", async (req, res) => {
  try {
    const job = await getReportJob(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
    if (!userCanAccessReportJob(req, job)) return res.status(403).json({ ok: false, error: "Forbidden" });
    res.json(serializeReportJobStatus(job));
  } catch (error) {
    res.status(500).json({ ok: false, error: safeErrorMessage(error, "Unable to load report job.") });
  }
});

app.get("/reports/jobs/:jobId/status", async (req, res) => {
  try {
    const job = await getReportJob(req.params.jobId);
    if (!job) return res.status(404).type("text").send("Report job not found.");
    if (!userCanAccessReportJob(req, job)) return res.status(403).type("text").send("Forbidden");
    res.type("html").send(renderReportStatusPage(job));
  } catch (error) {
    res.status(500).type("text").send(safeErrorMessage(error, "Unable to load report job."));
  }
});

app.post("/reports/jobs/:jobId/process-next", async (req, res) => {
  const jsonResponse = wantsReportJobJson(req);
  try {
    const existingJob = await getReportJob(req.params.jobId);
    if (!existingJob) {
      if (jsonResponse) return res.status(404).json({ ok: false, error: "Job not found" });
      return res.status(404).type("text").send("Report job not found.");
    }
    if (!userCanAccessReportJob(req, existingJob)) {
      if (jsonResponse) return res.status(403).json({ ok: false, error: "Forbidden" });
      return res.status(403).type("text").send("Forbidden");
    }
    if (["completed", "failed"].includes(existingJob.status)) {
      if (jsonResponse) return res.json(serializeProcessNextResponse(existingJob, { message: "Report job is already finished." }));
      return res.redirect(`/reports/jobs/${encodeURIComponent(req.params.jobId)}/status`);
    }
    if (reportJobProcessLocks.has(req.params.jobId)) {
      if (jsonResponse) return res.json(serializeProcessNextResponse(existingJob, { message: "A report step is already processing." }));
      return res.redirect(`/reports/jobs/${encodeURIComponent(req.params.jobId)}/status`);
    }
    reportJobProcessLocks.add(req.params.jobId);
    try {
      const authClient = getAuthorizedClient(req);
      const job = await processNextReportJobStep({ jobId: req.params.jobId, authClient });
      if (jsonResponse) return res.status(job.status === "failed" ? 500 : 200).json(serializeProcessNextResponse(job));
      res.redirect(`/reports/jobs/${encodeURIComponent(req.params.jobId)}/status`);
    } finally {
      reportJobProcessLocks.delete(req.params.jobId);
    }
  } catch (error) {
    const safeMessage = safeErrorMessage(error, "Unable to process report job.");
    if (jsonResponse) return res.status(500).json({ ok: false, status: "failed", progress: 0, error: safeMessage });
    res.status(500).type("text").send(safeMessage);
  }
});

app.get("/reports/jobs/:jobId/view", (req, res) => {
  res.redirect(`/reports/${encodeURIComponent(req.params.jobId)}/view`);
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
    if (!isEnvEnabled(process.env.ENABLE_SYNC_GENERATE)) {
      const job = await createReportJobFromRequest(req);
      res.redirect(`/reports/jobs/${encodeURIComponent(job.id)}/status`);
      return;
    }
    const startedAt = Date.now();
    if (REPORT_GENERATE_TIME_BUDGET_MS >= 300000 || Date.now() - startedAt > REPORT_GENERATE_TIME_BUDGET_MS) {
      res.status(202).type("html").send("This report is too large to generate synchronously. Please use background report generation.");
      return;
    }
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

