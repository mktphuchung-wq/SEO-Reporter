import express from "express";
import dotenv from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildSeoInsights } from "./analytics.js";
import { loadReportData } from "./dataLoader.js";
import { renderHtmlReport } from "./renderHtmlReport.js";
import { listGscSites } from "./datasources/gscApi.js";
import { GOOGLE_GSC_SCOPE } from "./config.js";
import { attachSession } from "./lib/authSession.js";
import { upsertGoogleTokens } from "./lib/authDatabase.js";
import {
  buildGoogleConnectUrl,
  createGoogleAuthClientForUser,
  exchangeCodeForGoogleTokens,
  getValidGoogleAccessToken,
} from "./lib/googleOAuth.js";

dotenv.config();

const app = express();
const OUTPUT_DIR = path.resolve("output");

app.set("trust proxy", 1);
app.use(attachSession);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/reports", express.static(OUTPUT_DIR));

async function getAuthorizedClient(req) {
  if (!req.authSession?.userId) {
    return null;
  }
  return createGoogleAuthClientForUser(req.authSession.userId);
}

async function loadSitesForSession(req) {
  const authClient = await getAuthorizedClient(req);
  if (!authClient) {
    return [];
  }
  return listGscSites({ authClient });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHomePage({ sites = [], authenticated = false, defaultValues = {}, error = "" } = {}) {
  const lookerPath = defaultValues.lookerCsvPath || "samples/gsc-looker-sample.csv";
  const contentPath = defaultValues.contentCsvPath || "samples/content-sample.csv";
  const gscOptions = sites
    .map(
      (site) =>
        `<option value="${escapeHtml(site.siteUrl)}">${escapeHtml(site.siteUrl)} (${escapeHtml(site.permissionLevel)})</option>`,
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
    input, select {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      font-size: 0.92rem;
      background: #fff;
    }
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
    .error {
      background: rgba(249, 87, 56, 0.12);
      border: 1px solid rgba(249, 87, 56, 0.4);
      color: #7f1d1d;
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 12px;
    }
    .helper { margin-top: 16px; border-top: 1px dashed var(--line); padding-top: 12px; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <h1>SEO Report Builder</h1>
      <p>Connect Google first, then select an authorized Search Console property.</p>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
      <div class="actions">
        ${authenticated ? '<a class="btn btn-ghost" href="/auth/logout">Disconnect session</a>' : '<a class="btn btn-primary" href="/api/google/connect">Connect Google</a>'}
      </div>

      <form action="/generate" method="post">
        <div class="grid">
          <div>
            <label>Source Type</label>
            <select name="sourceType" id="sourceType">
              <option value="gsc">GSC API (OAuth)</option>
              <option value="looker">Looker CSV</option>
            </select>
          </div>
          <div>
            <label>GSC Property (choose after auth)</label>
            <select name="siteUrl">
              <option value="">${authenticated ? "Select a property" : "Connect Google first"}</option>
              ${gscOptions}
            </select>
          </div>
          <div>
            <label>Search Type</label>
            <select name="searchType">
              <option value="web">web</option>
              <option value="image">image</option>
              <option value="video">video</option>
              <option value="news">news</option>
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
            <label>Start Date (optional)</label>
            <input type="date" name="startDate" />
          </div>
          <div>
            <label>End Date (optional)</label>
            <input type="date" name="endDate" />
          </div>
          <div>
            <label>Service Key File (optional fallback)</label>
            <input type="text" name="gscKeyFile" placeholder="C:\\keys\\service-account.json" />
          </div>
        </div>
        <div class="actions">
          <button type="submit" class="btn btn-primary">Generate HTML Report</button>
        </div>
      </form>

      <div class="helper">
        <h2>Data format</h2>
        <p>Looker CSV: <code>Date,Page,Clicks,Impressions,CTR,Position</code></p>
        <p>Content CSV: <code>url,title,topic,published_date</code></p>
        <p>Google scope: <code>${escapeHtml(GOOGLE_GSC_SCOPE)}</code></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

app.get("/api/google/connect", async (req, res) => {
  try {
    const session = await req.ensureAuthSession();
    const state = crypto.randomUUID();
    session.data.googleOAuthState = state;
    await req.saveAuthSession();

    res.redirect(buildGoogleConnectUrl(state));
  } catch (error) {
    res.status(400).send(`Auth config error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

app.get("/auth/google", (req, res) => {
  res.redirect("/api/google/connect");
});

app.get("/api/auth/callback/google", async (req, res) => {
  try {
    const session = await req.ensureAuthSession();
    if (!req.query.code) {
      throw new Error("Missing authorization code.");
    }
    if (!req.query.state || req.query.state !== session.data.googleOAuthState) {
      throw new Error("Invalid OAuth state.");
    }

    const tokens = await exchangeCodeForGoogleTokens(String(req.query.code));
    await upsertGoogleTokens({ userId: session.userId, tokens });
    session.data.googleOAuthState = null;
    session.data.googleConnectedAt = new Date().toISOString();
    await req.saveAuthSession();

    res.redirect("/");
  } catch (error) {
    res.status(400).send(`OAuth callback failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

app.get("/auth/callback", (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  res.redirect(`/api/auth/callback/google${query ? `?${query}` : ""}`);
});

app.get("/auth/logout", async (req, res) => {
  await req.destroyAuthSession();
  res.redirect("/");
});

app.get("/api/google/sites", async (req, res) => {
  try {
    if (!req.authSession?.userId) {
      res.status(401).json({ error: "Connect Google first." });
      return;
    }

    await getValidGoogleAccessToken({ userId: req.authSession.userId });
    const sites = await loadSitesForSession(req);
    res.json({ sites });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to load GSC sites." });
  }
});

app.get("/", async (req, res) => {
  try {
    const sites = await loadSitesForSession(req);
    res.type("html").send(
      renderHomePage({
        sites,
        authenticated: Boolean(req.authSession?.data?.googleConnectedAt),
      }),
    );
  } catch (error) {
    res.type("html").send(
      renderHomePage({
        authenticated: Boolean(req.authSession?.data?.googleConnectedAt),
        error: error instanceof Error ? error.message : "Failed to load sites.",
      }),
    );
  }
});

app.post("/generate", async (req, res) => {
  try {
    const sourceType = req.body.sourceType || "gsc";
    const authClient = await getAuthorizedClient(req);

    if (sourceType === "gsc" && !authClient && !req.body.gscKeyFile && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error("Connect Google first or provide service account key file.");
    }
    if (sourceType === "gsc" && !req.body.siteUrl) {
      throw new Error("Please select a GSC property before generating report.");
    }

    const input = {
      sourceType,
      siteUrl: req.body.siteUrl,
      lookerCsvPath: req.body.lookerCsvPath,
      contentCsvPath: req.body.contentCsvPath,
      searchType: req.body.searchType,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      gscKeyFile: req.body.gscKeyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS,
      authClient,
    };

    const { rows, contentRows, sourceInfo } = await loadReportData(input);
    const insights = buildSeoInsights({
      rows,
      contentRows,
      endDate: input.endDate || sourceInfo.range?.end,
    });

    const reportHtml = renderHtmlReport({ insights, sourceInfo });

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
        authenticated: Boolean(req.authSession?.data?.googleConnectedAt),
        error: error instanceof Error ? error.message : "Report generation failed.",
      }),
    );
  }
});

export default app;

