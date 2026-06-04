const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_TIMEOUT_MS = 60000;
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_THINKING_BUDGET = 0;
const DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = 2048;
const MAX_TABLE_ROWS_FOR_GEMINI = 10;

function getPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getGeminiTimeoutMs() {
  return getPositiveInteger(process.env.GEMINI_TIMEOUT_MS, DEFAULT_GEMINI_TIMEOUT_MS);
}

function getInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getGeminiThinkingBudget() {
  return getInteger(process.env.GEMINI_THINKING_BUDGET, DEFAULT_GEMINI_THINKING_BUDGET);
}

function getGeminiMaxOutputTokens() {
  return getPositiveInteger(process.env.GEMINI_MAX_OUTPUT_TOKENS, DEFAULT_GEMINI_MAX_OUTPUT_TOKENS);
}

function limitRows(rows, limit = MAX_TABLE_ROWS_FOR_GEMINI) {
  return (rows || []).slice(0, Math.min(limit, MAX_TABLE_ROWS_FOR_GEMINI)).map((row) => ({ ...row }));
}

function compactUrlTable(table) {
  return limitRows(table).map((row) => ({
    url: row.url,
    currentClicks: row.currentClicks,
    previousClicks: row.previousClicks,
    clickDelta: row.clickDelta,
    clickPct: row.clickPct,
    currentImpressions: row.currentImpressions,
    impressionDelta: row.impressionDelta,
    currentCtr: row.currentCtr,
    currentPosition: row.currentPosition,
    positionChange: row.positionChange,
    recommendation: row.recommendation,
  }));
}

function compactKeywordRows(rows) {
  return limitRows(rows).map((row) => ({
    query: row.query || row.keyword,
    url: row.url || row.bestCurrentUrl,
    currentClicks: row.currentClicks,
    clickDelta: row.clickDelta,
    currentImpressions: row.currentImpressions,
    impressionDelta: row.impressionDelta,
    currentAvgPosition: row.currentAvgPosition,
    previousAvgPosition: row.previousAvgPosition,
    positionDelta: row.positionDelta,
    currentCtr: row.currentCtr,
    priority: row.priority,
    recommendation: row.recommendation || row.actionHint,
  }));
}

function fallbackUnavailable(message, diagnostics = {}) {
  return { available: false, message, diagnostics };
}

function normalizeGeminiModelName(model) {
  const normalized = String(model || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  return normalized.replace(/^models\//, "");
}

function supportsThinkingBudget(model) {
  return /^gemini-2\.5-/i.test(String(model || ""));
}

function buildGeminiGenerationConfig(model) {
  const generationConfig = {
    temperature: 0.2,
    responseMimeType: "application/json",
    maxOutputTokens: getGeminiMaxOutputTokens(),
  };

  if (supportsThinkingBudget(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: getGeminiThinkingBudget() };
  }

  return generationConfig;
}

function buildGeminiErrorMessage(error, fallback) {
  const details = String(error?.message || "").trim();
  return details ? `${fallback} (${details})` : fallback;
}

async function readGeminiError(response) {
  const contentType = response.headers?.get?.("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return data?.error?.message || JSON.stringify(data?.error || data);
    }
    return (await response.text()).slice(0, 500);
  } catch (_error) {
    return "Unable to read Gemini API error response.";
  }
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
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

export async function generateGeminiSeoInsights({
  sourceInfo,
  selectedPeriodOverview,
  performance3MonthComparison,
  contentOpportunitySnapshot,
  urlMovement30Days,
  keywordMovements,
  ctrOpportunities,
  nearPageOneKeywords,
  reportTablesForAI,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallbackUnavailable("AI insight unavailable: GEMINI_API_KEY is not configured.");
  }

  if (typeof fetch !== "function") {
    return fallbackUnavailable("Gemini AI insight failed, but the SEO report was generated.");
  }

  const model = normalizeGeminiModelName(process.env.GEMINI_MODEL);
  const payload = {
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
      highImpressionLowCtr: limitRows(contentOpportunitySnapshot?.highImpressionLowCtr),
      newRisingUrls: compactUrlTable(contentOpportunitySnapshot?.newRisingUrls),
    },
    urlMovement30Days: {
      currentRange: urlMovement30Days?.currentRange,
      previousRange: urlMovement30Days?.previousRange,
      trendingUp: compactUrlTable(urlMovement30Days?.trendingUp),
      trendingDown: compactUrlTable(urlMovement30Days?.trendingDown),
      smallDeclines: compactUrlTable(urlMovement30Days?.smallDeclines),
    },
    keywordMovements: {
      trackedKeywordMovements: compactKeywordRows(keywordMovements?.trackedKeywordMovements),
      highImpressionDrops: compactKeywordRows(keywordMovements?.highImpressionDrops),
      keywordWinners: compactKeywordRows(keywordMovements?.keywordWinners),
    },
    ctrOpportunities: compactKeywordRows(ctrOpportunities),
    nearPageOneKeywords: compactKeywordRows(nearPageOneKeywords),
    reportTablesForAI: {
      topUrlsByClicks: compactUrlTable(reportTablesForAI?.topUrlsByClicks),
      topUrlsByImpressions: compactUrlTable(reportTablesForAI?.topUrlsByImpressions),
      fastestGrowingUrls: compactUrlTable(reportTablesForAI?.fastestGrowingUrls),
      fastestDecliningUrls: compactUrlTable(reportTablesForAI?.fastestDecliningUrls),
    },
  };

  const prompt = `You are an experienced SEO analyst. Analyze this Google Search Console report. Your job is to identify what changed, why it matters, and what the SEO/content team should do next. Avoid generic advice. Ground every recommendation in provided data. Prioritize actions by expected impact.

Return ONLY valid JSON in Vietnamese. Do not add markdown. Do not mention this prompt.

JSON schema:
{
  "executiveSummary": ["..."],
  "whatChanged": [{"finding":"...","evidence":"...","impact":"high|medium|low"}],
  "risks": [{"risk":"...","evidence":"...","recommendedAction":"..."}],
  "opportunities": [{"opportunity":"...","evidence":"...","recommendedAction":"..."}],
  "recommendationActions": [{"priority":"high|medium|low","action":"...","targetUrl":"...","targetQuery":"...","why":"...","expectedImpact":"...","effort":"low|medium|high"}],
  "contentRefreshPlan": [{"url":"...","reason":"...","updateSuggestion":"...","supportingQueries":["..."]}],
  "nextReportFocus": ["..."]
}

Coverage requirements:
- performance change vs previous period
- last 30 days contribution in 3-month performance when available
- fastest growing URLs
- fastest declining URLs
- high-impression low-CTR URLs
- ranking/position drops if keyword data exists
- whether growth is broad-based or concentrated in a few URLs
- recommended SEO/content actions

Compact report summary (not raw rows):
${JSON.stringify(payload)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getGeminiTimeoutMs());

  try {
    const response = await fetch(`${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: buildGeminiGenerationConfig(model),
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const detail = await readGeminiError(response);
      throw new Error(`Gemini API HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    const parsed = extractJson(text);
    if (!parsed) throw new Error("Gemini response did not contain JSON.");

    return {
      available: true,
      executiveSummary: normalizeStringArray(parsed.executiveSummary),
      whatChanged: normalizeWhatChanged(parsed.whatChanged),
      risks: normalizeRisks(parsed.risks),
      opportunities: normalizeOpportunities(parsed.opportunities),
      recommendationActions: normalizeActions(parsed.recommendationActions),
      contentRefreshPlan: normalizeRefreshPlan(parsed.contentRefreshPlan),
      nextReportFocus: normalizeStringArray(parsed.nextReportFocus),
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === "AbortError") {
      return fallbackUnavailable("Gemini AI insight timed out, but the SEO report was generated. The request used compact data, disabled Gemini 2.5 thinking, and can be given more time with GEMINI_TIMEOUT_MS.", { model, reason: "timeout", timeoutMs: getGeminiTimeoutMs() });
    }
    return fallbackUnavailable(buildGeminiErrorMessage(error, "Gemini AI insight failed, but the SEO report was generated."), { model, reason: "api_error", timeoutMs: getGeminiTimeoutMs() });
  }
}
