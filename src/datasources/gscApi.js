import { google } from "googleapis";
import path from "node:path";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const MAX_ROW_LIMIT = 25000;

function normalizePageRow(row) {
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

function normalizeKeywordRow(row) {
  const keys = row.keys || [];
  const date = keys[0];
  const query = keys[1];
  const url = keys[2];

  if (!date || !query || !url) {
    return null;
  }

  return {
    date,
    query,
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

function buildPageContainsFilter(pageContains) {
  const expression = String(pageContains || "").trim();
  if (!expression) {
    return undefined;
  }

  return [
    {
      filters: [
        {
          dimension: "page",
          operator: "contains",
          expression,
        },
      ],
    },
  ];
}

async function fetchSearchAnalyticsRows({
  siteUrl,
  startDate,
  endDate,
  searchType,
  auth,
  dimensions,
  pageContains,
  normalizer,
}) {
  const webmasters = google.webmasters({ version: "v3", auth });
  const allRows = [];
  let startRow = 0;

  while (true) {
    const response = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions,
        type: searchType,
        rowLimit: MAX_ROW_LIMIT,
        startRow,
        ...(pageContains ? { dimensionFilterGroups: buildPageContainsFilter(pageContains) } : {}),
      },
    });

    const rows = response.data.rows || [];
    allRows.push(...rows.map(normalizer).filter(Boolean));

    if (rows.length < MAX_ROW_LIMIT) {
      break;
    }
    startRow += MAX_ROW_LIMIT;
  }

  return allRows;
}

async function fetchWithOptionalPageFilter({ siteUrl, startDate, endDate, searchType, keyFile, authClient, dimensions, normalizer, pageContains }) {
  if (!siteUrl) {
    throw new Error("Missing siteUrl for GSC request.");
  }

  if (!startDate || !endDate) {
    throw new Error("startDate and endDate are required for GSC request.");
  }

  const auth = resolveAuth({ authClient, keyFile });
  const trimmedFilter = String(pageContains || "").trim();

  if (!trimmedFilter) {
    return fetchSearchAnalyticsRows({ siteUrl, startDate, endDate, searchType, auth, dimensions, normalizer });
  }

  try {
    return await fetchSearchAnalyticsRows({
      siteUrl,
      startDate,
      endDate,
      searchType,
      auth,
      dimensions,
      normalizer,
      pageContains: trimmedFilter,
    });
  } catch (filteredError) {
    try {
      const unfilteredRows = await fetchSearchAnalyticsRows({
        siteUrl,
        startDate,
        endDate,
        searchType,
        auth,
        dimensions,
        normalizer,
      });
      return unfilteredRows.filter((row) => String(row.url || "").includes(trimmedFilter));
    } catch (_unfilteredError) {
      throw filteredError;
    }
  }
}

export async function fetchGscRows({
  siteUrl,
  startDate,
  endDate,
  searchType = "web",
  keyFile,
  authClient,
  pageContains,
}) {
  return fetchWithOptionalPageFilter({
    siteUrl,
    startDate,
    endDate,
    searchType,
    keyFile,
    authClient,
    pageContains,
    dimensions: ["date", "page"],
    normalizer: normalizePageRow,
  });
}

export async function fetchGscKeywordRows({
  siteUrl,
  startDate,
  endDate,
  searchType = "web",
  keyFile,
  authClient,
  pageContains,
}) {
  return fetchWithOptionalPageFilter({
    siteUrl,
    startDate,
    endDate,
    searchType,
    keyFile,
    authClient,
    pageContains,
    dimensions: ["date", "query", "page"],
    normalizer: normalizeKeywordRow,
  });
}

export function normalizeGscSiteEntries(entries = []) {
  return entries
    .filter((site) => site?.siteUrl || site?.permissionLevel)
    .map((site) => ({
      siteUrl: site.siteUrl || "",
      permissionLevel: site.permissionLevel || "",
    }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

export function filterVerifiedGscSiteEntries(entries = []) {
  return normalizeGscSiteEntries(entries).filter(
    (site) => site.siteUrl && site.permissionLevel && site.permissionLevel !== "siteUnverifiedUser",
  );
}

export async function listGscSites({ authClient, keyFile }) {
  const auth = resolveAuth({ authClient, keyFile });
  const webmasters = google.webmasters({ version: "v3", auth });
  const response = await webmasters.sites.list();

  return filterVerifiedGscSiteEntries(response.data.siteEntry || []);
}
