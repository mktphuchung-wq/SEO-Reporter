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

export function renderUrlPerformancePlaceholderPage({ user = null, authenticated = false } = {}) {
  const body = `
    <section class="hero">
      <div>
        <p class="muted">SEO tools</p>
        <h1>URL Performance Compare</h1>
        <p>URL Performance Compare backend is not implemented yet.</p>
      </div>
      <div class="actions"><a class="btn btn-secondary" href="/tools/url-performance">Back to URL compare</a></div>
    </section>
    <section class="card">
      <h2>URL Performance Compare backend is not implemented yet.</h2>
      <p class="muted">No Google Search Console comparison query was run. This placeholder keeps the form flow available until backend comparison logic is added.</p>
    </section>
  `;

  return renderLayout({
    title: "URL Performance Compare · SEO Reporter",
    body,
    user,
    authenticated,
    activeNav: "url-performance",
  });
}
