const OPENROUTER_CHAT_COMPLETIONS_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_TIMEOUT_MS = 60000;
const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
const DEFAULT_OPENROUTER_MAX_OUTPUT_TOKENS = 3500;
const MAX_TABLE_ROWS_FOR_AI = 15;
const SAFE_OPENROUTER_FAILURE_MESSAGE = "OpenRouter AI insight failed, but the SEO report was generated.";
const SYSTEM_PROMPT = "You are an experienced SEO analyst. Analyze Google Search Console report summaries and produce practical SEO insights. Return Vietnamese output. Avoid generic advice. Ground every recommendation in the provided metrics. Focus on what changed, why it matters, and what the content/SEO team should do next.";

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
  return (rows || []).slice(0, Math.min(limit, MAX_TABLE_ROWS_FOR_AI)).map((row) => ({ ...row }));
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

function fallbackUnavailable(diagnostics = {}) {
  return { available: false, message: SAFE_OPENROUTER_FAILURE_MESSAGE, diagnostics };
}

function normalizeOpenRouterModelName(model) {
  return String(model || DEFAULT_OPENROUTER_MODEL).trim() || DEFAULT_OPENROUTER_MODEL;
}

async function readOpenRouterError(response) {
  const contentType = response.headers?.get?.("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return data?.error?.message || JSON.stringify(data?.error || data);
    }
    return (await response.text()).slice(0, 500);
  } catch (_error) {
    return "Unable to read OpenRouter API error response.";
  }
}

function extractFirstJsonObject(text) {
  const source = String(text || "");
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : source;
  const start = candidate.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseOpenRouterJson(content) {
  const text = String(content || "").trim();
  if (!text) return { parsed: null, rawText: "" };

  try {
    return { parsed: JSON.parse(text), rawText: text };
  } catch (_directParseError) {
    const extracted = extractFirstJsonObject(text);
    if (extracted) {
      try {
        return { parsed: JSON.parse(extracted), rawText: text };
      } catch (_extractedParseError) {
        // Fall through to raw text fallback.
      }
    }
  }

  return { parsed: null, rawText: text };
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normalizeImpact(value) {
  return ["high", "medium", "low"].includes(value) ? value : "medium";
}

function normalizeWhatChanged(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    finding: String(item?.finding || "").trim(),
    evidence: String(item?.evidence || "").trim(),
    impact: normalizeImpact(item?.impact),
  })).filter((item) => item.finding || item.evidence);
}

function normalizeRisks(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    risk: String(item?.risk || "").trim(),
    evidence: String(item?.evidence || "").trim(),
    recommendedAction: String(item?.recommendedAction || "").trim(),
  })).filter((item) => item.risk || item.evidence || item.recommendedAction);
}

function normalizeOpportunities(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    opportunity: String(item?.opportunity || "").trim(),
    evidence: String(item?.evidence || "").trim(),
    recommendedAction: String(item?.recommendedAction || "").trim(),
  })).filter((item) => item.opportunity || item.evidence || item.recommendedAction);
}

function normalizeActions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    priority: normalizeImpact(item?.priority),
    action: String(item?.action || "").trim(),
    targetUrl: String(item?.targetUrl || "").trim(),
    targetQuery: String(item?.targetQuery || "").trim(),
    why: String(item?.why || "").trim(),
    expectedImpact: String(item?.expectedImpact || "").trim(),
    effort: ["low", "medium", "high"].includes(item?.effort) ? item.effort : "medium",
  })).filter((item) => item.action || item.why);
}

function normalizeRefreshPlan(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    url: String(item?.url || "").trim(),
    reason: String(item?.reason || "").trim(),
    updateSuggestion: String(item?.updateSuggestion || "").trim(),
    supportingQueries: normalizeStringArray(item?.supportingQueries),
  })).filter((item) => item.url || item.reason || item.updateSuggestion);
}

function buildCompactReportSummary(reportSummary = {}) {
  const {
    sourceInfo,
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
      filters: sourceInfo?.filters,
      diagnostics: {
        queryRange: sourceInfo?.diagnostics?.queryRange,
        coalescedPageRowCount: sourceInfo?.diagnostics?.coalescedPageRowCount,
        keywordRowCount: sourceInfo?.diagnostics?.keywordRowCount,
      },
    },
    selectedPeriodOverview,
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
    last30Contribution: reportTablesForAI?.last30Contribution,
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
    reportTablesForAI: {
      topUrlsByClicks: compactUrlTable(reportTablesForAI?.topUrlsByClicks),
      topUrlsByImpressions: compactUrlTable(reportTablesForAI?.topUrlsByImpressions),
      fastestGrowingUrls: compactUrlTable(reportTablesForAI?.fastestGrowingUrls),
      fastestDecliningUrls: compactUrlTable(reportTablesForAI?.fastestDecliningUrls),
    },
  };
}

function buildUserPrompt(compactReportSummary) {
  return `Analyze this SEO report summary. Return JSON only in this exact shape:
{
  "executiveSummary": [],
  "whatChanged": [],
  "risks": [],
  "opportunities": [],
  "recommendationActions": [],
  "contentRefreshPlan": [],
  "nextReportFocus": []
}

Guidance for array items:
- whatChanged: objects with finding, evidence, impact (high|medium|low)
- risks: objects with risk, evidence, recommendedAction
- opportunities: objects with opportunity, evidence, recommendedAction
- recommendationActions: objects with priority (high|medium|low), action, targetUrl, targetQuery, why, expectedImpact, effort (low|medium|high)
- contentRefreshPlan: objects with url, reason, updateSuggestion, supportingQueries
- executiveSummary and nextReportFocus: concise Vietnamese strings

Use only the compact summaries/top tables below. Do not infer from unavailable raw rows.

Compact report summary:
${JSON.stringify(compactReportSummary)}`;
}

function buildOpenRouterHeaders(apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (process.env.OPENROUTER_SITE_URL) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }

  if (process.env.OPENROUTER_APP_TITLE) {
    headers["X-OpenRouter-Title"] = process.env.OPENROUTER_APP_TITLE;
  }

  return headers;
}

async function callOpenRouter({ apiKey, model, messages, includeReasoning }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getOpenRouterTimeoutMs());

  try {
    const body = {
      model,
      messages,
      temperature: 0.3,
      max_tokens: getOpenRouterMaxOutputTokens(),
    };

    if (includeReasoning) {
      body.reasoning = { enabled: true, exclude: true };
    }

    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_ENDPOINT, {
      method: "POST",
      headers: buildOpenRouterHeaders(apiKey),
      signal: controller.signal,
      body: JSON.stringify(body),
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

function normalizeParsedInsights(parsed, rawText) {
  return {
    available: true,
    executiveSummary: normalizeStringArray(parsed.executiveSummary),
    whatChanged: normalizeWhatChanged(parsed.whatChanged),
    risks: normalizeRisks(parsed.risks),
    opportunities: normalizeOpportunities(parsed.opportunities),
    recommendationActions: normalizeActions(parsed.recommendationActions),
    contentRefreshPlan: normalizeRefreshPlan(parsed.contentRefreshPlan),
    nextReportFocus: normalizeStringArray(parsed.nextReportFocus),
    rawText,
  };
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

  let reasoningError;

  try {
    const data = await callOpenRouter({ apiKey, model, messages, includeReasoning: true });
    const content = data?.choices?.[0]?.message?.content || "";
    const { parsed, rawText } = parseOpenRouterJson(content);

    if (!parsed) {
      return { available: true, rawText, parseError: "OpenRouter response was not valid JSON." };
    }

    return normalizeParsedInsights(parsed, rawText);
  } catch (error) {
    reasoningError = error;
  }

  try {
    const data = await callOpenRouter({ apiKey, model, messages, includeReasoning: false });
    const content = data?.choices?.[0]?.message?.content || "";
    const { parsed, rawText } = parseOpenRouterJson(content);

    if (!parsed) {
      return { available: true, rawText, parseError: "OpenRouter response was not valid JSON." };
    }

    return normalizeParsedInsights(parsed, rawText);
  } catch (error) {
    const finalError = error?.name === "AbortError" ? error : (error || reasoningError);
    return fallbackUnavailable({
      model,
      reason: finalError?.name === "AbortError" ? "timeout" : "api_error",
      timeoutMs: getOpenRouterTimeoutMs(),
      debugMessage: finalError?.message,
      reasoningDebugMessage: reasoningError?.message,
    });
  }
}
