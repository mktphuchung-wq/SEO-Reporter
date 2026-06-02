const DEFAULT_HIGH_POSITION_LOSS = 3;
const DEFAULT_HIGH_IMPRESSIONS = 500;
const DEFAULT_TRACKED_CLICK_LOSS = 25;
const DEFAULT_TRACKED_CLICK_LOSS_PERCENT = 30;
const DEFAULT_CTR_HIGH_IMPRESSIONS = 1000;

function safeNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Number(numeric.toFixed(digits));
}

function percentage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Number((numeric * 100).toFixed(1));
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function positivePositionLoss(row) {
  if (row.currentAvgPosition !== null && row.previousAvgPosition !== null) {
    return safeNumber(row.currentAvgPosition) - safeNumber(row.previousAvgPosition);
  }
  if (row.positionDelta !== null && row.positionDelta !== undefined) {
    return -safeNumber(row.positionDelta);
  }
  return 0;
}

function clickLossPercent(row) {
  const previousClicks = safeNumber(row.previousClicks);
  if (previousClicks <= 0) {
    return null;
  }
  const clickLoss = Math.max(0, -safeNumber(row.clickDelta));
  return (clickLoss / previousClicks) * 100;
}

function severityRank(severity) {
  return { high: 3, medium: 2, low: 1 }[severity] || 0;
}

function buildRankingDropAlert(row, options) {
  const positionLoss = positivePositionLoss(row);
  const currentImpressions = safeNumber(row.currentImpressions);
  const previousImpressions = safeNumber(row.previousImpressions);
  const maxImpressions = Math.max(currentImpressions, previousImpressions);
  const clickLoss = Math.max(0, -safeNumber(row.clickDelta));
  const severity =
    positionLoss >= options.highPositionLoss && maxImpressions >= options.highImpressions
      ? "high"
      : positionLoss >= 2 || maxImpressions >= options.highImpressions || clickLoss >= options.trackedClickLoss
        ? "medium"
        : "low";

  return {
    id: `ranking-drop:${row.query || "unknown"}:${row.url || ""}`,
    type: "ranking_drop",
    severity,
    title: `Ranking drop: ${row.query || "Unknown keyword"}`,
    message: `Position worsened by ${round(positionLoss)} with ${maxImpressions} impressions.`,
    query: row.query || "",
    url: row.url || "",
    metrics: {
      positionLoss: round(positionLoss),
      currentAvgPosition: round(row.currentAvgPosition),
      previousAvgPosition: round(row.previousAvgPosition),
      currentImpressions,
      previousImpressions,
      clickDelta: safeNumber(row.clickDelta),
    },
    recommendation: row.recommendation || "Refresh content, validate intent, and add internal links.",
  };
}

function buildTrackedKeywordAlert(row, options) {
  const positionLoss = positivePositionLoss(row);
  const clickLoss = Math.max(0, -safeNumber(row.clickDelta));
  const lossPercent = clickLossPercent(row);
  const maxImpressions = Math.max(safeNumber(row.currentImpressions), safeNumber(row.previousImpressions));
  const severeClickLoss = clickLoss >= options.trackedClickLoss && (lossPercent === null || lossPercent >= options.trackedClickLossPercent);
  const severePositionLoss = positionLoss >= options.highPositionLoss && maxImpressions >= options.highImpressions;
  const severity =
    severeClickLoss || severePositionLoss
      ? "high"
      : clickLoss >= Math.max(10, options.trackedClickLoss / 2) || positionLoss >= 2 || maxImpressions >= options.highImpressions
        ? "medium"
        : "low";

  return {
    id: `tracked-keyword:${row.keyword || "unknown"}`,
    type: "tracked_keyword_movement",
    severity,
    title: `Tracked keyword movement: ${row.keyword || "Unknown keyword"}`,
    message: clickLoss > 0
      ? `Tracked keyword lost ${clickLoss} clicks${lossPercent === null ? "" : ` (${round(lossPercent)}%)`}.`
      : `Tracked keyword position worsened by ${round(positionLoss)}.`,
    query: row.keyword || "",
    url: row.bestCurrentUrl || "",
    metrics: {
      positionLoss: round(positionLoss),
      currentAvgPosition: round(row.currentAvgPosition),
      previousAvgPosition: round(row.previousAvgPosition),
      currentClicks: safeNumber(row.currentClicks),
      previousClicks: safeNumber(row.previousClicks),
      clickDelta: safeNumber(row.clickDelta),
      clickLossPercent: lossPercent === null ? null : round(lossPercent),
      currentImpressions: safeNumber(row.currentImpressions),
      previousImpressions: safeNumber(row.previousImpressions),
    },
    recommendation: row.actionHint || "Review the ranking page, SERP title, and internal links.",
  };
}

function buildCtrOpportunityAlert(row, options) {
  const impressions = safeNumber(row.currentImpressions);
  const ctr = safeNumber(row.currentCtr);
  const severity = impressions >= options.ctrHighImpressions && ctr < 0.02 ? "high" : row.priority === "high" ? "medium" : "low";

  return {
    id: `ctr-opportunity:${row.query || "unknown"}:${row.url || ""}`,
    type: "ctr_opportunity",
    severity,
    title: `CTR opportunity: ${row.query || "Unknown keyword"}`,
    message: `CTR is ${percentage(ctr)}% with ${impressions} impressions.`,
    query: row.query || "",
    url: row.url || "",
    metrics: {
      currentCtr: percentage(ctr),
      currentImpressions: impressions,
      currentAvgPosition: round(row.currentAvgPosition),
      currentClicks: safeNumber(row.currentClicks),
    },
    recommendation: row.recommendation || "Rewrite title/meta description to improve SERP appeal.",
  };
}

export function getSeoAlertConfig(env = process.env) {
  return {
    enabled: isEnabled(env.SEO_ALERTS_ENABLED),
    slackWebhookUrl: env.SLACK_WEBHOOK_URL || "",
    emailProviderUrl: env.ALERT_EMAIL_PROVIDER_URL || "",
    emailProviderApiKey: env.ALERT_EMAIL_PROVIDER_API_KEY || "",
    emailFrom: env.ALERT_EMAIL_FROM || "",
    emailTo: env.ALERT_EMAIL_TO || "",
    thresholds: {
      highPositionLoss: safeNumber(env.SEO_ALERT_HIGH_POSITION_LOSS) || DEFAULT_HIGH_POSITION_LOSS,
      highImpressions: safeNumber(env.SEO_ALERT_HIGH_IMPRESSIONS) || DEFAULT_HIGH_IMPRESSIONS,
      trackedClickLoss: safeNumber(env.SEO_ALERT_TRACKED_CLICK_LOSS) || DEFAULT_TRACKED_CLICK_LOSS,
      trackedClickLossPercent: safeNumber(env.SEO_ALERT_TRACKED_CLICK_LOSS_PERCENT) || DEFAULT_TRACKED_CLICK_LOSS_PERCENT,
      ctrHighImpressions: safeNumber(env.SEO_ALERT_CTR_HIGH_IMPRESSIONS) || DEFAULT_CTR_HIGH_IMPRESSIONS,
    },
  };
}

export function buildSeoAlerts({ highImpressionDrops = [], trackedKeywordMovements = [], ctrOpportunities = [] } = {}, config = getSeoAlertConfig()) {
  const options = config.thresholds || getSeoAlertConfig().thresholds;
  const rankingAlerts = highImpressionDrops.map((row) => buildRankingDropAlert(row, options));
  const trackedAlerts = trackedKeywordMovements
    .filter((row) => row.matchType !== "none" && (safeNumber(row.clickDelta) < 0 || positivePositionLoss(row) > 0))
    .map((row) => buildTrackedKeywordAlert(row, options));
  const ctrAlerts = ctrOpportunities.map((row) => buildCtrOpportunityAlert(row, options));

  return [...rankingAlerts, ...trackedAlerts, ...ctrAlerts]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || (b.metrics.currentImpressions || 0) - (a.metrics.currentImpressions || 0));
}

export function hasHighSeverityAlerts(alerts = []) {
  return alerts.some((alert) => alert.severity === "high");
}

export function buildSeoAlertSummary(alerts = [], { sourceInfo = {}, maxAlerts = 10 } = {}) {
  const highAlerts = alerts.filter((alert) => alert.severity === "high");
  const shownAlerts = highAlerts.slice(0, maxAlerts);
  const range = sourceInfo.range?.start && sourceInfo.range?.end ? `${sourceInfo.range.start} to ${sourceInfo.range.end}` : "selected range";
  const property = sourceInfo.siteUrl || sourceInfo.filters?.siteUrl || sourceInfo.sourceType || "SEO report";
  const lines = [
    `SEO alert summary for ${property} (${range})`,
    `${highAlerts.length} high-severity alert${highAlerts.length === 1 ? "" : "s"} detected.`,
    ...shownAlerts.map((alert, index) => `${index + 1}. [${alert.type}] ${alert.title} — ${alert.message}${alert.url ? ` (${alert.url})` : ""}`),
  ];

  if (highAlerts.length > shownAlerts.length) {
    lines.push(`...and ${highAlerts.length - shownAlerts.length} more high-severity alerts.`);
  }

  return lines.join("\n");
}

async function sendSlackSummary(summary, webhookUrl) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: summary }),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed with HTTP ${response.status}.`);
  }
}

async function sendEmailProviderSummary(summary, config) {
  const response = await fetch(config.emailProviderUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.emailProviderApiKey ? { Authorization: `Bearer ${config.emailProviderApiKey}` } : {}),
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: config.emailTo,
      subject: "High-severity SEO alerts",
      text: summary,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider failed with HTTP ${response.status}.`);
  }
}

export async function sendSeoAlertSummary({ alerts = [], sourceInfo = {}, config = getSeoAlertConfig() } = {}) {
  if (!hasHighSeverityAlerts(alerts)) {
    return { sent: false, reason: "no_high_severity_alerts" };
  }

  const summary = buildSeoAlertSummary(alerts, { sourceInfo });
  const results = [];

  if (config.slackWebhookUrl) {
    await sendSlackSummary(summary, config.slackWebhookUrl);
    results.push("slack");
  }

  if (config.emailProviderUrl && config.emailTo) {
    await sendEmailProviderSummary(summary, config);
    results.push("email");
  }

  if (results.length === 0) {
    return { sent: false, reason: "no_alert_destination_configured", summary };
  }

  return { sent: true, channels: results, summary };
}
