import fs from "node:fs/promises";
import path from "node:path";
import { buildSeoInsights } from "../analytics.js";
import { generateOpenRouterSeoInsights } from "../ai/openRouterInsights.js";
import { loadReportData } from "../dataLoader.js";
import { buildKeywordInsightsCsv } from "../exporters/csvExport.js";
import {
  buildComparableRanges,
  buildCtrOpportunities,
  buildHighImpressionKeywordMovements,
  buildKeywordWinners,
  buildNearPageOneKeywords,
  buildTrackedKeywordMovements,
  parseTrackedKeywords,
} from "../keywordAnalytics.js";
import { parseDate } from "../lib/time.js";
import { renderHtmlReport } from "../renderHtmlReport.js";

const OUTPUT_DIR = path.resolve("output");
const MAX_TRACKED_KEYWORDS = Number.parseInt(process.env.MAX_TRACKED_KEYWORDS || "100", 10);

const COMPACT_SECTION_ROW_LIMIT = 10;

function limitRows(rows, limit = COMPACT_SECTION_ROW_LIMIT) {
  return Array.isArray(rows) ? rows.slice(0, limit) : [];
}

function compactPerformance3MonthComparison(perf = {}) {
  return {
    note: perf.note || "",
    currentRange: perf.currentRange || null,
    previousRange: perf.previousRange || null,
    current: perf.current || {},
    previous: perf.previous || {},
    delta: perf.delta || {},
    growthCounts: perf.growthCounts || {},
    outstandingUrls: {
      topByClicks: limitRows(perf.outstandingUrls?.topByClicks),
      topByImpressions: limitRows(perf.outstandingUrls?.topByImpressions),
      fastestGrowing: limitRows(perf.outstandingUrls?.fastestGrowing),
      fastestDeclining: limitRows(perf.outstandingUrls?.fastestDeclining),
    },
  };
}

export function buildCompactReportJson({ insights = {}, sourceInfo = {}, filters = {}, keywordInsights = {}, aiInsights = {} } = {}) {
  return {
    sourceInfo: {
      label: sourceInfo.label || "",
      property: sourceInfo.property || "",
      range: sourceInfo.range || null,
      filters,
      diagnostics: {
        queryRange: sourceInfo.diagnostics?.queryRange || null,
        pageRowCount: sourceInfo.diagnostics?.pageRowCount || 0,
        coalescedPageRowCount: sourceInfo.diagnostics?.coalescedPageRowCount || 0,
        keywordRowCount: sourceInfo.diagnostics?.keywordRowCount || 0,
        gscDataDelayDays: sourceInfo.diagnostics?.gscDataDelayDays ?? null,
        pageContainsApplied: sourceInfo.diagnostics?.pageContainsApplied ?? Boolean(filters.pageContains),
      },
      dataDelayNote: sourceInfo.dataDelayNote || "",
      emptyReason: sourceInfo.emptyReason || "",
    },
    filters,
    selectedPeriodOverview: insights.selectedPeriodOverview || {},
    performance3MonthComparison: compactPerformance3MonthComparison(insights.performance3MonthComparison || {}),
    last30Contribution: insights.last30Contribution || {},
    contentOpportunitySnapshot: {
      note: insights.contentOpportunitySnapshot?.note || "",
      topGrowingUrls: limitRows(insights.contentOpportunitySnapshot?.topGrowingUrls),
      topDecliningUrls: limitRows(insights.contentOpportunitySnapshot?.topDecliningUrls),
      highImpressionLowCtr: limitRows(insights.contentOpportunitySnapshot?.highImpressionLowCtr),
      newRisingUrls: limitRows(insights.contentOpportunitySnapshot?.newRisingUrls),
    },
    urlMovement30Days: {
      ...(insights.urlMovement30Days || {}),
      trendingUp: limitRows(insights.urlMovement30Days?.trendingUp),
      trendingDown: limitRows(insights.urlMovement30Days?.trendingDown),
      smallDeclines: limitRows(insights.urlMovement30Days?.smallDeclines),
    },
    keywordOpportunities: {
      trackedKeywords: limitRows(keywordInsights.trackedKeywords),
      trackedKeywordMovements: limitRows(keywordInsights.trackedKeywordMovements),
      highImpressionDrops: limitRows(keywordInsights.highImpressionDrops),
      nearPageOneKeywords: limitRows(keywordInsights.nearPageOneKeywords),
      keywordWinners: limitRows(keywordInsights.keywordWinners),
      ctrOpportunities: limitRows(keywordInsights.ctrOpportunities),
      currentRange: keywordInsights.currentRange || null,
      previousRange: keywordInsights.previousRange || null,
      aiInsights,
    },
    aiInsights,
    generatedAt: insights.generatedAt || new Date().toISOString(),
  };
}

function encodeReportPayload(reportJson) {
  return Buffer.from(JSON.stringify(reportJson), "utf8").toString("base64");
}


export const REPORT_PERIOD_LABELS = {
  "7d": "1 week",
  "30d": "1 month",
  "90d": "3 months",
  "180d": "6 months",
  custom: "Custom date range",
};

export function isEnvEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function getMaxTrackedKeywords() {
  return Number.isFinite(MAX_TRACKED_KEYWORDS) && MAX_TRACKED_KEYWORDS > 0 ? MAX_TRACKED_KEYWORDS : 100;
}

function limitTrackedKeywords(keywords) {
  return keywords.slice(0, getMaxTrackedKeywords());
}

function countDaysInclusive(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end.isBefore(start, "day")) {
    return 30;
  }
  return end.diff(start, "day") + 1;
}

export function isEmptyDataError(error) {
  return error?.code === "EMPTY_GSC_DATA";
}

export function createEmptyGscDataError({ sourceInfo, input }) {
  const range = sourceInfo?.range || { start: input.startDate || "—", end: input.endDate || "—" };
  const filters = sourceInfo?.filters || {};
  const diagnostics = sourceInfo?.diagnostics || {};
  const error = new Error("No GSC data rows matched the selected filters.");
  error.code = "EMPTY_GSC_DATA";
  error.emptyDataContext = {
    property: sourceInfo?.property || input.siteUrl || "—",
    range,
    searchType: diagnostics.searchType || filters.searchType || input.searchType || "web",
    pageContains: filters.pageContains || input.pageContains || "",
    pageContainsApplied: Boolean(diagnostics.pageContainsApplied),
    pageRowCount: diagnostics.pageRowCount || 0,
    keywordRowCount: diagnostics.keywordRowCount || 0,
  };
  return error;
}

export function buildEmptyDataWarning(error, fallbackInput = {}) {
  const context = error?.emptyDataContext || {};
  const range = context.range || {};
  const pageContains = context.pageContains || fallbackInput.pageContains || "";

  return [
    "No GSC data matched the selected filters.",
    `Property: ${context.property || fallbackInput.siteUrl || "—"}`,
    `Range: ${range.start || fallbackInput.startDate || "—"} -> ${range.end || fallbackInput.endDate || "—"}`,
    `Search type: ${context.searchType || fallbackInput.searchType || "web"}`,
    `Page contains: ${pageContains || "None"}`,
    `Rows returned: page=${context.pageRowCount ?? 0}, keyword=${context.keywordRowCount ?? 0}`,
    "Next steps: confirm the selected GSC property has data for this period; try search type 'web'; widen the report period/custom date range; remove or loosen the Page contains filter; then generate the report again.",
  ].join("\n");
}

export function validateReportInput(input = {}, authClient = null) {
  const sourceType = input.sourceType || "gsc";
  if (sourceType === "gsc" && !authClient && !input.gscKeyFile && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("Authenticate with Google first or provide service account key file.");
  }
  if (sourceType === "gsc" && !input.siteUrl) {
    throw new Error("Please select a GSC property before generating report.");
  }
  if (sourceType === "looker" && !input.lookerCsvPath) {
    throw new Error("Please provide a Looker CSV path.");
  }
  return sourceType;
}

export async function generateReportFromInput({ input: rawInput = {}, authClient, onProgress = () => {}, reportDownloadUrl = "" }) {
  const sourceType = validateReportInput(rawInput, authClient);
  onProgress(10);

  const reportPeriod = rawInput.reportPeriod || "30d";
  const pageContains = String(rawInput.pageContains || "").trim();
  const trackedKeywordsInput = rawInput.trackedKeywords || "";
  const enableAiInsights = Boolean(rawInput.enableAiInsights);

  const input = {
    sourceType,
    siteUrl: rawInput.siteUrl,
    lookerCsvPath: rawInput.lookerCsvPath,
    contentCsvPath: rawInput.contentCsvPath,
    searchType: rawInput.searchType,
    reportPeriod,
    pageContains,
    startDate: rawInput.startDate,
    endDate: rawInput.endDate,
    gscKeyFile: rawInput.gscKeyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS,
    authClient,
  };

  const { rows, keywordRows, sourceInfo } = await loadReportData(input);
  onProgress(30);
  if (sourceType === "gsc" && rows.length === 0) {
    throw createEmptyGscDataError({ sourceInfo, input });
  }

  const insights = buildSeoInsights({
    rows,
    endDate: sourceInfo.range?.end,
    currentRange: sourceInfo.range,
  });

  const periodDays = countDaysInclusive(sourceInfo.range?.start, sourceInfo.range?.end);
  const { currentRange, previousRange } = buildComparableRanges(sourceInfo.range?.end, periodDays);
  currentRange.start = sourceInfo.range?.start || currentRange.start;
  currentRange.end = sourceInfo.range?.end || currentRange.end;
  const trackedKeywords = limitTrackedKeywords(parseTrackedKeywords(trackedKeywordsInput));
  const trackedKeywordMovements = buildTrackedKeywordMovements({ keywordRows, trackedKeywords, currentRange, previousRange });
  const highImpressionDrops = buildHighImpressionKeywordMovements({ keywordRows, currentRange, previousRange });
  const nearPageOneKeywords = buildNearPageOneKeywords({ keywordRows, currentRange });
  const keywordWinners = buildKeywordWinners({ keywordRows, currentRange, previousRange });
  const ctrOpportunities = buildCtrOpportunities({ keywordRows, currentRange });
  onProgress(60);

  const reportTablesForAI = {
    last30Contribution: insights.last30Contribution,
    topUrlsByClicks: insights.performance3MonthComparison.outstandingUrls.topByClicks,
    topUrlsByImpressions: insights.performance3MonthComparison.outstandingUrls.topByImpressions,
    fastestGrowingUrls: insights.performance3MonthComparison.outstandingUrls.fastestGrowing,
    fastestDecliningUrls: insights.performance3MonthComparison.outstandingUrls.fastestDeclining,
  };

  const aiInsights = enableAiInsights
    ? await generateOpenRouterSeoInsights({
        sourceInfo,
        selectedPeriodOverview: insights.selectedPeriodOverview,
        performance3MonthComparison: insights.performance3MonthComparison,
        contentOpportunitySnapshot: insights.contentOpportunitySnapshot,
        urlMovement30Days: insights.urlMovement30Days,
        filters: sourceInfo.filters || {
          reportPeriod,
          pageContains,
          searchType: input.searchType || "web",
        },
        keywordMovements: {
          trackedKeywordMovements,
          highImpressionDrops,
          keywordWinners,
        },
        ctrOpportunities,
        nearPageOneKeywords,
        reportTablesForAI,
      })
    : { available: false, message: "AI insight not requested." };

  const filters = {
    ...(sourceInfo.filters || {}),
    reportPeriod,
    reportPeriodLabel: REPORT_PERIOD_LABELS[reportPeriod] || REPORT_PERIOD_LABELS.custom,
    pageContains,
    searchType: input.searchType || "web",
    trackedKeywordCount: trackedKeywords.length,
    trackedKeywordLimit: getMaxTrackedKeywords(),
  };

  const enrichedSourceInfo = {
    ...sourceInfo,
    filters,
    diagnostics: {
      ...(sourceInfo.diagnostics || {}),
      pageRowCount: sourceInfo.diagnostics?.pageRowCount ?? rows.length,
      keywordRowCount: sourceInfo.diagnostics?.keywordRowCount ?? keywordRows.length,
    },
  };

  const keywordInsights = {
    trackedKeywords,
    trackedKeywordMovements,
    highImpressionDrops,
    nearPageOneKeywords,
    keywordWinners,
    ctrOpportunities,
    currentRange,
    previousRange,
    aiInsights,
  };

  const keywordCsv = buildKeywordInsightsCsv(keywordInsights);
  const reportJson = buildCompactReportJson({ insights, sourceInfo: enrichedSourceInfo, filters, keywordInsights, aiInsights });
  const reportHtml = renderHtmlReport({
    insights,
    sourceInfo: enrichedSourceInfo,
    keywordInsights,
    reportDownloadUrl,
    saveReportPayload: encodeReportPayload(reportJson),
  });
  onProgress(80);

  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, `seo-report-${Date.now()}.html`);
    await fs.writeFile(outputPath, reportHtml, "utf8");
  } catch (_error) {
    // Ignore write errors on serverless environments with ephemeral filesystem.
  }

  onProgress(100);

  return {
    reportHtml,
    reportJson,
    sourceInfo: enrichedSourceInfo,
    filters,
    aiInsights,
    keywordCsv,
  };
}
