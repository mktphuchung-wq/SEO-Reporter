import express from "express";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import session from "express-session";
import { google } from "googleapis";
import { buildSeoInsights } from "./analytics.js";
import { generateGeminiSeoInsights } from "./ai/geminiInsights.js";
import { loadReportData } from "./dataLoader.js";
import { renderHtmlReport } from "./renderHtmlReport.js";
import { listGscSites } from "./datasources/gscApi.js";
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

dotenv.config();

const app = express();
const OUTPUT_DIR = path.resolve("output");
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret-change-me";
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

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
app.use("/reports", express.static(OUTPUT_DIR));

function buildRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  return `${req.protocol}://${req.get("host")}/auth/callback`;
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
  const tokens = req.session?.googleTokens;
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
  const tokens = req.session?.googleTokens;
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
    const rawSiteEntries = (response.data.siteEntry || [])
      .filter((site) => site.siteUrl || site.permissionLevel)
      .map((site) => ({
        siteUrl: site.siteUrl || "",
        permissionLevel: site.permissionLevel || "",
      }))
      .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
    const filteredSiteEntries = rawSiteEntries.filter(
      (site) => site.siteUrl && site.permissionLevel && site.permissionLevel !== "siteUnverifiedUser",
    );

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHomePage({ sites = [], authenticated = false, defaultValues = {}, error = "", googleApiError = null } = {}) {
  const lookerPath = defaultValues.lookerCsvPath || "samples/gsc-looker-sample.csv";
  const contentPath = defaultValues.contentCsvPath || "samples/content-sample.csv";
  const selectedSiteUrl = defaultValues.siteUrl || defaultValues.selectedSiteUrl || "";
  const selectedPermission = findSitePermission(sites, selectedSiteUrl);
  const reportPeriod = defaultValues.reportPeriod || "30d";
  const searchType = defaultValues.searchType || "web";
  const pageContains = defaultValues.pageContains || "";
  const trackedKeywords = defaultValues.trackedKeywords || "";
  const propertyStatusMessage = googleApiError
    ? `Search Console API error: ${googleApiError.message}`
    : authenticated && sites.length === 0
      ? "No Search Console properties found for this Google account. Make sure this account has access in Google Search Console."
      : "";
  const gscOptions = sites
    .map(
      (site) =>
        `<option value="${escapeHtml(site.siteUrl)}" data-permission="${escapeHtml(site.permissionLevel)}" ${selected(site.siteUrl, selectedSiteUrl)}>${escapeHtml(site.siteUrl)} (${escapeHtml(site.permissionLevel)})</option>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SEO Report Builder</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-1: #edf3ea;
      --bg-2: #f9f0df;
      --ink: #12232e;
      --muted: #4f5d75;
      --brand: #2c6e49;
      --accent: #f95738;
      --line: #d7dfdc;
      --card: #fff;
    }
    body {
      margin: 0;
      font-family: "Public Sans", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 8%, rgba(44, 110, 73, 0.22), transparent 24%),
        radial-gradient(circle at 90% 2%, rgba(249, 87, 56, 0.22), transparent 30%),
        linear-gradient(155deg, var(--bg-1), var(--bg-2));
    }
    .shell { width: min(980px, 95vw); margin: 20px auto 40px; }
    .card {
      background: rgba(255,255,255,0.88);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 18px;
      backdrop-filter: blur(6px);
    }
    h1, h2 { margin: 0 0 10px; font-family: "Space Grotesk", sans-serif; }
    p { margin-top: 0; color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    label { display: block; margin-bottom: 4px; font-weight: 600; font-size: 0.9rem; }
    input, select, textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      font-size: 0.92rem;
      background: #fff;
    }
    textarea { min-height: 110px; resize: vertical; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 7px 10px;
      margin-top: 10px;
      font-weight: 700;
      background: rgba(44, 110, 73, 0.1);
      color: var(--brand);
    }
    .status.offline { background: rgba(249, 87, 56, 0.12); color: #7f1d1d; }
    .note { color: var(--muted); font-size: 0.84rem; margin-top: 6px; }
    .actions { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
    .btn {
      text-decoration: none;
      border: 0;
      display: inline-block;
      padding: 10px 14px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-primary { background: var(--brand); color: #fff; }
    .btn-ghost { background: transparent; color: var(--brand); border: 1px solid var(--brand); }
    .error, .warning {
      background: rgba(249, 87, 56, 0.12);
      border: 1px solid rgba(249, 87, 56, 0.4);
      color: #7f1d1d;
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 12px;
    }
    .warning { margin-top: 10px; margin-bottom: 0; }
    .helper { margin-top: 16px; border-top: 1px dashed var(--line); padding-top: 12px; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <h1>SEO Report Builder</h1>
      <p>Authenticate Google first, then select an authorized Search Console property.</p>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
      <div class="actions">
        ${authenticated ? '<a class="btn btn-ghost" href="/auth/logout">Logout Google</a>' : '<a class="btn btn-primary" href="/auth/google">Authenticate Google</a>'}
      </div>
      <div class="status ${authenticated ? "" : "offline"}">${authenticated ? "Google connected" : "Google not connected"}</div>
      ${propertyStatusMessage ? `<div class="warning">${escapeHtml(propertyStatusMessage)}</div>` : ""}

      <form action="/generate" method="post">
        <div class="grid">
          <div>
            <label>Source Type</label>
            <select name="sourceType" id="sourceType">
              <option value="gsc" ${selected(defaultValues.sourceType || "gsc", "gsc")}>GSC API (OAuth)</option>
              <option value="looker" ${selected(defaultValues.sourceType, "looker")}>Looker CSV</option>
            </select>
          </div>
          <div>
            <label>GSC Property (choose after auth)</label>
            <select name="siteUrl" id="siteUrl" ${authenticated ? "" : "disabled"}>
              <option value="">${authenticated ? "Select a property" : "Authenticate first"}</option>
              ${gscOptions}
            </select>
            <div class="note">Permission level: <strong id="permissionLevel">${escapeHtml(selectedPermission || "Select a property")}</strong></div>
          </div>
          <div>
            <label>Search Type</label>
            <select name="searchType">
              <option value="web" ${selected(searchType, "web")}>web</option>
              <option value="image" ${selected(searchType, "image")}>image</option>
              <option value="video" ${selected(searchType, "video")}>video</option>
              <option value="news" ${selected(searchType, "news")}>news</option>
            </select>
          </div>
          <div>
            <label>Looker CSV Path</label>
            <input type="text" name="lookerCsvPath" value="${escapeHtml(lookerPath)}" />
          </div>
          <div>
            <label>Content Metadata CSV Path</label>
            <input type="text" name="contentCsvPath" value="${escapeHtml(contentPath)}" />
          </div>
          <div>
            <label>Report Period</label>
            <select name="reportPeriod">
              <option value="7d" ${selected(reportPeriod, "7d")}>1 week</option>
              <option value="30d" ${selected(reportPeriod, "30d")}>1 month</option>
              <option value="90d" ${selected(reportPeriod, "90d")}>3 months</option>
              <option value="180d" ${selected(reportPeriod, "180d")}>6 months</option>
              <option value="custom" ${selected(reportPeriod, "custom")}>Custom date range</option>
            </select>
          </div>
          <div>
            <label>Start Date (for custom)</label>
            <input type="date" name="startDate" value="${escapeHtml(defaultValues.startDate || "")}" />
          </div>
          <div>
            <label>End Date (for custom)</label>
            <input type="date" name="endDate" value="${escapeHtml(defaultValues.endDate || "")}" />
          </div>
          <div>
            <label>Event/Page filter: URL contains</label>
            <input type="text" name="pageContains" value="${escapeHtml(pageContains)}" placeholder="/ten-su-kien/" />
          </div>
          <div>
            <label>Service Key File (optional fallback)</label>
            <input type="text" name="gscKeyFile" placeholder="C:\\keys\\service-account.json" />
          </div>
          <div>
            <label>Tracked keywords</label>
            <textarea name="trackedKeywords" placeholder="One keyword per line">${escapeHtml(trackedKeywords)}</textarea>
            <div class="note">One keyword per line or comma-separated keywords.</div>
          </div>
          <div>
            <label>AI Insights</label>
            <div class="note"><input type="checkbox" name="enableAiInsights" value="1" style="width:auto;" ${checked(defaultValues.enableAiInsights)} /> Generate Gemini AI SEO insights when configured</div>
          </div>
        </div>
        <div class="actions">
          <button type="submit" id="generateButton" class="btn btn-primary" ${authenticated || defaultValues.sourceType === "looker" ? "" : "disabled"}>Generate HTML Report</button>
        </div>
      </form>

      <div class="helper">
        <h2>Data format</h2>
        <p>Looker CSV: <code>Date,Page,Clicks,Impressions,CTR,Position</code></p>
        <p>Content CSV: <code>url,title,topic,published_date</code></p>
      </div>
      <script>
        const siteSelect = document.getElementById("siteUrl");
        const permissionEl = document.getElementById("permissionLevel");
        const sourceTypeSelect = document.getElementById("sourceType");
        const generateButton = document.getElementById("generateButton");
        function syncGenerateState() {
          const selectedOption = siteSelect?.options[siteSelect.selectedIndex];
          if (permissionEl) {
            permissionEl.textContent = selectedOption?.dataset?.permission || "Select a property";
          }
          if (generateButton) {
            generateButton.disabled = sourceTypeSelect?.value === "gsc" ? !siteSelect?.value : false;
          }
        }
        siteSelect?.addEventListener("change", syncGenerateState);
        sourceTypeSelect?.addEventListener("change", syncGenerateState);
        syncGenerateState();
      </script>
    </div>
  </div>
</body>
</html>`;
}

function startGoogleAuth(req, res) {
  try {
    const client = createOAuthClient(req);
    const state = Math.random().toString(36).slice(2);
    req.session.oauthState = state;
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [GSC_SCOPE],
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
    if (!req.query.state || req.query.state !== req.session.oauthState) {
      throw new Error("Invalid OAuth state.");
    }

    const client = createOAuthClient(req);
    const { tokens } = await client.getToken(String(req.query.code));
    req.session.googleTokens = tokens;
    req.session.oauthState = null;
    res.redirect("/");
  } catch (error) {
    res.status(400).send(`OAuth callback failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

app.get("/auth/google", startGoogleAuth);
app.get("/auth/callback", finishGoogleAuth);
app.get("/api/google/connect", startGoogleAuth);
app.get("/api/google/callback", finishGoogleAuth);
app.get("/dashboard/integrations/google-search-console", (_req, res) => res.redirect("/"));

app.get("/auth/logout", (req, res) => {
  req.session.googleTokens = null;
  req.session.oauthState = null;
  res.redirect("/");
});

app.get("/", async (req, res) => {
  const { sites, googleApiError } = await loadSitesResultForSession(req);
  res.type("html").send(
    renderHomePage({
      sites,
      authenticated: Boolean(req.session.googleTokens),
      googleApiError,
      defaultValues: {
        ...req.query,
        selectedSiteUrl: req.session.selectedSiteUrl,
        reportPeriod: req.session.reportPeriod,
        pageContains: req.session.pageContains,
        trackedKeywords: req.session.trackedKeywords,
        searchType: req.session.searchType,
      },
    }),
  );
});

app.get("/debug/gsc-sites", async (req, res) => {
  res.json(await buildGscSitesDebugPayload(req));
});

app.post("/generate", async (req, res) => {
  try {
    const sourceType = req.body.sourceType || "gsc";
    const authClient = getAuthorizedClient(req);

    if (sourceType === "gsc" && !authClient && !req.body.gscKeyFile && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error("Authenticate with Google first or provide service account key file.");
    }
    if (sourceType === "gsc" && !req.body.siteUrl) {
      throw new Error("Please select a GSC property before generating report.");
    }

    const reportPeriod = req.body.reportPeriod || "30d";
    const pageContains = String(req.body.pageContains || "").trim();
    const trackedKeywordsInput = req.body.trackedKeywords || "";
    const enableAiInsights = Boolean(req.body.enableAiInsights);

    req.session.selectedSiteUrl = req.body.siteUrl || req.session.selectedSiteUrl;
    req.session.reportPeriod = reportPeriod;
    req.session.pageContains = pageContains;
    req.session.trackedKeywords = trackedKeywordsInput;
    req.session.searchType = req.body.searchType || "web";

    const input = {
      sourceType,
      siteUrl: req.body.siteUrl,
      lookerCsvPath: req.body.lookerCsvPath,
      contentCsvPath: req.body.contentCsvPath,
      searchType: req.body.searchType,
      reportPeriod,
      pageContains,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      gscKeyFile: req.body.gscKeyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS,
      authClient,
    };

    const { rows, keywordRows, contentRows, sourceInfo } = await loadReportData(input);
    const insights = buildSeoInsights({
      rows,
      contentRows,
      endDate: sourceInfo.range?.end,
    });

    const periodDays = countDaysInclusive(sourceInfo.range?.start, sourceInfo.range?.end);
    const { currentRange, previousRange } = buildComparableRanges(sourceInfo.range?.end, periodDays);
    currentRange.start = sourceInfo.range?.start || currentRange.start;
    currentRange.end = sourceInfo.range?.end || currentRange.end;
    const trackedKeywords = parseTrackedKeywords(trackedKeywordsInput);
    const trackedKeywordMovements = buildTrackedKeywordMovements({ keywordRows, trackedKeywords, currentRange, previousRange });
    const highImpressionDrops = buildHighImpressionKeywordMovements({ keywordRows, currentRange, previousRange });
    const nearPageOneKeywords = buildNearPageOneKeywords({ keywordRows, currentRange });
    const keywordWinners = buildKeywordWinners({ keywordRows, currentRange, previousRange });
    const ctrOpportunities = buildCtrOpportunities({ keywordRows, currentRange });
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
      },
    });

    try {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      const outputPath = path.join(OUTPUT_DIR, `seo-report-${Date.now()}.html`);
      await fs.writeFile(outputPath, reportHtml, "utf8");
    } catch (_error) {
      // Ignore write errors on serverless environments with ephemeral filesystem.
    }

    res.type("html").send(reportHtml);
  } catch (error) {
    const sites = await loadSitesForSession(req).catch(() => []);
    res.status(400).type("html").send(
      renderHomePage({
        sites,
        authenticated: Boolean(req.session.googleTokens),
        defaultValues: req.body,
        error: error instanceof Error ? error.message : "Report generation failed.",
      }),
    );
  }
});

export default app;

