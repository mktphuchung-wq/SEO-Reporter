function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDecimal(value, digits = 2) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return safeNumber(value).toFixed(digits);
}

function formatInteger(value) {
  if (value === null || value === undefined || value === "") {
    return "0";
  }
  return String(Math.round(safeNumber(value)));
}

function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return `${(safeNumber(value) * 100).toFixed(digits)}%`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

const KEYWORD_CSV_HEADERS = [
  "table",
  "keyword_or_query",
  "match_type",
  "url",
  "current_position",
  "previous_position",
  "position_change",
  "position_loss",
  "current_clicks",
  "previous_clicks",
  "click_change",
  "current_impressions",
  "previous_impressions",
  "impression_change",
  "current_ctr",
  "previous_ctr",
  "priority",
  "recommendation_or_action",
];

function buildBaseRow(tableName, item) {
  return {
    table: tableName,
    keywordOrQuery: item.keyword || item.query || "",
    matchType: item.matchType || "",
    url: item.bestCurrentUrl || item.url || "",
    currentPosition: formatDecimal(item.currentAvgPosition),
    previousPosition: formatDecimal(item.previousAvgPosition),
    positionChange: formatDecimal(item.positionDelta),
    positionLoss: "",
    currentClicks: formatInteger(item.currentClicks),
    previousClicks: formatInteger(item.previousClicks),
    clickChange: formatInteger(item.clickDelta),
    currentImpressions: formatInteger(item.currentImpressions),
    previousImpressions: formatInteger(item.previousImpressions),
    impressionChange: formatInteger(item.impressionDelta),
    currentCtr: formatPercent(item.currentCtr),
    previousCtr: formatPercent(item.previousCtr),
    priority: item.priority || "",
    recommendationOrAction: item.recommendation || item.actionHint || "",
  };
}

function flattenRow(row) {
  return [
    row.table,
    row.keywordOrQuery,
    row.matchType,
    row.url,
    row.currentPosition,
    row.previousPosition,
    row.positionChange,
    row.positionLoss,
    row.currentClicks,
    row.previousClicks,
    row.clickChange,
    row.currentImpressions,
    row.previousImpressions,
    row.impressionChange,
    row.currentCtr,
    row.previousCtr,
    row.priority,
    row.recommendationOrAction,
  ];
}

export function formatTrackedKeywordMovementRows(rows = []) {
  return rows.map((item) => flattenRow(buildBaseRow("tracked keyword movements", item)));
}

export function formatHighImpressionDropRows(rows = []) {
  return rows.map((item) => {
    const row = buildBaseRow("high impression drops", item);
    row.positionLoss = formatDecimal(Math.abs(safeNumber(item.positionDelta)));
    return flattenRow(row);
  });
}

export function formatNearPageOneRows(rows = []) {
  return rows.map((item) => flattenRow(buildBaseRow("near page one", item)));
}

export function formatCtrOpportunityRows(rows = []) {
  return rows.map((item) => flattenRow(buildBaseRow("CTR opportunities", item)));
}

export function formatKeywordWinnerRows(rows = []) {
  return rows.map((item) => flattenRow(buildBaseRow("keyword winners", item)));
}

export function buildKeywordInsightsCsv(keywordInsights = {}) {
  const rows = [
    KEYWORD_CSV_HEADERS,
    ...formatTrackedKeywordMovementRows(keywordInsights.trackedKeywordMovements),
    ...formatHighImpressionDropRows(keywordInsights.highImpressionDrops),
    ...formatNearPageOneRows(keywordInsights.nearPageOneKeywords),
    ...formatCtrOpportunityRows(keywordInsights.ctrOpportunities),
    ...formatKeywordWinnerRows(keywordInsights.keywordWinners),
  ];

  return `${rowsToCsv(rows)}\n`;
}
