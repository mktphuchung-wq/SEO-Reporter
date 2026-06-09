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

function renderInvalidRowsTable(invalidRows = []) {
  if (!invalidRows.length) {
    return `
      <section class="card">
        <h2>Invalid URL rows</h2>
        <p class="muted">No invalid URL rows found.</p>
      </section>`;
  }

  return `
    <section class="card">
      <h2>Invalid URL rows</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Row</th><th>URL</th><th>Error</th><th>Raw input</th></tr>
          </thead>
          <tbody>
            ${invalidRows
              .map(
                (row) => `<tr>
                  <td>${escapeHtml(row.rowNumber)}</td>
                  <td>${escapeHtml(row.url || "")}</td>
                  <td>${escapeHtml((row.errors || []).join("; "))}</td>
                  <td><code>${escapeHtml(row.raw || "")}</code></td>
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

function renderStatusCounts(statusCounts = {}) {
  const entries = Object.entries(statusCounts);
  if (!entries.length) return '<p class="muted">No comparison rows generated.</p>';
  return `<div class="pill-row">${entries.map(([status, count]) => `<span class="badge">${escapeHtml(status)}: ${escapeHtml(count)}</span>`).join(" ")}</div>`;
}

function renderUrlPerformanceResultsTable(flatRows = []) {
  if (!flatRows.length) {
    return renderEmptyState({ title: "No results", body: "No URL/window comparison rows were generated." });
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Row</th><th>URL</th><th>Window</th><th>Previous</th><th>Current</th>
            <th>Prev clicks</th><th>Curr clicks</th><th>Click Δ</th><th>Click Δ%</th>
            <th>Prev impr.</th><th>Curr impr.</th><th>Impr. Δ</th><th>Impr. Δ%</th>
            <th>Prev CTR</th><th>Curr CTR</th><th>Prev pos.</th><th>Curr pos.</th><th>Pos. Δ</th>
            <th>Match</th><th>Status</th><th>Insight</th>
          </tr>
        </thead>
        <tbody>
          ${flatRows.map((row) => `<tr>
            <td>${escapeHtml(row.rowNumber)}</td>
            <td><code>${escapeHtml(row.url)}</code></td>
            <td>${escapeHtml(row.windowLabel || row.windowKey)}</td>
            <td>${escapeHtml(row.previousStart)} → ${escapeHtml(row.previousEnd)}</td>
            <td>${escapeHtml(row.currentStart)} → ${escapeHtml(row.currentEnd)}</td>
            <td>${escapeHtml(formatInteger(row.previousClicks))}</td>
            <td>${escapeHtml(formatInteger(row.currentClicks))}</td>
            <td>${escapeHtml(formatInteger(row.clickDelta))}</td>
            <td>${escapeHtml(formatPercent(row.clickDeltaPercent))}</td>
            <td>${escapeHtml(formatInteger(row.previousImpressions))}</td>
            <td>${escapeHtml(formatInteger(row.currentImpressions))}</td>
            <td>${escapeHtml(formatInteger(row.impressionDelta))}</td>
            <td>${escapeHtml(formatPercent(row.impressionDeltaPercent))}</td>
            <td>${escapeHtml(formatPercent(row.previousCtr))}</td>
            <td>${escapeHtml(formatPercent(row.currentCtr))}</td>
            <td>${escapeHtml(formatDecimal(row.previousPosition))}</td>
            <td>${escapeHtml(formatDecimal(row.currentPosition))}</td>
            <td>${escapeHtml(formatDecimal(row.positionDelta))}</td>
            <td>${escapeHtml(row.matchTypePrevious)} / ${escapeHtml(row.matchTypeCurrent)}</td>
            <td><strong>${escapeHtml(row.status)}</strong></td>
            <td>${escapeHtml(row.insight)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

export function renderUrlPerformanceResultsPage({ user = null, authenticated = false, result = {}, comparison = {}, defaultValues = {} } = {}) {
  const body = `
    <section class="hero">
      <div>
        <p class="muted">SEO tools</p>
        <h1>URL Performance Compare results</h1>
        <p>Each valid URL was compared across the automatic 1M, 2M, and 3M windows.</p>
      </div>
      <div class="actions"><a class="btn btn-secondary" href="/tools/url-performance">Back to URL compare</a></div>
    </section>

    ${renderList(result.warnings || [], "warning")}
    ${renderInvalidRowsTable(result.invalidRows || [])}

    <section class="card">
      <h2>Run summary</h2>
      <p><strong>Property:</strong> ${escapeHtml(defaultValues.siteUrl || defaultValues.selectedSiteUrl || "")}</p>
      <p><strong>Search type:</strong> ${escapeHtml(defaultValues.searchType || "web")}</p>
      <p><strong>Total URLs checked:</strong> ${escapeHtml(result.validCount || 0)} valid URLs${result.invalidCount ? ` (${escapeHtml(result.invalidCount)} invalid rows skipped)` : ""}</p>
      ${renderStatusCounts(comparison.statusCounts || {})}
    </section>

    ${renderCompareWindows(result.compareWindows || [])}

    <section class="card">
      <h2>Comparison rows</h2>
      ${renderUrlPerformanceResultsTable(comparison.flatRows || [])}
    </section>
  `;

  return renderLayout({
    title: "URL Performance Compare Results · SEO Reporter",
    body,
    user,
    authenticated,
    activeNav: "url-performance",
  });
}
