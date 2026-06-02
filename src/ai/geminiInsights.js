const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function limitRows(rows, limit) {
  return (rows || []).slice(0, limit).map((row) => ({ ...row }));
}

function fallbackUnavailable(message) {
  return {
    available: false,
    message,
  };
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normalizeActions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      priority: ["high", "medium", "low"].includes(item?.priority) ? item.priority : "medium",
      title: String(item?.title || "").trim(),
      why: String(item?.why || "").trim(),
      action: String(item?.action || "").trim(),
      expectedImpact: String(item?.expectedImpact || "").trim(),
    }))
    .filter((item) => item.title || item.action);
}

function normalizeRefreshIdeas(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      url: String(item?.url || "").trim(),
      reason: String(item?.reason || "").trim(),
      suggestedUpdate: String(item?.suggestedUpdate || "").trim(),
    }))
    .filter((item) => item.url || item.reason || item.suggestedUpdate);
}

export async function generateGeminiSeoInsights({
  sourceInfo,
  periodCards,
  trackedKeywordMovements,
  highImpressionDrops,
  nearPageOneKeywords,
  keywordWinners,
  ctrOpportunities,
  url6MonthInsights,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallbackUnavailable("AI insight unavailable: GEMINI_API_KEY is not configured.");
  }

  if (typeof fetch !== "function") {
    return fallbackUnavailable("Gemini AI insight failed, but the SEO report was generated.");
  }

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const payload = {
    sourceInfo,
    periodCards,
    trackedKeywordMovements: limitRows(trackedKeywordMovements, 10),
    highImpressionDrops: limitRows(highImpressionDrops, 15),
    nearPageOneKeywords: limitRows(nearPageOneKeywords, 15),
    keywordWinners: limitRows(keywordWinners, 15),
    ctrOpportunities: limitRows(ctrOpportunities, 15),
    url6MonthInsights: {
      topIncreaseMost: limitRows(url6MonthInsights?.topIncreaseMost, 10),
      topDecreaseMost: limitRows(url6MonthInsights?.topDecreaseMost, 10),
      signals: limitRows(url6MonthInsights?.signals, 10),
    },
  };

  const prompt = `Bạn là chuyên gia SEO. Hãy phân tích dữ liệu tóm tắt sau và trả về DUY NHẤT JSON hợp lệ bằng tiếng Việt, thực tế, ưu tiên hành động. Không thêm markdown.

JSON schema cần trả về:
{
  "available": true,
  "executiveSummary": ["..."],
  "risks": ["..."],
  "opportunities": ["..."],
  "recommendedActions": [{"priority":"high|medium|low","title":"...","why":"...","action":"...","expectedImpact":"..."}],
  "contentRefreshIdeas": [{"url":"...","reason":"...","suggestedUpdate":"..."}]
}

Dữ liệu tóm tắt (không phải dữ liệu thô):
${JSON.stringify(payload)}`;

  try {
    const response = await fetch(`${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    const parsed = extractJson(text);
    if (!parsed) {
      throw new Error("Gemini response did not contain JSON.");
    }

    return {
      available: true,
      executiveSummary: normalizeArray(parsed.executiveSummary),
      risks: normalizeArray(parsed.risks),
      opportunities: normalizeArray(parsed.opportunities),
      recommendedActions: normalizeActions(parsed.recommendedActions),
      contentRefreshIdeas: normalizeRefreshIdeas(parsed.contentRefreshIdeas),
    };
  } catch (_error) {
    return fallbackUnavailable("Gemini AI insight failed, but the SEO report was generated.");
  }
}
