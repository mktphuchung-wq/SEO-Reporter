const ALLOWED_SEARCH_TYPES = new Set(["web", "image", "video", "news"]);
const DEFAULT_MAX_URLS = 50;
const HARD_MAX_URLS = 100;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toStringValue(value) {
  return value == null ? "" : String(value);
}

function splitFirstCell(line) {
  const tabIndex = line.indexOf("\t");
  const commaIndex = line.indexOf(",");
  const indexes = [tabIndex, commaIndex].filter((index) => index >= 0);

  if (!indexes.length) {
    return { cell: line, hasExtraColumns: false };
  }

  const splitIndex = Math.min(...indexes);
  return {
    cell: line.slice(0, splitIndex),
    hasExtraColumns: line.slice(splitIndex + 1).trim().length > 0,
  };
}

export function parseUrlList(input) {
  return toStringValue(input)
    .split(/\r?\n/)
    .map((raw, index) => ({ raw, rowNumber: index + 1 }))
    .filter(({ raw }) => raw.trim().length > 0)
    .map(({ raw, rowNumber }) => {
      const { cell } = splitFirstCell(raw.trim());
      return {
        rowNumber,
        url: cell.trim(),
        raw,
      };
    });
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrlPrefix(value) {
  return toStringValue(value).trim();
}

function normalizeHostname(hostname) {
  return toStringValue(hostname).trim().toLowerCase().replace(/^www\./, "");
}

function hostnameMatchesDomain(hostname, domain) {
  const normalizedHostname = normalizeHostname(hostname);
  const normalizedDomain = normalizeHostname(domain.replace(/^sc-domain:/i, ""));

  return normalizedHostname === normalizedDomain || normalizedHostname.endsWith(`.${normalizedDomain}`);
}

function buildPropertyWarning({ siteUrl, url }) {
  const normalizedSiteUrl = normalizeUrlPrefix(siteUrl);

  if (normalizedSiteUrl.toLowerCase().startsWith("sc-domain:")) {
    try {
      const parsedUrl = new URL(url);
      const domain = normalizedSiteUrl.slice("sc-domain:".length);
      if (!hostnameMatchesDomain(parsedUrl.hostname, domain)) {
        return `URL does not appear to match selected domain property ${normalizedSiteUrl}: ${url}`;
      }
    } catch {
      return "";
    }
    return "";
  }

  if ((normalizedSiteUrl.startsWith("http://") || normalizedSiteUrl.startsWith("https://")) && !url.startsWith(normalizedSiteUrl)) {
    return `URL does not start with selected URL-prefix property ${normalizedSiteUrl}: ${url}`;
  }

  return "";
}

export function validateUrlCompareRequest({ siteUrl, searchType, urlList } = {}) {
  const requestErrors = [];
  const invalidRows = [];
  const warnings = [];
  const validRows = [];
  const normalizedSiteUrl = toStringValue(siteUrl).trim();
  const normalizedSearchType = toStringValue(searchType || "web").trim().toLowerCase();
  const rows = Array.isArray(urlList) ? urlList : parseUrlList(urlList);

  if (!normalizedSiteUrl) {
    requestErrors.push("Search Console property is required.");
  }

  if (!ALLOWED_SEARCH_TYPES.has(normalizedSearchType)) {
    requestErrors.push("Search type must be one of web, image, video, news.");
  }

  if (!rows.length) {
    requestErrors.push("URL list is required.");
  }

  if (rows.length > DEFAULT_MAX_URLS) {
    warnings.push("For large URL lists, split into batches of 50–100 URLs.");
  }

  if (rows.length > HARD_MAX_URLS) {
    requestErrors.push("Please split large URL lists into batches of 50–100 URLs to avoid timeout.");
  }

  const seenUrls = new Set();

  for (const row of rows) {
    const url = toStringValue(row.url).trim();
    const { hasExtraColumns } = splitFirstCell(toStringValue(row.raw).trim());

    if (hasExtraColumns) {
      warnings.push(`Extra columns ignored on row ${row.rowNumber}; using first cell as URL.`);
    }

    if (!isValidHttpUrl(url)) {
      invalidRows.push({
        ...row,
        url,
        errors: ["URL must be a valid http/https URL."],
      });
      continue;
    }

    if (seenUrls.has(url)) {
      warnings.push(`Duplicate URL removed: ${url}`);
      continue;
    }
    seenUrls.add(url);

    if (normalizedSiteUrl) {
      const propertyWarning = buildPropertyWarning({ siteUrl: normalizedSiteUrl, url });
      if (propertyWarning) {
        warnings.push(propertyWarning);
      }
    }

    validRows.push({
      rowNumber: row.rowNumber,
      url,
      raw: row.raw,
    });
  }

  return {
    requestErrors,
    validRows,
    invalidRows,
    warnings,
    rowCount: rows.length,
    validCount: validRows.length,
    invalidCount: invalidRows.length,
  };
}

function dateOnlyUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateOnlyString(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * ONE_DAY_MS);
}

function daysInUtcMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function subtractMonthsClamped(date, months) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonthOffset = month - months;
  const targetYear = year + Math.floor(targetMonthOffset / 12);
  const targetMonth = ((targetMonthOffset % 12) + 12) % 12;
  const targetDay = Math.min(day, daysInUtcMonth(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

function coerceDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("today must be a valid Date.");
  }
  return dateOnlyUtc(date);
}

export function buildAutoCompareWindows({ today = new Date(), gscDelayDays = 2 } = {}) {
  const delayDays = Number.isFinite(Number(gscDelayDays)) ? Number(gscDelayDays) : 2;
  const effectiveEndDate = addDays(coerceDateOnly(today), -delayDays);

  // Periods are inclusive. For an N-month current period, start is the day
  // after subtracting N calendar months from the effective end date. Previous
  // periods use the same rule ending the day before the current start, keeping
  // windows continuous, non-overlapping, and safe around month ends.
  return [1, 2, 3].map((months) => {
    const currentStart = addDays(subtractMonthsClamped(effectiveEndDate, months), 1);
    const previousEnd = addDays(currentStart, -1);
    const previousStart = addDays(subtractMonthsClamped(previousEnd, months), 1);
    const monthLabel = months === 1 ? "Month" : "Months";

    return {
      key: `${months}m`,
      label: `${months} ${monthLabel}`,
      previousRange: {
        start: toDateOnlyString(previousStart),
        end: toDateOnlyString(previousEnd),
        label: `Previous ${months} ${monthLabel}`,
      },
      currentRange: {
        start: toDateOnlyString(currentStart),
        end: toDateOnlyString(effectiveEndDate),
        label: `Latest ${months} ${monthLabel}`,
      },
    };
  });
}

export function normalizeUrlCompareRequest(input = {}) {
  const urlList = input.urlList ?? input.urls ?? input.url_list ?? "";
  const validation = validateUrlCompareRequest({
    siteUrl: input.siteUrl,
    searchType: input.searchType,
    urlList,
  });

  return {
    ...validation,
    compareWindows: buildAutoCompareWindows({
      today: input.today instanceof Date || input.today ? input.today : new Date(),
      gscDelayDays: input.gscDelayDays ?? 2,
    }),
  };
}


function toNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toNullableNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function buildPercentDelta(previousValue, currentValue) {
  if (previousValue > 0) {
    return (currentValue - previousValue) / previousValue;
  }

  if (currentValue > 0) {
    return null;
  }

  return 0;
}

function buildUrlWindowStatus({ previousClicks, currentClicks, clickDelta, clickDeltaPercent, currentImpressions, currentCtr, error }) {
  if (error) {
    return "Error";
  }

  if (previousClicks === 0 && currentClicks > 0) {
    return "New traffic";
  }

  if (previousClicks > 0 && currentClicks === 0) {
    return "Lost traffic";
  }

  if (clickDeltaPercent != null && clickDeltaPercent >= 0.2 && clickDelta >= 5) {
    return "Growing";
  }

  if (clickDeltaPercent != null && clickDeltaPercent <= -0.2 && clickDelta <= -5) {
    return "Declining";
  }

  if (currentImpressions >= 500 && currentCtr < 0.01) {
    return "High impressions low CTR";
  }

  return "Stable";
}

function buildUrlWindowInsight(status) {
  switch (status) {
    case "Growing":
      return "Traffic increased meaningfully. Protect this URL and add internal links.";
    case "Declining":
      return "Traffic declined meaningfully. Review content freshness, title/meta, indexing, and ranking movement.";
    case "High impressions low CTR":
      return "High visibility but low CTR. Review title/meta and intent match.";
    case "New traffic":
      return "This URL started gaining clicks in the current period.";
    case "Lost traffic":
      return "This URL lost traffic in the current period. Check indexing, rankings, and seasonality.";
    case "Error":
      return "GSC fetch failed for this URL/window. Try again or check the URL/date range.";
    case "Stable":
    default:
      return "Performance is stable.";
  }
}

function buildEmptyPerformance(url, range = {}) {
  return {
    url,
    startDate: range.start || range.startDate || "",
    endDate: range.end || range.endDate || "",
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: null,
    matchType: "none",
  };
}

export function buildUrlPerformanceComparison({ validRows = [], compareWindows = [], gscResults = [] } = {}) {
  const resultMap = new Map();

  for (const result of gscResults) {
    resultMap.set(`${result.rowNumber}::${result.url}::${result.windowKey}`, result);
  }

  const flatRows = [];
  const groupedRows = validRows.map((row) => ({
    rowNumber: row.rowNumber,
    url: row.url,
    windows: {},
  }));
  const groupedByKey = new Map(groupedRows.map((row) => [`${row.rowNumber}::${row.url}`, row]));

  for (const row of validRows) {
    for (const window of compareWindows) {
      const result = resultMap.get(`${row.rowNumber}::${row.url}::${window.key}`) || {};
      const previous = result.previous || buildEmptyPerformance(row.url, window.previousRange);
      const current = result.current || buildEmptyPerformance(row.url, window.currentRange);
      const previousClicks = toNumber(previous.clicks);
      const currentClicks = toNumber(current.clicks);
      const clickDelta = currentClicks - previousClicks;
      const clickDeltaPercent = buildPercentDelta(previousClicks, currentClicks);
      const previousImpressions = toNumber(previous.impressions);
      const currentImpressions = toNumber(current.impressions);
      const impressionDelta = currentImpressions - previousImpressions;
      const impressionDeltaPercent = buildPercentDelta(previousImpressions, currentImpressions);
      const previousPosition = toNullableNumber(previous.position);
      const currentPosition = toNullableNumber(current.position);
      const positionDelta = previousPosition == null || currentPosition == null ? null : previousPosition - currentPosition;
      const status = buildUrlWindowStatus({
        previousClicks,
        currentClicks,
        clickDelta,
        clickDeltaPercent,
        currentImpressions,
        currentCtr: toNumber(current.ctr),
        error: result.error,
      });
      const comparisonRow = {
        rowNumber: row.rowNumber,
        url: row.url,
        windowKey: window.key,
        windowLabel: window.label,
        previousStart: window.previousRange?.start || previous.startDate || "",
        previousEnd: window.previousRange?.end || previous.endDate || "",
        currentStart: window.currentRange?.start || current.startDate || "",
        currentEnd: window.currentRange?.end || current.endDate || "",
        previousClicks,
        currentClicks,
        clickDelta,
        clickDeltaPercent,
        previousImpressions,
        currentImpressions,
        impressionDelta,
        impressionDeltaPercent,
        previousCtr: toNumber(previous.ctr),
        currentCtr: toNumber(current.ctr),
        previousPosition,
        currentPosition,
        positionDelta,
        matchTypePrevious: previous.matchType || "none",
        matchTypeCurrent: current.matchType || "none",
        status,
        insight: buildUrlWindowInsight(status),
      };

      flatRows.push(comparisonRow);
      groupedByKey.get(`${row.rowNumber}::${row.url}`).windows[window.key] = comparisonRow;
    }
  }

  const statusCounts = flatRows.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    return counts;
  }, {});

  return { flatRows, groupedRows, statusCounts };
}
