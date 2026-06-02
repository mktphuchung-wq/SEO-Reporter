import { google } from "googleapis";
import path from "node:path";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const MAX_ROW_LIMIT = 25000;
const ALLOWED_SEARCH_TYPES = new Set(["web", "image", "video", "news"]);

function normalizeSearchType(searchType) {
  const normalized = String(searchType || "web").toLowerCase();
  if (!ALLOWED_SEARCH_TYPES.has(normalized)) {
    throw new Error(`Invalid searchType: ${searchType}. Expected one of: web, image, video, news.`);
  }
  return normalized;
}

function normalizeRow(row) {
  const keys = row.keys || [];
  const date = keys[0];
  const url = keys[1];

  if (!date || !url) {
    return null;
  }

  return {
    date,
    url,
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0),
  };
}

function resolveAuth({ authClient, keyFile }) {
  if (authClient) {
    return authClient;
  }

  if (!keyFile) {
    throw new Error("Missing authClient or GOOGLE_APPLICATION_CREDENTIALS.");
  }

  return new google.auth.GoogleAuth({
    keyFile: path.resolve(keyFile),
    scopes: [GSC_SCOPE],
  });
}

export async function fetchGscRows({
  siteUrl,
  startDate,
  endDate,
  searchType = "web",
  keyFile,
  authClient,
}) {
  if (!siteUrl) {
    throw new Error("Missing siteUrl for GSC request.");
  }

  if (!startDate || !endDate) {
    throw new Error("startDate and endDate are required for GSC request.");
  }

  const normalizedSearchType = normalizeSearchType(searchType);
  const auth = resolveAuth({ authClient, keyFile });
  const webmasters = google.webmasters({ version: "v3", auth });

  const allRows = [];
  let startRow = 0;

  while (true) {
    const response = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["date", "page"],
        searchType: normalizedSearchType,
        rowLimit: MAX_ROW_LIMIT,
        startRow,
      },
    });

    const rows = response.data.rows || [];
    const normalized = rows.map(normalizeRow).filter(Boolean);
    allRows.push(...normalized);

    if (rows.length < MAX_ROW_LIMIT) {
      break;
    }
    startRow += MAX_ROW_LIMIT;
  }

  return allRows;
}

export async function listGscSites({ authClient, keyFile }) {
  const normalizedSearchType = normalizeSearchType(searchType);
  const auth = resolveAuth({ authClient, keyFile });
  const webmasters = google.webmasters({ version: "v3", auth });
  const response = await webmasters.sites.list();
  const entries = response.data.siteEntry || [];

  return entries
    .filter((site) => site.siteUrl && site.permissionLevel && site.permissionLevel !== "siteUnverifiedUser")
    .map((site) => ({
      siteUrl: site.siteUrl,
      permissionLevel: site.permissionLevel,
    }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

