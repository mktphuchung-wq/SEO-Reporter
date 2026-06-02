function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatPct(value, digits = 2) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
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
  return `${sign}${deltaPercent.toFixed(1)}%`;
}

function periodCardHtml(card) {
  const clickDirection = card.delta.clicks.absolute > 0 ? "up" : card.delta.clicks.absolute < 0 ? "down" : "flat";
  const impressionDirection =
    card.delta.impressions.absolute > 0 ? "up" : card.delta.impressions.absolute < 0 ? "down" : "flat";
  const ctrDirection = card.delta.ctr.absolute > 0 ? "up" : card.delta.ctr.absolute < 0 ? "down" : "flat";
  const positionDirection =
    card.delta.position.absolute > 0 ? "up" : card.delta.position.absolute < 0 ? "down" : "flat";

  return `
  <article class="metric-card">
    <div class="metric-head">
      <h3>${escapeHtml(card.label)}</h3>
      <p>${card.range.start} -> ${card.range.end}</p>
    </div>
    <div class="metric-grid">
      <div>
        <span>Clicks</span>
        <strong>${formatNumber(card.summary.clicks)}</strong>
        <small class="${clickDirection}">${formatSigned(card.delta.clicks.absolute)} (${formatDeltaPercent(card.delta.clicks.percent)})</small>
      </div>
      <div>
        <span>Impressions</span>
        <strong>${formatNumber(card.summary.impressions)}</strong>
        <small class="${impressionDirection}">${formatSigned(card.delta.impressions.absolute)} (${formatDeltaPercent(card.delta.impressions.percent)})</small>
      </div>
      <div>
        <span>CTR</span>
        <strong>${formatPct(card.summary.ctr)}</strong>
        <small class="${ctrDirection}">${formatSigned(card.delta.ctr.absolute * 100, 2)}pt (${formatDeltaPercent(card.delta.ctr.percent)})</small>
      </div>
      <div>
        <span>Avg Position</span>
        <strong>${Number(card.summary.position || 0).toFixed(2)}</strong>
        <small class="${positionDirection}">${formatSigned(card.delta.position.absolute, 2)} (${formatDeltaPercent(card.delta.position.percent)})</small>
      </div>
    </div>
  </article>`;
}


function formatPosition(value) {
  return value === null || value === undefined ? "—" : Number(value || 0).toFixed(2);
}

function deltaClass(value) {
  const numeric = Number(value || 0);
  return numeric > 0 ? "up" : numeric < 0 ? "down" : "flat";
}

function inverseDeltaClass(value) {
  const numeric = Number(value || 0);
  return numeric > 0 ? "down" : numeric < 0 ? "up" : "flat";
}

function linkedUrl(url) {
  if (!url) {
    return "—";
  }
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
}

function aiList(items) {
  if (!items?.length) {
    return '<p class="empty">No AI items</p>';
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function priorityBadge(priority) {
  return `<span class="priority priority-${escapeHtml(priority || "low")}">${escapeHtml(priority || "low")}</span>`;
}

function yesNo(value) {
  return value ? "Yes" : "No";
}


function renderEmptyReportSection({ sourceInfo, filters, diagnostics }) {
  const emptyReason = sourceInfo.emptyReason || diagnostics.emptyReason || diagnostics.emptyDataWarning;
  if (!emptyReason) {
    return "";
  }

  const dateRange = sourceInfo.range ? `${sourceInfo.range.start} -> ${sourceInfo.range.end}` : "—";
  const pageContains = filters.pageContains || "None";

  return `
    <section class="empty-report">
      <h2>Empty Report Diagnostics</h2>
      <p class="note-box" style="border-color: rgba(179,54,54,.45); background: rgba(179,54,54,.09);">${escapeHtml(emptyReason)}</p>
      <div class="kpis" style="margin-top:10px;">
        <div class="kpi"><span>Property</span><strong>${escapeHtml(sourceInfo.property || "—")}</strong></div>
        <div class="kpi"><span>Date range</span><strong>${escapeHtml(dateRange)}</strong></div>
        <div class="kpi"><span>Search type</span><strong>${escapeHtml(filters.searchType || "web")}</strong></div>
        <div class="kpi"><span>Page contains</span><strong>${escapeHtml(pageContains)}</strong></div>
        <div class="kpi"><span>Page rows received</span><strong>${formatNumber(diagnostics.pageRowCount || 0)}</strong></div>
        <div class="kpi"><span>Keyword rows received</span><strong>${formatNumber(diagnostics.keywordRowCount || 0)}</strong></div>
      </div>
      <div class="note-box" style="margin-top:10px;">
        <strong>Suggested next tries</strong>
        <ul>
          <li>Remove or relax the URL filter, especially <code>/ten-su-kien/</code>, then generate again.</li>
          <li>Select a wider date range so Search Console has more matching page data to return.</li>
          <li>Use an end date that is 2–3 days earlier to avoid fresh GSC data delays.</li>
        </ul>
      </div>
    </section>`;
}

function rowsToTable(items, mapper) {
  if (!items.length) {
    return '<p class="empty">No data</p>';
  }

  return `
  <table>
    <thead>${mapper.header}</thead>
    <tbody>
      ${items.map((item, index) => mapper.row(item, index)).join("\n")}
    </tbody>
  </table>`;
}

export function renderHtmlReport({ insights, sourceInfo, keywordInsights = {}, keywordCsvDownloadUrl = "" }) {
  const publishing = insights.thisMonthPublishing;
  const trend30 = insights.trending30Days;
  const sixMonths = insights.url6MonthInsights;
  const perf = insights.performance3Months;
  const trackedKeywordMovements = keywordInsights.trackedKeywordMovements || [];
  const highImpressionDrops = keywordInsights.highImpressionDrops || [];
  const nearPageOneKeywords = keywordInsights.nearPageOneKeywords || [];
  const keywordWinners = keywordInsights.keywordWinners || [];
  const ctrOpportunities = keywordInsights.ctrOpportunities || [];
  const seoAlerts = keywordInsights.seoAlerts || [];
  const geminiInsights = keywordInsights.geminiInsights || { available: false, message: "AI insight not requested." };
  const filters = sourceInfo.filters || {};
  const diagnostics = sourceInfo.diagnostics || {};
  const dataDelayNote = sourceInfo.dataDelayNote || (diagnostics.gscDataDelayDays != null && sourceInfo.range?.end
    ? `GSC data may be delayed; report ends at ${sourceInfo.range.end}.`
    : null);

  const chartPayload = {
    dailyLabels: perf.dailySeries.map((x) => x.date),
    dailyClicks: perf.dailySeries.map((x) => Number(x.clicks.toFixed(2))),
    dailyImpressions: perf.dailySeries.map((x) => Number(x.impressions.toFixed(2))),
    monthlyLabels: perf.monthly.map((x) => x.month),
    monthlyClicks: perf.monthly.map((x) => Number(x.clicks.toFixed(2))),
    monthlyImpressions: perf.monthly.map((x) => Number(x.impressions.toFixed(2))),
    moverLabels: sixMonths.topIncreaseMost.slice(0, 8).map((x) => x.url),
    moverValues: sixMonths.topIncreaseMost.slice(0, 8).map((x) => Number(x.delta.toFixed(2))),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SEO Insight Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-1: #f5f2e8;
      --bg-2: #e8efe3;
      --ink: #102027;
      --muted: #4f6272;
      --accent: #156064;
      --accent-soft: #b8d8d8;
      --warm: #ff7b54;
      --up: #1f7a1f;
      --down: #b33636;
      --flat: #6a7280;
      --card: rgba(255, 255, 255, 0.8);
      --line: rgba(0, 0, 0, 0.08);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: "IBM Plex Sans", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% 12%, rgba(255, 123, 84, 0.28), transparent 28%),
        radial-gradient(circle at 86% 4%, rgba(21, 96, 100, 0.2), transparent 32%),
        linear-gradient(140deg, var(--bg-1), var(--bg-2));
    }

    .wrapper {
      width: min(1220px, 95vw);
      margin: 0 auto;
      padding: 28px 0 60px;
    }

    header {
      background: linear-gradient(120deg, rgba(16, 32, 39, 0.95), rgba(21, 96, 100, 0.86));
      color: #fff;
      border-radius: 20px;
      padding: 28px;
      margin-bottom: 18px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 18px 40px rgba(12, 22, 26, 0.25);
    }

    header::after {
      content: "";
      width: 220px;
      height: 220px;
      border-radius: 999px;
      background: rgba(255, 123, 84, 0.22);
      position: absolute;
      right: -40px;
      top: -80px;
      transform: rotate(18deg);
    }

    h1, h2, h3 {
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.01em;
      margin: 0;
    }

    h1 { font-size: clamp(1.4rem, 3vw, 2rem); }
    h2 { font-size: clamp(1.1rem, 2.4vw, 1.4rem); margin-bottom: 10px; }

    .meta {
      margin-top: 8px;
      color: rgba(255, 255, 255, 0.9);
      font-size: 0.95rem;
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      position: relative;
      z-index: 2;
    }

    section {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 18px;
      margin-top: 16px;
      backdrop-filter: blur(8px);
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 12px;
    }

    .metric-card {
      background: rgba(255,255,255,0.85);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
    }

    .metric-head p {
      margin: 4px 0 10px;
      color: var(--muted);
      font-size: 0.85rem;
    }

    .metric-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .metric-grid span {
      color: var(--muted);
      font-size: 0.8rem;
      display: block;
    }

    .metric-grid strong {
      font-size: 1.1rem;
      display: block;
      margin-top: 2px;
    }

    .metric-grid small {
      font-size: 0.8rem;
      display: block;
      margin-top: 3px;
    }

    .up { color: var(--up); }
    .down { color: var(--down); }
    .flat { color: var(--flat); }

    .topic-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0;
    }

    .topic-pill {
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 0.82rem;
      border: 1px solid rgba(21, 96, 100, 0.24);
      background: rgba(184, 216, 216, 0.42);
    }

    .two-col {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }

    .chart-box {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 8px;
      min-height: 280px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
    }

    th, td {
      text-align: left;
      border-bottom: 1px solid var(--line);
      padding: 8px;
      vertical-align: top;
    }

    th {
      background: rgba(16, 32, 39, 0.94);
      color: #fff;
      font-weight: 600;
      position: sticky;
      top: 0;
    }

    td.url {
      max-width: 360px;
      word-break: break-word;
      font-size: 0.85rem;
    }

    .muted {
      color: var(--muted);
      font-size: 0.88rem;
    }

    .empty {
      color: var(--muted);
      margin: 0;
      padding: 6px 0;
    }

    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
      margin-top: 10px;
    }

    .kpi {
      background: rgba(255,255,255,0.8);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px;
    }

    .kpi span {
      display: block;
      font-size: 0.8rem;
      color: var(--muted);
    }

    .kpi strong {
      font-size: 1rem;
    }

    .priority {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      background: rgba(106, 114, 128, 0.16);
    }

    .priority-high { background: rgba(179, 54, 54, 0.16); color: var(--down); }
    .priority-medium { background: rgba(255, 123, 84, 0.2); color: #8a3f1d; }
    .priority-low { background: rgba(31, 122, 31, 0.14); color: var(--up); }

    .note-box {
      border-left: 4px solid var(--accent);
      padding: 10px 12px;
      background: rgba(184, 216, 216, 0.28);
      border-radius: 10px;
      color: var(--muted);
    }

    .report-actions {
      margin-bottom: 16px;
      display: flex;
      justify-content: flex-start;
    }

    .download-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 10px 14px;
      color: #fff;
      background: var(--accent);
      font-weight: 700;
      text-decoration: none;
      box-shadow: 0 10px 24px rgba(21, 96, 100, 0.22);
    }

    .download-link:hover {
      background: #0f4c50;
    }

    @media (max-width: 700px) {
      .wrapper { width: 94vw; }
      header, section { padding: 14px; }
      th, td { font-size: 0.83rem; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    ${keywordCsvDownloadUrl ? `<div class="report-actions"><a class="download-link" href="${escapeHtml(keywordCsvDownloadUrl)}">Download keyword CSV</a></div>` : ""}
    <header>
      <h1>SEO Insight Report</h1>
      <div class="meta">
        <span>Generated: ${escapeHtml(insights.generatedAt)}</span>
        <span>Source: ${escapeHtml(sourceInfo.label)}</span>
        <span>Property: ${escapeHtml(sourceInfo.property)}</span>
        <span>Date range: ${escapeHtml(sourceInfo.range ? `${sourceInfo.range.start} -> ${sourceInfo.range.end}` : "No date range")}</span>
        <span>Data span: ${escapeHtml(insights.dataSpan ? `${insights.dataSpan.start} -> ${insights.dataSpan.end}` : "No data")}</span>
      </div>
    </header>

    <section>
      <h2>Summary Cards (Week / Month / 3M / 6M)</h2>
      <div class="cards">${insights.periodCards.map((card) => periodCardHtml(card)).join("\n")}</div>
    </section>

    <section>
      <h2>Active Filters</h2>
      ${dataDelayNote ? `<p class="note-box" style="margin-bottom:10px;">${escapeHtml(dataDelayNote)}</p>` : ""}
      <div class="kpis">
        <div class="kpi"><span>Property</span><strong>${escapeHtml(sourceInfo.property || "—")}</strong></div>
        <div class="kpi"><span>Search type</span><strong>${escapeHtml(filters.searchType || "web")}</strong></div>
        <div class="kpi"><span>Date range</span><strong>${escapeHtml(sourceInfo.range ? `${sourceInfo.range.start} -> ${sourceInfo.range.end}` : "—")}</strong></div>
        <div class="kpi"><span>Report period</span><strong>${escapeHtml(filters.reportPeriodLabel || filters.reportPeriod || "custom")}</strong></div>
        <div class="kpi"><span>Page contains filter</span><strong>${escapeHtml(filters.pageContains || "None")}</strong></div>
        <div class="kpi"><span>Tracked keyword count</span><strong>${formatNumber(filters.trackedKeywordCount || 0)}</strong></div>
        <div class="kpi"><span>SEO alert count</span><strong>${formatNumber(filters.seoAlertCount || seoAlerts.length || 0)}</strong></div>
        <div class="kpi"><span>High-severity alerts</span><strong>${formatNumber(filters.highSeveritySeoAlertCount || seoAlerts.filter((alert) => alert.severity === "high").length || 0)}</strong></div>
      </div>
      <p class="note-box" style="margin-top:10px;">For average position, lower is better.</p>
    </section>

    ${renderEmptyReportSection({ sourceInfo, filters, diagnostics })}

    <section>
      <h2>GSC Diagnostics</h2>
      ${diagnostics.emptyDataWarning ? `<p class="note-box" style="border-color: rgba(179,54,54,.25); background: rgba(179,54,54,.08);">${escapeHtml(diagnostics.emptyDataWarning)}</p>` : ""}
      ${diagnostics.contentMetadataWarning ? `<p class="note-box" style="margin-top:8px;">${escapeHtml(diagnostics.contentMetadataWarning)}</p>` : ""}
      <div class="kpis">
        <div class="kpi"><span>Raw page rows</span><strong>${formatNumber(diagnostics.pageRowCount || 0)}</strong></div>
        <div class="kpi"><span>Coalesced page rows</span><strong>${formatNumber(diagnostics.coalescedPageRowCount || 0)}</strong></div>
        <div class="kpi"><span>Keyword rows</span><strong>${formatNumber(diagnostics.keywordRowCount || 0)}</strong></div>
        <div class="kpi"><span>Content rows</span><strong>${formatNumber(diagnostics.contentMetadataRowCount || 0)}</strong></div>
        <div class="kpi"><span>GSC delay days</span><strong>${diagnostics.gscDataDelayDays ?? "—"}</strong></div>
        <div class="kpi"><span>Diagnostic search type</span><strong>${escapeHtml(diagnostics.searchType || filters.searchType || "web")}</strong></div>
        <div class="kpi"><span>Page filter applied</span><strong>${yesNo(Boolean(diagnostics.pageContainsApplied ?? filters.pageContains))}</strong></div>
      </div>
    </section>

    <section>
      <h2>This Month Content Publishing</h2>
      <p class="muted">${publishing.range.start} -> ${publishing.range.end} | Published articles: <strong>${publishing.count}</strong></p>
      <div class="topic-list">
        ${publishing.topics.length ? publishing.topics.map((x) => `<span class="topic-pill">${escapeHtml(x.topic)}: ${x.count}</span>`).join("") : "<span class=\"topic-pill\">No topic data</span>"}
      </div>
      ${rowsToTable(publishing.items, {
        header: "<tr><th>#</th><th>Publish Date</th><th>Topic</th><th>Title</th><th>URL</th></tr>",
        row: (item, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(item.publishedDate)}</td><td>${escapeHtml(item.topic)}</td><td>${escapeHtml(item.title || "")}</td><td class=\"url\"><a href=\"${escapeHtml(item.url)}\" target=\"_blank\" rel=\"noopener noreferrer\">${escapeHtml(item.url)}</a></td></tr>`,
      })}
    </section>

    <section>
      <h2>SEO Performance - Last 3 Months</h2>
      <div class="kpis">
        <div class="kpi"><span>Total Clicks</span><strong>${formatNumber(perf.total.clicks)}</strong></div>
        <div class="kpi"><span>Total Impressions</span><strong>${formatNumber(perf.total.impressions)}</strong></div>
        <div class="kpi"><span>CTR</span><strong>${formatPct(perf.total.ctr)}</strong></div>
        <div class="kpi"><span>Avg Position</span><strong>${Number(perf.total.position || 0).toFixed(2)}</strong></div>
      </div>
      <div class="two-col" style="margin-top: 12px;">
        <div class="chart-box"><canvas id="dailyChart"></canvas></div>
        <div class="chart-box"><canvas id="monthlyChart"></canvas></div>
      </div>
    </section>

    <section>
      <h2>GSC-style Insight: Trending Up / Down (30 Days)</h2>
      <div class="two-col">
        <div>
          <h3 style="margin-bottom:8px;">Trending Up</h3>
          ${rowsToTable(trend30.trendingUp, {
            header: "<tr><th>#</th><th>URL</th><th>Clicks Δ</th><th>Clicks %</th><th>Current</th><th>Previous</th></tr>",
            row: (item, idx) => `<tr><td>${idx + 1}</td><td class=\"url\">${escapeHtml(item.url)}</td><td class=\"up\">${formatSigned(item.clickDelta)}</td><td>${escapeHtml(formatDeltaPercent(item.clickPct))}</td><td>${formatNumber(item.currentClicks)}</td><td>${formatNumber(item.previousClicks)}</td></tr>`,
          })}
        </div>
        <div>
          <h3 style="margin-bottom:8px;">Trending Down</h3>
          ${rowsToTable(trend30.trendingDown, {
            header: "<tr><th>#</th><th>URL</th><th>Clicks Δ</th><th>Clicks %</th><th>Current</th><th>Previous</th></tr>",
            row: (item, idx) => `<tr><td>${idx + 1}</td><td class=\"url\">${escapeHtml(item.url)}</td><td class=\"down\">${formatSigned(item.clickDelta)}</td><td>${escapeHtml(formatDeltaPercent(item.clickPct))}</td><td>${formatNumber(item.currentClicks)}</td><td>${formatNumber(item.previousClicks)}</td></tr>`,
          })}
        </div>
      </div>
      <p class="muted" style="margin-top:8px;">Window compare: ${trend30.currentRange.start} -> ${trend30.currentRange.end} vs ${trend30.previousRange.start} -> ${trend30.previousRange.end}</p>
    </section>

    <section>
      <h2>SEO Alerts</h2>
      <p class="muted">Alerts are generated from high-impression ranking drops, tracked keyword losses, and CTR opportunities. Notification summaries are sent only for high-severity alerts when alerts are enabled.</p>
      ${rowsToTable(seoAlerts, {
        header: "<tr><th>Severity</th><th>Type</th><th>Title</th><th>Message</th><th>URL</th><th>Recommendation</th></tr>",
        row: (item) => `<tr><td>${priorityBadge(item.severity)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.message)}</td><td class="url">${linkedUrl(item.url)}</td><td>${escapeHtml(item.recommendation)}</td></tr>`,
      })}
    </section>

    <section>
      <h2>Tracked Keyword Ranking Movement</h2>
      ${rowsToTable(trackedKeywordMovements, {
        header: "<tr><th>Keyword</th><th>Match type</th><th>Best URL</th><th>Current position</th><th>Previous position</th><th>Position change</th><th>Current clicks</th><th>Click change</th><th>Current impressions</th><th>Impression change</th><th>Action hint</th></tr>",
        row: (item) => `<tr><td>${escapeHtml(item.keyword)}</td><td>${escapeHtml(item.matchType)}</td><td class="url">${linkedUrl(item.bestCurrentUrl)}</td><td>${formatPosition(item.currentAvgPosition)}</td><td>${formatPosition(item.previousAvgPosition)}</td><td class="${deltaClass(item.positionDelta)}">${item.positionDelta === null ? "—" : formatSigned(item.positionDelta, 2)}</td><td>${formatNumber(item.currentClicks)}</td><td class="${deltaClass(item.clickDelta)}">${formatSigned(item.clickDelta)}</td><td>${formatNumber(item.currentImpressions)}</td><td class="${deltaClass(item.impressionDelta)}">${formatSigned(item.impressionDelta)}</td><td>${escapeHtml(item.actionHint)}</td></tr>`,
      })}
    </section>

    <section>
      <h2>High Impression Keywords With Ranking Drop</h2>
      ${rowsToTable(highImpressionDrops, {
        header: "<tr><th>Query</th><th>URL</th><th>Current position</th><th>Previous position</th><th>Position loss</th><th>Current impressions</th><th>Current clicks</th><th>CTR</th><th>Priority</th><th>Recommendation</th></tr>",
        row: (item) => `<tr><td>${escapeHtml(item.query)}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatPosition(item.currentAvgPosition)}</td><td>${formatPosition(item.previousAvgPosition)}</td><td class="down">${formatSigned(Math.abs(item.positionDelta || 0), 2)}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatNumber(item.currentClicks)}</td><td>${formatPct(item.currentCtr)}</td><td>${priorityBadge(item.priority)}</td><td>${escapeHtml(item.recommendation)}</td></tr>`,
      })}
    </section>

    <section>
      <h2>High Impression Keywords Near Page 1</h2>
      ${rowsToTable(nearPageOneKeywords, {
        header: "<tr><th>Query</th><th>URL</th><th>Position</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Priority</th><th>Recommendation</th></tr>",
        row: (item) => `<tr><td>${escapeHtml(item.query)}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatPosition(item.currentAvgPosition)}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatNumber(item.currentClicks)}</td><td>${formatPct(item.currentCtr)}</td><td>${priorityBadge(item.priority)}</td><td>${escapeHtml(item.recommendation)}</td></tr>`,
      })}
    </section>

    <section>
      <h2>CTR Opportunity Keywords</h2>
      ${rowsToTable(ctrOpportunities, {
        header: "<tr><th>Query</th><th>URL</th><th>Position</th><th>Impressions</th><th>CTR</th><th>Priority</th><th>Recommendation</th></tr>",
        row: (item) => `<tr><td>${escapeHtml(item.query)}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatPosition(item.currentAvgPosition)}</td><td>${formatNumber(item.currentImpressions)}</td><td>${formatPct(item.currentCtr)}</td><td>${priorityBadge(item.priority)}</td><td>${escapeHtml(item.recommendation)}</td></tr>`,
      })}
    </section>

    <section>
      <h2>Keyword Winners</h2>
      ${rowsToTable(keywordWinners, {
        header: "<tr><th>Query</th><th>URL</th><th>Current position</th><th>Position gain</th><th>Click change</th><th>Impression change</th><th>Priority</th><th>Recommendation</th></tr>",
        row: (item) => `<tr><td>${escapeHtml(item.query)}</td><td class="url">${linkedUrl(item.url)}</td><td>${formatPosition(item.currentAvgPosition)}</td><td class="up">${item.positionDelta === null ? "—" : formatSigned(item.positionDelta, 2)}</td><td class="${deltaClass(item.clickDelta)}">${formatSigned(item.clickDelta)}</td><td class="${deltaClass(item.impressionDelta)}">${formatSigned(item.impressionDelta)}</td><td>${priorityBadge(item.priority)}</td><td>${escapeHtml(item.recommendation)}</td></tr>`,
      })}
    </section>

    <section>
      <h2>Gemini AI SEO Insights</h2>
      ${geminiInsights.available ? `
        <div class="two-col">
          <div><h3>Executive Summary</h3>${aiList(geminiInsights.executiveSummary)}</div>
          <div><h3>Key Risks</h3>${aiList(geminiInsights.risks)}</div>
          <div><h3>Opportunities</h3>${aiList(geminiInsights.opportunities)}</div>
          <div><h3>Content Refresh Ideas</h3>${rowsToTable(geminiInsights.contentRefreshIdeas || [], {
            header: "<tr><th>URL</th><th>Reason</th><th>Suggested update</th></tr>",
            row: (item) => `<tr><td class="url">${linkedUrl(item.url)}</td><td>${escapeHtml(item.reason)}</td><td>${escapeHtml(item.suggestedUpdate)}</td></tr>`,
          })}</div>
        </div>
        <h3 style="margin-top:12px;">Recommended Actions</h3>
        ${rowsToTable(geminiInsights.recommendedActions || [], {
          header: "<tr><th>Priority</th><th>Title</th><th>Why</th><th>Action</th><th>Expected impact</th></tr>",
          row: (item) => `<tr><td>${priorityBadge(item.priority)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.why)}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.expectedImpact)}</td></tr>`,
        })}
      ` : `<p class="empty">${escapeHtml(geminiInsights.message || "AI insight unavailable.")}</p>`}
    </section>

    <section>
      <h2>URL Signals In 6 Months</h2>
      <p class="muted">Month buckets: ${sixMonths.monthKeys.join(" | ")}</p>
      <div class="two-col" style="margin-top:8px;">
        <div>
          <h3 style="margin-bottom:8px;">Top Increase (Most)</h3>
          ${rowsToTable(sixMonths.topIncreaseMost, {
            header: "<tr><th>#</th><th>URL</th><th>Δ Clicks</th><th>Start Month</th><th>Last Month</th></tr>",
            row: (item, idx) => `<tr><td>${idx + 1}</td><td class=\"url\">${escapeHtml(item.url)}</td><td class=\"up\">${formatSigned(item.delta)}</td><td>${formatNumber(item.firstMonth)}</td><td>${formatNumber(item.lastMonth)}</td></tr>`,
          })}
        </div>
        <div>
          <h3 style="margin-bottom:8px;">Top Decrease (Most)</h3>
          ${rowsToTable(sixMonths.topDecreaseMost, {
            header: "<tr><th>#</th><th>URL</th><th>Δ Clicks</th><th>Start Month</th><th>Last Month</th></tr>",
            row: (item, idx) => `<tr><td>${idx + 1}</td><td class=\"url\">${escapeHtml(item.url)}</td><td class=\"down\">${formatSigned(item.delta)}</td><td>${formatNumber(item.firstMonth)}</td><td>${formatNumber(item.lastMonth)}</td></tr>`,
          })}
        </div>
      </div>
      <div class="two-col" style="margin-top: 12px;">
        <div>
          <h3 style="margin-bottom:8px;">Fastest Increase (Trend Velocity)</h3>
          ${rowsToTable(sixMonths.topIncreaseFast, {
            header: "<tr><th>#</th><th>URL</th><th>Slope</th><th>Δ Clicks</th><th>Δ %</th></tr>",
            row: (item, idx) => `<tr><td>${idx + 1}</td><td class=\"url\">${escapeHtml(item.url)}</td><td class=\"up\">${item.slope.toFixed(2)}</td><td>${formatSigned(item.delta)}</td><td>${escapeHtml(formatDeltaPercent(item.pct))}</td></tr>`,
          })}
        </div>
        <div>
          <h3 style="margin-bottom:8px;">Fastest Decrease (Trend Velocity)</h3>
          ${rowsToTable(sixMonths.topDecreaseFast, {
            header: "<tr><th>#</th><th>URL</th><th>Slope</th><th>Δ Clicks</th><th>Δ %</th></tr>",
            row: (item, idx) => `<tr><td>${idx + 1}</td><td class=\"url\">${escapeHtml(item.url)}</td><td class=\"down\">${item.slope.toFixed(2)}</td><td>${formatSigned(item.delta)}</td><td>${escapeHtml(formatDeltaPercent(item.pct))}</td></tr>`,
          })}
        </div>
      </div>
      <div class="chart-box" style="margin-top: 12px;"><canvas id="moverChart"></canvas></div>
    </section>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
  <script>
    const payload = ${JSON.stringify(chartPayload)};

    const dailyCtx = document.getElementById("dailyChart");
    const monthlyCtx = document.getElementById("monthlyChart");
    const moverCtx = document.getElementById("moverChart");

    new Chart(dailyCtx, {
      type: "line",
      data: {
        labels: payload.dailyLabels,
        datasets: [
          {
            label: "Clicks",
            data: payload.dailyClicks,
            borderColor: "#156064",
            backgroundColor: "rgba(21, 96, 100, 0.18)",
            yAxisID: "y",
            tension: 0.28,
            fill: true,
          },
          {
            label: "Impressions",
            data: payload.dailyImpressions,
            borderColor: "#ff7b54",
            backgroundColor: "rgba(255, 123, 84, 0.12)",
            yAxisID: "y1",
            tension: 0.24,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        scales: {
          y: { type: "linear", position: "left", title: { display: true, text: "Clicks" } },
          y1: { type: "linear", position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Impressions" } },
        },
      },
    });

    new Chart(monthlyCtx, {
      type: "bar",
      data: {
        labels: payload.monthlyLabels,
        datasets: [
          {
            label: "Clicks",
            data: payload.monthlyClicks,
            backgroundColor: "rgba(21, 96, 100, 0.78)",
          },
          {
            label: "Impressions",
            data: payload.monthlyImpressions,
            backgroundColor: "rgba(255, 123, 84, 0.6)",
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "top" },
        },
      },
    });

    new Chart(moverCtx, {
      type: "bar",
      data: {
        labels: payload.moverLabels,
        datasets: [
          {
            label: "Clicks delta (Top increase - 6M)",
            data: payload.moverValues,
            backgroundColor: "rgba(42, 157, 143, 0.8)",
          },
        ],
      },
      options: {
        responsive: true,
        indexAxis: "y",
        plugins: {
          legend: { display: true },
          tooltip: { callbacks: { title: (items) => items[0].label } },
        },
        scales: {
          x: { title: { display: true, text: "Clicks delta" } },
        },
      },
    });
  </script>
</body>
</html>`;
}
