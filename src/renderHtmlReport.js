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

function formatUrlLabel(url) {
  if (!url) return "—";

  const normalized = String(url);
  if (normalized.length <= 56) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    const pathLabel = `${parsed.pathname || "/"}${parsed.search || ""}`;
    return pathLabel.length > 1 ? pathLabel : normalized;
  } catch {
    return normalized;
  }
}

function linkedUrl(url) {
  if (!url) return "—";
  return `<a href="${escapeHtml(url)}" title="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(formatUrlLabel(url))}</a>`;
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

  return `<div class="table-scroll"><table><thead>${mapper.header}</thead><tbody>${items.map((item, index) => mapper.row(item, index)).join("\n")}</tbody></table></div>`;
}

function renderTabbedTables({ id, title, description, tabs = [] }) {
  const safeId = String(id || "report-tabs").replace(/[^a-zA-Z0-9_-]/g, "-");
  const safeTabs = tabs.filter((tab) => tab && tab.id && tab.label);

  if (!safeTabs.length) {
    return `<section><h2>${escapeHtml(title)}</h2><p class="empty">No table options are available for this section.</p></section>`;
  }

  const tabButtons = safeTabs.map((tab, index) => {
    const tabId = `${safeId}-${tab.id}`;
    const activeClass = index === 0 ? " active" : "";
    const selected = index === 0 ? "true" : "false";
    return `<button class="report-tab-button${activeClass}" type="button" data-tab-target="${escapeHtml(tabId)}" aria-controls="${escapeHtml(tabId)}" aria-selected="${selected}">${escapeHtml(tab.label)}</button>`;
  }).join("");

  const tabPanels = safeTabs.map((tab, index) => {
    const tabId = `${safeId}-${tab.id}`;
    const hidden = index === 0 ? "" : " hidden";
    return `<div class="report-tab-panel" id="${escapeHtml(tabId)}" role="tabpanel"${hidden}>${tab.html || `<p class="empty">No table content is available for this option.</p>`}</div>`;
  }).join("");

  return `<section data-tab-group="${escapeHtml(safeId)}">
    <h2>${escapeHtml(title)}</h2>
    ${description ? `<p class="muted">${escapeHtml(description)}</p>` : ""}
    <div class="report-tabs" role="tablist" aria-label="${escapeHtml(title)} options">${tabButtons}</div>
    ${tabPanels}
  </section>`;
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
    header: "<tr><th>#</th><th>URL</th><th>Current clicks</th><th>Previous clicks</th><th>Click Δ</th><th>Current impressions</th><th>Avg position</th><th>Position change</th></tr>",
    row: (item, idx) => `<tr><td>${idx + 1}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatNumber(item.currentClicks)}</td><td>${formatNumber(item.previousClicks)}</td><td class="${deltaClass(item.clickDelta)}">${formatSigned(item.clickDelta)}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatPosition(item.currentPosition)}</td><td class="${deltaClass(item.positionChange)}">${formatSigned(item.positionChange, 2)}</td></tr>`,
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
  </section>
  ${renderTabbedTables({
    id: "outstanding-urls-3-months",
    title: "Outstanding URLs In Current 3 Months",
    tabs: [
      { id: "clicks", label: "By Clicks", html: urlComparisonTable(perf.outstandingUrls.topByClicks) },
      { id: "impressions", label: "By Impressions", html: urlComparisonTable(perf.outstandingUrls.topByImpressions) },
      { id: "fastest-growing", label: "Fastest Growing", html: urlComparisonTable(perf.outstandingUrls.fastestGrowing) },
      { id: "fastest-declining", label: "Fastest Declining", html: urlComparisonTable(perf.outstandingUrls.fastestDeclining) },
    ],
  })}`;
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
  const lowCtrTable = rowsToTable(snapshot.highImpressionLowCtr, {
    header: "<tr><th>#</th><th>URL</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Avg position</th><th>Recommendation</th></tr>",
    row: (item, idx) => `<tr><td>${idx + 1}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatNumber(item.impressions)}</td><td>${formatNumber(item.clicks)}</td><td>${formatPct(item.ctr)}</td><td>${formatPosition(item.position)}</td><td>${escapeHtml(item.recommendation)}</td></tr>`,
  });

  return renderTabbedTables({
    id: "content-opportunity-snapshot",
    title: "Content Opportunity Snapshot",
    description: snapshot.note || "Switch between URL opportunity views without rendering every wide table at once.",
    tabs: [
      { id: "growing-urls", label: "Growing URLs", html: urlComparisonTable(snapshot.topGrowingUrls) },
      { id: "declining-urls", label: "Declining URLs", html: urlComparisonTable(snapshot.topDecliningUrls) },
      { id: "low-ctr", label: "Low CTR", html: lowCtrTable },
      { id: "new-rising-urls", label: "New/Rising URLs", html: urlComparisonTable(snapshot.newRisingUrls) },
    ],
  });
}

function movementTable(rows, emptyMessage) {
  return rowsToTable(rows, {
    header: "<tr><th>#</th><th>URL</th><th>Current clicks</th><th>Previous clicks</th><th>Click Δ</th><th>Current impressions</th><th>Avg position</th><th>Position change</th></tr>",
    row: (item, idx) => `<tr><td>${idx + 1}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatNumber(item.currentClicks)}</td><td>${formatNumber(item.previousClicks)}</td><td class="${deltaClass(item.clickDelta)}">${formatSigned(item.clickDelta)}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatPosition(item.currentPosition)}</td><td class="${deltaClass(item.positionChange)}">${formatSigned(item.positionChange, 2)}</td></tr>`,
  }, emptyMessage);
}

function renderUrlMovement(movement) {
  const note = [
    movement.hasPreviousData ? "" : "Previous 30-day comparison may be limited by fetched data range.",
    `Window compare: ${rangeLabel(movement.currentRange)} vs ${rangeLabel(movement.previousRange)}`,
  ].filter(Boolean).join(" ");

  return renderTabbedTables({
    id: "gsc-url-movement-30-days",
    title: "GSC URL Movement - Last 30 Days vs Previous 30 Days",
    description: note,
    tabs: [
      { id: "trending-up", label: "Trending Up", html: movementTable(movement.trendingUp) },
      {
        id: "trending-down",
        label: "Trending Down",
        html: movement.trendingDown.length
          ? movementTable(movement.trendingDown)
          : `<p class="note-box">${escapeHtml(movement.emptyDeclineMessage)}</p>${movementTable(movement.smallDeclines, "No meaningful declines detected for this filter.")}`,
      },
    ],
  });
}

function renderAiUnavailable(aiInsights) {
  const diagnostics = aiInsights?.diagnostics || {};
  const debugDetails = process.env.NODE_ENV !== "production" && Object.keys(diagnostics).length
    ? `<details class="note-box"><summary>OpenRouter debug (non-production)</summary><pre>${escapeHtml(JSON.stringify(diagnostics, null, 2))}</pre></details>`
    : "";

  return `<p class="empty">${escapeHtml(aiInsights?.message || "OpenRouter AI insight failed, but the SEO report was generated.")}</p>${debugDetails}`;
}

function renderAiInsights(aiInsights) {
  return `<section>
    <h2>OpenRouter AI SEO Insights</h2>
    ${aiInsights.available ? `
      ${aiInsights.parseError ? `<p class="note-box">${escapeHtml(aiInsights.parseError)}</p>` : ""}
      ${aiInsights.rawText && aiInsights.parseError ? `<details class="note-box" open><summary>Raw OpenRouter response</summary><pre>${escapeHtml(aiInsights.rawText)}</pre></details>` : ""}
      <div class="two-col">
        <div><h3>Executive Summary</h3>${aiList(aiInsights.executiveSummary)}</div>
        <div><h3>What Changed</h3>${rowsToTable(aiInsights.whatChanged || [], {
          header: "<tr><th>Finding</th><th>Evidence</th><th>Impact</th></tr>",
          row: (item) => `<tr><td>${escapeHtml(item.finding)}</td><td>${escapeHtml(item.evidence)}</td><td>${priorityBadge(item.impact)}</td></tr>`,
        })}</div>
        <div><h3>Risks</h3>${rowsToTable(aiInsights.risks || [], {
          header: "<tr><th>Risk</th><th>Evidence</th><th>Recommended action</th></tr>",
          row: (item) => `<tr><td>${escapeHtml(item.risk)}</td><td>${escapeHtml(item.evidence)}</td><td>${escapeHtml(item.recommendedAction)}</td></tr>`,
        })}</div>
        <div><h3>Opportunities</h3>${rowsToTable(aiInsights.opportunities || [], {
          header: "<tr><th>Opportunity</th><th>Evidence</th><th>Recommended action</th></tr>",
          row: (item) => `<tr><td>${escapeHtml(item.opportunity)}</td><td>${escapeHtml(item.evidence)}</td><td>${escapeHtml(item.recommendedAction)}</td></tr>`,
        })}</div>
      </div>
      <h3 style="margin-top:12px;">Recommendation Actions</h3>
      ${rowsToTable(aiInsights.recommendationActions || [], {
        header: "<tr><th>Priority</th><th>Action</th><th>Target URL</th><th>Target query</th><th>Why</th><th>Expected impact</th><th>Effort</th></tr>",
        row: (item) => `<tr><td>${priorityBadge(item.priority)}</td><td>${escapeHtml(item.action)}</td><td class="url">${linkedUrl(item.targetUrl)}</td><td>${escapeHtml(item.targetQuery)}</td><td>${escapeHtml(item.why)}</td><td>${escapeHtml(item.expectedImpact)}</td><td>${escapeHtml(item.effort)}</td></tr>`,
      })}
      <h3 style="margin-top:12px;">Content Refresh Plan</h3>
      ${rowsToTable(aiInsights.contentRefreshPlan || [], {
        header: "<tr><th>URL</th><th>Reason</th><th>Update suggestion</th><th>Supporting queries</th></tr>",
        row: (item) => `<tr><td class="url">${linkedUrl(item.url)}</td><td>${escapeHtml(item.reason)}</td><td>${escapeHtml(item.updateSuggestion)}</td><td>${escapeHtml((item.supportingQueries || []).join(", "))}</td></tr>`,
      })}
      <h3 style="margin-top:12px;">Next Report Focus</h3>${aiList(aiInsights.nextReportFocus)}
    ` : renderAiUnavailable(aiInsights)}
  </section>`;
}

function keywordOpportunityTable(rows, { queryKey = "query", urlKey = "url", positionKey = "currentAvgPosition", impressionsKey = "currentImpressions", clicksKey = "currentClicks", ctrKey = "currentCtr", priorityKey = "priority", recommendationKey = "recommendation" } = {}) {
  return rowsToTable(rows, {
    header: "<tr><th>Query</th><th>URL</th><th>Position</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Priority</th><th>Recommendation</th></tr>",
    row: (item) => `<tr><td>${escapeHtml(item[queryKey])}</td><td class="url">${linkedUrl(item[urlKey])}</td><td>${formatPosition(item[positionKey])}</td><td>${formatNumber(item[impressionsKey])}</td><td>${formatNumber(item[clicksKey])}</td><td>${formatPct(item[ctrKey])}</td><td>${priorityBadge(item[priorityKey] || "medium")}</td><td>${escapeHtml(item[recommendationKey] || item.actionHint || "Review this opportunity and prioritize next SEO action.")}</td></tr>`,
  });
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

  return renderTabbedTables({
    id: "keyword-query-opportunities",
    title: "Keyword / Query Opportunities",
    description: keywordCsvDownloadUrl ? "Use the tabs to review one keyword table at a time, or download the CSV for the full export." : "Use the tabs to review one keyword table at a time.",
    tabs: [
      {
        id: "tracked-keywords",
        label: "Tracked Keywords",
        html: `${keywordCsvDownloadUrl ? `<p><a class="download-link" href="${escapeHtml(keywordCsvDownloadUrl)}">Download keyword CSV</a></p>` : ""}${keywordOpportunityTable(trackedKeywordMovements, { queryKey: "keyword", urlKey: "bestCurrentUrl", recommendationKey: "actionHint" })}`,
      },
      { id: "ranking-drops", label: "Ranking Drops", html: keywordOpportunityTable(highImpressionDrops) },
      { id: "near-page-1", label: "Near Page 1", html: keywordOpportunityTable(nearPageOneKeywords) },
      { id: "ctr-opportunities", label: "CTR Opportunities", html: keywordOpportunityTable(ctrOpportunities) },
      { id: "winners", label: "Winners", html: keywordOpportunityTable(keywordWinners) },
    ],
  });
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

export function renderHtmlReport({ insights, sourceInfo, keywordInsights = {}, keywordCsvDownloadUrl = "", reportDownloadUrl = "" }) {
  const overview = insights.selectedPeriodOverview;
  const perf = insights.performance3MonthComparison;
  const contribution = insights.last30Contribution;
  const snapshot = insights.contentOpportunitySnapshot;
  const movement = insights.urlMovement30Days;
  const sixMonths = insights.url6MonthInsights;
  const aiInsights = keywordInsights.aiInsights || { available: false, message: "AI insight not requested." };
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
*{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;font-family:"IBM Plex Sans",sans-serif;color:var(--ink);background:radial-gradient(circle at 8% 12%,rgba(255,123,84,.28),transparent 28%),radial-gradient(circle at 86% 4%,rgba(21,96,100,.2),transparent 32%),linear-gradient(140deg,var(--bg-1),var(--bg-2))}.wrapper{width:min(1220px,95vw);margin:0 auto;padding:28px 0 60px}header{background:linear-gradient(120deg,rgba(16,32,39,.95),rgba(21,96,100,.86));color:#fff;border-radius:20px;padding:28px;margin-bottom:18px;overflow:hidden;box-shadow:0 18px 40px rgba(12,22,26,.25)}h1,h2,h3{font-family:"Space Grotesk",sans-serif;letter-spacing:-.01em;margin:0}h1{font-size:clamp(1.4rem,3vw,2rem)}h2{font-size:clamp(1.1rem,2.4vw,1.4rem);margin-bottom:10px}h3{font-size:1rem;margin-bottom:8px}.meta{margin-top:8px;color:rgba(255,255,255,.9);font-size:.95rem;display:flex;flex-wrap:wrap;gap:14px}section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:16px;backdrop-filter:blur(8px);max-width:100%;overflow:hidden}.two-col{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:10px}.kpi{background:rgba(255,255,255,.8);border:1px solid var(--line);border-radius:12px;padding:10px}.kpi span{display:block;font-size:.8rem;color:var(--muted)}.kpi strong{font-size:1rem}.kpi small{display:block;margin-top:4px}.up{color:var(--up);font-weight:700}.down{color:var(--down);font-weight:700}.flat{color:var(--flat);font-weight:700}.chart-box{height:320px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px}.table-scroll{overflow-x:auto;max-width:100%;border-radius:12px}.table-scroll table{min-width:880px}table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.74);border-radius:12px;overflow:hidden}th,td{text-align:left;border-bottom:1px solid var(--line);padding:8px;vertical-align:top}th{background:rgba(16,32,39,.94);color:#fff;font-weight:600}td.url{width:34%;max-width:340px;word-break:break-word;overflow-wrap:anywhere;font-size:.84rem;line-height:1.35}td.url a{color:var(--accent);font-weight:600;text-decoration:none}.muted,.empty{color:var(--muted);font-size:.88rem}.note-box{border-left:4px solid var(--accent);padding:10px 12px;background:rgba(184,216,216,.28);border-radius:10px;color:var(--muted)}.note-box.danger{border-color:rgba(179,54,54,.45);background:rgba(179,54,54,.09)}.report-actions{margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap}.action-link,.download-link{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:10px 14px;color:#fff;background:var(--accent);font-weight:700;text-decoration:none;box-shadow:0 10px 24px rgba(21,96,100,.22);border:1px solid rgba(21,96,100,.1)}.action-link.secondary{background:#fff;color:var(--accent);border-color:rgba(21,96,100,.28);box-shadow:none}.action-link.disabled{background:rgba(106,114,128,.15);color:var(--flat);box-shadow:none;cursor:not-allowed}.empty-table{border:1px dashed rgba(79,98,114,.35);border-radius:12px;background:rgba(255,255,255,.72);padding:16px;color:var(--muted)}.empty-table strong{display:block;color:var(--ink);margin-bottom:4px}.priority{display:inline-block;border-radius:999px;padding:2px 8px;font-size:.75rem;font-weight:700;text-transform:uppercase;background:rgba(106,114,128,.16)}.priority-high{background:rgba(179,54,54,.16);color:var(--down)}.priority-medium{background:rgba(255,123,84,.2);color:#8a3f1d}.priority-low{background:rgba(31,122,31,.14);color:var(--up)}.report-tabs{display:flex;gap:8px;margin:14px 0 12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}.report-tab-button{appearance:none;border:1px solid rgba(21,96,100,.28);border-radius:999px;background:#fff;color:var(--accent);cursor:pointer;flex:0 0 auto;font:700 .88rem "IBM Plex Sans",sans-serif;padding:9px 14px;transition:background .18s ease,color .18s ease,box-shadow .18s ease}.report-tab-button.active{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 8px 18px rgba(21,96,100,.22)}.report-tab-button:focus-visible{outline:3px solid rgba(255,123,84,.45);outline-offset:2px}.report-tab-panel{max-width:100%}.report-tab-panel[hidden]{display:none!important}@media(max-width:700px){.wrapper{width:94vw;padding-top:16px}header,section{padding:14px}.two-col{grid-template-columns:1fr}.kpis{grid-template-columns:1fr}.report-tabs{margin-left:-2px;margin-right:-2px;padding:0 2px 6px}.report-tab-button{padding:8px 12px;font-size:.84rem}th,td{font-size:.83rem;padding:7px}.table-scroll table{min-width:760px}td.url{max-width:240px;font-size:.84rem}.chart-box{height:260px}}
</style></head><body><div class="wrapper">
  <div class="report-actions" aria-label="Report actions"><a class="action-link secondary" href="/">Back to dashboard</a><a class="action-link" href="/reports/new">Create another report</a>${reportDownloadUrl ? `<a class="action-link secondary" href="/reports">Saved in report history</a><a class="download-link" href="${escapeHtml(reportDownloadUrl)}">Download HTML + CSS + Script</a>` : ""}${keywordCsvDownloadUrl ? `<a class="download-link" href="${escapeHtml(keywordCsvDownloadUrl)}">Download keyword CSV</a>` : ""}</div>
  <header><h1>SEO Insight Report</h1><div class="meta"><span>Generated: ${escapeHtml(insights.generatedAt)}</span><span>Source: ${escapeHtml(sourceInfo.label)}</span><span>Property: ${escapeHtml(sourceInfo.property)}</span><span>Date range: ${escapeHtml(rangeLabel(sourceInfo.range))}</span><span>Data span: ${escapeHtml(insights.dataSpan ? rangeLabel(insights.dataSpan) : "No data")}</span></div></header>
  <section><h2>Active Filters</h2>${dataDelayNote ? `<p class="note-box" style="margin-bottom:10px;">${escapeHtml(dataDelayNote)}</p>` : ""}<div class="kpis"><div class="kpi"><span>Property</span><strong>${escapeHtml(sourceInfo.property || "—")}</strong></div><div class="kpi"><span>Search type</span><strong>${escapeHtml(filters.searchType || "web")}</strong></div><div class="kpi"><span>Date range</span><strong>${escapeHtml(rangeLabel(sourceInfo.range))}</strong></div><div class="kpi"><span>Fetched analysis range</span><strong>${escapeHtml(rangeLabel(diagnostics.queryRange))}</strong></div><div class="kpi"><span>Report period</span><strong>${escapeHtml(filters.reportPeriodLabel || filters.reportPeriod || "custom")}</strong></div><div class="kpi"><span>Page contains filter</span><strong>${escapeHtml(filters.pageContains || "None")}</strong></div><div class="kpi"><span>Tracked keyword count</span><strong>${formatNumber(filters.trackedKeywordCount || 0)}</strong></div></div></section>
  ${renderEmptyReportSection({ sourceInfo, filters, diagnostics })}
  ${renderAiInsights(aiInsights)}
  ${renderOverview(overview)}
  ${renderPerformance3Months(perf)}
  ${renderLast30Contribution(contribution)}
  ${renderContentSnapshot(snapshot)}
  ${renderUrlMovement(movement)}
  ${renderKeywordSections(keywordInsights, keywordCsvDownloadUrl)}
  ${render6MonthSignals(sixMonths)}
  <section><h2>Appendix / Raw tables</h2>${insights.dataAvailabilityNotes?.length ? `<ul>${insights.dataAvailabilityNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : `<p class="empty">Enough fetched data is available for the core comparisons.</p>`}<div class="kpis"><div class="kpi"><span>Raw page rows</span><strong>${formatNumber(diagnostics.pageRowCount || 0)}</strong></div><div class="kpi"><span>Coalesced page rows</span><strong>${formatNumber(diagnostics.coalescedPageRowCount || 0)}</strong></div><div class="kpi"><span>Keyword rows</span><strong>${formatNumber(diagnostics.keywordRowCount || 0)}</strong></div><div class="kpi"><span>GSC delay days</span><strong>${diagnostics.gscDataDelayDays ?? "—"}</strong></div><div class="kpi"><span>Page filter applied</span><strong>${yesNo(Boolean(diagnostics.pageContainsApplied ?? filters.pageContains))}</strong></div></div><p class="muted">Report tables above are generated from compact GSC page and query summaries. Full raw GSC rows are not exposed to OpenRouter AI.</p></section>
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
document.querySelectorAll("[data-tab-group]").forEach((group)=>{
  const buttons=Array.from(group.querySelectorAll("[data-tab-target]"));
  const panels=Array.from(group.querySelectorAll(".report-tab-panel"));
  buttons.forEach((button)=>{
    button.addEventListener("click",()=>{
      const targetId=button.getAttribute("data-tab-target");
      buttons.forEach((item)=>{item.classList.remove("active");item.setAttribute("aria-selected","false");});
      panels.forEach((panel)=>{panel.hidden=panel.id!==targetId;});
      button.classList.add("active");
      button.setAttribute("aria-selected","true");
    });
  });
});
</script></body></html>`;
}
