import { escapeHtml } from "./ui/html.js";

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatPct(value, digits = 2) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

function formatPoint(value, digits = 2) {
  return `${formatSigned(Number(value || 0) * 100, digits)}pt`;
}

function formatSigned(value, digits = 0) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(digits)}`;
}

function formatDeltaPercent(deltaPercent) {
  if (deltaPercent === null || deltaPercent === undefined) {
    return "new";
  }
  const sign = deltaPercent > 0 ? "+" : "";
  return `${sign}${Number(deltaPercent || 0).toFixed(1)}%`;
}

function formatPosition(value) {
  return value === null || value === undefined ? "—" : Number(value || 0).toFixed(2);
}

function deltaClass(value) {
  const numeric = Number(value || 0);
  return numeric > 0 ? "up" : numeric < 0 ? "down" : "flat";
}

function linkedUrl(url) {
  if (!url) return "—";
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
}

function priorityBadge(priority) {
  return `<span class="priority priority-${escapeHtml(priority || "low")}">${escapeHtml(priority || "low")}</span>`;
}

function aiList(items) {
  if (!items?.length) return '<p class="empty">No AI items</p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function rangeLabel(range) {
  return range ? `${range.start} -> ${range.end}` : "—";
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function rowsToTable(items = [], mapper, emptyMessage = "The selected source, period, or filters did not return rows for this section.") {
  if (!items.length) {
    return `<div class="empty-table"><strong>No data available</strong><p>${escapeHtml(emptyMessage)}</p></div>`;
  }

  return `<table><thead>${mapper.header}</thead><tbody>${items.map((item, index) => mapper.row(item, index)).join("\n")}</tbody></table>`;
}

function renderEmptyReportSection({ sourceInfo, filters, diagnostics }) {
  const emptyReason = sourceInfo.emptyReason || diagnostics.emptyReason || diagnostics.emptyDataWarning;
  if (!emptyReason) return "";

  return `<section class="empty-report">
    <h2>Empty Report Diagnostics</h2>
    <p class="note-box danger">${escapeHtml(emptyReason)}</p>
    <div class="kpis">
      <div class="kpi"><span>Property</span><strong>${escapeHtml(sourceInfo.property || "—")}</strong></div>
      <div class="kpi"><span>Date range</span><strong>${escapeHtml(rangeLabel(sourceInfo.range))}</strong></div>
      <div class="kpi"><span>Search type</span><strong>${escapeHtml(filters.searchType || "web")}</strong></div>
      <div class="kpi"><span>Page contains</span><strong>${escapeHtml(filters.pageContains || "None")}</strong></div>
      <div class="kpi"><span>Page rows received</span><strong>${formatNumber(diagnostics.pageRowCount || 0)}</strong></div>
      <div class="kpi"><span>Keyword rows received</span><strong>${formatNumber(diagnostics.keywordRowCount || 0)}</strong></div>
    </div>
  </section>`;
}

function renderOverview(overview) {
  const metricRows = [
    ["Clicks", formatNumber(overview.current.clicks), formatNumber(overview.previous.clicks), formatSigned(overview.delta.clicks.absolute), formatDeltaPercent(overview.delta.clicks.percent), overview.delta.clicks.absolute],
    ["Impressions", formatNumber(overview.current.impressions), formatNumber(overview.previous.impressions), formatSigned(overview.delta.impressions.absolute), formatDeltaPercent(overview.delta.impressions.percent), overview.delta.impressions.absolute],
    ["CTR", formatPct(overview.current.ctr), formatPct(overview.previous.ctr), formatPoint(overview.delta.ctr.absolute), formatDeltaPercent(overview.delta.ctr.percent), overview.delta.ctr.absolute],
    ["Avg Position", formatPosition(overview.current.position), formatPosition(overview.previous.position), formatSigned(overview.delta.position.absolute, 2), formatDeltaPercent(overview.delta.position.percent), overview.delta.position.absolute],
  ];

  return `<section>
    <h2>Report Period Overview</h2>
    ${overview.note ? `<p class="note-box">${escapeHtml(overview.note)}</p>` : ""}
    <div class="kpis">
      <div class="kpi"><span>Selected report period</span><strong>${escapeHtml(rangeLabel(overview.currentRange))}</strong></div>
      <div class="kpi"><span>Previous comparable period</span><strong>${escapeHtml(rangeLabel(overview.previousRange))}</strong></div>
    </div>
    <table style="margin-top:12px;"><thead><tr><th>Metric</th><th>Current</th><th>Previous</th><th>Delta</th><th>Delta %</th></tr></thead><tbody>
      ${metricRows.map(([label, current, previous, delta, pct, direction]) => `<tr><td>${label}</td><td>${current}</td><td>${previous}</td><td class="${deltaClass(direction)}">${delta}</td><td>${escapeHtml(pct)}</td></tr>`).join("")}
    </tbody></table>
    <p class="muted">For average position, lower is better; positive position delta means improved rankings.</p>
  </section>`;
}

function urlComparisonTable(rows) {
  return rowsToTable(rows, {
    header: "<tr><th>#</th><th>URL</th><th>Current clicks</th><th>Previous clicks</th><th>Click Δ</th><th>Click Δ %</th><th>Current impressions</th><th>Avg position</th><th>Position change</th></tr>",
    row: (item, idx) => `<tr><td>${idx + 1}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatNumber(item.currentClicks)}</td><td>${formatNumber(item.previousClicks)}</td><td class="${deltaClass(item.clickDelta)}">${formatSigned(item.clickDelta)}</td><td>${escapeHtml(formatDeltaPercent(item.clickPct))}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatPosition(item.currentPosition)}</td><td class="${deltaClass(item.positionChange)}">${formatSigned(item.positionChange, 2)}</td></tr>`,
  });
}

function renderPerformance3Months(perf) {
  return `<section>
    <h2>SEO Performance - Last 3 Months vs Previous 3 Months</h2>
    ${perf.note ? `<p class="note-box">${escapeHtml(perf.note)}</p>` : ""}
    <p class="muted">Current: ${escapeHtml(rangeLabel(perf.currentRange))} | Previous: ${escapeHtml(rangeLabel(perf.previousRange))}</p>
    <div class="kpis">
      <div class="kpi"><span>Current clicks</span><strong>${formatNumber(perf.current.clicks)}</strong><small class="${deltaClass(perf.delta.clicks.absolute)}">${formatSigned(perf.delta.clicks.absolute)} (${formatDeltaPercent(perf.delta.clicks.percent)})</small></div>
      <div class="kpi"><span>Current impressions</span><strong>${formatNumber(perf.current.impressions)}</strong><small class="${deltaClass(perf.delta.impressions.absolute)}">${formatSigned(perf.delta.impressions.absolute)} (${formatDeltaPercent(perf.delta.impressions.percent)})</small></div>
      <div class="kpi"><span>CTR</span><strong>${formatPct(perf.current.ctr)}</strong><small class="${deltaClass(perf.delta.ctr.absolute)}">${formatPoint(perf.delta.ctr.absolute)}</small></div>
      <div class="kpi"><span>Avg position</span><strong>${formatPosition(perf.current.position)}</strong><small class="${deltaClass(perf.delta.position.absolute)}">${formatSigned(perf.delta.position.absolute, 2)}</small></div>
      <div class="kpi"><span>URLs growth &gt; 20%</span><strong>${formatNumber(perf.growthCounts.clickGrowthOver20)}</strong></div>
      <div class="kpi"><span>URLs loss &gt; 20%</span><strong>${formatNumber(perf.growthCounts.clickLossOver20)}</strong></div>
      <div class="kpi"><span>Newly gaining clicks</span><strong>${formatNumber(perf.growthCounts.newlyGainingClicks)}</strong></div>
      <div class="kpi"><span>Dropped to zero clicks</span><strong>${formatNumber(perf.growthCounts.droppedToZeroClicks)}</strong></div>
    </div>
    <div class="two-col" style="margin-top:12px;"><div class="chart-box"><canvas id="dailyChart"></canvas></div><div class="chart-box"><canvas id="monthlyChart"></canvas></div></div>
    <h3 style="margin-top:14px;">Outstanding URLs In Current 3 Months</h3>
    <div class="two-col" style="margin-top:8px;">
      <div><h3>Top URLs by clicks</h3>${urlComparisonTable(perf.outstandingUrls.topByClicks)}</div>
      <div><h3>Top URLs by impressions</h3>${urlComparisonTable(perf.outstandingUrls.topByImpressions)}</div>
      <div><h3>Fastest growing URLs vs previous 3 months</h3>${urlComparisonTable(perf.outstandingUrls.fastestGrowing)}</div>
      <div><h3>Fastest declining URLs vs previous 3 months</h3>${urlComparisonTable(perf.outstandingUrls.fastestDeclining)}</div>
    </div>
  </section>`;
}

function renderLast30Contribution(contribution) {
  return `<section>
    <h2>Last 30 Days Contribution Within Current 3 Months</h2>
    <div class="kpis">
      <div class="kpi"><span>Last 30 clicks</span><strong>${formatNumber(contribution.last30Clicks)}</strong></div>
      <div class="kpi"><span>Current 3-month clicks</span><strong>${formatNumber(contribution.current3MonthClicks)}</strong></div>
      <div class="kpi"><span>Last 30 click share</span><strong>${contribution.last30ClickShare.toFixed(1)}%</strong></div>
      <div class="kpi"><span>Last 30 impressions</span><strong>${formatNumber(contribution.last30Impressions)}</strong></div>
      <div class="kpi"><span>Current 3-month impressions</span><strong>${formatNumber(contribution.current3MonthImpressions)}</strong></div>
      <div class="kpi"><span>Last 30 impression share</span><strong>${contribution.last30ImpressionShare.toFixed(1)}%</strong></div>
      <div class="kpi"><span>Interpretation</span><strong>${escapeHtml(contribution.interpretation)}</strong></div>
    </div>
  </section>`;
}

function renderContentSnapshot(snapshot) {
  return `<section>
    <h2>Content Opportunity Snapshot</h2>
    ${snapshot.note ? `<p class="note-box">${escapeHtml(snapshot.note)}</p>` : ""}
    <div class="two-col">
      <div><h3>Top Growing URLs</h3>${urlComparisonTable(snapshot.topGrowingUrls)}</div>
      <div><h3>Top Declining URLs</h3>${urlComparisonTable(snapshot.topDecliningUrls)}</div>
      <div><h3>High-Impression Low-CTR URLs</h3>${rowsToTable(snapshot.highImpressionLowCtr, {
        header: "<tr><th>#</th><th>URL</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Avg position</th><th>Recommendation</th></tr>",
        row: (item, idx) => `<tr><td>${idx + 1}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatNumber(item.impressions)}</td><td>${formatNumber(item.clicks)}</td><td>${formatPct(item.ctr)}</td><td>${formatPosition(item.position)}</td><td>${escapeHtml(item.recommendation)}</td></tr>`,
      })}</div>
      <div><h3>New/Rising URLs</h3>${urlComparisonTable(snapshot.newRisingUrls)}</div>
    </div>
  </section>`;
}

function movementTable(rows, emptyMessage) {
  return rowsToTable(rows, {
    header: "<tr><th>#</th><th>URL</th><th>Clicks Δ</th><th>Impressions Δ</th><th>Current clicks</th><th>Previous clicks</th><th>Current impressions</th><th>Previous impressions</th></tr>",
    row: (item, idx) => `<tr><td>${idx + 1}</td><td class="url">${linkedUrl(item.url)}</td><td class="${deltaClass(item.clickDelta)}">${formatSigned(item.clickDelta)}</td><td class="${deltaClass(item.impressionDelta)}">${formatSigned(item.impressionDelta)}</td><td>${formatNumber(item.currentClicks)}</td><td>${formatNumber(item.previousClicks)}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatNumber(item.previousImpressions)}</td></tr>`,
  }, emptyMessage);
}

function renderUrlMovement(movement) {
  return `<section>
    <h2>GSC URL Movement - Last 30 Days vs Previous 30 Days</h2>
    ${movement.hasPreviousData ? "" : `<p class="note-box">Previous 30-day comparison may be limited by fetched data range.</p>`}
    <p class="muted">Window compare: ${escapeHtml(rangeLabel(movement.currentRange))} vs ${escapeHtml(rangeLabel(movement.previousRange))}</p>
    <div class="two-col">
      <div><h3>Trending Up</h3>${movementTable(movement.trendingUp)}</div>
      <div><h3>Trending Down</h3>${movement.trendingDown.length ? movementTable(movement.trendingDown) : `<p class="note-box">${escapeHtml(movement.emptyDeclineMessage)}</p><h3 style="margin-top:10px;">Small Declines</h3>${movementTable(movement.smallDeclines, "No meaningful declines detected for this filter.")}`}</div>
    </div>
  </section>`;
}

function renderGeminiInsights(geminiInsights) {
  return `<section>
    <h2>Executive Summary / Gemini AI SEO Insights</h2>
    ${geminiInsights.available ? `
      <div class="two-col">
        <div><h3>Executive Summary</h3>${aiList(geminiInsights.executiveSummary)}</div>
        <div><h3>What Changed</h3>${rowsToTable(geminiInsights.whatChanged || [], {
          header: "<tr><th>Finding</th><th>Evidence</th><th>Impact</th></tr>",
          row: (item) => `<tr><td>${escapeHtml(item.finding)}</td><td>${escapeHtml(item.evidence)}</td><td>${priorityBadge(item.impact)}</td></tr>`,
        })}</div>
        <div><h3>Risks</h3>${rowsToTable(geminiInsights.risks || [], {
          header: "<tr><th>Risk</th><th>Evidence</th><th>Recommended action</th></tr>",
          row: (item) => `<tr><td>${escapeHtml(item.risk)}</td><td>${escapeHtml(item.evidence)}</td><td>${escapeHtml(item.recommendedAction)}</td></tr>`,
        })}</div>
        <div><h3>Opportunities</h3>${rowsToTable(geminiInsights.opportunities || [], {
          header: "<tr><th>Opportunity</th><th>Evidence</th><th>Recommended action</th></tr>",
          row: (item) => `<tr><td>${escapeHtml(item.opportunity)}</td><td>${escapeHtml(item.evidence)}</td><td>${escapeHtml(item.recommendedAction)}</td></tr>`,
        })}</div>
      </div>
      <h3 style="margin-top:12px;">Recommendation Actions</h3>
      ${rowsToTable(geminiInsights.recommendationActions || [], {
        header: "<tr><th>Priority</th><th>Action</th><th>Target URL</th><th>Target query</th><th>Why</th><th>Expected impact</th><th>Effort</th></tr>",
        row: (item) => `<tr><td>${priorityBadge(item.priority)}</td><td>${escapeHtml(item.action)}</td><td class="url">${linkedUrl(item.targetUrl)}</td><td>${escapeHtml(item.targetQuery)}</td><td>${escapeHtml(item.why)}</td><td>${escapeHtml(item.expectedImpact)}</td><td>${escapeHtml(item.effort)}</td></tr>`,
      })}
      <h3 style="margin-top:12px;">Content Refresh Plan</h3>
      ${rowsToTable(geminiInsights.contentRefreshPlan || [], {
        header: "<tr><th>URL</th><th>Reason</th><th>Update suggestion</th><th>Supporting queries</th></tr>",
        row: (item) => `<tr><td class="url">${linkedUrl(item.url)}</td><td>${escapeHtml(item.reason)}</td><td>${escapeHtml(item.updateSuggestion)}</td><td>${escapeHtml((item.supportingQueries || []).join(", "))}</td></tr>`,
      })}
      <h3 style="margin-top:12px;">Next Report Focus</h3>${aiList(geminiInsights.nextReportFocus)}
    ` : `<p class="empty">${escapeHtml(geminiInsights.message || "AI insight unavailable.")}</p>`}
  </section>`;
}

function renderKeywordSections(keywordInsights, keywordCsvDownloadUrl) {
  const trackedKeywordMovements = keywordInsights.trackedKeywordMovements || [];
  const highImpressionDrops = keywordInsights.highImpressionDrops || [];
  const nearPageOneKeywords = keywordInsights.nearPageOneKeywords || [];
  const keywordWinners = keywordInsights.keywordWinners || [];
  const ctrOpportunities = keywordInsights.ctrOpportunities || [];

  if (!trackedKeywordMovements.length && !highImpressionDrops.length && !nearPageOneKeywords.length && !keywordWinners.length && !ctrOpportunities.length) {
    return `<section><h2>Keyword / Query Opportunities</h2><p class="empty">No keyword/query opportunity data is available for this report.</p></section>`;
  }

  return `<section>
    <h2>Keyword / Query Opportunities</h2>
    ${keywordCsvDownloadUrl ? `<p><a class="download-link" href="${escapeHtml(keywordCsvDownloadUrl)}">Download keyword CSV</a></p>` : ""}
    <h3>Tracked Keyword Ranking Movement</h3>${rowsToTable(trackedKeywordMovements, {
      header: "<tr><th>Keyword</th><th>Match type</th><th>Best URL</th><th>Current position</th><th>Previous position</th><th>Position change</th><th>Current clicks</th><th>Click change</th><th>Action hint</th></tr>",
      row: (item) => `<tr><td>${escapeHtml(item.keyword)}</td><td>${escapeHtml(item.matchType)}</td><td class="url">${linkedUrl(item.bestCurrentUrl)}</td><td>${formatPosition(item.currentAvgPosition)}</td><td>${formatPosition(item.previousAvgPosition)}</td><td class="${deltaClass(item.positionDelta)}">${item.positionDelta === null ? "—" : formatSigned(item.positionDelta, 2)}</td><td>${formatNumber(item.currentClicks)}</td><td class="${deltaClass(item.clickDelta)}">${formatSigned(item.clickDelta)}</td><td>${escapeHtml(item.actionHint)}</td></tr>`,
    })}
    <h3 style="margin-top:12px;">High Impression Keywords With Ranking Drop</h3>${rowsToTable(highImpressionDrops, {
      header: "<tr><th>Query</th><th>URL</th><th>Current position</th><th>Previous position</th><th>Current impressions</th><th>CTR</th><th>Priority</th><th>Recommendation</th></tr>",
      row: (item) => `<tr><td>${escapeHtml(item.query)}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatPosition(item.currentAvgPosition)}</td><td>${formatPosition(item.previousAvgPosition)}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatPct(item.currentCtr)}</td><td>${priorityBadge(item.priority)}</td><td>${escapeHtml(item.recommendation)}</td></tr>`,
    })}
    <h3 style="margin-top:12px;">High Impression Keywords Near Page 1</h3>${rowsToTable(nearPageOneKeywords, {
      header: "<tr><th>Query</th><th>URL</th><th>Position</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Priority</th><th>Recommendation</th></tr>",
      row: (item) => `<tr><td>${escapeHtml(item.query)}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatPosition(item.currentAvgPosition)}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatNumber(item.currentClicks)}</td><td>${formatPct(item.currentCtr)}</td><td>${priorityBadge(item.priority)}</td><td>${escapeHtml(item.recommendation)}</td></tr>`,
    })}
    <h3 style="margin-top:12px;">CTR Opportunity Keywords</h3>${rowsToTable(ctrOpportunities, {
      header: "<tr><th>Query</th><th>URL</th><th>Position</th><th>Impressions</th><th>CTR</th><th>Priority</th><th>Recommendation</th></tr>",
      row: (item) => `<tr><td>${escapeHtml(item.query)}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatPosition(item.currentAvgPosition)}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatPct(item.currentCtr)}</td><td>${priorityBadge(item.priority)}</td><td>${escapeHtml(item.recommendation)}</td></tr>`,
    })}
    <h3 style="margin-top:12px;">Keyword Winners</h3>${rowsToTable(keywordWinners, {
      header: "<tr><th>Query</th><th>URL</th><th>Current position</th><th>Position gain</th><th>Click change</th><th>Priority</th><th>Recommendation</th></tr>",
      row: (item) => `<tr><td>${escapeHtml(item.query)}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatPosition(item.currentAvgPosition)}</td><td class="up">${item.positionDelta === null ? "—" : formatSigned(item.positionDelta, 2)}</td><td class="${deltaClass(item.clickDelta)}">${formatSigned(item.clickDelta)}</td><td>${priorityBadge(item.priority)}</td><td>${escapeHtml(item.recommendation)}</td></tr>`,
    })}
  </section>`;
}

function render6MonthSignals(sixMonths) {
  if (!sixMonths?.hasEnoughData) {
    return `<section><h2>URL Signals In 6 Months</h2><p class="note-box">${escapeHtml(sixMonths?.note || "Only limited data is available, so 6-month views are hidden.")}</p></section>`;
  }

  return `<section>
    <h2>URL Signals In 6 Months</h2>
    <p class="muted">Month buckets: ${(sixMonths.monthKeys || []).map(escapeHtml).join(" | ")}</p>
    <div class="two-col" style="margin-top:8px;">
      <div><h3>Top Increase (Most)</h3>${rowsToTable(sixMonths.topIncreaseMost, {
        header: "<tr><th>#</th><th>URL</th><th>Δ Clicks</th><th>Start Month</th><th>Last Month</th></tr>",
        row: (item, idx) => `<tr><td>${idx + 1}</td><td class="url">${linkedUrl(item.url)}</td><td class="up">${formatSigned(item.delta)}</td><td>${formatNumber(item.firstMonth)}</td><td>${formatNumber(item.lastMonth)}</td></tr>`,
      })}</div>
      <div><h3>Top Decrease (Most)</h3>${rowsToTable(sixMonths.topDecreaseMost, {
        header: "<tr><th>#</th><th>URL</th><th>Δ Clicks</th><th>Start Month</th><th>Last Month</th></tr>",
        row: (item, idx) => `<tr><td>${idx + 1}</td><td class="url">${linkedUrl(item.url)}</td><td class="down">${formatSigned(item.delta)}</td><td>${formatNumber(item.firstMonth)}</td><td>${formatNumber(item.lastMonth)}</td></tr>`,
      })}</div>
    </div>
    <div class="chart-box" style="margin-top: 12px;"><canvas id="moverChart"></canvas></div>
  </section>`;
}

export function renderHtmlReport({ insights, sourceInfo, keywordInsights = {}, keywordCsvDownloadUrl = "" }) {
  const overview = insights.selectedPeriodOverview;
  const perf = insights.performance3MonthComparison;
  const contribution = insights.last30Contribution;
  const snapshot = insights.contentOpportunitySnapshot;
  const movement = insights.urlMovement30Days;
  const sixMonths = insights.url6MonthInsights;
  const geminiInsights = keywordInsights.geminiInsights || { available: false, message: "AI insight not requested." };
  const filters = sourceInfo.filters || {};
  const diagnostics = sourceInfo.diagnostics || {};
  const dataDelayNote = sourceInfo.dataDelayNote || (diagnostics.gscDataDelayDays != null && sourceInfo.range?.end ? `GSC data may be delayed; report ends at ${sourceInfo.range.end}.` : null);
  const chartPayload = {
    dailyLabels: (perf.dailySeries || []).map((x) => x.date),
    dailyClicks: (perf.dailySeries || []).map((x) => Number(x.clicks.toFixed(2))),
    dailyImpressions: (perf.dailySeries || []).map((x) => Number(x.impressions.toFixed(2))),
    monthlyLabels: (perf.monthly || []).map((x) => x.month),
    monthlyClicks: (perf.monthly || []).map((x) => Number(x.clicks.toFixed(2))),
    monthlyImpressions: (perf.monthly || []).map((x) => Number(x.impressions.toFixed(2))),
    moverLabels: (sixMonths.topIncreaseMost || []).slice(0, 8).map((x) => x.url),
    moverValues: (sixMonths.topIncreaseMost || []).slice(0, 8).map((x) => Number(x.delta.toFixed(2))),
  };

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SEO Insight Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg-1:#f5f2e8;--bg-2:#e8efe3;--ink:#102027;--muted:#4f6272;--accent:#156064;--accent-soft:#b8d8d8;--warm:#ff7b54;--up:#1f7a1f;--down:#b33636;--flat:#6a7280;--card:rgba(255,255,255,.8);--line:rgba(0,0,0,.08)}
*{box-sizing:border-box}body{margin:0;font-family:"IBM Plex Sans",sans-serif;color:var(--ink);background:radial-gradient(circle at 8% 12%,rgba(255,123,84,.28),transparent 28%),radial-gradient(circle at 86% 4%,rgba(21,96,100,.2),transparent 32%),linear-gradient(140deg,var(--bg-1),var(--bg-2))}.wrapper{width:min(1220px,95vw);margin:0 auto;padding:28px 0 60px}header{background:linear-gradient(120deg,rgba(16,32,39,.95),rgba(21,96,100,.86));color:#fff;border-radius:20px;padding:28px;margin-bottom:18px;overflow:hidden;box-shadow:0 18px 40px rgba(12,22,26,.25)}h1,h2,h3{font-family:"Space Grotesk",sans-serif;letter-spacing:-.01em;margin:0}h1{font-size:clamp(1.4rem,3vw,2rem)}h2{font-size:clamp(1.1rem,2.4vw,1.4rem);margin-bottom:10px}h3{font-size:1rem;margin-bottom:8px}.meta{margin-top:8px;color:rgba(255,255,255,.9);font-size:.95rem;display:flex;flex-wrap:wrap;gap:14px}section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:16px;backdrop-filter:blur(8px)}.two-col{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:10px}.kpi{background:rgba(255,255,255,.8);border:1px solid var(--line);border-radius:12px;padding:10px}.kpi span{display:block;font-size:.8rem;color:var(--muted)}.kpi strong{font-size:1rem}.kpi small{display:block;margin-top:4px}.up{color:var(--up);font-weight:700}.down{color:var(--down);font-weight:700}.flat{color:var(--flat);font-weight:700}.chart-box{height:320px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px}table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.74);border-radius:12px;overflow:hidden}th,td{text-align:left;border-bottom:1px solid var(--line);padding:8px;vertical-align:top}th{background:rgba(16,32,39,.94);color:#fff;font-weight:600}td.url{max-width:360px;word-break:break-word;font-size:.85rem}.muted,.empty{color:var(--muted);font-size:.88rem}.note-box{border-left:4px solid var(--accent);padding:10px 12px;background:rgba(184,216,216,.28);border-radius:10px;color:var(--muted)}.note-box.danger{border-color:rgba(179,54,54,.45);background:rgba(179,54,54,.09)}.report-actions{margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap}.action-link,.download-link{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:10px 14px;color:#fff;background:var(--accent);font-weight:700;text-decoration:none;box-shadow:0 10px 24px rgba(21,96,100,.22);border:1px solid rgba(21,96,100,.1)}.action-link.secondary{background:#fff;color:var(--accent);border-color:rgba(21,96,100,.28);box-shadow:none}.action-link.disabled{background:rgba(106,114,128,.15);color:var(--flat);box-shadow:none;cursor:not-allowed}.empty-table{border:1px dashed rgba(79,98,114,.35);border-radius:12px;background:rgba(255,255,255,.72);padding:16px;color:var(--muted)}.empty-table strong{display:block;color:var(--ink);margin-bottom:4px}.priority{display:inline-block;border-radius:999px;padding:2px 8px;font-size:.75rem;font-weight:700;text-transform:uppercase;background:rgba(106,114,128,.16)}.priority-high{background:rgba(179,54,54,.16);color:var(--down)}.priority-medium{background:rgba(255,123,84,.2);color:#8a3f1d}.priority-low{background:rgba(31,122,31,.14);color:var(--up)}@media(max-width:700px){.wrapper{width:94vw}header,section{padding:14px}th,td{font-size:.83rem}.two-col{grid-template-columns:1fr}}
</style></head><body><div class="wrapper">
  <div class="report-actions" aria-label="Report actions"><a class="action-link secondary" href="/">Back to dashboard</a><a class="action-link" href="/reports/new">Create another report</a><span class="action-link disabled" aria-disabled="true">Download HTML (coming soon)</span>${keywordCsvDownloadUrl ? `<a class="download-link" href="${escapeHtml(keywordCsvDownloadUrl)}">Download keyword CSV</a>` : ""}</div>
  <header><h1>SEO Insight Report</h1><div class="meta"><span>Generated: ${escapeHtml(insights.generatedAt)}</span><span>Source: ${escapeHtml(sourceInfo.label)}</span><span>Property: ${escapeHtml(sourceInfo.property)}</span><span>Date range: ${escapeHtml(rangeLabel(sourceInfo.range))}</span><span>Data span: ${escapeHtml(insights.dataSpan ? rangeLabel(insights.dataSpan) : "No data")}</span></div></header>
  <section><h2>Active Filters</h2>${dataDelayNote ? `<p class="note-box" style="margin-bottom:10px;">${escapeHtml(dataDelayNote)}</p>` : ""}<div class="kpis"><div class="kpi"><span>Property</span><strong>${escapeHtml(sourceInfo.property || "—")}</strong></div><div class="kpi"><span>Search type</span><strong>${escapeHtml(filters.searchType || "web")}</strong></div><div class="kpi"><span>Date range</span><strong>${escapeHtml(rangeLabel(sourceInfo.range))}</strong></div><div class="kpi"><span>Fetched analysis range</span><strong>${escapeHtml(rangeLabel(diagnostics.queryRange))}</strong></div><div class="kpi"><span>Report period</span><strong>${escapeHtml(filters.reportPeriodLabel || filters.reportPeriod || "custom")}</strong></div><div class="kpi"><span>Page contains filter</span><strong>${escapeHtml(filters.pageContains || "None")}</strong></div><div class="kpi"><span>Tracked keyword count</span><strong>${formatNumber(filters.trackedKeywordCount || 0)}</strong></div></div></section>
  ${renderEmptyReportSection({ sourceInfo, filters, diagnostics })}
  ${renderGeminiInsights(geminiInsights)}
  ${renderOverview(overview)}
  ${renderPerformance3Months(perf)}
  ${renderLast30Contribution(contribution)}
  ${renderContentSnapshot(snapshot)}
  ${renderUrlMovement(movement)}
  ${renderKeywordSections(keywordInsights, keywordCsvDownloadUrl)}
  ${render6MonthSignals(sixMonths)}
  <section><h2>Appendix / Raw tables</h2>${insights.dataAvailabilityNotes?.length ? `<ul>${insights.dataAvailabilityNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : `<p class="empty">Enough fetched data is available for the core comparisons.</p>`}<div class="kpis"><div class="kpi"><span>Raw page rows</span><strong>${formatNumber(diagnostics.pageRowCount || 0)}</strong></div><div class="kpi"><span>Coalesced page rows</span><strong>${formatNumber(diagnostics.coalescedPageRowCount || 0)}</strong></div><div class="kpi"><span>Keyword rows</span><strong>${formatNumber(diagnostics.keywordRowCount || 0)}</strong></div><div class="kpi"><span>GSC delay days</span><strong>${diagnostics.gscDataDelayDays ?? "—"}</strong></div><div class="kpi"><span>Page filter applied</span><strong>${yesNo(Boolean(diagnostics.pageContainsApplied ?? filters.pageContains))}</strong></div></div><p class="muted">Report tables above are generated from compact GSC page and query summaries. Full raw GSC rows are not exposed to Gemini AI.</p></section>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const payload=${JSON.stringify(chartPayload)};
const dailyCtx=document.getElementById("dailyChart");
const monthlyCtx=document.getElementById("monthlyChart");
const moverCtx=document.getElementById("moverChart");
if(dailyCtx){new Chart(dailyCtx,{type:"line",data:{labels:payload.dailyLabels,datasets:[{label:"Clicks",data:payload.dailyClicks,borderColor:"#156064",backgroundColor:"rgba(21,96,100,.18)",yAxisID:"y",tension:.28,fill:true},{label:"Impressions",data:payload.dailyImpressions,borderColor:"#ff7b54",backgroundColor:"rgba(255,123,84,.12)",yAxisID:"y1",tension:.24,fill:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:{y:{type:"linear",position:"left",title:{display:true,text:"Clicks"}},y1:{type:"linear",position:"right",grid:{drawOnChartArea:false},title:{display:true,text:"Impressions"}}}}});}
if(monthlyCtx){new Chart(monthlyCtx,{type:"bar",data:{labels:payload.monthlyLabels,datasets:[{label:"Clicks",data:payload.monthlyClicks,backgroundColor:"rgba(21,96,100,.78)"},{label:"Impressions",data:payload.monthlyImpressions,backgroundColor:"rgba(255,123,84,.6)"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"top"}}}});}
if(moverCtx){new Chart(moverCtx,{type:"bar",data:{labels:payload.moverLabels,datasets:[{label:"Clicks delta (Top increase - 6M)",data:payload.moverValues,backgroundColor:"rgba(42,157,143,.8)"}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:"y",plugins:{legend:{display:true},tooltip:{callbacks:{title:(items)=>items[0].label}}},scales:{x:{title:{display:true,text:"Clicks delta"}}}}});}
</script></body></html>`;
}
