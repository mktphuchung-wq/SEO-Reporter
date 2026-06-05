import { escapeHtml } from "./ui/html.js";

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatPct(value, digits = 2) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

function formatPoint(value, digits = 2) {
  return `${formatSigned(Number(value || 0) * 100, digits)}pt`;
}

function formatSigned(value, digits = 0) {
  if (value === null || value === undefined) {
    return "N/A";
  }
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(digits)}`;
}

function formatDeltaPercent(deltaPercent, unavailableLabel = "new") {
  if (deltaPercent === null || deltaPercent === undefined) {
    return unavailableLabel;
  }
  const sign = deltaPercent > 0 ? "+" : "";
  return `${sign}${Number(deltaPercent || 0).toFixed(1)}%`;
}

function formatPosition(value) {
  return value === null || value === undefined ? "—" : Number(value || 0).toFixed(2);
}

function deltaClass(value) {
  if (value === null || value === undefined) {
    return "";
  }
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
  if (!range) return "—";
  return range.label ? `${range.label} (${range.start} -> ${range.end})` : `${range.start} -> ${range.end}`;
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function dataSpanLabel(insights = {}, diagnostics = {}) {
  if (insights.dataSpan) {
    return rangeLabel(insights.dataSpan);
  }
  const rowCount = Number(diagnostics.coalescedPageRowCount || diagnostics.pageRowCount || 0) + Number(diagnostics.keywordRowCount || 0);
  return rowCount > 0 ? "Data dates unavailable" : "No page or keyword data available";
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
    return `<button class="report-tab-button${activeClass}" type="button" role="tab" data-tab-target="${escapeHtml(tabId)}" aria-controls="${escapeHtml(tabId)}" aria-selected="${selected}" tabindex="${index === 0 ? "0" : "-1"}">${escapeHtml(tab.label)}</button>`;
  }).join("");

  const tabPanels = safeTabs.map((tab, index) => {
    const tabId = `${safeId}-${tab.id}`;
    const hidden = index === 0 ? "" : " hidden";
    return `<div class="report-tab-panel${index === 0 ? " is-active" : ""}" id="${escapeHtml(tabId)}" role="tabpanel" tabindex="${index === 0 ? "0" : "-1"}"${hidden}>${tab.html || `<p class="empty">No table content is available for this option.</p>`}</div>`;
  }).join("");

  return `<section data-tab-group="${escapeHtml(safeId)}">
    <h2>${escapeHtml(title)}</h2>
    ${description ? `<p class="muted">${escapeHtml(description)}</p>` : ""}
    <p class="muted tab-helper">Chọn một chế độ xem để tập trung vào nhóm dữ liệu quan trọng nhất.</p>
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
  const hasPreviousData = overview.hasPreviousData !== false;
  const metricRows = hasPreviousData
    ? [
        ["Clicks", formatNumber(overview.current.clicks), formatNumber(overview.previous.clicks), formatSigned(overview.delta.clicks.absolute), formatDeltaPercent(overview.delta.clicks.percent), overview.delta.clicks.absolute],
        ["Impressions", formatNumber(overview.current.impressions), formatNumber(overview.previous.impressions), formatSigned(overview.delta.impressions.absolute), formatDeltaPercent(overview.delta.impressions.percent), overview.delta.impressions.absolute],
        ["CTR", formatPct(overview.current.ctr), formatPct(overview.previous.ctr), formatPoint(overview.delta.ctr.absolute), formatDeltaPercent(overview.delta.ctr.percent), overview.delta.ctr.absolute],
        ["Avg Position", formatPosition(overview.current.position), formatPosition(overview.previous.position), formatSigned(overview.delta.position.absolute, 2), formatDeltaPercent(overview.delta.position.percent), overview.delta.position.absolute],
      ]
    : [
        ["Clicks", formatNumber(overview.current.clicks), "Previous period unavailable", "—", "—", null],
        ["Impressions", formatNumber(overview.current.impressions), "Previous period unavailable", "—", "—", null],
        ["CTR", formatPct(overview.current.ctr), "Previous period unavailable", "—", "—", null],
        ["Avg Position", formatPosition(overview.current.position), "Previous period unavailable", "—", "—", null],
      ];

  return `<section>
    <h2>Report Period Overview</h2>
    ${overview.note ? `<p class="note-box">${escapeHtml(overview.note)}</p>` : ""}
    <div class="kpis">
      <div class="kpi"><span>Selected report period</span><strong>${escapeHtml(rangeLabel(overview.currentRange))}</strong></div>
      <div class="kpi"><span>Previous comparable period</span><strong>${hasPreviousData ? escapeHtml(rangeLabel(overview.previousRange)) : "Unavailable"}</strong></div>
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

function currentOnlyUrlTable(rows) {
  return rowsToTable(rows, {
    header: "<tr><th>#</th><th>URL</th><th>Current clicks</th><th>Current impressions</th><th>CTR</th><th>Avg position</th></tr>",
    row: (item, idx) => `<tr><td>${idx + 1}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatNumber(item.currentClicks)}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatPct(item.currentCtr)}</td><td>${formatPosition(item.currentPosition)}</td></tr>`,
  });
}

function renderPerformance3Months(perf, { filters = {}, sourceInfo = {} } = {}) {
  const isQuarterly = isQuarterlyReportContext(filters, sourceInfo);
  const periodNoun = isQuarterly ? "quarter" : "3 months";
  const performanceTitle = isQuarterly ? "SEO Performance - Current Quarter vs Previous Quarter" : "SEO Performance - Last 3 Months vs Previous 3 Months";
  const hasPreviousData = Boolean(perf.hasPreviousData && perf.delta);
  const outstandingUrls = perf.outstandingUrls || {};
  const growthCounts = perf.growthCounts || {};
  const deltaLabel = (metric, formatter = formatSigned) => {
    if (!hasPreviousData) {
      return '<small>Previous period unavailable</small>';
    }
    const delta = perf.delta?.[metric];
    if (!delta) {
      return '<small>Previous period unavailable</small>';
    }
    const value = metric === "ctr" ? formatPoint(delta.absolute) : formatter(delta.absolute);
    const pct = metric === "clicks" || metric === "impressions" ? ` (${formatDeltaPercent(delta.percent, "N/A")})` : "";
    return `<small class="${deltaClass(delta.absolute)}">${value}${pct}</small>`;
  };
  const growthValue = (value) => hasPreviousData ? formatNumber(value) : "Previous period unavailable";
  const chartUnavailableNote = '<p class="note-box">Chart unavailable because this report does not include daily/monthly series.</p>';
  const hasDailySeries = Array.isArray(perf.dailySeries) && perf.dailySeries.length > 0;
  const hasMonthlySeries = Array.isArray(perf.monthly) && perf.monthly.length > 0;
  const chartHtml = hasDailySeries || hasMonthlySeries
    ? `<div class="two-col" style="margin-top:12px;">${hasDailySeries ? '<div class="chart-box"><canvas id="dailyChart"></canvas></div>' : chartUnavailableNote}${hasMonthlySeries ? '<div class="chart-box"><canvas id="monthlyChart"></canvas></div>' : chartUnavailableNote}</div>`
    : chartUnavailableNote;
  const tableRenderer = hasPreviousData ? urlComparisonTable : currentOnlyUrlTable;

  return `<section>
    <h2>${escapeHtml(performanceTitle)}</h2>
    ${perf.note ? `<p class="note-box">${escapeHtml(perf.note)}</p>` : ""}
    <p class="muted">Current: ${escapeHtml(rangeLabel(perf.currentRange))} | Previous: ${hasPreviousData ? escapeHtml(rangeLabel(perf.previousRange)) : "Previous period unavailable"}</p>
    <div class="kpis">
      <div class="kpi"><span>Current clicks</span><strong>${formatNumber(perf.current.clicks)}</strong>${deltaLabel("clicks")}</div>
      <div class="kpi"><span>Current impressions</span><strong>${formatNumber(perf.current.impressions)}</strong>${deltaLabel("impressions")}</div>
      <div class="kpi"><span>CTR</span><strong>${formatPct(perf.current.ctr)}</strong>${deltaLabel("ctr")}</div>
      <div class="kpi"><span>Avg position</span><strong>${formatPosition(perf.current.position)}</strong>${deltaLabel("position", (value) => formatSigned(value, 2))}</div>
      <div class="kpi"><span>URLs growth &gt; 20%</span><strong>${growthValue(growthCounts.clickGrowthOver20)}</strong></div>
      <div class="kpi"><span>URLs loss &gt; 20%</span><strong>${growthValue(growthCounts.clickLossOver20)}</strong></div>
      <div class="kpi"><span>Newly gaining clicks</span><strong>${growthValue(growthCounts.newlyGainingClicks)}</strong></div>
      <div class="kpi"><span>Dropped to zero clicks</span><strong>${growthValue(growthCounts.droppedToZeroClicks)}</strong></div>
    </div>
    ${chartHtml}
  </section>
  ${renderTabbedTables({
    id: "outstanding-urls-3-months",
    title: `Outstanding URLs In Current ${periodNoun}`,
    description: hasPreviousData ? `Compared against the previous ${periodNoun} period.` : "Previous period unavailable; showing current-period metrics only.",
    tabs: [
      { id: "clicks", label: "By Clicks", html: tableRenderer(outstandingUrls.topByClicks) },
      { id: "impressions", label: "By Impressions", html: tableRenderer(outstandingUrls.topByImpressions) },
      { id: "fastest-growing", label: "Fastest Growing", html: hasPreviousData ? urlComparisonTable(outstandingUrls.fastestGrowing) : '<p class="empty">Previous period unavailable</p>' },
      { id: "fastest-declining", label: "Fastest Declining", html: hasPreviousData ? urlComparisonTable(outstandingUrls.fastestDeclining) : '<p class="empty">Previous period unavailable</p>' },
    ],
  })}`;
}

function renderLast30Contribution(contribution, { filters = {}, sourceInfo = {} } = {}) {
  const isQuarterly = isQuarterlyReportContext(filters, sourceInfo);
  const periodLabel = isQuarterly ? "Current quarter" : "Current 3 months";
  return `<section>
    <h2>Last 30 Days Contribution Within ${escapeHtml(periodLabel)}</h2>
    <div class="kpis">
      <div class="kpi"><span>Last 30 clicks</span><strong>${formatNumber(contribution.last30Clicks)}</strong></div>
      <div class="kpi"><span>${escapeHtml(periodLabel)} clicks</span><strong>${formatNumber(contribution.current3MonthClicks)}</strong></div>
      <div class="kpi"><span>Last 30 click share</span><strong>${contribution.last30ClickShare.toFixed(1)}%</strong></div>
      <div class="kpi"><span>Last 30 impressions</span><strong>${formatNumber(contribution.last30Impressions)}</strong></div>
      <div class="kpi"><span>${escapeHtml(periodLabel)} impressions</span><strong>${formatNumber(contribution.current3MonthImpressions)}</strong></div>
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



function reasonTags(tags) {
  const list = Array.isArray(tags) ? tags : [tags].filter(Boolean);
  return list.length ? list.map((tag) => `<span class="reason-tag">${escapeHtml(tag)}</span>`).join(" ") : '<span class="reason-tag">Review</span>';
}

function isMonthlyReport(filters = {}) {
  const explicitReportType = ["monthly", "quarterly", "custom"].includes(filters.reportType) ? filters.reportType : null;
  return explicitReportType ? explicitReportType === "monthly" : filters.reportPeriod === "monthly" || filters.reportPeriod === "30d";
}

function isQuarterlyReportContext(filters = {}, sourceInfo = {}) {
  return filters.reportType === "quarterly" || sourceInfo.reportType === "quarterly";
}

function monthlyMetricKpi(label, metric, { formatter = formatNumber, deltaFormatter = formatSigned, showPercent = true, deltaKey = "delta" } = {}) {
  const hasPreviousData = Boolean(metric?.previous !== null && metric?.previous !== undefined && metric?.[deltaKey] !== null && metric?.[deltaKey] !== undefined);
  const delta = metric?.[deltaKey];
  const deltaText = hasPreviousData
    ? `${deltaFormatter(delta)}${showPercent && metric.deltaPercent !== null && metric.deltaPercent !== undefined ? ` (${formatDeltaPercent(metric.deltaPercent, "N/A")})` : ""}`
    : "Previous month unavailable";
  return `<div class="kpi"><span>${escapeHtml(label)}</span><strong>${formatter(metric?.current)}</strong><small>${hasPreviousData ? `Previous: ${formatter(metric.previous)}` : "Current month only"}</small><small class="${hasPreviousData ? deltaClass(delta) : "flat"}">${deltaText}</small></div>`;
}

function summarySignalList(items = []) {
  if (!items.length) {
    return '<p class="empty">No meaningful items found for this month.</p>';
  }
  return `<ol class="summary-list">${items.map((item) => `<li><strong>${escapeHtml(item.type || "URL")}:</strong> ${item.url ? linkedUrl(item.url) : escapeHtml(item.label || "—")} ${item.url && item.label && item.label !== item.url ? `<span class="muted">${escapeHtml(item.label)}</span>` : ""}<br><span class="muted">Clicks Δ: ${formatSigned(item.clickDelta)} · Impressions: ${formatNumber(item.currentImpressions)} · CTR: ${formatPct(item.ctr)} · Avg position: ${formatPosition(item.avgPosition)} · ${escapeHtml(item.reason || "Review")}</span></li>`).join("")}</ol>`;
}

function renderMonthlyExecutiveSummary(summary = {}, filters = {}) {
  if (!isMonthlyReport(filters)) {
    return "";
  }
  const metrics = summary.metricSummary || {};
  return `<section>
    <h2>Monthly Executive Summary</h2>
    ${metrics.warning ? `<p class="note-box">${escapeHtml(metrics.warning)}</p>` : ""}
    <div class="kpis">
      <div class="kpi"><span>Current month</span><strong>${escapeHtml(summary.currentMonthLabel || "—")}</strong></div>
      <div class="kpi"><span>Previous month</span><strong>${metrics.hasPreviousData ? escapeHtml(summary.previousMonthLabel || "—") : "Unavailable"}</strong></div>
      ${monthlyMetricKpi("Organic clicks", metrics.clicks, { formatter: formatNumber })}
      ${monthlyMetricKpi("Impressions", metrics.impressions, { formatter: formatNumber })}
      ${monthlyMetricKpi("CTR", metrics.ctr, { formatter: formatPct, deltaFormatter: formatPoint, showPercent: false, deltaKey: "pointDelta" })}
      ${monthlyMetricKpi("Avg position", metrics.position, { formatter: formatPosition, deltaFormatter: (value) => formatSigned(value, 2), showPercent: false, deltaKey: "positionChange" })}
    </div>
    <div class="two-col" style="margin-top:14px;">
      <div><h3>Top 3 wins</h3>${metrics.hasPreviousData ? summarySignalList(summary.topWins) : '<p class="empty">Previous month unavailable; wins require comparison data.</p>'}</div>
      <div><h3>Top 3 losses</h3>${metrics.hasPreviousData ? summarySignalList(summary.topLosses) : '<p class="empty">Previous month unavailable; losses require comparison data.</p>'}</div>
    </div>
    <div style="margin-top:14px;"><h3>Top 3 opportunities</h3>${summarySignalList(summary.topOpportunities)}</div>
    <p class="note-box"><strong>Recommended focus for next month:</strong> ${escapeHtml(summary.recommendedFocus || "Prioritize the highest-impact opportunities above.")}</p>
  </section>`;
}

function monthlyUrlTable(rows = []) {
  return rowsToTable(rows, {
    header: "<tr><th>#</th><th>URL</th><th>Current clicks</th><th>Previous clicks</th><th>Click delta</th><th>Click delta %</th><th>Current impressions</th><th>CTR</th><th>Avg position</th><th>Reason tag</th></tr>",
    row: (item, idx) => `<tr><td>${idx + 1}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatNumber(item.currentClicks)}</td><td>${formatNumber(item.previousClicks)}</td><td class="${deltaClass(item.clickDelta)}">${formatSigned(item.clickDelta)}</td><td>${escapeHtml(formatDeltaPercent(item.clickPct, "N/A"))}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatPct(item.currentCtr)}</td><td>${formatPosition(item.currentPosition)}</td><td>${reasonTags(item.reasonTags || item.reasonTag)}</td></tr>`,
  });
}

function monthlyCtrOpportunityTable(rows = []) {
  return rowsToTable(rows, {
    header: "<tr><th>#</th><th>URL</th><th>Current clicks</th><th>Current impressions</th><th>CTR</th><th>Avg position</th><th>Reason</th></tr>",
    row: (item, idx) => `<tr><td>${idx + 1}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatNumber(item.clicks)}</td><td>${formatNumber(item.impressions)}</td><td>${formatPct(item.ctr)}</td><td>${formatPosition(item.position)}</td><td>${escapeHtml(item.recommendation || "High impressions with low CTR")}</td></tr>`,
  });
}

function renderMonthlyUrlWinnersLosers(monthly = {}, filters = {}) {
  if (!isMonthlyReport(filters)) {
    return "";
  }

  return renderTabbedTables({
    id: "monthly-url-winners-losers",
    title: "Month-over-Month URL Winners & Losers",
    description: monthly.note || `Compare Previous → Current: ${rangeLabel(monthly.previousRange)} → ${rangeLabel(monthly.currentRange)}. Winner/loser tables require at least 10 combined clicks or 500 combined impressions.`,
    tabs: [
      { id: "url-winners", label: "URL Winners", html: monthly.hasPreviousData ? monthlyUrlTable(monthly.urlWinners) : '<p class="empty">Previous month unavailable; URL winner deltas are hidden.</p>' },
      { id: "url-losers", label: "URL Losers", html: monthly.hasPreviousData ? monthlyUrlTable(monthly.urlLosers) : '<p class="empty">Previous month unavailable; URL loser deltas are hidden.</p>' },
      { id: "ctr-opportunities", label: "CTR Opportunities", html: monthlyCtrOpportunityTable(monthly.ctrOpportunities) },
      { id: "new-rising-urls", label: "New/Rising URLs", html: monthly.hasPreviousData ? monthlyUrlTable(monthly.newRisingUrls) : '<p class="empty">Previous month unavailable; new/rising classification is hidden.</p>' },
    ],
  });
}

function isMarkdownTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitMarkdownTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderMarkdownTable(lines) {
  if (lines.length < 2 || !isMarkdownTableDivider(lines[1])) {
    return `<pre class="markdown-pre">${escapeHtml(lines.join("\n"))}</pre>`;
  }

  const headerCells = splitMarkdownTableRow(lines[0]);
  const bodyRows = lines.slice(2).filter((line) => line.trim()).map(splitMarkdownTableRow);

  return `<table class="markdown-table"><thead><tr>${headerCells.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function flushMarkdownList(items) {
  if (!items.length) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderMarkdownLite(markdown = "") {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listItems = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.includes("|") && lines[index + 1] && isMarkdownTableDivider(lines[index + 1])) {
      html.push(flushMarkdownList(listItems));
      listItems = [];
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].trim().includes("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      html.push(renderMarkdownTable(tableLines));
      continue;
    }

    const heading2 = trimmed.match(/^##\s+(.+)$/);
    const heading3 = trimmed.match(/^###\s+(.+)$/);
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    const checkbox = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);

    if (heading2 || heading3 || (!bullet && trimmed === "")) {
      html.push(flushMarkdownList(listItems));
      listItems = [];
    }

    if (heading2) {
      html.push(`<h3>${escapeHtml(heading2[1])}</h3>`);
    } else if (heading3) {
      html.push(`<h4>${escapeHtml(heading3[1])}</h4>`);
    } else if (checkbox) {
      const checked = checkbox[1].toLowerCase() === "x" ? "☑" : "☐";
      listItems.push(`${checked} ${checkbox[2]}`);
    } else if (bullet) {
      listItems.push(bullet[1]);
    } else if (trimmed === "") {
      html.push("");
    } else {
      html.push(`<p>${escapeHtml(trimmed)}</p>`);
    }
  }

  html.push(flushMarkdownList(listItems));
  return `<div class="ai-markdown">${html.filter((item) => item !== "").join("\n")}</div>`;
}

function renderAiUnavailable(aiInsights) {
  const debug = aiInsights?.debug || "";
  const debugDetails = process.env.NODE_ENV !== "production" && debug
    ? `<details class="note-box"><summary>OpenRouter debug (non-production)</summary><pre>${escapeHtml(debug)}</pre></details>`
    : "";

  return `<p class="empty">${escapeHtml(aiInsights?.message || "OpenRouter AI insight failed, but the SEO report was generated.")}</p>${debugDetails}`;
}

function renderAiInsights(aiInsights) {
  const hasMarkdown = Boolean(aiInsights?.available && aiInsights?.markdown);

  return `<section>
    <h2>OpenRouter AI SEO Insights</h2>
    <p class="muted">AI chỉ phân tích dữ liệu đã tóm tắt, không dùng raw GSC rows.</p>
    ${hasMarkdown ? renderMarkdownLite(aiInsights.markdown) : renderAiUnavailable(aiInsights)}
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

export function renderHtmlReport({ insights, sourceInfo, keywordInsights = {}, keywordCsvDownloadUrl = "", reportDownloadUrl = "", saveReportPayload = "" }) {
  const overview = insights.selectedPeriodOverview;
  const perf = insights.performance3MonthComparison;
  const contribution = insights.last30Contribution;
  const snapshot = insights.contentOpportunitySnapshot;
  const movement = insights.urlMovement30Days;
  const monthlySummary = insights.monthlyExecutiveSummary || {};
  const monthlyUrlWinnersLosers = insights.monthlyUrlWinnersLosers || {};
  const sixMonths = insights.url6MonthInsights || {};
  const aiInsights = keywordInsights.aiInsights || { available: false, message: "AI insight not requested." };
  const filters = sourceInfo.filters || {};
  const saveReportForm = saveReportPayload ? `<form method="post" action="/reports/save" style="display:inline"><input type="hidden" name="reportPayload" value="${escapeHtml(saveReportPayload)}" /><button class="action-link" type="submit">Save Report</button></form>` : "";
  const previewBanner = saveReportPayload ? `<div class="preview-banner"><strong>Đây là bản xem trước. Báo cáo chưa được lưu.</strong><span>Save Report để lưu vào lịch sử, hoặc tạo bản xem trước mới nếu cần tinh chỉnh bộ lọc.</span></div>` : "";
  const diagnostics = sourceInfo.diagnostics || {};
  const dataDelayNote = sourceInfo.dataDelayNote || (diagnostics.gscDataDelayDays != null && sourceInfo.range?.end ? `GSC data may be delayed; report ends at ${sourceInfo.range.end}.` : null);
  const isQuarterlyReport = sourceInfo.reportType === "quarterly" || filters.reportType === "quarterly";
  const reportTypeLabel = sourceInfo.reportType === "monthly" || filters.reportType === "monthly" ? "Monthly SEO Report" : isQuarterlyReport ? "Quarterly SEO Report" : "Custom Report";
  const currentPeriodLabel = isQuarterlyReport ? "Current quarter" : "Current period";
  const previousPeriodLabel = isQuarterlyReport ? "Previous comparable quarter" : "Previous comparable period";
  const reportLabel = sourceInfo.reportLabel || reportTypeLabel;
  const previousComparableRange = sourceInfo.previousRange || diagnostics.previousRange || diagnostics.comparisonRange || keywordInsights.previousRange;
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
*{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;font-family:"IBM Plex Sans",sans-serif;color:var(--ink);background:radial-gradient(circle at 8% 12%,rgba(255,123,84,.28),transparent 28%),radial-gradient(circle at 86% 4%,rgba(21,96,100,.2),transparent 32%),linear-gradient(140deg,var(--bg-1),var(--bg-2))}.wrapper{width:min(1220px,95vw);margin:0 auto;padding:28px 0 60px}header{background:linear-gradient(120deg,rgba(16,32,39,.95),rgba(21,96,100,.86));color:#fff;border-radius:20px;padding:28px;margin-bottom:18px;overflow:hidden;box-shadow:0 18px 40px rgba(12,22,26,.25)}h1,h2,h3{font-family:"Space Grotesk",sans-serif;letter-spacing:-.01em;margin:0}h1{font-size:clamp(1.4rem,3vw,2rem)}h2{font-size:clamp(1.1rem,2.4vw,1.4rem);margin-bottom:10px}h3{font-size:1rem;margin-bottom:8px}.meta{margin-top:8px;color:rgba(255,255,255,.9);font-size:.95rem;display:flex;flex-wrap:wrap;gap:14px}section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:16px;backdrop-filter:blur(8px);max-width:100%;overflow:hidden}.two-col{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:10px}.kpi{background:rgba(255,255,255,.8);border:1px solid var(--line);border-radius:12px;padding:10px}.kpi span{display:block;font-size:.8rem;color:var(--muted)}.kpi strong{font-size:1rem}.kpi small{display:block;margin-top:4px}.up{color:var(--up);font-weight:700}.down{color:var(--down);font-weight:700}.flat{color:var(--flat);font-weight:700}.chart-box{height:320px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px}.table-scroll{overflow-x:auto;max-width:100%;border-radius:12px}.table-scroll table{min-width:880px}table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.74);border-radius:12px;overflow:hidden}th,td{text-align:left;border-bottom:1px solid var(--line);padding:8px;vertical-align:top}th{background:rgba(16,32,39,.94);color:#fff;font-weight:600}td.url{width:34%;max-width:340px;word-break:break-word;overflow-wrap:anywhere;font-size:.84rem;line-height:1.35}td.url a{color:var(--accent);font-weight:600;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}td.url a:hover{color:var(--warm)}tbody tr{transition:background .16s ease}tbody tr:hover{background:rgba(184,216,216,.18)}.muted,.empty{color:var(--muted);font-size:.88rem}.note-box{border-left:4px solid var(--accent);padding:10px 12px;background:rgba(184,216,216,.28);border-radius:10px;color:var(--muted)}.note-box.danger{border-color:rgba(179,54,54,.45);background:rgba(179,54,54,.09)}.preview-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding:12px 14px;border:1px solid rgba(255,123,84,.34);border-radius:14px;background:rgba(255,247,237,.92);color:#8a3f1d}.preview-banner span{color:var(--muted);font-size:.9rem}.report-actions{margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap}.action-link,.download-link{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:10px 14px;color:#fff;background:var(--accent);font-weight:700;text-decoration:none;box-shadow:0 10px 24px rgba(21,96,100,.22);border:1px solid rgba(21,96,100,.1);cursor:pointer;transition:transform .18s ease,background .18s ease,box-shadow .18s ease}.action-link:hover,.download-link:hover{transform:translateY(-1px);box-shadow:0 13px 26px rgba(21,96,100,.24)}.action-link:active,.download-link:active{transform:translateY(0)}.action-link:focus-visible,.download-link:focus-visible{outline:3px solid rgba(255,123,84,.45);outline-offset:2px}.action-link.secondary{background:#fff;color:var(--accent);border-color:rgba(21,96,100,.28);box-shadow:none}.action-link.disabled{background:rgba(106,114,128,.15);color:var(--flat);box-shadow:none;cursor:not-allowed}.empty-table{border:1px dashed rgba(79,98,114,.35);border-radius:12px;background:rgba(255,255,255,.72);padding:16px;color:var(--muted)}.empty-table strong{display:block;color:var(--ink);margin-bottom:4px}.priority{display:inline-block;border-radius:999px;padding:2px 8px;font-size:.75rem;font-weight:700;text-transform:uppercase;background:rgba(106,114,128,.16)}.priority-high{background:rgba(179,54,54,.16);color:var(--down)}.priority-medium{background:rgba(255,123,84,.2);color:#8a3f1d}.priority-low{background:rgba(31,122,31,.14);color:var(--up)}.reason-tag{display:inline-block;border-radius:999px;background:rgba(21,96,100,.1);color:var(--accent);font-size:.74rem;font-weight:700;margin:1px 2px 1px 0;padding:2px 7px}.summary-list{margin:0;padding-left:20px}.summary-list li{margin-bottom:8px}.report-tabs{display:flex;gap:8px;margin:14px 0 12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}.report-tab-button{appearance:none;border:1px solid rgba(21,96,100,.28);border-radius:999px;background:#fff;color:var(--accent);cursor:pointer;flex:0 0 auto;font:700 .88rem "IBM Plex Sans",sans-serif;padding:9px 14px;transition:transform .18s ease,background .18s ease,color .18s ease,box-shadow .18s ease}.report-tab-button:hover{transform:translateY(-1px)}.report-tab-button:active{transform:translateY(0)}.report-tab-button.active{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 8px 18px rgba(21,96,100,.22)}.report-tab-button:focus-visible{outline:3px solid rgba(255,123,84,.45);outline-offset:2px}.tab-helper{margin-top:-2px}.report-tab-panel{max-width:100%;opacity:0;transform:translateY(6px);transition:opacity .22s ease,transform .22s ease}.report-tab-panel.is-active{opacity:1;transform:translateY(0)}.report-tab-panel.is-leaving{opacity:0;transform:translateY(6px)}.report-tab-panel[hidden]{display:none!important}section{animation:report-card-in .28s ease both}.kpi{animation:report-card-in .28s ease both}.kpi:nth-child(2){animation-delay:.03s}.kpi:nth-child(3){animation-delay:.06s}.kpi:nth-child(4){animation-delay:.09s}@keyframes report-card-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.report-tab-panel{opacity:1;transform:none}}@media(max-width:700px){.wrapper{width:94vw;padding-top:16px}header,section{padding:14px}.two-col{grid-template-columns:1fr}.kpis{grid-template-columns:1fr}.report-tabs{margin-left:-2px;margin-right:-2px;padding:0 2px 6px}.report-tab-button{padding:8px 12px;font-size:.84rem}th,td{font-size:.83rem;padding:7px}.table-scroll table{min-width:760px}td.url{max-width:240px;font-size:.84rem}.chart-box{height:260px}}
</style></head><body><div class="wrapper">
  ${previewBanner}
  <div class="report-actions" aria-label="Report actions">${saveReportForm}<a class="action-link secondary" href="/">Back to dashboard</a><a class="action-link" href="/reports/new">Create another preview</a>${reportDownloadUrl ? `<a class="action-link secondary" href="/reports">Saved in report history</a><a class="download-link" href="${escapeHtml(reportDownloadUrl)}">Download HTML + CSS + Script</a>` : ""}${keywordCsvDownloadUrl ? `<a class="download-link" href="${escapeHtml(keywordCsvDownloadUrl)}">Download keyword CSV</a>` : ""}</div>
  <header><h1>${escapeHtml(reportLabel)}</h1><div class="meta"><span>Report type: ${escapeHtml(reportTypeLabel)}</span><span>Report label: ${escapeHtml(reportLabel)}</span><span>${escapeHtml(currentPeriodLabel)}: ${escapeHtml(rangeLabel(sourceInfo.range))}</span><span>${escapeHtml(previousPeriodLabel)}: ${escapeHtml(rangeLabel(previousComparableRange))}</span><span>Property: ${escapeHtml(sourceInfo.property)}</span><span>Search type: ${escapeHtml(filters.searchType || "web")}</span><span>Page filter: ${escapeHtml(filters.pageContains || "None")}</span><span>Generated: ${escapeHtml(insights.generatedAt)}</span><span>Source: ${escapeHtml(sourceInfo.label)}</span><span>Data span: ${escapeHtml(dataSpanLabel(insights, diagnostics))}</span></div></header>
  <section><h2>Active Filters</h2>${dataDelayNote ? `<p class="note-box" style="margin-bottom:10px;">${escapeHtml(dataDelayNote)}</p>` : ""}<div class="kpis"><div class="kpi"><span>Report type</span><strong>${escapeHtml(reportTypeLabel)}</strong></div><div class="kpi"><span>Report label</span><strong>${escapeHtml(reportLabel)}</strong></div><div class="kpi"><span>Property</span><strong>${escapeHtml(sourceInfo.property || "—")}</strong></div><div class="kpi"><span>Search type</span><strong>${escapeHtml(filters.searchType || "web")}</strong></div><div class="kpi"><span>${escapeHtml(currentPeriodLabel)}</span><strong>${escapeHtml(rangeLabel(sourceInfo.range))}</strong></div><div class="kpi"><span>${escapeHtml(previousPeriodLabel)}</span><strong>${escapeHtml(rangeLabel(previousComparableRange))}</strong></div><div class="kpi"><span>Fetched analysis range</span><strong>${escapeHtml(rangeLabel(diagnostics.queryRange))}</strong></div><div class="kpi"><span>Report period</span><strong>${escapeHtml(filters.reportPeriodLabel || filters.reportPeriod || "custom")}</strong></div><div class="kpi"><span>Page contains filter</span><strong>${escapeHtml(filters.pageContains || "None")}</strong></div><div class="kpi"><span>Tracked keyword count</span><strong>${formatNumber(filters.trackedKeywordCount || 0)}</strong></div></div></section>
  ${renderEmptyReportSection({ sourceInfo, filters, diagnostics })}
  ${renderAiInsights(aiInsights)}
  ${renderMonthlyExecutiveSummary(monthlySummary, filters)}
  ${renderOverview(overview)}
  ${renderPerformance3Months(perf, { filters, sourceInfo })}
  ${renderLast30Contribution(contribution, { filters, sourceInfo })}
  ${renderContentSnapshot(snapshot)}
  ${renderMonthlyUrlWinnersLosers(monthlyUrlWinnersLosers, filters)}
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
  const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const switchTab=(button)=>{
    if(button.classList.contains("active")) return;
    const targetId=button.getAttribute("data-tab-target");
    const currentButton=buttons.find((item)=>item.classList.contains("active"));
    const currentPanel=panels.find((panel)=>!panel.hidden&&panel.classList.contains("is-active"));
    const nextPanel=panels.find((panel)=>panel.id===targetId);
    if(!nextPanel) return;
    const finish=()=>{if(currentPanel){currentPanel.hidden=true;currentPanel.classList.remove("is-leaving");currentPanel.setAttribute("tabindex","-1");currentPanel.setAttribute("aria-hidden","true");currentPanel.inert=true;}};
    if(currentButton){currentButton.classList.remove("active");currentButton.setAttribute("aria-selected","false");currentButton.setAttribute("tabindex","-1");}
    button.classList.add("active");button.setAttribute("aria-selected","true");button.setAttribute("tabindex","0");
    nextPanel.hidden=false;nextPanel.setAttribute("tabindex","0");nextPanel.removeAttribute("aria-hidden");nextPanel.inert=false;
    if(currentPanel){currentPanel.classList.remove("is-active");currentPanel.classList.add("is-leaving");currentPanel.setAttribute("aria-hidden","true");currentPanel.inert=true;}
    if(reduceMotion){nextPanel.classList.add("is-active");finish();return;}
    requestAnimationFrame(()=>{nextPanel.classList.add("is-active");});
    window.setTimeout(finish,240);
  };
  buttons.forEach((button)=>{button.addEventListener("click",()=>switchTab(button));});
});
</script></body></html>`;
}
