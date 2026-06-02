import dayjs, { parseDate } from "./lib/time.js";

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function safeNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function inRange(date, range) {
  return Boolean(date && range?.start && range?.end && date >= range.start && date <= range.end);
}

function pctFromDelta(delta, previous) {
  if (!previous) {
    return delta > 0 ? null : 0;
  }
  return (delta / previous) * 100;
}

function summarizeRows(rows) {
  const summary = {
    clicks: 0,
    impressions: 0,
    weightedPosition: 0,
    bestUrl: "",
    bestUrlClicks: -1,
    bestUrlImpressions: -1,
  };

  for (const row of rows) {
    const clicks = safeNumber(row.clicks);
    const impressions = safeNumber(row.impressions);
    const position = safeNumber(row.position);

    summary.clicks += clicks;
    summary.impressions += impressions;
    summary.weightedPosition += position * impressions;

    if (clicks > summary.bestUrlClicks || (clicks === summary.bestUrlClicks && impressions > summary.bestUrlImpressions)) {
      summary.bestUrl = row.url || "";
      summary.bestUrlClicks = clicks;
      summary.bestUrlImpressions = impressions;
    }
  }

  return {
    clicks: summary.clicks,
    impressions: summary.impressions,
    ctr: summary.impressions > 0 ? summary.clicks / summary.impressions : 0,
    avgPosition: summary.impressions > 0 ? summary.weightedPosition / summary.impressions : null,
    bestUrl: summary.bestUrl,
  };
}

function summarizeQueryUrlRows(rows, range) {
  const grouped = new Map();

  for (const row of rows) {
    if (!inRange(row.date, range) || !row.query) {
      continue;
    }

    const query = String(row.query || "").trim();
    const url = row.url || "";
    const key = `${normalizeText(query)}||${url}`;
    const existing = grouped.get(key) || {
      query,
      url,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
    };

    const clicks = safeNumber(row.clicks);
    const impressions = safeNumber(row.impressions);
    existing.clicks += clicks;
    existing.impressions += impressions;
    existing.weightedPosition += safeNumber(row.position) * impressions;
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).map((row) => ({
    query: row.query,
    url: row.url,
    currentClicks: row.clicks,
    currentImpressions: row.impressions,
    currentCtr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    currentAvgPosition: row.impressions > 0 ? row.weightedPosition / row.impressions : null,
  }));
}

function summarizeQueryUrlComparison(rows, currentRange, previousRange) {
  const currentRows = summarizeQueryUrlRows(rows, currentRange);
  const previousRows = summarizeQueryUrlRows(rows, previousRange);
  const previousMap = new Map(previousRows.map((row) => [`${normalizeText(row.query)}||${row.url}`, row]));

  return currentRows.map((current) => {
    const previous = previousMap.get(`${normalizeText(current.query)}||${current.url}`) || {
      currentClicks: 0,
      currentImpressions: 0,
      currentAvgPosition: null,
    };
    const previousAvgPosition = previous.currentAvgPosition;
    const positionDelta =
      previousAvgPosition !== null && current.currentAvgPosition !== null
        ? previousAvgPosition - current.currentAvgPosition
        : null;

    return {
      ...current,
      previousClicks: previous.currentClicks,
      previousImpressions: previous.currentImpressions,
      previousAvgPosition,
      clickDelta: current.currentClicks - previous.currentClicks,
      impressionDelta: current.currentImpressions - previous.currentImpressions,
      clickDeltaPercent: pctFromDelta(current.currentClicks - previous.currentClicks, previous.currentClicks),
      positionDelta,
    };
  });
}

function priorityFromRow(row) {
  if (row.positionDelta !== null && row.positionDelta < -3 && row.currentImpressions >= 500) {
    return "high";
  }
  if (row.currentImpressions >= 250 || Math.abs(row.clickDelta || 0) >= 20) {
    return "medium";
  }
  return "low";
}

export function parseTrackedKeywords(input) {
  const seen = new Set();
  return String(input ?? "")
    .split(/[\n,]+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .filter((keyword) => {
      const key = normalizeText(keyword);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function buildComparableRanges(endDate, periodDays) {
  const safeEnd = (parseDate(endDate) ?? dayjs()).format("YYYY-MM-DD");
  const days = Math.max(1, Number(periodDays || 30));
  const currentEnd = dayjs(safeEnd);
  const currentStart = currentEnd.subtract(days - 1, "day");
  const previousEnd = currentStart.subtract(1, "day");
  const previousStart = previousEnd.subtract(days - 1, "day");

  return {
    currentRange: {
      start: currentStart.format("YYYY-MM-DD"),
      end: currentEnd.format("YYYY-MM-DD"),
    },
    previousRange: {
      start: previousStart.format("YYYY-MM-DD"),
      end: previousEnd.format("YYYY-MM-DD"),
    },
  };
}

export function summarizeKeywordRows(rows) {
  const grouped = new Map();

  for (const row of rows || []) {
    if (!row.query) {
      continue;
    }
    const key = normalizeText(row.query);
    const existing = grouped.get(key) || {
      query: String(row.query).trim(),
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      urls: new Map(),
    };
    const clicks = safeNumber(row.clicks);
    const impressions = safeNumber(row.impressions);
    existing.clicks += clicks;
    existing.impressions += impressions;
    existing.weightedPosition += safeNumber(row.position) * impressions;
    existing.urls.set(row.url, (existing.urls.get(row.url) || 0) + clicks);
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).map((row) => ({
    query: row.query,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    avgPosition: row.impressions > 0 ? row.weightedPosition / row.impressions : null,
    topUrls: Array.from(row.urls.entries())
      .map(([url, clicks]) => ({ url, clicks }))
      .sort((a, b) => b.clicks - a.clicks),
  }));
}

export function buildTrackedKeywordMovements({ keywordRows = [], trackedKeywords = [], currentRange, previousRange }) {
  return trackedKeywords.map((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    const currentExact = keywordRows.filter((row) => inRange(row.date, currentRange) && normalizeText(row.query) === normalizedKeyword);
    const previousExact = keywordRows.filter((row) => inRange(row.date, previousRange) && normalizeText(row.query) === normalizedKeyword);
    const exactHasData = currentExact.length > 0 || previousExact.length > 0;
    const currentContains = exactHasData
      ? []
      : keywordRows.filter((row) => inRange(row.date, currentRange) && normalizeText(row.query).includes(normalizedKeyword));
    const previousContains = exactHasData
      ? []
      : keywordRows.filter((row) => inRange(row.date, previousRange) && normalizeText(row.query).includes(normalizedKeyword));
    const containsHasData = currentContains.length > 0 || previousContains.length > 0;
    const matchType = exactHasData ? "exact" : containsHasData ? "contains" : "none";
    const current = summarizeRows(exactHasData ? currentExact : currentContains);
    const previous = summarizeRows(exactHasData ? previousExact : previousContains);
    const positionDelta =
      previous.avgPosition !== null && current.avgPosition !== null ? previous.avgPosition - current.avgPosition : null;
    const clickDelta = current.clicks - previous.clicks;
    const impressionDelta = current.impressions - previous.impressions;

    let actionHint = "Monitor";
    if (matchType === "none" || (current.impressions === 0 && previous.impressions === 0)) {
      actionHint = "No GSC data in selected period";
    } else if (positionDelta !== null && positionDelta > 0 && impressionDelta > 0) {
      actionHint = "Protect and strengthen this page";
    } else if (positionDelta !== null && positionDelta < 0 && current.impressions >= 100) {
      actionHint = "Refresh content and improve internal links";
    } else if (current.impressions >= 100 && current.avgPosition > 8) {
      actionHint = "Optimization opportunity";
    } else if (clickDelta < 0 && impressionDelta >= 0) {
      actionHint = "Check title/meta CTR";
    }

    return {
      keyword,
      matchType,
      bestCurrentUrl: current.bestUrl,
      currentClicks: current.clicks,
      previousClicks: previous.clicks,
      clickDelta,
      currentImpressions: current.impressions,
      previousImpressions: previous.impressions,
      impressionDelta,
      currentCtr: current.ctr,
      previousCtr: previous.ctr,
      currentAvgPosition: current.avgPosition,
      previousAvgPosition: previous.avgPosition,
      positionDelta,
      actionHint,
    };
  });
}

export function buildHighImpressionKeywordMovements({ keywordRows = [], currentRange, previousRange }) {
  return summarizeQueryUrlComparison(keywordRows, currentRange, previousRange)
    .filter(
      (row) =>
        (row.currentImpressions >= 100 || row.previousImpressions >= 100) &&
        row.currentAvgPosition !== null &&
        row.previousAvgPosition !== null &&
        row.currentAvgPosition - row.previousAvgPosition >= 1.5,
    )
    .map((row) => ({
      ...row,
      priority: priorityFromRow(row),
      recommendation: "Refresh content, add internal links, and verify the page still satisfies search intent.",
    }))
    .sort((a, b) => b.currentImpressions - a.currentImpressions)
    .slice(0, 50);
}

export function buildNearPageOneKeywords({ keywordRows = [], currentRange }) {
  return summarizeQueryUrlRows(keywordRows, currentRange)
    .filter((row) => row.currentAvgPosition > 8 && row.currentAvgPosition <= 20 && row.currentImpressions >= 100)
    .map((row) => ({
      ...row,
      priority: row.currentImpressions >= 500 ? "high" : "medium",
      recommendation: "Improve on-page relevance, add supporting sections, and build internal links to push toward page 1.",
    }))
    .sort((a, b) => b.currentImpressions - a.currentImpressions)
    .slice(0, 50);
}

export function buildKeywordWinners({ keywordRows = [], currentRange, previousRange }) {
  return summarizeQueryUrlComparison(keywordRows, currentRange, previousRange)
    .filter((row) => {
      const significantClicks = row.clickDelta >= Math.max(10, row.previousClicks * 0.25);
      return row.currentImpressions >= 50 && ((row.positionDelta !== null && row.positionDelta >= 1.5) || significantClicks);
    })
    .map((row) => ({
      ...row,
      priority: row.clickDelta >= 50 || row.currentImpressions >= 500 ? "high" : "medium",
      recommendation: "Protect this win with fresh examples, FAQs, and stronger internal links from relevant pages.",
    }))
    .sort((a, b) => b.clickDelta - a.clickDelta || b.impressionDelta - a.impressionDelta)
    .slice(0, 50);
}

export function buildCtrOpportunities({ keywordRows = [], currentRange }) {
  return summarizeQueryUrlRows(keywordRows, currentRange)
    .filter((row) => {
      if (row.currentImpressions < 100 || row.currentAvgPosition === null || row.currentAvgPosition > 10) {
        return false;
      }
      if (row.currentAvgPosition <= 3) {
        return row.currentCtr < 0.08;
      }
      if (row.currentAvgPosition <= 5) {
        return row.currentCtr < 0.04;
      }
      return row.currentCtr < 0.02;
    })
    .map((row) => ({
      ...row,
      priority: row.currentImpressions >= 500 ? "high" : "medium",
      recommendation: "Rewrite title/meta description to better match intent and improve SERP click appeal.",
    }))
    .sort((a, b) => b.currentImpressions - a.currentImpressions)
    .slice(0, 50);
}
