import { google } from "googleapis";
import path from "node:path";
import { getCache, setCache } from "../cache/reportCache.js";
import { splitDateRangeIntoMonthlyChunks } from "../lib/dateChunks.js";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const MAX_ROW_LIMIT = 25000;
const GSC_CACHE_TTL_SECONDS = Number.parseInt(process.env.GSC_CACHE_TTL_SECONDS || "300", 10);
const GSC_KEYWORD_CHUNK_MIN_DAYS = Number.parseInt(process.env.GSC_KEYWORD_CHUNK_MIN_DAYS || "45", 10);

function getCacheTtlSeconds() {
  return Number.isFinite(GSC_CACHE_TTL_SECONDS) && GSC_CACHE_TTL_SECONDS > 0 ? GSC_CACHE_TTL_SECONDS : 300;
}

function buildGscCacheKey({ siteUrl, startDate, endDate, searchType, dimensions, pageContains }) {
  return JSON.stringify({ source: "gsc", siteUrl, startDate, endDate, searchType, dimensions, pageContains: pageContains || "" });
}

function shouldChunkRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return false;
  }
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return days >= (Number.isFinite(GSC_KEYWORD_CHUNK_MIN_DAYS) ? GSC_KEYWORD_CHUNK_MIN_DAYS : 45);
}

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


function sanitizeGscErrorMessage(message) {
  return String(message || "Google Search Console API request failed.")
    .replace(/Bearer\s+[A-Za-z0-9._~+\-/]+=*/gi, "Bearer [REDACTED]")
    .replace(/(access_token|refresh_token|client_secret|client_id|private_key|api_key|key)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/"(access_token|refresh_token|client_secret|client_id|private_key|api_key|key)"\s*:\s*"[^"]+"/gi, '"$1":"[REDACTED]"');
}

function toSafeGscError(error) {
  const status = error?.response?.status || error?.code || error?.status;
  const rawMessage = error?.response?.data?.error?.message || error?.errors?.[0]?.message || error?.message;
  const safeMessage = sanitizeGscErrorMessage(rawMessage);
  const safeError = new Error(`Google Search Console API request failed${status ? ` (${status})` : ""}: ${safeMessage}`);
  if (status) {
    safeError.status = status;
  }
  return safeError;
}

function getPathnameForGscFallback(url, siteUrl) {
  try {
    return new URL(url).pathname;
  } catch (_absoluteUrlError) {
    try {
      return new URL(url, siteUrl).pathname;
    } catch (_relativeUrlError) {
      return "";
    }
  }
}

function buildPageFilterGroups({ operator, expression }) {
  return [
    {
      filters: [
        {
          dimension: "page",
          operator,
          expression,
        },
      ],
    },
  ];
}

function normalizeUrlPerformance({ url, startDate, endDate, clicks = 0, impressions = 0, position = null, matchType }) {
  const normalizedClicks = Number(clicks) || 0;
  const normalizedImpressions = Number(impressions) || 0;

  return {
    url,
    startDate,
    endDate,
    clicks: normalizedClicks,
    impressions: normalizedImpressions,
    ctr: normalizedImpressions > 0 ? normalizedClicks / normalizedImpressions : 0,
    position: normalizedImpressions > 0 && Number.isFinite(Number(position)) ? Number(position) : null,
    matchType,
  };
}

function aggregateUrlPerformanceRows(rows = []) {
  let clicks = 0;
  let impressions = 0;
  let weightedPositionTotal = 0;

  for (const row of rows) {
    const rowClicks = Number(row.clicks) || 0;
    const rowImpressions = Number(row.impressions) || 0;
    const rowPosition = Number(row.position);

    clicks += rowClicks;
    impressions += rowImpressions;
    if (rowImpressions > 0 && Number.isFinite(rowPosition)) {
      weightedPositionTotal += rowPosition * rowImpressions;
    }
  }

  return {
    clicks,
    impressions,
    position: impressions > 0 ? weightedPositionTotal / impressions : null,
  };
}

async function queryGscUrlPerformanceRows({ auth, siteUrl, startDate, endDate, searchType, operator, expression, rowLimit }) {
  const webmasters = google.webmasters({ version: "v3", auth });

  try {
    const response = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["page"],
        searchType,
        rowLimit,
        dimensionFilterGroups: buildPageFilterGroups({ operator, expression }),
      },
    });

    return response.data.rows || [];
  } catch (error) {
    throw toSafeGscError(error);
  }
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

function appendNormalizedRows(target, rows, normalizer) {
  for (const row of rows || []) {
    const normalized = normalizer(row);
    if (normalized) {
      target.push(normalized);
    }
  }
}

async function appendFetchedRows(target, fetchOptions) {
  const rows = await fetchWithOptionalPageFilter(fetchOptions);
  for (const row of rows) {
    target.push(row);
  }
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
  const cacheKey = buildGscCacheKey({ siteUrl, startDate, endDate, searchType, dimensions, pageContains });
  const cachedRows = getCache(cacheKey);
  if (cachedRows) {
    return cachedRows.map((row) => ({ ...row }));
  }

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
    appendNormalizedRows(allRows, rows, normalizer);

    if (rows.length < MAX_ROW_LIMIT) {
      break;
    }
    startRow += MAX_ROW_LIMIT;
  }

  setCache(cacheKey, allRows.map((row) => ({ ...row })), getCacheTtlSeconds());
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
  const dimensions = ["date", "query", "page"];
  if (shouldChunkRange(startDate, endDate)) {
    const chunks = splitDateRangeIntoMonthlyChunks(startDate, endDate);
    if (chunks.length > 1) {
      const chunkRows = [];
      for (const chunk of chunks) {
        await appendFetchedRows(chunkRows, {
          siteUrl,
          startDate: chunk.start,
          endDate: chunk.end,
          searchType,
          keyFile,
          authClient,
          pageContains,
          dimensions,
          normalizer: normalizeKeywordRow,
        });
      }
      return chunkRows;
    }
  }

  return fetchWithOptionalPageFilter({
    siteUrl,
    startDate,
    endDate,
    searchType,
    keyFile,
    authClient,
    pageContains,
    dimensions,
    normalizer: normalizeKeywordRow,
  });
}


export async function fetchGscUrlPerformance({
  siteUrl,
  url,
  startDate,
  endDate,
  searchType = "web",
  authClient,
}) {
  if (!siteUrl) {
    throw new Error("Missing siteUrl for GSC URL performance request.");
  }

  if (!url) {
    throw new Error("Missing url for GSC URL performance request.");
  }

  if (!startDate || !endDate) {
    throw new Error("startDate and endDate are required for GSC URL performance request.");
  }

  const auth = resolveAuth({ authClient });
  const exactRows = await queryGscUrlPerformanceRows({
    auth,
    siteUrl,
    startDate,
    endDate,
    searchType,
    operator: "equals",
    expression: url,
    rowLimit: 1,
  });

  if (exactRows.length > 0) {
    const [row] = exactRows;
    return normalizeUrlPerformance({
      url,
      startDate,
      endDate,
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
      matchType: "exact",
    });
  }

  const pathname = getPathnameForGscFallback(url, siteUrl);
  if (!pathname) {
    return normalizeUrlPerformance({ url, startDate, endDate, matchType: "none" });
  }

  const fallbackRows = await queryGscUrlPerformanceRows({
    auth,
    siteUrl,
    startDate,
    endDate,
    searchType,
    operator: "contains",
    expression: pathname,
    rowLimit: 1000,
  });

  if (fallbackRows.length === 0) {
    return normalizeUrlPerformance({ url, startDate, endDate, matchType: "none" });
  }

  return normalizeUrlPerformance({
    url,
    startDate,
    endDate,
    ...aggregateUrlPerformanceRows(fallbackRows),
    matchType: "pathname_contains",
  });
}

export async function fetchGscUrlPerformanceForWindow({
  siteUrl,
  url,
  window,
  searchType = "web",
  authClient,
}) {
  if (!window?.previousRange || !window?.currentRange) {
    throw new Error("window.previousRange and window.currentRange are required for GSC URL performance window request.");
  }

  const previous = await fetchGscUrlPerformance({
    siteUrl,
    url,
    startDate: window.previousRange.startDate || window.previousRange.start,
    endDate: window.previousRange.endDate || window.previousRange.end,
    searchType,
    authClient,
  });

  const current = await fetchGscUrlPerformance({
    siteUrl,
    url,
    startDate: window.currentRange.startDate || window.currentRange.start,
    endDate: window.currentRange.endDate || window.currentRange.end,
    searchType,
    authClient,
  });

  return {
    url,
    windowKey: window.key,
    windowLabel: window.label,
    previous,
    current,
  };
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
