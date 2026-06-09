import { renderLayout } from "../ui/layout.js";
import { escapeHtml } from "../ui/html.js";
import { renderAlert, renderEmptyState } from "../ui/components.js";
import { renderFieldHelper, selected } from "../ui/forms.js";

function option(value, label, current) {
  return `<option value="${escapeHtml(value)}" ${selected(value, current)}>${escapeHtml(label)}</option>`;
}

function renderPropertySelector({ sites = [], siteUrl = "" } = {}) {
  const selectedSiteUrl = siteUrl || sites[0]?.siteUrl || "";
  const options = sites
    .map(
      (site) =>
        `<option value="${escapeHtml(site.siteUrl)}" data-permission="${escapeHtml(site.permissionLevel)}" ${selected(site.siteUrl, selectedSiteUrl)}>${escapeHtml(site.siteUrl)} (${escapeHtml(site.permissionLevel)})</option>`,
    )
    .join("");

  return `
    <div class="field">
      <label for="siteUrl">Search Console property</label>
      <select id="siteUrl" name="siteUrl" ${sites.length ? "" : "disabled"} required>
        ${sites.length ? options : '<option value="">No properties found</option>'}
      </select>
      ${renderFieldHelper("Choose one authenticated Google Search Console property to compare against the URL list.")}
    </div>`;
}

function renderUrlPerformanceForm({ sites = [], defaultValues = {} } = {}) {
  const searchType = defaultValues.searchType || "web";
  const urlList = defaultValues.urlList || "";
  const enableAiSummary = defaultValues.enableAiSummary === true || defaultValues.enableAiSummary === "on" || defaultValues.enableAiSummary === "true";

  return `
    <form class="card" method="post" action="/tools/url-performance" id="urlPerformanceForm">
      <div class="grid grid-2">
        ${renderPropertySelector({ sites, siteUrl: defaultValues.siteUrl || defaultValues.selectedSiteUrl })}
        <div class="field">
          <label for="searchType">Search type</label>
          <select id="searchType" name="searchType">
            ${option("web", "web", searchType)}
            ${option("image", "image", searchType)}
            ${option("video", "video", searchType)}
            ${option("news", "news", searchType)}
          </select>
        </div>
      </div>

      <aside class="help-box" aria-label="Automatic comparison periods">
        <strong>App sẽ tự động tạo 3 kỳ so sánh:</strong>
        <p>
          - 1 tháng gần nhất vs 1 tháng trước đó<br />
          - 2 tháng gần nhất vs 2 tháng trước đó<br />
          - 3 tháng gần nhất vs 3 tháng trước đó
        </p>
        <p>Để tránh dữ liệu GSC chưa cập nhật đủ, app dùng GSC delay mặc định 2 ngày.</p>
      </aside>

      <div class="field" style="margin-top:15px">
        <label for="urlList">URL list</label>
        <textarea id="urlList" name="urlList" rows="9" placeholder="https://example.com/page-a&#10;https://example.com/page-b&#10;https://example.com/page-c" required>${escapeHtml(urlList)}</textarea>
        ${renderFieldHelper("Nhập mỗi URL một dòng. App sẽ tự so sánh performance của từng URL trong 1 tháng, 2 tháng và 3 tháng gần nhất so với kỳ liền trước.")}
        ${renderFieldHelper("For large URL lists, split into batches of 50–100 URLs. This tool runs 1M, 2M and 3M comparisons for every URL.")}
      </div>

      <div class="field checkbox-field">
        <label><input type="checkbox" id="enableAiSummary" name="enableAiSummary" value="on" ${enableAiSummary ? "checked" : ""}> Ask AI to summarize this URL comparison</label>
        ${renderFieldHelper("AI chỉ phân tích kết quả đã tóm tắt, không dùng raw GSC rows.")}
      </div>

      <div class="actions">
        <button class="btn" type="submit" id="compareUrlsButton" ${sites.length ? "" : "disabled"}>Compare URLs</button>
        <button class="btn btn-secondary" type="button" id="loadSampleUrlsButton">Load sample</button>
        <button class="btn btn-secondary" type="button" id="clearUrlsButton">Clear</button>
      </div>

      <div class="loading-overlay" id="urlPerformanceLoading" role="status" aria-live="polite" aria-hidden="true">
        <div class="loading-card">
          <div class="tea-scene" aria-hidden="true">
            <span class="steam"></span><span class="steam"></span><span class="steam"></span>
            <span>🍵</span><span>🍰</span>
          </div>
          <h2>Ăn miếng bánh, uống miếng trà, chờ chút xíu...</h2>
          <p class="loading-subcopy">Đang so sánh performance 1M, 2M và 3M của danh sách URL...</p>
          <span class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
      </div>
    </form>

    <script>
      (() => {
        const form = document.getElementById("urlPerformanceForm");
        const textarea = document.getElementById("urlList");
        const submitButton = document.getElementById("compareUrlsButton");
        const loading = document.getElementById("urlPerformanceLoading");
        const sampleButton = document.getElementById("loadSampleUrlsButton");
        const clearButton = document.getElementById("clearUrlsButton");
        const sampleUrls = [
          "https://example.com/page-a",
          "https://example.com/page-b",
          "https://example.com/page-c",
        ].join("\\n");
        let isSubmitting = false;

        sampleButton?.addEventListener("click", () => {
          if (textarea) textarea.value = sampleUrls;
        });

        clearButton?.addEventListener("click", () => {
          if (textarea) {
            textarea.value = "";
            textarea.focus();
          }
        });

        form?.addEventListener("submit", (event) => {
          if (isSubmitting) {
            event.preventDefault();
            return;
          }
          isSubmitting = true;
          if (submitButton) submitButton.disabled = true;
          if (loading) {
            loading.classList.add("is-visible");
            loading.setAttribute("aria-hidden", "false");
          }
        });
      })();
    </script>`;
}


function renderList(items = [], type = "warning") {
  if (!items.length) return "";
  return `
    <section class="card">
      <h2>${type === "error" ? "Request errors" : "Warnings"}</h2>
      <ul>
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>`;
}

function renderInvalidRowsTable(invalidRows = [], { showEmpty = true } = {}) {
  if (!invalidRows.length) {
    return showEmpty
      ? `
      <section class="card">
        <h2>Invalid Rows</h2>
        <p class="muted">No invalid URL rows found.</p>
      </section>`
      : "";
  }

  return `
    <section class="card invalid-rows-card">
      <h2>Invalid Rows</h2>
      <div class="table-wrap table-scroll">
        <table>
          <thead>
            <tr><th>Row number</th><th>Raw input</th><th>Errors</th></tr>
          </thead>
          <tbody>
            ${invalidRows
              .map(
                (row) => `<tr>
                  <td>${escapeHtml(row.rowNumber)}</td>
                  <td><code>${escapeHtml(row.raw || "")}</code></td>
                  <td>${escapeHtml((row.errors || []).join("; "))}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderCompareWindows(compareWindows = []) {
  return `
    <section class="card">
      <h2>Generated compare windows</h2>
      <p class="muted">These windows are generated automatically with the default 2-day Search Console data delay. No GSC query has been run yet.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Window</th><th>Previous range</th><th>Current range</th></tr>
          </thead>
          <tbody>
            ${compareWindows
              .map(
                (window) => `<tr>
                  <td><strong>${escapeHtml(window.label)}</strong></td>
                  <td>${escapeHtml(window.previousRange.label)}: ${escapeHtml(window.previousRange.start)} → ${escapeHtml(window.previousRange.end)}</td>
                  <td>${escapeHtml(window.currentRange.label)}: ${escapeHtml(window.currentRange.start)} → ${escapeHtml(window.currentRange.end)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

export function renderUrlPerformancePage({ sites = [], user = null, authenticated = false, defaultValues = {}, googleApiError = null, error = "" } = {}) {
  const noPropertiesWarning = authenticated && !googleApiError && sites.length === 0 ? "No Search Console properties found for this account." : "";
  const googleWarning = googleApiError ? `Search Console API error: ${googleApiError.message}` : "";
  const body = `
    ${renderAlert({ type: "error", message: error })}
    ${renderAlert({ type: "warning", message: noPropertiesWarning || googleWarning })}
    <section class="hero">
      <div>
        <p class="muted">SEO tools</p>
        <h1>URL Performance Compare</h1>
        <p>Choose a Search Console property, select a search type, and paste URLs. The app will automatically prepare 1-month, 2-month, and 3-month comparisons from today.</p>
      </div>
      <div class="actions"><a class="btn btn-secondary" href="/reports/new">Back to reports</a></div>
    </section>
    ${!authenticated ? renderEmptyState({
      title: "Authenticate Google first.",
      body: "Connect Google before loading Search Console properties for URL Performance Compare.",
      actionHtml: '<a class="btn" href="/auth/google">Authenticate Google first</a>',
    }) : renderUrlPerformanceForm({ sites, defaultValues })}
  `;

  return renderLayout({
    title: "URL Performance Compare · SEO Reporter",
    body,
    user,
    authenticated,
    activeNav: "url-performance",
  });
}

export function renderUrlPerformanceValidationPage({ sites = [], user = null, authenticated = false, result = {}, defaultValues = {}, googleApiError = null } = {}) {
  const body = `
    <section class="hero">
      <div>
        <p class="muted">SEO tools</p>
        <h1>URL Performance Compare validation</h1>
        <p>URL-list-only input was parsed, duplicates were removed, and 1M/2M/3M comparison periods were generated. No Google Search Console API query was run because the request needs review.</p>
      </div>
      <div class="actions"><a class="btn btn-secondary" href="/tools/url-performance">Back to URL compare</a></div>
    </section>

    <section class="card">
      <h2>Validation summary</h2>
      <p><strong>${escapeHtml(result.validCount || 0)}</strong> valid unique URLs from <strong>${escapeHtml(result.rowCount || 0)}</strong> parsed rows.</p>
      <p><strong>${escapeHtml(result.invalidCount || 0)}</strong> invalid rows need review.</p>
      <p class="muted">Search type: ${escapeHtml(defaultValues.searchType || "web")}</p>
    </section>

    ${renderAlert({ type: "warning", message: googleApiError ? `Search Console API error: ${googleApiError.message}` : "" })}
    ${renderList(result.requestErrors || [], "error")}
    ${renderList(result.warnings || [], "warning")}
    ${renderInvalidRowsTable(result.invalidRows || [])}
    ${renderCompareWindows(result.compareWindows || [])}
    ${authenticated ? renderUrlPerformanceForm({ sites, defaultValues }) : ""}
  `;

  return renderLayout({
    title: "URL Performance Compare · SEO Reporter",
    body,
    user,
    authenticated,
    activeNav: "url-performance",
  });
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function formatPercent(value) {
  if (value == null) return "new";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatDecimal(value, digits = 2) {
  if (value == null) return "N/A";
  return Number(value).toFixed(digits);
}

function formatSignedInteger(value) {
  const numberValue = Number(value) || 0;
  return `${numberValue > 0 ? "+" : ""}${formatInteger(numberValue)}`;
}

function formatSignedPercent(value) {
  if (value == null) return "new";
  const numberValue = Number(value) || 0;
  return `${numberValue > 0 ? "+" : ""}${(numberValue * 100).toFixed(1)}%`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(value);
}

function compactUrlLabel(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return url || "";
  }
}

function statusKey(status = "") {
  return String(status).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "stable";
}

function deltaClass(value, { inverse = false } = {}) {
  const numberValue = Number(value) || 0;
  if (numberValue === 0) return "delta-neutral";
  const isPositive = numberValue > 0;
  return (inverse ? !isPositive : isPositive) ? "delta-positive" : "delta-negative";
}

function statusClass(status = "") {
  switch (status) {
    case "Growing":
    case "New traffic":
      return "status-green";
    case "Declining":
    case "Lost traffic":
      return "status-red";
    case "High impressions low CTR":
      return "status-orange";
    case "Error":
      return "status-red status-error-row";
    case "Stable":
    default:
      return "status-gray";
  }
}

function rowToneClass(status = "") {
  switch (status) {
    case "Growing":
    case "New traffic":
      return "row-growth";
    case "Declining":
    case "Lost traffic":
      return "row-decline";
    case "High impressions low CTR":
      return "row-warning";
    case "Error":
      return "row-error";
    default:
      return "row-stable";
  }
}

function countStatus(statusCounts = {}, status) {
  return Number(statusCounts[status]) || 0;
}

function renderMetricCard(label, value, className = "") {
  return `<div class="metric-card ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatInteger(value))}</strong></div>`;
}

function renderSummaryCards({ validCount = 0, rowCount = 0, statusCounts = {} } = {}) {
  const errorCount = countStatus(statusCounts, "Error");
  const cards = [
    ["Total URLs checked", validCount, "metric-blue"],
    ["Total comparison rows", rowCount, "metric-blue"],
    ["Growing rows", countStatus(statusCounts, "Growing"), "metric-green"],
    ["Declining rows", countStatus(statusCounts, "Declining"), "metric-red"],
    ["New traffic rows", countStatus(statusCounts, "New traffic"), "metric-green"],
    ["Lost traffic rows", countStatus(statusCounts, "Lost traffic"), "metric-red"],
    ["High impression low CTR rows", countStatus(statusCounts, "High impressions low CTR"), "metric-orange"],
  ];

  if (errorCount > 0) {
    cards.push(["Error rows", errorCount, "metric-red"]);
  }

  return `<section class="url-summary-grid">${cards.map(([label, value, className]) => renderMetricCard(label, value, className)).join("")}</section>`;
}

function renderMetadataList({ result = {}, comparison = {}, defaultValues = {}, generatedAt = new Date() } = {}) {
  const compareWindows = result.compareWindows || [];
  const effectiveEndDate = compareWindows[0]?.currentRange?.end || "";
  return `
    <section class="card metadata-card">
      <h2>Run metadata</h2>
      <dl class="metadata-grid">
        <div><dt>Property</dt><dd>${escapeHtml(defaultValues.siteUrl || defaultValues.selectedSiteUrl || "")}</dd></div>
        <div><dt>Search type</dt><dd>${escapeHtml(defaultValues.searchType || "web")}</dd></div>
        <div><dt>Effective GSC end date</dt><dd>${escapeHtml(effectiveEndDate || "N/A")}</dd></div>
        <div><dt>Total valid URLs</dt><dd>${escapeHtml(formatInteger(result.validCount || 0))}</dd></div>
        <div><dt>Invalid rows count</dt><dd>${escapeHtml(formatInteger(result.invalidCount || 0))}</dd></div>
        <div><dt>Generated date</dt><dd>${escapeHtml(formatDateTime(generatedAt))}</dd></div>
        <div><dt>Total comparison rows</dt><dd>${escapeHtml(formatInteger((comparison.flatRows || []).length))}</dd></div>
      </dl>
      <h3>Compare windows</h3>
      <div class="compare-window-list">
        ${compareWindows.map((window) => `<div><strong>${escapeHtml(window.label)}:</strong> ${escapeHtml(window.previousRange?.start || "")} → ${escapeHtml(window.previousRange?.end || "")} vs ${escapeHtml(window.currentRange?.start || "")} → ${escapeHtml(window.currentRange?.end || "")}</div>`).join("")}
      </div>
    </section>`;
}

function buildCsvRows(flatRows = []) {
  return flatRows.map((row) => ({
    url: row.url,
    window_key: row.windowKey,
    window_label: row.windowLabel || row.windowKey,
    previous_start: row.previousStart,
    previous_end: row.previousEnd,
    current_start: row.currentStart,
    current_end: row.currentEnd,
    previous_clicks: row.previousClicks,
    current_clicks: row.currentClicks,
    click_delta: row.clickDelta,
    click_delta_percent: row.clickDeltaPercent,
    previous_impressions: row.previousImpressions,
    current_impressions: row.currentImpressions,
    impression_delta: row.impressionDelta,
    impression_delta_percent: row.impressionDeltaPercent,
    previous_ctr: row.previousCtr,
    current_ctr: row.currentCtr,
    previous_position: row.previousPosition,
    current_position: row.currentPosition,
    position_delta: row.positionDelta,
    status: row.status,
    insight: row.insight,
  }));
}

function safeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
function renderWindowTabs(compareWindows = []) {
  return `<div class="window-tabs" role="tablist" aria-label="Compare windows">
    ${compareWindows.map((window, index) => `<button class="window-tab ${index === 0 ? "active" : ""}" type="button" role="tab" aria-selected="${index === 0 ? "true" : "false"}" data-window-tab="${escapeHtml(window.key)}">${escapeHtml(window.label)}</button>`).join("")}
  </div>`;
}

function renderUrlPerformanceResultsTable(flatRows = []) {
  if (!flatRows.length) {
    return renderEmptyState({ title: "No results", body: "No URL/window comparison rows were generated." });
  }

  return `
    <div class="table-wrap table-scroll url-results-table-wrap">
      <table class="url-results-table">
        <thead>
          <tr>
            <th>URL</th>
            <th>Previous clicks</th>
            <th>Current clicks</th>
            <th>Click Δ</th>
            <th>Click Δ %</th>
            <th>Previous impressions</th>
            <th>Current impressions</th>
            <th>Impression Δ</th>
            <th>Impression Δ %</th>
            <th>Previous CTR</th>
            <th>Current CTR</th>
            <th>Previous position</th>
            <th>Current position</th>
            <th>Position change</th>
            <th>Status</th>
            <th>Insight</th>
          </tr>
        </thead>
        <tbody id="urlCompareRows">
          ${flatRows.map((row) => `<tr class="${escapeHtml(rowToneClass(row.status))}" data-window-key="${escapeHtml(row.windowKey)}" data-status-key="${escapeHtml(statusKey(row.status))}">
            <td class="url-cell"><a href="${escapeHtml(row.url)}" title="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(compactUrlLabel(row.url))}</code></a></td>
            <td>${escapeHtml(formatInteger(row.previousClicks))}</td>
            <td>${escapeHtml(formatInteger(row.currentClicks))}</td>
            <td class="${escapeHtml(deltaClass(row.clickDelta))}">${escapeHtml(formatSignedInteger(row.clickDelta))}</td>
            <td class="${escapeHtml(deltaClass(row.clickDeltaPercent))}">${escapeHtml(formatSignedPercent(row.clickDeltaPercent))}</td>
            <td>${escapeHtml(formatInteger(row.previousImpressions))}</td>
            <td>${escapeHtml(formatInteger(row.currentImpressions))}</td>
            <td class="${escapeHtml(deltaClass(row.impressionDelta))}">${escapeHtml(formatSignedInteger(row.impressionDelta))}</td>
            <td class="${escapeHtml(deltaClass(row.impressionDeltaPercent))}">${escapeHtml(formatSignedPercent(row.impressionDeltaPercent))}</td>
            <td>${escapeHtml(formatPercent(row.previousCtr))}</td>
            <td>${escapeHtml(formatPercent(row.currentCtr))}</td>
            <td>${escapeHtml(formatDecimal(row.previousPosition))}</td>
            <td>${escapeHtml(formatDecimal(row.currentPosition))}</td>
            <td class="${escapeHtml(deltaClass(row.positionDelta, { inverse: true }))}">${escapeHtml(formatDecimal(row.positionDelta))}</td>
            <td><span class="status-badge ${escapeHtml(statusClass(row.status))}">${escapeHtml(row.status)}</span></td>
            <td class="insight-cell">${escapeHtml(row.insight)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="empty-state url-filter-empty" id="urlFilterEmpty" hidden>No URLs in this category.</p>`;
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

function renderUrlCompareAiSummary(aiSummary) {
  if (!aiSummary) return "";
  const hasMarkdown = Boolean(aiSummary.available && aiSummary.markdown);
  const debug = aiSummary.debug || "";
  const debugDetails = process.env.NODE_ENV !== "production" && debug
    ? `<details class="note-box"><summary>OpenRouter debug (non-production)</summary><pre>${escapeHtml(debug)}</pre></details>`
    : "";

  return `<section class="card ai-summary-card">
    <h2>AI URL Performance Summary</h2>
    <p class="muted">AI chỉ phân tích kết quả đã tóm tắt, không dùng raw GSC rows.</p>
    ${hasMarkdown ? renderMarkdownLite(aiSummary.markdown) : `<p class="empty">${escapeHtml(aiSummary.message || "AI summary unavailable, but URL comparison completed.")}</p>${debugDetails}`}
  </section>`;
}

function renderResultsPageStyles() {
  return `<style>
    .url-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}.metadata-card,.url-results-card,.invalid-rows-card{margin-bottom:16px}.metadata-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:12px 0 18px}.metadata-grid div{border:1px solid var(--line);border-radius:14px;background:var(--panel-2);padding:12px}.metadata-grid dt{color:var(--muted);font-weight:800;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}.metadata-grid dd{margin:6px 0 0;font-weight:800;overflow-wrap:anywhere}.metadata-card h3{font-family:"Space Grotesk";margin:8px 0 10px}.compare-window-list{display:grid;gap:8px;color:var(--muted)}.result-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin:12px 0 16px}.window-tabs{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}.window-tab{border:1px solid var(--line);background:#fff;color:var(--muted);border-radius:999px;padding:10px 14px;font-weight:800;cursor:pointer}.window-tab.active,.window-tab:hover{background:var(--brand);border-color:var(--brand);color:#fff}.status-filter{min-width:220px}.export-actions{display:flex;gap:10px;flex-wrap:wrap}.url-results-table{min-width:1500px}.url-cell code{display:inline-block;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.insight-cell{min-width:260px}.delta-positive{color:var(--green);font-weight:800}.delta-negative{color:var(--red);font-weight:800}.delta-neutral{color:var(--gray);font-weight:700}.row-growth{background:rgba(220,252,231,.24)}.row-decline{background:rgba(254,226,226,.24)}.row-warning{background:rgba(255,237,213,.34)}.row-error{background:rgba(254,226,226,.42)}.row-stable{background:#fff}.status-error-row{box-shadow:inset 0 0 0 1px rgba(185,28,28,.12)}.url-filter-empty{margin-top:12px}.copy-status{align-self:center;color:var(--muted);font-weight:700}.table-scroll{overflow:auto;-webkit-overflow-scrolling:touch}.ai-summary-card{margin-bottom:16px}.ai-markdown{display:grid;gap:10px}.ai-markdown h3{font-family:"Space Grotesk";margin:12px 0 0}.ai-markdown h4{margin:8px 0 0}.ai-markdown p,.ai-markdown ul{margin:0;color:var(--text)}.markdown-table{width:100%;border-collapse:collapse;margin-top:8px}.markdown-table th,.markdown-table td{border:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}.markdown-pre{white-space:pre-wrap;background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:12px}.table-scroll{overflow:auto;-webkit-overflow-scrolling:touch}@media(max-width:900px){.url-summary-grid,.metadata-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.result-toolbar{display:block}.status-filter{margin-top:12px;min-width:0}.export-actions .btn{width:100%}.url-cell code{max-width:220px}}@media(max-width:620px){.url-summary-grid,.metadata-grid{grid-template-columns:1fr}.window-tab{flex:1 0 auto}.url-results-table{min-width:1320px}}
  </style>`;
}

function renderResultsPageScript({ flatRows = [], generatedDate = "" } = {}) {
  const csvColumns = [
    "url", "window_key", "window_label", "previous_start", "previous_end", "current_start", "current_end",
    "previous_clicks", "current_clicks", "click_delta", "click_delta_percent", "previous_impressions",
    "current_impressions", "impression_delta", "impression_delta_percent", "previous_ctr", "current_ctr",
    "previous_position", "current_position", "position_delta", "status", "insight",
  ];

  return `
    <script type="application/json" id="urlCompareCsvRows">${safeJsonForHtml(buildCsvRows(flatRows))}</script>
    <script>
      (() => {
        const rows = Array.from(document.querySelectorAll("#urlCompareRows tr"));
        const tabs = Array.from(document.querySelectorAll("[data-window-tab]"));
        const filter = document.getElementById("urlStatusFilter");
        const empty = document.getElementById("urlFilterEmpty");
        const downloadButton = document.getElementById("downloadUrlCompareCsv");
        const copyButton = document.getElementById("copyUrlCompareCsv");
        const copyStatus = document.getElementById("copyCsvStatus");
        const csvColumns = ${safeJsonForHtml(csvColumns)};
        let activeWindow = tabs[0]?.dataset.windowTab || "";

        function updateRows() {
          const selectedStatus = filter?.value || "all";
          let visibleCount = 0;
          rows.forEach((row) => {
            const statusMatches = selectedStatus === "all" || row.dataset.statusKey === selectedStatus;
            const windowMatches = !activeWindow || row.dataset.windowKey === activeWindow;
            const isVisible = statusMatches && windowMatches;
            row.hidden = !isVisible;
            if (isVisible) visibleCount += 1;
          });
          if (empty) empty.hidden = visibleCount > 0;
        }

        tabs.forEach((tab) => {
          tab.addEventListener("click", () => {
            activeWindow = tab.dataset.windowTab;
            tabs.forEach((item) => {
              const isActive = item === tab;
              item.classList.toggle("active", isActive);
              item.setAttribute("aria-selected", String(isActive));
            });
            updateRows();
          });
        });

        filter?.addEventListener("change", updateRows);
        updateRows();

        function readCsvRows() {
          const element = document.getElementById("urlCompareCsvRows");
          if (!element) return [];
          try {
            const parsed = JSON.parse(element.textContent || "[]");
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }

        function csvEscape(value) {
          if (value == null) return "";
          const text = String(value);
          if (/[",\r\n]/.test(text)) {
            return '"' + text.replace(/"/g, '""') + '"';
          }
          return text;
        }

        function buildCsv() {
          const dataRows = readCsvRows();
          const header = csvColumns.join(",");
          const body = dataRows.map((row) => csvColumns.map((column) => csvEscape(row[column])).join(","));
          return [header, ...body].join("\n");
        }

        downloadButton?.addEventListener("click", () => {
          const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "url-performance-compare-1m-2m-3m-${escapeHtml(generatedDate)}.csv";
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        });

        copyButton?.addEventListener("click", async () => {
          if (!navigator.clipboard?.writeText) {
            if (copyStatus) copyStatus.textContent = "Clipboard is not available in this browser.";
            return;
          }
          try {
            await navigator.clipboard.writeText(buildCsv());
            if (copyStatus) copyStatus.textContent = "CSV copied.";
          } catch {
            if (copyStatus) copyStatus.textContent = "Copy failed.";
          }
        });
      })();
    </script>`;
}

export function renderUrlPerformanceResultsPage({ user = null, authenticated = false, result = {}, comparison = {}, defaultValues = {}, aiSummary = null } = {}) {
  const flatRows = comparison.flatRows || [];
  const generatedAt = new Date();
  const generatedDate = generatedAt.toISOString().slice(0, 10);
  const body = `
    ${renderResultsPageStyles()}
    <section class="hero">
      <div>
        <p class="muted">SEO tools</p>
        <h1>URL Performance Compare Results</h1>
        <p>Each valid URL was compared across the automatic 1M, 2M, and 3M windows.</p>
      </div>
      <div class="actions"><a class="btn btn-secondary" href="/tools/url-performance">Back to URL compare</a></div>
    </section>

    ${renderList(result.warnings || [], "warning")}
    ${renderMetadataList({ result, comparison, defaultValues, generatedAt })}
    ${renderSummaryCards({ validCount: result.validCount || 0, rowCount: flatRows.length, statusCounts: comparison.statusCounts || {} })}
    ${renderUrlCompareAiSummary(aiSummary)}

    <section class="card url-results-card">
      <div class="split">
        <div>
          <h2>Comparison rows</h2>
          <p class="muted">Use the window tabs and status filter to review each automatic comparison period.</p>
        </div>
        <div class="export-actions">
          <button class="btn" type="button" id="downloadUrlCompareCsv">Download CSV</button>
          <button class="btn btn-secondary" type="button" id="copyUrlCompareCsv">Copy CSV</button>
          <span class="copy-status" id="copyCsvStatus" aria-live="polite"></span>
        </div>
      </div>
      <div class="result-toolbar">
        ${renderWindowTabs(result.compareWindows || [])}
        <label class="status-filter" for="urlStatusFilter">Status filter
          <select id="urlStatusFilter">
            <option value="all">All</option>
            <option value="growing">Growing</option>
            <option value="declining">Declining</option>
            <option value="new_traffic">New Traffic</option>
            <option value="lost_traffic">Lost Traffic</option>
            <option value="high_impressions_low_ctr">Low CTR</option>
            <option value="error">Errors</option>
          </select>
        </label>
      </div>
      ${renderUrlPerformanceResultsTable(flatRows)}
    </section>

    ${renderInvalidRowsTable(result.invalidRows || [], { showEmpty: false })}
    ${renderResultsPageScript({ flatRows, generatedDate })}
  `;

  return renderLayout({
    title: "URL Performance Compare Results · SEO Reporter",
    body,
    user,
    authenticated,
    activeNav: "url-performance",
  });
}
