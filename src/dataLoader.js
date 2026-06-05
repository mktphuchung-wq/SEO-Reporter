import fs from "node:fs/promises";
import path from "node:path";
import { fetchGscKeywordRows, fetchGscRows } from "./datasources/gscApi.js";
import { loadContentMetadataRows, loadLookerCsvRows } from "./lib/csv.js";
import dayjs, { clampDateRangeByDays, parseDate } from "./lib/time.js";
import {
  formatMonthLabel,
  formatQuarterLabel,
  getMostRecentCompletedMonth,
  getMostRecentCompletedQuarter,
  getPreviousMonthRange,
  getPreviousQuarterRange,
} from "./lib/reportPeriods.js";

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

export function resolveRange({ startDate, endDate, reportPeriod, defaultEndDate } = {}) {
  const safeDefaultEndDate = defaultEndDate || dayjs().format("YYYY-MM-DD");
  const periodDays = REPORT_PERIOD_DAYS[reportPeriod];
  if (periodDays) {
    return clampDateRangeByDays(safeDefaultEndDate, periodDays);
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
      end: safeDefaultEndDate,
    };
  }

  return clampDateRangeByDays(safeDefaultEndDate, 180);
}

const GSC_DATA_DELAY_DAYS = Number.parseInt(process.env.GSC_DATA_DELAY_DAYS || "2", 10);

function getGscDataDelayDays() {
  return Number.isFinite(GSC_DATA_DELAY_DAYS) && GSC_DATA_DELAY_DAYS >= 0 ? GSC_DATA_DELAY_DAYS : 2;
}

function getGscDefaultEndDate() {
  return dayjs().subtract(getGscDataDelayDays(), "day").format("YYYY-MM-DD");
}

export function resolveGscRange({ startDate, endDate, reportPeriod, reportType } = {}) {
  if (reportType === "monthly") {
    return getMostRecentCompletedMonth(dayjs(), getGscDataDelayDays());
  }

  if (reportType === "quarterly") {
    return getMostRecentCompletedQuarter(dayjs(), getGscDataDelayDays());
  }

  return resolveRange({
    startDate,
    endDate,
    reportPeriod,
    defaultEndDate: getGscDefaultEndDate(),
  });
}

function buildGscDataDelayNote(range) {
  return range?.end ? `GSC data may be delayed; report ends at ${range.end}.` : null;
}

function isFileNotFoundError(error) {
  return error?.code === "ENOENT" || /no such file or directory/i.test(error?.message || "");
}

async function loadLookerRowsOrThrow(lookerCsvPath) {
  const absoluteLookerPath = path.resolve(lookerCsvPath);

  try {
    return await loadLookerCsvRows(absoluteLookerPath);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new Error(`Looker CSV not found at ${absoluteLookerPath}.`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse Looker CSV at ${absoluteLookerPath}: ${message}`);
  }
}

async function loadOptionalContentRows(contentCsvPath, { optional = false } = {}) {
  const trimmedPath = String(contentCsvPath || "").trim();
  if (!trimmedPath) {
    return { rows: [], warning: null };
  }

  try {
    await fs.access(path.resolve(trimmedPath));
    return { rows: await loadContentMetadataRows(trimmedPath), warning: null };
  } catch (error) {
    if (optional && isFileNotFoundError(error)) {
      return {
        rows: [],
        warning: `Content metadata CSV not found at ${trimmedPath}; report continues with GSC-only content opportunities.`,
      };
    }
    throw error;
  }
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
  reportType,
}) {
  const normalizedReportType = ["monthly", "quarterly", "custom"].includes(reportType) ? reportType : "custom";
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

    const range = resolveGscRange({ startDate, endDate, reportPeriod, reportType: normalizedReportType });

    const comparisonRange = normalizedReportType === "monthly"
      ? getPreviousMonthRange(range)
      : normalizedReportType === "quarterly"
        ? getPreviousQuarterRange(range)
        : previousRangeFor(range);
    const fetchRange = {
      start: comparisonRange.start,
      end: range.end,
    };
    const keywordFetchRange = fetchRange;

    rows = await fetchGscRows({
      siteUrl,
      startDate: fetchRange.start,
      endDate: fetchRange.end,
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
      previousRange: comparisonRange,
      keywordRange: keywordFetchRange,
      reportType: normalizedReportType,
      reportLabel: normalizedReportType === "monthly"
        ? `Monthly SEO Report - ${formatMonthLabel(range)}`
        : normalizedReportType === "quarterly"
          ? `Quarterly SEO Report - ${formatQuarterLabel(range)}`
          : "Custom Report",
      dataDelayNote: buildGscDataDelayNote(range),
      filters: {
        reportType: normalizedReportType,
        reportPeriod: reportPeriod || "custom",
        pageContains: trimmedPageContains,
        searchType: normalizedSearchType,
      },
      diagnostics: {
        pageRowCount: rows.length,
        keywordRowCount: keywordRows.length,
        pageContainsApplied: Boolean(trimmedPageContains),
        searchType: normalizedSearchType,
        queryRange: fetchRange,
        selectedRange: range,
        previousRange: comparisonRange,
        comparisonRange,
        keywordFetchRange,
        gscDataDelayDays: getGscDataDelayDays(),
      },
    };
  } else {
    if (!lookerCsvPath) {
      throw new Error("lookerCsvPath is required when sourceType = looker");
    }

    const absoluteLookerPath = path.resolve(lookerCsvPath);
    rows = await loadLookerRowsOrThrow(absoluteLookerPath);
    const span = findDateSpan(rows);

    if (startDate || endDate || reportPeriod || normalizedReportType !== "custom") {
      const range = normalizedReportType === "monthly"
        ? getMostRecentCompletedMonth(dayjs(), getGscDataDelayDays())
        : normalizedReportType === "quarterly"
          ? getMostRecentCompletedQuarter(dayjs(), getGscDataDelayDays())
          : resolveRange({ startDate: startDate || span?.start, endDate: endDate || span?.end, reportPeriod });
      const comparisonRange = normalizedReportType === "monthly"
        ? getPreviousMonthRange(range)
        : normalizedReportType === "quarterly"
          ? getPreviousQuarterRange(range)
          : previousRangeFor(range);
      const fetchRange = { start: comparisonRange.start, end: range.end };
      rows = rows.filter((row) => row.date >= fetchRange.start && row.date <= fetchRange.end);
      sourceInfo = {
        label: "Looker CSV Export",
        property: absoluteLookerPath,
        range,
        previousRange: comparisonRange,
        reportType: normalizedReportType,
        reportLabel: normalizedReportType === "monthly"
          ? `Monthly SEO Report - ${formatMonthLabel(range)}`
          : normalizedReportType === "quarterly"
            ? `Quarterly SEO Report - ${formatQuarterLabel(range)}`
            : "Custom Report",
        filters: {
          reportType: normalizedReportType,
          reportPeriod: reportPeriod || "custom",
          pageContains: trimmedPageContains,
          searchType: normalizedSearchType,
        },
        diagnostics: {
          queryRange: fetchRange,
          selectedRange: range,
          previousRange: comparisonRange,
          comparisonRange,
        },
      };
    } else {
      sourceInfo = {
        label: "Looker CSV Export",
        property: absoluteLookerPath,
        range: span,
        previousRange: span ? previousRangeFor(span) : null,
        reportType: normalizedReportType,
        reportLabel: normalizedReportType === "monthly" && span
          ? `Monthly SEO Report - ${formatMonthLabel(span)}`
          : normalizedReportType === "quarterly" && span
            ? `Quarterly SEO Report - ${formatQuarterLabel(span)}`
            : "Custom Report",
        filters: {
          reportType: normalizedReportType,
          reportPeriod: reportPeriod || "custom",
          pageContains: trimmedPageContains,
          searchType: normalizedSearchType,
        },
      };
    }
  }

  const contentResult = await loadOptionalContentRows(contentCsvPath, { optional: normalizedType === "gsc" });
  const contentRows = contentResult.rows;
  const coalesced = coalesceRows(rows);
  const isEmptyGscReport = normalizedType === "gsc" && coalesced.length === 0;
  const emptyReason = isEmptyGscReport
    ? "No GSC page rows matched this property, search type, date range, and page filter."
    : null;

  sourceInfo = {
    ...sourceInfo,
    emptyReason,
    diagnostics: {
      ...(sourceInfo?.diagnostics || {}),
      coalescedPageRowCount: coalesced.length,
      contentMetadataRowCount: contentRows.length,
      contentMetadataWarning: contentResult.warning,
      emptyReason,
      emptyDataWarning: emptyReason
        ? `${emptyReason} Try a wider range or remove the page filter.`
        : null,
    },
  };

  if (!coalesced.length && normalizedType !== "gsc") {
    throw new Error("No rows found after parsing data source.");
  }

  return {
    rows: coalesced,
    keywordRows,
    contentRows,
    sourceInfo,
    emptyReason,
  };
}
