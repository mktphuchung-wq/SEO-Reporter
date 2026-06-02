import path from "node:path";
import { fetchGscRows } from "./datasources/gscApi.js";
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

function resolveRange({ startDate, endDate }) {
  const parsedStart = parseDate(startDate);
  const parsedEnd = parseDate(endDate);

  if (parsedStart && parsedEnd) {
    if (parsedStart.isAfter(parsedEnd, "day")) {
      throw new Error("startDate must be before or equal to endDate.");
    }
    return {
      start: parsedStart.format("YYYY-MM-DD"),
      end: parsedEnd.format("YYYY-MM-DD"),
    };
  }

  if (!parsedStart && parsedEnd) {
    return clampDateRangeByDays(parsedEnd.format("YYYY-MM-DD"), 180);
  }

  if (parsedStart && !parsedEnd) {
    const today = dayjs();
    if (parsedStart.isAfter(today, "day")) {
      throw new Error("startDate cannot be after today when endDate is omitted.");
    }
    return {
      start: parsedStart.format("YYYY-MM-DD"),
      end: today.format("YYYY-MM-DD"),
    };
  }

  return clampDateRangeByDays(dayjs().format("YYYY-MM-DD"), 180);
}

export async function loadReportData({
  sourceType,
  siteUrl,
  lookerCsvPath,
  contentCsvPath,
  searchType,
  startDate,
  endDate,
  gscKeyFile,
  authClient,
}) {
  const normalizedType = (sourceType || "looker").toLowerCase();
  let rows = [];
  let sourceInfo;

  if (normalizedType === "gsc") {
    if (!siteUrl) {
      throw new Error("siteUrl is required when sourceType = gsc");
    }

    const range = resolveRange({ startDate, endDate });

    rows = await fetchGscRows({
      siteUrl,
      startDate: range.start,
      endDate: range.end,
      searchType: (searchType || "web").toLowerCase(),
      keyFile: gscKeyFile,
      authClient,
    });

    sourceInfo = {
      label: "Google Search Console API",
      property: siteUrl,
      range,
    };
  } else {
    if (!lookerCsvPath) {
      throw new Error("lookerCsvPath is required when sourceType = looker");
    }

    const absoluteLookerPath = path.resolve(lookerCsvPath);
    rows = await loadLookerCsvRows(absoluteLookerPath);
    const span = findDateSpan(rows);

    if (startDate || endDate) {
      const range = resolveRange({ startDate: startDate || span?.start, endDate: endDate || span?.end });
      rows = rows.filter((row) => row.date >= range.start && row.date <= range.end);
      sourceInfo = {
        label: "Looker CSV Export",
        property: absoluteLookerPath,
        range,
      };
    } else {
      sourceInfo = {
        label: "Looker CSV Export",
        property: absoluteLookerPath,
        range: span,
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
    contentRows,
    sourceInfo,
  };
}
