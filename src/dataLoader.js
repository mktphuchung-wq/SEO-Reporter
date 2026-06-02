import path from "node:path";
import { fetchGscKeywordRows, fetchGscRows } from "./datasources/gscApi.js";
import { loadContentMetadataRows, loadLookerCsvRows } from "./lib/csv.js";
import dayjs, { clampDateRangeByDays, parseDate } from "./lib/time.js";

function coalesceRows(rows) {
  const grouped = new Map();

  for (const row of rows) {
    if (!row.date || !row.url) {
      continue;
    }

    const key = `${row.date}||${row.url}`;
    const existing = grouped.get(key) || {
      date: row.date,
      url: row.url,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
    };

    const clicks = Number(row.clicks || 0);
    const impressions = Number(row.impressions || 0);
    const position = Number(row.position || 0);

    existing.clicks += clicks;
    existing.impressions += impressions;
    existing.weightedPosition += position * impressions;

    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .map((row) => ({
      date: row.date,
      url: row.url,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
      position: row.impressions > 0 ? row.weightedPosition / row.impressions : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.url.localeCompare(b.url));
}

function findDateSpan(rows) {
  if (!rows.length) {
    return null;
  }

  let min = rows[0].date;
  let max = rows[0].date;

  for (const row of rows) {
    if (row.date < min) {
      min = row.date;
    }
    if (row.date > max) {
      max = row.date;
    }
  }

  return { start: min, end: max };
}

export function resolveRange({ startDate, endDate, reportPeriod } = {}) {
  const periodDays = REPORT_PERIOD_DAYS[reportPeriod];
  if (periodDays) {
    return clampDateRangeByDays(dayjs().format("YYYY-MM-DD"), periodDays);
  }

  const parsedStart = parseDate(startDate);
  const parsedEnd = parseDate(endDate);

  if (parsedStart && parsedEnd) {
    return {
      start: parsedStart.format("YYYY-MM-DD"),
      end: parsedEnd.format("YYYY-MM-DD"),
    };
  }

  if (!parsedStart && parsedEnd) {
    return clampDateRangeByDays(parsedEnd.format("YYYY-MM-DD"), 180);
  }

  if (parsedStart && !parsedEnd) {
    return {
      start: parsedStart.format("YYYY-MM-DD"),
      end: dayjs().format("YYYY-MM-DD"),
    };
  }

  return clampDateRangeByDays(dayjs().format("YYYY-MM-DD"), 180);
}

const REPORT_PERIOD_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
};

function countDaysInclusive(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end.isBefore(start, "day")) {
    return 30;
  }
  return end.diff(start, "day") + 1;
}

function previousRangeFor(range) {
  const days = countDaysInclusive(range.start, range.end);
  const previousEnd = dayjs(range.start).subtract(1, "day").format("YYYY-MM-DD");
  return clampDateRangeByDays(previousEnd, days);
}

export async function loadReportData({
  sourceType,
  siteUrl,
  lookerCsvPath,
  contentCsvPath,
  searchType,
  startDate,
  endDate,
  reportPeriod,
  pageContains,
  gscKeyFile,
  authClient,
}) {
  const normalizedType = (sourceType || "looker").toLowerCase();
  const normalizedSearchType = (searchType || "web").toLowerCase();
  const trimmedPageContains = String(pageContains || "").trim();
  let rows = [];
  let keywordRows = [];
  let sourceInfo;

  if (normalizedType === "gsc") {
    if (!siteUrl) {
      throw new Error("siteUrl is required when sourceType = gsc");
    }

    const range = resolveRange({ startDate, endDate, reportPeriod });

    const comparisonRange = previousRangeFor(range);
    const keywordFetchRange = {
      start: comparisonRange.start,
      end: range.end,
    };

    rows = await fetchGscRows({
      siteUrl,
      startDate: range.start,
      endDate: range.end,
      searchType: normalizedSearchType,
      keyFile: gscKeyFile,
      authClient,
      pageContains: trimmedPageContains,
    });

    keywordRows = await fetchGscKeywordRows({
      siteUrl,
      startDate: keywordFetchRange.start,
      endDate: keywordFetchRange.end,
      searchType: normalizedSearchType,
      keyFile: gscKeyFile,
      authClient,
      pageContains: trimmedPageContains,
    });

    sourceInfo = {
      label: "Google Search Console API",
      property: siteUrl,
      range,
      keywordRange: keywordFetchRange,
      filters: {
        reportPeriod: reportPeriod || "custom",
        pageContains: trimmedPageContains,
        searchType: normalizedSearchType,
      },
    };
  } else {
    if (!lookerCsvPath) {
      throw new Error("lookerCsvPath is required when sourceType = looker");
    }

    const absoluteLookerPath = path.resolve(lookerCsvPath);
    rows = await loadLookerCsvRows(absoluteLookerPath);
    const span = findDateSpan(rows);

    if (startDate || endDate) {
      const range = resolveRange({ startDate: startDate || span?.start, endDate: endDate || span?.end, reportPeriod });
      rows = rows.filter((row) => row.date >= range.start && row.date <= range.end);
      sourceInfo = {
        label: "Looker CSV Export",
        property: absoluteLookerPath,
        range,
        filters: {
          reportPeriod: reportPeriod || "custom",
          pageContains: trimmedPageContains,
          searchType: normalizedSearchType,
        },
      };
    } else {
      sourceInfo = {
        label: "Looker CSV Export",
        property: absoluteLookerPath,
        range: span,
        filters: {
          reportPeriod: reportPeriod || "custom",
          pageContains: trimmedPageContains,
          searchType: normalizedSearchType,
        },
      };
    }
  }

  const contentRows = contentCsvPath ? await loadContentMetadataRows(contentCsvPath) : [];
  const coalesced = coalesceRows(rows);

  if (!coalesced.length) {
    throw new Error("No rows found after parsing data source.");
  }

  return {
    rows: coalesced,
    keywordRows,
    contentRows,
    sourceInfo,
  };
}
