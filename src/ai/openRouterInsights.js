const OPENROUTER_CHAT_COMPLETIONS_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_TIMEOUT_MS = 30000;
const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
const DEFAULT_OPENROUTER_MAX_OUTPUT_TOKENS = 3500;
const MAX_TABLE_ROWS_FOR_AI = 10;
const SAFE_OPENROUTER_FAILURE_MESSAGE = "OpenRouter AI insight failed, but the SEO report was generated.";
const SYSTEM_PROMPT = "You are a senior SEO analyst. Your job is to analyze a completed Google Search Console report and write practical, evidence-based SEO insights in Vietnamese. Do not invent data. Only use the metrics, tables, URLs, and queries provided. Focus on what changed, why it matters, what needs attention, and what actions the SEO/content team should take next. Write in a concise but useful consulting style. Avoid generic SEO advice. Prioritize recommendations by expected impact.";

function getPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getOpenRouterTimeoutMs() {
  return getPositiveInteger(process.env.OPENROUTER_TIMEOUT_MS, DEFAULT_OPENROUTER_TIMEOUT_MS);
}

function getOpenRouterMaxOutputTokens() {
  return getPositiveInteger(process.env.OPENROUTER_MAX_OUTPUT_TOKENS, DEFAULT_OPENROUTER_MAX_OUTPUT_TOKENS);
}

function limitRows(rows, limit = MAX_TABLE_ROWS_FOR_AI) {
  return Array.isArray(rows) ? rows.slice(0, Math.min(limit, MAX_TABLE_ROWS_FOR_AI)).map((row) => ({ ...row })) : [];
}

function compactUrlTable(table) {
  return limitRows(table).map((row) => ({
    url: row.url,
    currentClicks: row.currentClicks,
    previousClicks: row.previousClicks,
    clickDelta: row.clickDelta,
    clickPct: row.clickPct,
    currentImpressions: row.currentImpressions,
    previousImpressions: row.previousImpressions,
    impressionDelta: row.impressionDelta,
    currentCtr: row.currentCtr,
    previousCtr: row.previousCtr,
    currentPosition: row.currentPosition,
    previousPosition: row.previousPosition,
    positionChange: row.positionChange,
    recommendation: row.recommendation,
  }));
}

function compactLowCtrRows(rows) {
  return limitRows(rows).map((row) => ({
    url: row.url,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
    recommendation: row.recommendation,
  }));
}

function compactKeywordRows(rows) {
  return limitRows(rows).map((row) => ({
    query: row.query || row.keyword,
    url: row.url || row.bestCurrentUrl,
    currentClicks: row.currentClicks,
    previousClicks: row.previousClicks,
    clickDelta: row.clickDelta,
    currentImpressions: row.currentImpressions,
    previousImpressions: row.previousImpressions,
    impressionDelta: row.impressionDelta,
    currentAvgPosition: row.currentAvgPosition,
    previousAvgPosition: row.previousAvgPosition,
    positionDelta: row.positionDelta,
    currentCtr: row.currentCtr,
    priority: row.priority,
    recommendation: row.recommendation || row.actionHint,
  }));
}

function safeDebugMessage(error, fallbackReason = "api_error") {
  if (error?.name === "AbortError") {
    return "OpenRouter request timed out.";
  }

  const message = String(error?.message || fallbackReason)
    .replace(/Bearer\s+[A-Za-z0-9._~+\-/]+=*/gi, "Bearer [redacted]")
    .replace(/OPENROUTER_API_KEY=\S+/gi, "OPENROUTER_API_KEY=[redacted]")
    .replace(/DATABASE_URL=\S+/gi, "DATABASE_URL=[redacted]");

  return message.slice(0, 300);
}

function fallbackUnavailable(errorOrDebug = {}) {
  const debug = typeof errorOrDebug === "string"
    ? errorOrDebug
    : safeDebugMessage(errorOrDebug?.error, errorOrDebug?.reason || "unavailable");

  return {
    available: false,
    markdown: "",
    message: SAFE_OPENROUTER_FAILURE_MESSAGE,
    debug,
  };
}

function normalizeOpenRouterModelName(model) {
  return String(model || DEFAULT_OPENROUTER_MODEL).trim() || DEFAULT_OPENROUTER_MODEL;
}

async function readOpenRouterError(response) {
  try {
    const contentType = response.headers?.get?.("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return String(data?.error?.message || data?.message || `HTTP ${response.status}`).slice(0, 300);
    }
    return (await response.text()).slice(0, 300);
  } catch (_error) {
    return "Unable to read OpenRouter API error response.";
  }
}

function buildCompactReportSummary(reportSummary = {}) {
  const {
    sourceInfo,
    filters,
    selectedPeriodOverview,
    performance3MonthComparison,
    contentOpportunitySnapshot,
    urlMovement30Days,
    keywordMovements,
    ctrOpportunities,
    nearPageOneKeywords,
    reportTablesForAI,
  } = reportSummary;

  return {
    sourceInfo: {
      label: sourceInfo?.label,
      property: sourceInfo?.property,
      range: sourceInfo?.range,
      diagnostics: {
        queryRange: sourceInfo?.diagnostics?.queryRange,
        coalescedPageRowCount: sourceInfo?.diagnostics?.coalescedPageRowCount,
        keywordRowCount: sourceInfo?.diagnostics?.keywordRowCount,
      },
    },
    filters: filters || sourceInfo?.filters || {},
    selectedPeriodOverview: selectedPeriodOverview || {},
    performance3MonthComparison: {
      currentRange: performance3MonthComparison?.currentRange,
      previousRange: performance3MonthComparison?.previousRange,
      current: performance3MonthComparison?.current,
      previous: performance3MonthComparison?.previous,
      delta: performance3MonthComparison?.delta,
      growthCounts: performance3MonthComparison?.growthCounts,
      note: performance3MonthComparison?.note,
      outstandingUrls: {
        topByClicks: compactUrlTable(performance3MonthComparison?.outstandingUrls?.topByClicks),
        topByImpressions: compactUrlTable(performance3MonthComparison?.outstandingUrls?.topByImpressions),
        fastestGrowing: compactUrlTable(performance3MonthComparison?.outstandingUrls?.fastestGrowing),
        fastestDeclining: compactUrlTable(performance3MonthComparison?.outstandingUrls?.fastestDeclining),
      },
    },
    last30Contribution: reportTablesForAI?.last30Contribution || reportSummary.last30Contribution || {},
    contentOpportunitySnapshot: {
      note: contentOpportunitySnapshot?.note,
      topGrowingUrls: compactUrlTable(contentOpportunitySnapshot?.topGrowingUrls),
      topDecliningUrls: compactUrlTable(contentOpportunitySnapshot?.topDecliningUrls),
      highImpressionLowCtr: compactLowCtrRows(contentOpportunitySnapshot?.highImpressionLowCtr),
      newRisingUrls: compactUrlTable(contentOpportunitySnapshot?.newRisingUrls),
    },
    urlMovement30Days: {
      currentRange: urlMovement30Days?.currentRange,
      previousRange: urlMovement30Days?.previousRange,
      trendingUp: compactUrlTable(urlMovement30Days?.trendingUp),
      trendingDown: compactUrlTable(urlMovement30Days?.trendingDown),
      smallDeclines: compactUrlTable(urlMovement30Days?.smallDeclines),
    },
    keywordOpportunities: {
      trackedKeywordMovements: compactKeywordRows(keywordMovements?.trackedKeywordMovements),
      highImpressionDrops: compactKeywordRows(keywordMovements?.highImpressionDrops),
      keywordWinners: compactKeywordRows(keywordMovements?.keywordWinners),
      ctrOpportunities: compactKeywordRows(ctrOpportunities),
      nearPageOneKeywords: compactKeywordRows(nearPageOneKeywords),
    },
  };
}

function buildUserPrompt(compactReportSummary) {
  return `Phân tích báo cáo Google Search Console dưới đây.

Yêu cầu đầu ra bằng tiếng Việt, dạng Markdown, không cần JSON.

Cấu trúc bắt buộc:

## Đánh giá tổng quan
Tóm tắt tình hình SEO trong kỳ báo cáo.

## Những thay đổi quan trọng
Liệt kê các thay đổi đáng chú ý, có bằng chứng chỉ số.

## Các URL cần chú ý
Phân tích URL tăng trưởng tốt, URL nhiều impression CTR thấp, URL tụt traffic, URL gần trang 1.

## Cơ hội tối ưu
Nêu cơ hội cụ thể dựa trên dữ liệu.

## Recommended Actions
Tạo bảng Markdown:
| Priority | Action | Target URL / Query | Why | Expected Impact | Effort |

## Kế hoạch hành động 7 ngày tới
Checklist hành động ngắn gọn.

Dữ liệu báo cáo:
${JSON.stringify(compactReportSummary, null, 2)}`;
}

function buildOpenRouterHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "",
    "X-OpenRouter-Title": process.env.OPENROUTER_APP_TITLE || "SEO Reporter",
  };
}

async function callOpenRouter({ apiKey, model, messages }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getOpenRouterTimeoutMs());

  try {
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_ENDPOINT, {
      method: "POST",
      headers: buildOpenRouterHeaders(apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: getOpenRouterMaxOutputTokens(),
      }),
    });

    if (!response.ok) {
      const detail = await readOpenRouterError(response);
      throw new Error(`OpenRouter API HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateOpenRouterSeoInsights(reportSummary) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return fallbackUnavailable({ reason: "missing_api_key" });
  }

  if (typeof fetch !== "function") {
    return fallbackUnavailable({ reason: "fetch_unavailable" });
  }

  const model = normalizeOpenRouterModelName(process.env.OPENROUTER_MODEL);
  const compactReportSummary = buildCompactReportSummary(reportSummary);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(compactReportSummary) },
  ];

  try {
    const data = await callOpenRouter({ apiKey, model, messages });
    const markdown = String(data?.choices?.[0]?.message?.content || "").trim();

    if (!markdown) {
      return fallbackUnavailable({ reason: "empty_response" });
    }

    return {
      available: true,
      provider: "openrouter",
      model,
      markdown,
    };
  } catch (error) {
    return fallbackUnavailable({ error, reason: error?.name === "AbortError" ? "timeout" : "api_error" });
  }
}
