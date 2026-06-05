import dayjs, { clampDateRangeByDays, daysBetweenInclusive, monthKey, parseDate } from "./lib/time.js";

function inRange(dateString, start, end) {
  return dateString >= start && dateString <= end;
}

function filterRowsByRange(rows, start, end) {
  if (!start || !end) {
    return [];
  }
  return rows.filter((row) => row.date && inRange(row.date, start, end));
}

export function summarizeRows(rows) {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;

  for (const row of rows || []) {
    const rowClicks = Number(row.clicks || 0);
    const rowImpressions = Number(row.impressions || 0);
    const rowPosition = Number(row.position || 0);

    clicks += rowClicks;
    impressions += rowImpressions;
    weightedPosition += rowPosition * rowImpressions;
  }

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
  };
}

function countDaysInclusive(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end.isBefore(start, "day")) {
    return 0;
  }
  return end.diff(start, "day") + 1;
}

function calcDelta(current, previous) {
  const absolute = current - previous;
  const percent = previous === 0 ? (current > 0 ? null : 0) : (absolute / previous) * 100;

  return { absolute, percent };
}

function calcPositionDelta(currentPosition, previousPosition) {
  const absolute = previousPosition - currentPosition;
  return {
    absolute,
    percent: previousPosition === 0 ? (currentPosition === 0 ? 0 : null) : (absolute / previousPosition) * 100,
  };
}

function buildDelta(currentSummary, previousSummary) {
  return {
    clicks: calcDelta(currentSummary.clicks, previousSummary.clicks),
    impressions: calcDelta(currentSummary.impressions, previousSummary.impressions),
    ctr: {
      absolute: currentSummary.ctr - previousSummary.ctr,
      percent: previousSummary.ctr === 0 ? (currentSummary.ctr > 0 ? null : 0) : ((currentSummary.ctr - previousSummary.ctr) / previousSummary.ctr) * 100,
    },
    position: calcPositionDelta(currentSummary.position, previousSummary.position),
  };
}

export function buildComparableRange(currentRange) {
  if (!currentRange?.start || !currentRange?.end) {
    return null;
  }

  const days = countDaysInclusive(currentRange.start, currentRange.end);
  if (!days) {
    return null;
  }

  const previousEnd = dayjs(currentRange.start).subtract(1, "day").format("YYYY-MM-DD");
  return clampDateRangeByDays(previousEnd, days);
}

export function inferDateSpan(rows) {
  const validRows = (rows || []).filter((row) => row.date);
  if (!validRows.length) {
    return null;
  }

  let min = validRows[0].date;
  let max = validRows[0].date;

  for (const row of validRows) {
    if (row.date < min) {
      min = row.date;
    }
    if (row.date > max) {
      max = row.date;
    }
  }

  return { start: min, end: max, days: countDaysInclusive(min, max) };
}

export function hasEnoughDataForRange(rows, requiredStart, requiredEnd) {
  const span = inferDateSpan(rows);
  return Boolean(span && requiredStart && requiredEnd && span.start <= requiredStart && span.end >= requiredEnd);
}

export function hasSufficientPreviousPeriodData(rows, previousRange) {
  return Boolean(previousRange?.start && previousRange?.end && hasEnoughDataForRange(rows, previousRange.start, previousRange.end));
}

export function buildDailySeries(rows, start, end) {
  const grouped = new Map();

  for (const row of rows || []) {
    if (!row.date || !inRange(row.date, start, end)) {
      continue;
    }

    const existing = grouped.get(row.date) || {
      date: row.date,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
    };

    existing.clicks += Number(row.clicks || 0);
    existing.impressions += Number(row.impressions || 0);
    existing.weightedPosition += Number(row.position || 0) * Number(row.impressions || 0);

    grouped.set(row.date, existing);
  }

  return daysBetweenInclusive(start, end).map((date) => {
    const item = grouped.get(date) || { clicks: 0, impressions: 0, weightedPosition: 0 };
    return {
      date,
      clicks: item.clicks,
      impressions: item.impressions,
      ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
      position: item.impressions > 0 ? item.weightedPosition / item.impressions : 0,
    };
  });
}

export function summarizeByUrl(rows, start, end) {
  const grouped = new Map();

  for (const row of rows || []) {
    if (!row.date || !row.url || !inRange(row.date, start, end)) {
      continue;
    }

    const key = row.url;
    const existing = grouped.get(key) || {
      url: key,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
    };

    existing.clicks += Number(row.clicks || 0);
    existing.impressions += Number(row.impressions || 0);
    existing.weightedPosition += Number(row.position || 0) * Number(row.impressions || 0);

    grouped.set(key, existing);
  }

  return grouped;
}

function finalizeUrlSummary(summary = {}) {
  const impressions = Number(summary.impressions || 0);
  const clicks = Number(summary.clicks || 0);
  return {
    url: summary.url || "",
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? Number(summary.weightedPosition || 0) / impressions : 0,
  };
}

function pctFromDelta(delta, base) {
  if (base === 0) {
    return delta > 0 ? null : 0;
  }
  return (delta / base) * 100;
}

function collectUrlKeys(currentMap, previousMap) {
  const urls = new Set();
  for (const url of currentMap.keys()) {
    urls.add(url);
  }
  for (const url of previousMap.keys()) {
    urls.add(url);
  }
  return urls;
}

function compareUrlMaps(currentMap, previousMap) {
  const urls = collectUrlKeys(currentMap, previousMap);
  const rows = [];

  for (const url of urls) {
    const current = finalizeUrlSummary(currentMap.get(url) || { url });
    const previous = finalizeUrlSummary(previousMap.get(url) || { url });
    const clickDelta = current.clicks - previous.clicks;
    const impressionDelta = current.impressions - previous.impressions;
    const positionChange = previous.impressions > 0 && current.impressions > 0 ? previous.position - current.position : null;

    if (current.clicks === 0 && previous.clicks === 0 && current.impressions === 0 && previous.impressions === 0) {
      continue;
    }

    rows.push({
      url,
      currentClicks: current.clicks,
      previousClicks: previous.clicks,
      clickDelta,
      clickPct: pctFromDelta(clickDelta, previous.clicks),
      currentImpressions: current.impressions,
      previousImpressions: previous.impressions,
      impressionDelta,
      impressionPct: pctFromDelta(impressionDelta, previous.impressions),
      currentCtr: current.ctr,
      previousCtr: previous.ctr,
      currentPosition: current.position,
      previousPosition: previous.position,
      positionChange,
      isNew: previous.clicks === 0 && current.clicks > 0,
      isDropToZero: previous.clicks > 0 && current.clicks === 0,
    });
  }

  return rows;
}

export function buildSelectedPeriodOverview(rows, currentRange, previousRangeOverride = null) {
  const previousRange = previousRangeOverride || buildComparableRange(currentRange);
  const currentRows = filterRowsByRange(rows, currentRange?.start, currentRange?.end);
  const previousRows = previousRange ? filterRowsByRange(rows, previousRange.start, previousRange.end) : [];
  const current = summarizeRows(currentRows);
  const previous = summarizeRows(previousRows);
  const hasPreviousData = Boolean(previousRange && hasEnoughDataForRange(rows, previousRange.start, currentRange.end));

  return {
    currentRange,
    previousRange,
    current,
    previous,
    delta: buildDelta(current, previous),
    hasPreviousData,
    note: hasPreviousData ? null : "Previous comparable period may be limited by fetched data range.",
  };
}

function buildMonthlySeries(rows, range) {
  const monthlyMap = new Map();

  for (const row of filterRowsByRange(rows, range.start, range.end)) {
    const key = monthKey(row.date);
    const existing = monthlyMap.get(key) || { month: key, clicks: 0, impressions: 0, weightedPosition: 0 };
    existing.clicks += Number(row.clicks || 0);
    existing.impressions += Number(row.impressions || 0);
    existing.weightedPosition += Number(row.position || 0) * Number(row.impressions || 0);
    monthlyMap.set(key, existing);
  }

  return Array.from(monthlyMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => ({
      month: item.month,
      clicks: item.clicks,
      impressions: item.impressions,
      ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
      position: item.impressions > 0 ? item.weightedPosition / item.impressions : 0,
    }));
}

function decorateUrlComparison(row) {
  return {
    ...row,
    recommendation:
      row.currentImpressions >= 100 && row.currentCtr < 0.02
        ? "Improve title/meta to better match high-impression queries."
        : row.positionChange !== null && row.positionChange < 0
          ? "Review ranking loss and refresh content/internal links."
          : "Prioritize based on traffic impact and current query intent.",
  };
}

export function build3MonthComparison(rows, endDate) {
  const currentRange = clampDateRangeByDays(endDate, 90);
  const previousEnd = dayjs(currentRange.start).subtract(1, "day").format("YYYY-MM-DD");
  const previousRange = clampDateRangeByDays(previousEnd, 90);
  const currentRows = filterRowsByRange(rows, currentRange.start, currentRange.end);
  const previousRows = filterRowsByRange(rows, previousRange.start, previousRange.end);
  const current = summarizeRows(currentRows);
  const previous = summarizeRows(previousRows);
  const hasPreviousData = hasSufficientPreviousPeriodData(rows, previousRange);
  const currentMap = summarizeByUrl(rows, currentRange.start, currentRange.end);
  const previousMap = hasPreviousData ? summarizeByUrl(rows, previousRange.start, previousRange.end) : new Map();
  const compared = hasPreviousData
    ? compareUrlMaps(currentMap, previousMap).map(decorateUrlComparison)
    : Array.from(currentMap.values()).map((row) => decorateUrlComparison({
        url: row.url,
        currentClicks: row.clicks,
        previousClicks: null,
        clickDelta: null,
        clickPct: null,
        currentImpressions: row.impressions,
        previousImpressions: null,
        impressionDelta: null,
        impressionPct: null,
        currentCtr: row.impressions > 0 ? row.clicks / row.impressions : 0,
        previousCtr: null,
        currentPosition: row.impressions > 0 ? Number(row.weightedPosition || 0) / row.impressions : null,
        previousPosition: null,
        positionChange: null,
        isNew: false,
        isDropToZero: false,
      }));

  return {
    currentRange,
    previousRange,
    current,
    previous: hasPreviousData ? previous : null,
    delta: hasPreviousData ? buildDelta(current, previous) : null,
    dailySeries: buildDailySeries(rows, currentRange.start, currentRange.end),
    monthly: buildMonthlySeries(rows, currentRange),
    hasPreviousData,
    note: hasPreviousData ? null : "Previous period unavailable. Not enough historical data to compare previous 3 months; current-period metrics only.",
    outstandingUrls: {
      topByClicks: [...compared].sort((a, b) => b.currentClicks - a.currentClicks || b.currentImpressions - a.currentImpressions).slice(0, 12),
      topByImpressions: [...compared].sort((a, b) => b.currentImpressions - a.currentImpressions || b.currentClicks - a.currentClicks).slice(0, 12),
      fastestGrowing: hasPreviousData ? [...compared].filter((row) => row.clickDelta > 0).sort((a, b) => b.clickDelta - a.clickDelta || b.impressionDelta - a.impressionDelta).slice(0, 12) : [],
      fastestDeclining: hasPreviousData ? [...compared].filter((row) => row.clickDelta < 0).sort((a, b) => a.clickDelta - b.clickDelta || a.impressionDelta - b.impressionDelta).slice(0, 12) : [],
    },
    growthCounts: {
      clickGrowthOver20: hasPreviousData ? compared.filter((row) => row.previousClicks > 0 && row.clickPct > 20).length : null,
      clickLossOver20: hasPreviousData ? compared.filter((row) => row.previousClicks > 0 && row.clickPct < -20).length : null,
      newlyGainingClicks: hasPreviousData ? compared.filter((row) => row.isNew).length : null,
      droppedToZeroClicks: hasPreviousData ? compared.filter((row) => row.isDropToZero).length : null,
    },
  };
}

export function buildLast30Contribution(rows, current3MonthRange) {
  const last30Range = clampDateRangeByDays(current3MonthRange.end, 30);
  const last30 = summarizeRows(filterRowsByRange(rows, last30Range.start, last30Range.end));
  const current3Month = summarizeRows(filterRowsByRange(rows, current3MonthRange.start, current3MonthRange.end));
  const last30ClickShare = current3Month.clicks > 0 ? (last30.clicks / current3Month.clicks) * 100 : 0;
  const last30ImpressionShare = current3Month.impressions > 0 ? (last30.impressions / current3Month.impressions) * 100 : 0;

  return {
    last30Range,
    current3MonthRange,
    last30Clicks: last30.clicks,
    current3MonthClicks: current3Month.clicks,
    last30ClickShare,
    last30Impressions: last30.impressions,
    current3MonthImpressions: current3Month.impressions,
    last30ImpressionShare,
    interpretation: last30ClickShare > 45 ? "Recent acceleration" : last30ClickShare < 20 ? "Recent slowdown" : "Balanced performance",
  };
}

export function buildContentOpportunitySnapshot(rows, currentRange, previousRange) {
  const currentMap = summarizeByUrl(rows, currentRange?.start, currentRange?.end);
  const previousMap = previousRange ? summarizeByUrl(rows, previousRange.start, previousRange.end) : new Map();
  const compared = compareUrlMaps(currentMap, previousMap).map(decorateUrlComparison);

  const highImpressionLowCtr = Array.from(currentMap.values())
    .map(finalizeUrlSummary)
    .filter((row) => row.impressions >= 20 && row.ctr < 0.03)
    .sort((a, b) => b.impressions - a.impressions || a.ctr - b.ctr)
    .slice(0, 12)
    .map((row) => ({
      ...row,
      recommendation: row.position <= 10
        ? "Rewrite title/meta for intent match; validate snippets against top queries."
        : "Improve relevance and internal links before CTR copy changes."
    }));

  return {
    currentRange,
    previousRange,
    topGrowingUrls: [...compared].filter((row) => row.clickDelta > 0).sort((a, b) => b.clickDelta - a.clickDelta || b.currentImpressions - a.currentImpressions).slice(0, 12),
    topDecliningUrls: [...compared].filter((row) => row.clickDelta < 0).sort((a, b) => a.clickDelta - b.clickDelta || b.previousClicks - a.previousClicks).slice(0, 12),
    highImpressionLowCtr,
    newRisingUrls: [...compared].filter((row) => row.previousClicks === 0 && row.currentClicks > 0).sort((a, b) => b.currentClicks - a.currentClicks || b.currentImpressions - a.currentImpressions).slice(0, 12),
    note: previousRange && hasEnoughDataForRange(rows, previousRange.start, currentRange.end) ? null : "Previous comparison may be limited by fetched data range.",
  };
}


function monthLabel(range) {
  const parsed = parseDate(range?.end || range?.start);
  return parsed ? parsed.format("MMMM YYYY") : "—";
}

function hasMeaningfulUrlVolume(row) {
  return Number(row.currentClicks || 0) + Number(row.previousClicks || 0) >= 10 || Number(row.currentImpressions || 0) + Number(row.previousImpressions || 0) >= 500;
}

function buildReasonTags(row) {
  const tags = [];
  const ctrDelta = Number(row.currentCtr || 0) - Number(row.previousCtr || 0);

  if (row.previousClicks === 0 && (row.currentClicks > 0 || row.currentImpressions >= 50)) {
    tags.push("New page gaining traction");
  }
  if (row.clickDelta > 0 && row.impressionPct !== null && row.impressionPct >= 50) {
    tags.push("Seasonal spike");
  }
  if (row.clickDelta > 0) {
    if (ctrDelta >= 0.005) tags.push("CTR improved");
    if (row.positionChange !== null && row.positionChange >= 0.5) tags.push("Ranking improved");
    if (row.impressionDelta > 0) tags.push("Impressions increased");
  }
  if (row.clickDelta < 0) {
    tags.push("Clicks dropped");
    if (row.impressionDelta < 0) tags.push("Impressions dropped");
    if (ctrDelta <= -0.005) tags.push("CTR dropped");
    if (row.positionChange !== null && row.positionChange <= -0.5) tags.push("Ranking dropped");
  }

  return [...new Set(tags)].slice(0, 3);
}

function decorateMonthlyUrlRow(row) {
  const reasonTags = buildReasonTags(row);
  return {
    ...row,
    reasonTags,
    reasonTag: reasonTags[0] || (row.clickDelta >= 0 ? "Impressions increased" : "Clicks dropped"),
  };
}

function summarizeKeywordsForRange(keywordRows = [], range) {
  const grouped = new Map();

  for (const row of keywordRows || []) {
    if (!row.date || !row.query || !inRange(row.date, range?.start, range?.end)) {
      continue;
    }
    const key = String(row.query || "").trim().toLowerCase();
    const existing = grouped.get(key) || {
      query: String(row.query || "").trim(),
      url: row.url || "",
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      urlClicks: new Map(),
    };
    const clicks = Number(row.clicks || 0);
    const impressions = Number(row.impressions || 0);
    existing.clicks += clicks;
    existing.impressions += impressions;
    existing.weightedPosition += Number(row.position || 0) * impressions;
    existing.urlClicks.set(row.url || "", (existing.urlClicks.get(row.url || "") || 0) + clicks);
    grouped.set(key, existing);
  }

  return grouped;
}

function finalizeKeywordSummary(summary = {}) {
  const urlEntries = Array.from(summary.urlClicks?.entries?.() || []).sort((a, b) => b[1] - a[1]);
  const impressions = Number(summary.impressions || 0);
  const clicks = Number(summary.clicks || 0);
  return {
    query: summary.query || "",
    url: urlEntries[0]?.[0] || summary.url || "",
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? Number(summary.weightedPosition || 0) / impressions : null,
  };
}

function compareKeywordMaps(currentMap, previousMap) {
  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
  return Array.from(keys).map((key) => {
    const current = finalizeKeywordSummary(currentMap.get(key) || {});
    const previous = finalizeKeywordSummary(previousMap.get(key) || {});
    const clickDelta = current.clicks - previous.clicks;
    const impressionDelta = current.impressions - previous.impressions;
    return {
      query: current.query || previous.query,
      url: current.url || previous.url,
      currentClicks: current.clicks,
      previousClicks: previous.clicks,
      clickDelta,
      clickPct: pctFromDelta(clickDelta, previous.clicks),
      currentImpressions: current.impressions,
      previousImpressions: previous.impressions,
      impressionDelta,
      impressionPct: pctFromDelta(impressionDelta, previous.impressions),
      currentCtr: current.ctr,
      previousCtr: previous.ctr,
      currentPosition: current.position,
      previousPosition: previous.position,
      positionChange: previous.position !== null && current.position !== null ? previous.position - current.position : null,
    };
  });
}

function compactSummaryItem(item, fallbackType = "URL") {
  return {
    type: item.query ? "Query" : fallbackType,
    label: item.query || item.url || "—",
    url: item.url || "",
    currentClicks: item.currentClicks ?? item.clicks ?? 0,
    previousClicks: item.previousClicks ?? null,
    clickDelta: item.clickDelta ?? null,
    currentImpressions: item.currentImpressions ?? item.impressions ?? 0,
    ctr: item.currentCtr ?? item.ctr ?? 0,
    avgPosition: item.currentPosition ?? item.position ?? null,
    reason: item.reasonTag || item.recommendation || item.reason || "Review for impact",
  };
}

function buildRecommendedFocus({ metricSummary, topLosses, topOpportunities }) {
  if (topLosses.length) {
    return `Recover traffic on ${topLosses[0].label} while testing CTR/ranking fixes on the highest-impression opportunities.`;
  }
  if (topOpportunities.length) {
    return `Prioritize title/meta and content improvements for ${topOpportunities[0].label} to convert existing impressions into more clicks.`;
  }
  if (metricSummary?.hasPreviousData && metricSummary.clicks?.delta > 0) {
    return "Protect this month's winners with content refreshes, internal links, and snippet monitoring.";
  }
  return "Review the highest-impression pages and queries, then prioritize CTR and near-page-1 improvements next month.";
}

export function buildMonthlyUrlWinnersLosers({ rows = [], currentRange, previousRange } = {}) {
  const hasPreviousData = hasSufficientPreviousPeriodData(rows, previousRange);
  const currentMap = summarizeByUrl(rows, currentRange?.start, currentRange?.end);
  const previousMap = hasPreviousData ? summarizeByUrl(rows, previousRange?.start, previousRange?.end) : new Map();
  const compared = hasPreviousData ? compareUrlMaps(currentMap, previousMap).map(decorateMonthlyUrlRow) : [];
  const meaningful = compared.filter(hasMeaningfulUrlVolume);

  const ctrOpportunities = Array.from(currentMap.values())
    .map(finalizeUrlSummary)
    .filter((row) => row.impressions >= 100 && row.position > 0 && row.position <= 12 && ((row.position <= 3 && row.ctr < 0.08) || (row.position <= 5 && row.ctr < 0.04) || row.ctr < 0.025))
    .sort((a, b) => b.impressions - a.impressions || a.ctr - b.ctr)
    .slice(0, 12)
    .map((row) => ({ ...row, recommendation: "High impressions with below-expected CTR for current rankings." }));

  const newRisingUrls = hasPreviousData
    ? compared
        .filter((row) => row.previousClicks === 0 && (row.currentClicks > 0 || row.currentImpressions >= 50))
        .sort((a, b) => b.currentClicks - a.currentClicks || b.currentImpressions - a.currentImpressions)
        .slice(0, 12)
    : [];

  return {
    currentRange,
    previousRange,
    hasPreviousData,
    note: hasPreviousData ? null : "Previous month data is insufficient. Showing current-month opportunity data only; month-over-month deltas are hidden.",
    urlWinners: [...meaningful].filter((row) => row.clickDelta > 0).sort((a, b) => b.clickDelta - a.clickDelta || b.currentImpressions - a.currentImpressions).slice(0, 12),
    urlLosers: [...meaningful].filter((row) => row.clickDelta < 0).sort((a, b) => a.clickDelta - b.clickDelta || b.previousClicks - a.previousClicks).slice(0, 12),
    ctrOpportunities,
    newRisingUrls,
  };
}

export function buildMonthlyExecutiveSummary({ rows = [], keywordRows = [], currentRange, previousRange } = {}) {
  const currentRows = filterRowsByRange(rows, currentRange?.start, currentRange?.end);
  const previousRows = filterRowsByRange(rows, previousRange?.start, previousRange?.end);
  const current = summarizeRows(currentRows);
  const previous = summarizeRows(previousRows);
  const hasPreviousData = hasSufficientPreviousPeriodData(rows, previousRange);
  const delta = hasPreviousData ? buildDelta(current, previous) : null;
  const monthlyUrls = buildMonthlyUrlWinnersLosers({ rows, currentRange, previousRange });
  const currentKeywordMap = summarizeKeywordsForRange(keywordRows, currentRange);
  const previousKeywordMap = hasPreviousData ? summarizeKeywordsForRange(keywordRows, previousRange) : new Map();
  const keywordCompared = hasPreviousData ? compareKeywordMaps(currentKeywordMap, previousKeywordMap).filter((row) => row.currentImpressions + row.previousImpressions >= 100 || row.currentClicks + row.previousClicks >= 5) : [];

  const keywordWins = keywordCompared
    .filter((row) => row.clickDelta > 0 || row.positionChange >= 1)
    .sort((a, b) => b.clickDelta - a.clickDelta || (b.positionChange || 0) - (a.positionChange || 0))
    .slice(0, 3)
    .map((row) => compactSummaryItem({ ...row, reason: row.positionChange >= 1 ? "Ranking improved" : "Clicks increased" }, "Query"));
  const keywordLosses = keywordCompared
    .filter((row) => row.clickDelta < 0 || row.positionChange <= -1)
    .sort((a, b) => a.clickDelta - b.clickDelta || (a.positionChange || 0) - (b.positionChange || 0))
    .slice(0, 3)
    .map((row) => compactSummaryItem({ ...row, reason: row.positionChange <= -1 ? "Ranking dropped" : "Clicks dropped" }, "Query"));

  const urlWins = monthlyUrls.urlWinners.slice(0, 3).map((row) => compactSummaryItem(row));
  const urlLosses = monthlyUrls.urlLosers.slice(0, 3).map((row) => compactSummaryItem(row));
  const currentKeywordRows = Array.from(currentKeywordMap.values()).map(finalizeKeywordSummary);
  const keywordCtrOps = currentKeywordRows
    .filter((row) => row.impressions >= 100 && row.position !== null && row.position <= 12 && ((row.position <= 3 && row.ctr < 0.08) || (row.position <= 5 && row.ctr < 0.04) || row.ctr < 0.025))
    .map((row) => compactSummaryItem({ ...row, reason: "High impressions + low CTR" }, "Query"));
  const nearPageOneOps = currentKeywordRows
    .filter((row) => row.impressions >= 100 && row.position !== null && row.position > 8 && row.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
    .map((row) => compactSummaryItem({ ...row, reason: "Near page 1 query" }, "Query"));
  const rankingDropOps = keywordCompared
    .filter((row) => row.currentImpressions >= 100 && row.positionChange !== null && row.positionChange <= -1)
    .sort((a, b) => b.currentImpressions - a.currentImpressions)
    .slice(0, 5)
    .map((row) => compactSummaryItem({ ...row, reason: "Ranking drop with high impressions" }, "Query"));
  const urlCtrOps = monthlyUrls.ctrOpportunities.slice(0, 5).map((row) => compactSummaryItem({ ...row, reason: "High impressions + low CTR" }));
  const topOpportunities = [...keywordCtrOps, ...nearPageOneOps, ...rankingDropOps, ...urlCtrOps]
    .sort((a, b) => b.currentImpressions - a.currentImpressions || a.ctr - b.ctr)
    .slice(0, 3);

  const metricSummary = {
    hasPreviousData,
    warning: hasPreviousData ? null : "Previous month data is insufficient. Current summary is shown without deltas to avoid misleading comparisons.",
    clicks: { current: current.clicks, previous: hasPreviousData ? previous.clicks : null, delta: delta?.clicks.absolute ?? null, deltaPercent: delta?.clicks.percent ?? null },
    impressions: { current: current.impressions, previous: hasPreviousData ? previous.impressions : null, delta: delta?.impressions.absolute ?? null, deltaPercent: delta?.impressions.percent ?? null },
    ctr: { current: current.ctr, previous: hasPreviousData ? previous.ctr : null, pointDelta: delta?.ctr.absolute ?? null },
    position: { current: current.position, previous: hasPreviousData ? previous.position : null, positionChange: delta?.position.absolute ?? null },
  };

  const topWins = [...urlWins, ...keywordWins].sort((a, b) => (b.clickDelta || 0) - (a.clickDelta || 0) || b.currentImpressions - a.currentImpressions).slice(0, 3);
  const topLosses = [...urlLosses, ...keywordLosses].sort((a, b) => (a.clickDelta || 0) - (b.clickDelta || 0) || b.currentImpressions - a.currentImpressions).slice(0, 3);

  return {
    currentMonthLabel: monthLabel(currentRange),
    previousMonthLabel: monthLabel(previousRange),
    metricSummary,
    topWins,
    topLosses,
    topOpportunities,
    recommendedFocus: buildRecommendedFocus({ metricSummary, topLosses, topOpportunities }),
  };
}

export function buildUrlMovement30Days(rows, endDate) {
  const currentRange = clampDateRangeByDays(endDate, 30);
  const previousEnd = dayjs(currentRange.start).subtract(1, "day").format("YYYY-MM-DD");
  const previousRange = clampDateRangeByDays(previousEnd, 30);
  const currentMap = summarizeByUrl(rows, currentRange.start, currentRange.end);
  const previousMap = summarizeByUrl(rows, previousRange.start, previousRange.end);
  const movementRows = compareUrlMaps(currentMap, previousMap);
  const meaningful = movementRows.filter(
    (row) => row.currentImpressions + row.previousImpressions >= 20 || row.currentClicks + row.previousClicks >= 3,
  );

  const trendingUp = [...meaningful]
    .filter((row) => row.clickDelta > 0 || row.impressionDelta > 0)
    .sort((a, b) => b.clickDelta - a.clickDelta || b.impressionDelta - a.impressionDelta)
    .slice(0, 12);

  const trendingDown = [...meaningful]
    .filter((row) => row.clickDelta < 0 || row.impressionDelta < 0)
    .sort((a, b) => a.clickDelta - b.clickDelta || a.impressionDelta - b.impressionDelta)
    .slice(0, 12);

  const smallDeclines = movementRows
    .filter((row) => row.clickDelta < 0 || row.impressionDelta < 0)
    .sort((a, b) => a.clickDelta - b.clickDelta || a.impressionDelta - b.impressionDelta)
    .slice(0, 5);

  return {
    currentRange,
    previousRange,
    trendingUp,
    trendingDown,
    smallDeclines,
    hasPreviousData: hasEnoughDataForRange(rows, previousRange.start, previousRange.end),
    emptyDeclineMessage: "No meaningful declining URLs in this 30-day comparison. This usually means performance is stable/growing, the property has limited data, or filters are too narrow.",
  };
}

function linearSlope(values) {
  const n = values.length;
  if (n <= 1) {
    return 0;
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;
  return denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
}

export function build6MonthUrlInsights(rows, endDate) {
  const end = parseDate(endDate) ?? dayjs();
  const monthKeys = [];

  for (let i = 5; i >= 0; i -= 1) {
    monthKeys.push(end.subtract(i, "month").format("YYYY-MM"));
  }

  const keySet = new Set(monthKeys);
  const byUrlByMonth = new Map();

  for (const row of rows || []) {
    const key = monthKey(row.date);
    if (!keySet.has(key) || !row.url) {
      continue;
    }

    const urlMap = byUrlByMonth.get(row.url) || new Map();
    urlMap.set(key, (urlMap.get(key) || 0) + Number(row.clicks || 0));
    byUrlByMonth.set(row.url, urlMap);
  }

  const metrics = [];

  for (const [url, monthMap] of byUrlByMonth.entries()) {
    const clicksByMonth = monthKeys.map((key) => monthMap.get(key) || 0);
    const firstMonth = clicksByMonth[0];
    const lastMonth = clicksByMonth[clicksByMonth.length - 1];
    const delta = lastMonth - firstMonth;
    const pct = pctFromDelta(delta, firstMonth);
    const slope = linearSlope(clicksByMonth);
    const totalClicks = clicksByMonth.reduce((sum, value) => sum + value, 0);

    metrics.push({ url, clicksByMonth, firstMonth, lastMonth, delta, pct, slope, totalClicks });
  }

  const filtered = metrics.filter((item) => item.totalClicks >= 20);

  return {
    monthKeys,
    hasEnoughData: hasEnoughDataForRange(rows, end.subtract(5, "month").startOf("month").format("YYYY-MM-DD"), end.format("YYYY-MM-DD")),
    note: hasEnoughDataForRange(rows, end.subtract(5, "month").startOf("month").format("YYYY-MM-DD"), end.format("YYYY-MM-DD"))
      ? null
      : `Only ${inferDateSpan(rows)?.days || 0} days of data are available, so 6-month URL signals may be hidden or limited.`,
    topIncreaseMost: [...filtered].sort((a, b) => b.delta - a.delta).slice(0, 12),
    topDecreaseMost: [...filtered].sort((a, b) => a.delta - b.delta).slice(0, 12),
    topIncreaseFast: [...filtered].filter((item) => item.slope > 0).sort((a, b) => b.slope - a.slope).slice(0, 12),
    topDecreaseFast: [...filtered].filter((item) => item.slope < 0).sort((a, b) => a.slope - b.slope).slice(0, 12),
    signals: [...filtered]
      .filter((item) => Math.abs(item.delta) >= 10)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 25)
      .map((item) => ({
        url: item.url,
        direction: item.delta >= 0 ? "up" : "down",
        delta: item.delta,
        pct: item.pct,
        slope: item.slope,
        firstMonth: item.firstMonth,
        lastMonth: item.lastMonth,
      })),
  };
}

export function buildSeoInsights({ rows, keywordRows = [], endDate, currentRange, previousRange }) {
  const pageDataSpan = inferDateSpan(rows);
  const keywordDataSpan = inferDateSpan(keywordRows);
  const dataSpan = pageDataSpan || keywordDataSpan;
  const safeEnd = (parseDate(endDate) ?? (dataSpan ? parseDate(dataSpan.end) : dayjs())).format("YYYY-MM-DD");
  const selectedRange = currentRange || { start: dataSpan?.start || safeEnd, end: safeEnd };
  const selectedPeriodOverview = buildSelectedPeriodOverview(rows, selectedRange, previousRange);
  const performance3MonthComparison = build3MonthComparison(rows, safeEnd);
  const last30Contribution = buildLast30Contribution(rows, performance3MonthComparison.currentRange);
  const contentOpportunitySnapshot = buildContentOpportunitySnapshot(
    rows,
    selectedPeriodOverview.currentRange,
    selectedPeriodOverview.previousRange,
  );
  const urlMovement30Days = buildUrlMovement30Days(rows, safeEnd);
  const url6MonthInsights = build6MonthUrlInsights(rows, safeEnd);
  const monthlyExecutiveSummary = buildMonthlyExecutiveSummary({
    rows,
    keywordRows,
    currentRange: selectedPeriodOverview.currentRange,
    previousRange: selectedPeriodOverview.previousRange,
  });
  const monthlyUrlWinnersLosers = buildMonthlyUrlWinnersLosers({
    rows,
    currentRange: selectedPeriodOverview.currentRange,
    previousRange: selectedPeriodOverview.previousRange,
  });

  return {
    generatedAt: dayjs().format("YYYY-MM-DD HH:mm:ss"),
    reportEndDate: safeEnd,
    dataSpan,
    dataSpanSource: pageDataSpan ? "page" : keywordDataSpan ? "keyword" : "none",
    selectedPeriodOverview,
    performance3MonthComparison,
    last30Contribution,
    contentOpportunitySnapshot,
    urlMovement30Days,
    url6MonthInsights,
    monthlyExecutiveSummary,
    monthlyUrlWinnersLosers,
    dataAvailabilityNotes: [
      selectedPeriodOverview.note,
      performance3MonthComparison.note,
      contentOpportunitySnapshot.note,
      urlMovement30Days.hasPreviousData ? null : "Previous 30-day URL movement comparison may be limited by fetched data range.",
      url6MonthInsights.note,
      monthlyExecutiveSummary.metricSummary?.warning,
      monthlyUrlWinnersLosers.note,
    ].filter(Boolean),
  };
}
