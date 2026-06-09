const OPENROUTER_CHAT_COMPLETIONS_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_TIMEOUT_MS = 30000;
const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
const DEFAULT_OPENROUTER_MAX_OUTPUT_TOKENS = 3500;
const MAX_TABLE_ROWS_FOR_AI = 10;
const SAFE_OPENROUTER_FAILURE_MESSAGE = "OpenRouter AI insight failed, but the SEO report was generated.";
const SAFE_URL_COMPARE_AI_FAILURE_MESSAGE = "AI summary unavailable, but URL comparison completed.";
const SYSTEM_PROMPT = "You are a senior SEO analyst. Your job is to analyze a completed Google Search Console report and write practical, evidence-based SEO insights in Vietnamese Markdown. Do not invent data. Only use the metrics, tables, URLs, and queries provided. If previous-period data is insufficient, explicitly say so and only discuss current-period metrics for that section. Do not invent YoY, quarterly, or other comparisons unless the provided data contains them. When comparing metrics, always write Previous → Current. Never reverse the direction. Correct: Clicks increased from 25,374 to 27,404 (+8.0%). Wrong: Clicks 27,404 → 25,374. Focus on what changed, why it matters, what needs attention, and what actions the SEO/content team should take next. Write in a concise but useful consulting style. Avoid generic SEO advice. Prioritize recommendations by expected impact.";

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
    reasonTag: row.reasonTag,
    reasonTags: row.reasonTags,
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
    reasonTag: row.reasonTag,
    reasonTags: row.reasonTags,
    recommendation: row.recommendation,
  }));
}


function labeledMetricComparison(current = {}, previous = {}, delta = {}, hasPreviousData = true) {
  const metrics = ["clicks", "impressions", "ctr", "position"];
  return Object.fromEntries(metrics.map((metric) => [metric, {
    previous: hasPreviousData ? previous?.[metric] ?? null : null,
    current: current?.[metric] ?? null,
    delta: hasPreviousData ? delta?.[metric]?.absolute ?? null : null,
    deltaPercent: hasPreviousData ? delta?.[metric]?.percent ?? null : null,
    hasPreviousData,
  }]));
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
    monthlyExecutiveSummary,
    monthlyUrlWinnersLosers,
  } = reportSummary;

  return {
    sourceInfo: {
      label: sourceInfo?.label,
      property: sourceInfo?.property,
      range: sourceInfo?.range,
      previousRange: sourceInfo?.previousRange,
      reportType: sourceInfo?.reportType,
      reportLabel: sourceInfo?.reportLabel,
      diagnostics: {
        queryRange: sourceInfo?.diagnostics?.queryRange,
        coalescedPageRowCount: sourceInfo?.diagnostics?.coalescedPageRowCount,
        keywordRowCount: sourceInfo?.diagnostics?.keywordRowCount,
      },
    },
    filters: filters || sourceInfo?.filters || {},
    selectedPeriodOverview: {
      ...(selectedPeriodOverview || {}),
      metricComparisons: labeledMetricComparison(
        selectedPeriodOverview?.current,
        selectedPeriodOverview?.previous,
        selectedPeriodOverview?.delta,
        selectedPeriodOverview?.hasPreviousData !== false,
      ),
    },
    performance3MonthComparison: {
      currentRange: performance3MonthComparison?.currentRange,
      previousRange: performance3MonthComparison?.previousRange,
      hasPreviousData: Boolean(performance3MonthComparison?.hasPreviousData),
      dataAvailabilityNote: performance3MonthComparison?.hasPreviousData ? null : "Previous period unavailable",
      metricComparisons: labeledMetricComparison(
        performance3MonthComparison?.current,
        performance3MonthComparison?.previous,
        performance3MonthComparison?.delta,
        Boolean(performance3MonthComparison?.hasPreviousData),
      ),
      current: performance3MonthComparison?.current,
      previous: performance3MonthComparison?.hasPreviousData ? performance3MonthComparison?.previous : null,
      delta: performance3MonthComparison?.hasPreviousData ? performance3MonthComparison?.delta : null,
      growthCounts: performance3MonthComparison?.hasPreviousData ? performance3MonthComparison?.growthCounts : null,
      note: performance3MonthComparison?.note,
      outstandingUrls: {
        topByClicks: compactUrlTable(performance3MonthComparison?.outstandingUrls?.topByClicks),
        topByImpressions: compactUrlTable(performance3MonthComparison?.outstandingUrls?.topByImpressions),
        fastestGrowing: compactUrlTable(performance3MonthComparison?.outstandingUrls?.fastestGrowing),
        fastestDeclining: compactUrlTable(performance3MonthComparison?.outstandingUrls?.fastestDeclining),
      },
    },
    monthlyExecutiveSummary: monthlyExecutiveSummary || {},
    monthlyUrlWinnersLosers: {
      currentRange: monthlyUrlWinnersLosers?.currentRange,
      previousRange: monthlyUrlWinnersLosers?.previousRange,
      hasPreviousData: Boolean(monthlyUrlWinnersLosers?.hasPreviousData),
      note: monthlyUrlWinnersLosers?.note,
      urlWinners: compactUrlTable(monthlyUrlWinnersLosers?.urlWinners),
      urlLosers: compactUrlTable(monthlyUrlWinnersLosers?.urlLosers),
      ctrOpportunities: compactLowCtrRows(monthlyUrlWinnersLosers?.ctrOpportunities),
      newRisingUrls: compactUrlTable(monthlyUrlWinnersLosers?.newRisingUrls),
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
  const filters = compactReportSummary.filters || {};
  const explicitReportType = ["monthly", "quarterly", "custom"].includes(filters.reportType) ? filters.reportType : null;
  const isMonthly = explicitReportType ? explicitReportType === "monthly" : filters.reportPeriod === "monthly" || filters.reportPeriod === "30d";
  const isQuarterly = explicitReportType === "quarterly" || (!explicitReportType && filters.reportPeriod === "quarterly");
  const monthlyInstructions = isMonthly ? `

Vì reportType = monthly, bắt buộc thêm các ý sau trong phân tích:
- Recommended focus for next month.
- Top monthly wins.
- Top monthly risks.
- Top monthly optimization actions.
- Compare Previous → Current.
- Use only provided data.
- Mention if previous month data is insufficient.
` : "";
  const quarterlyInstructions = isQuarterly ? `

Vì reportType = quarterly, bắt buộc thêm các ý sau trong phân tích:
- Recommended focus for next quarter.
- Quarter-level performance summary.
- Quarter risks.
- Quarter opportunities.
- Whether growth is concentrated or broad-based.
- Compare Previous → Current.
- Use only provided data.
- Mention if previous quarter data is insufficient.
- Do not invent YoY comparisons unless provided.
` : "";
  return `Phân tích báo cáo Google Search Console dưới đây.

Yêu cầu đầu ra bằng tiếng Việt, dạng Markdown, không cần JSON.

Chỉ sử dụng dữ liệu được cung cấp. Không tự tạo YoY, quý, hoặc so sánh khác nếu dữ liệu không có. Nếu hasPreviousData=false hoặc dataAvailabilityNote báo thiếu dữ liệu kỳ trước, hãy ghi rõ dữ liệu kỳ trước không đủ và chỉ nêu chỉ số hiện tại cho phần đó. Khi so sánh metric, luôn viết theo chiều Previous → Current; không bao giờ đảo thành Current → Previous.
${monthlyInstructions}${quarterlyInstructions}

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


function buildUrlComparePrompt(summary) {
  return `You are a senior SEO analyst. Analyze this URL performance comparison across 1-month, 2-month, and 3-month windows. Write Vietnamese Markdown. Use only provided data. Focus on which URLs improved, which declined, which have high impressions but low CTR, and what actions the team should take next. Compare previous period to current period. Do not invent data.

Required Markdown sections:
## Tổng quan URL Performance
## Xu hướng 1 tháng
## Xu hướng 2 tháng
## Xu hướng 3 tháng
## URL tăng trưởng đáng chú ý
## URL suy giảm cần kiểm tra
## Cơ hội CTR
## Recommended Actions

Provided compact summary (raw GSC rows, tokens, and secrets are not included):
${JSON.stringify(summary, null, 2)}`;
}

function fallbackUrlCompareUnavailable(errorOrDebug = {}) {
  const debug = typeof errorOrDebug === "string"
    ? errorOrDebug
    : safeDebugMessage(errorOrDebug?.error, errorOrDebug?.reason || "unavailable");

  return {
    available: false,
    markdown: "",
    message: SAFE_URL_COMPARE_AI_FAILURE_MESSAGE,
    debug,
  };
}

export async function generateOpenRouterUrlCompareSummary(summary) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return fallbackUrlCompareUnavailable({ reason: "missing_api_key" });
  }

  if (typeof fetch !== "function") {
    return fallbackUrlCompareUnavailable({ reason: "fetch_unavailable" });
  }

  const model = normalizeOpenRouterModelName(process.env.OPENROUTER_MODEL);
  const messages = [
    { role: "system", content: "You are a senior SEO analyst. Write Vietnamese Markdown. Use only provided compact URL comparison data. Do not invent data." },
    { role: "user", content: buildUrlComparePrompt(summary) },
  ];

  try {
    const data = await callOpenRouter({ apiKey, model, messages });
    const markdown = String(data?.choices?.[0]?.message?.content || "").trim();

    if (!markdown) {
      return fallbackUrlCompareUnavailable({ reason: "empty_response" });
    }

    return {
      available: true,
      provider: "openrouter",
      model,
      markdown,
    };
  } catch (error) {
    return fallbackUrlCompareUnavailable({ error, reason: error?.name === "AbortError" ? "timeout" : "api_error" });
  }
}
