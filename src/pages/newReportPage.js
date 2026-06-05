import { renderLayout } from "../ui/layout.js";
import { escapeHtml } from "../ui/html.js";
import { renderAlert, renderEmptyState, renderHelpBox } from "../ui/components.js";
import { checked, renderFieldHelper, selected } from "../ui/forms.js";
import { getMostRecentCompletedMonth, getPreviousMonthRange } from "../lib/reportPeriods.js";

function option(value, label, current) {
  return `<option value="${escapeHtml(value)}" ${selected(value, current)}>${escapeHtml(label)}</option>`;
}

export function renderNewReportPage({ sites = [], authenticated = false, user = null, defaultValues = {}, error = "", warning = "", googleApiError = null } = {}) {
  const siteUrl = defaultValues.siteUrl || defaultValues.selectedSiteUrl || sites[0]?.siteUrl || "";
  const sourceType = defaultValues.sourceType || "gsc";
  const reportType = defaultValues.reportType || "custom";
  const reportPeriod = defaultValues.reportPeriod || "30d";
  const monthlyRange = getMostRecentCompletedMonth(new Date(), Number.parseInt(process.env.GSC_DATA_DELAY_DAYS || "2", 10));
  const previousMonthlyRange = getPreviousMonthRange(monthlyRange);
  const searchType = defaultValues.searchType || "web";
  const noPropertiesWarning = authenticated && !googleApiError && sites.length === 0 ? "No Search Console properties found for this Google account." : "";
  const gscOptions = sites
    .map((site) => `<option value="${escapeHtml(site.siteUrl)}" data-permission="${escapeHtml(site.permissionLevel)}" ${selected(site.siteUrl, siteUrl)}>${escapeHtml(site.siteUrl)} (${escapeHtml(site.permissionLevel)})</option>`)
    .join("");

  const body = `
    ${renderAlert({ type: "error", message: error })}
    ${renderAlert({ type: "warning", message: warning || noPropertiesWarning || (googleApiError ? `Search Console API error: ${googleApiError.message}` : "") })}
    <section class="hero">
      <div>
        <p class="muted">Report builder</p>
        <h1>Generate Report Preview</h1>
        <p>Choose a Google Search Console property and filters, then generate a preview. Nothing is saved until you click Save Report on the generated report page.</p>
      </div>
      <div class="actions"><a class="btn btn-secondary" href="/">Back to dashboard</a></div>
    </section>

    ${!authenticated ? renderEmptyState({
      title: "Authenticate Google first",
      body: "Connect Google before loading Search Console properties and generating GSC reports.",
      actionHtml: '<a class="btn" href="/auth/google">Authenticate Google first</a>',
    }) : `
      <form class="card" method="post" action="/generate">
        <div class="grid grid-2">
          <div class="field">
            <label for="sourceType">Source type</label>
            <select id="sourceType" name="sourceType">
              ${option("gsc", "GSC API", sourceType)}
              ${option("looker", "Looker CSV fallback", sourceType)}
            </select>
            ${renderFieldHelper("Use the GSC API for authenticated reporting. Generated previews are not saved automatically. Use Save Report on the preview page to add one to history.")}
          </div>
          <div class="field">
            <label for="siteUrl">GSC property</label>
            <select id="siteUrl" name="siteUrl" ${sites.length ? "" : "disabled"}>
              ${sites.length ? gscOptions : '<option value="">No properties found</option>'}
            </select>
            ${renderFieldHelper("Existing Search Console properties still load from the connected Google account.")}
          </div>
        </div>

        <div class="grid grid-2">
          <div class="field source-looker">
            <label for="lookerCsvPath">Looker CSV path</label>
            <input id="lookerCsvPath" name="lookerCsvPath" value="${escapeHtml(defaultValues.lookerCsvPath || (sourceType === "looker" ? "samples/gsc-looker-sample.csv" : ""))}" data-default="samples/gsc-looker-sample.csv" />
          </div>
          <div class="field source-looker">
            <label for="contentCsvPath">Content CSV path</label>
            <input id="contentCsvPath" name="contentCsvPath" value="${escapeHtml(defaultValues.contentCsvPath || (sourceType === "looker" ? "samples/content-sample.csv" : ""))}" data-default="samples/content-sample.csv" />
          </div>
        </div>

        <div class="grid grid-2">
          <div class="field">
            <label for="reportType">Report type</label>
            <select id="reportType" name="reportType">
              ${option("monthly", "Monthly SEO Report", reportType)}
              ${option("quarterly", "Quarterly SEO Report", reportType)}
              ${option("custom", "Custom Report", reportType)}
            </select>
            ${renderFieldHelper("Monthly reports use the most recently completed GSC month. Quarterly reports are coming soon.")}
          </div>
          <div class="field">
            <label for="searchType">Search type</label>
            <select id="searchType" name="searchType">
              ${option("web", "Web", searchType)}
              ${option("image", "Image", searchType)}
              ${option("video", "Video", searchType)}
              ${option("news", "News", searchType)}
            </select>
          </div>
        </div>

        <div class="monthly-report-helper help-box" data-current-month="${escapeHtml(monthlyRange.label)}" data-previous-month="${escapeHtml(previousMonthlyRange.label)}">
          <strong>Monthly report uses the most recently completed GSC month.</strong>
          <p>Current period: ${escapeHtml(monthlyRange.label)} (${escapeHtml(monthlyRange.start)} → ${escapeHtml(monthlyRange.end)}). Previous comparable period: ${escapeHtml(previousMonthlyRange.label)} (${escapeHtml(previousMonthlyRange.start)} → ${escapeHtml(previousMonthlyRange.end)}).</p>
        </div>
        <div class="quarterly-report-helper help-box">
          <strong>Quarterly SEO Report is coming soon.</strong>
          <p>Please choose Monthly SEO Report or Custom Report for now.</p>
        </div>

        <div class="grid grid-2 custom-report-controls">
          <div class="field">
            <label for="reportPeriod">Report period</label>
            <select id="reportPeriod" name="reportPeriod">
              ${option("7d", "7d", reportPeriod)}
              ${option("30d", "30d", reportPeriod)}
              ${option("90d", "90d", reportPeriod)}
              ${option("180d", "180d", reportPeriod)}
              ${option("custom", "Custom", reportPeriod)}
            </select>
            ${renderFieldHelper("Preset periods end on the latest reliable GSC date; custom lets you provide exact start and end dates.")}
          </div>
        </div>

        <div class="grid grid-2 custom-report-controls">
          <div class="field custom-date">
            <label for="startDate">Custom start date</label>
            <input id="startDate" type="date" name="startDate" value="${escapeHtml(defaultValues.startDate || "")}" />
          </div>
          <div class="field custom-date">
            <label for="endDate">Custom end date</label>
            <input id="endDate" type="date" name="endDate" value="${escapeHtml(defaultValues.endDate || "")}" />
          </div>
        </div>

        <div class="field">
          <label for="pageContains">Event/Page filter</label>
          <input id="pageContains" name="pageContains" placeholder="/ten-su-kien/" value="${escapeHtml(defaultValues.pageContains || "")}" />
          ${renderFieldHelper("Page contains example: /ten-su-kien/ limits the report to URLs that include that path segment.")}
        </div>

        <div class="field">
          <label for="trackedKeywords">Tracked keywords</label>
          <textarea id="trackedKeywords" name="trackedKeywords" placeholder="one keyword per line">${escapeHtml(defaultValues.trackedKeywords || "")}</textarea>
          ${renderFieldHelper("Add one keyword per line to compare current vs previous ranking movement. Average position is a ranking metric where lower is better.")}
        </div>

        <div class="checkbox-row field">
          <input id="enableAiInsights" type="checkbox" name="enableAiInsights" value="1" ${checked(defaultValues.enableAiInsights)} />
          <div>
            <label for="enableAiInsights">Enable OpenRouter AI insight</label>
            ${renderFieldHelper("OpenRouter insights run only when enabled and OPENROUTER_API_KEY is configured; no API key value is shown in the UI.")}
          </div>
        </div>

        ${renderHelpBox({ title: "Average position note", body: "For average position, lower is better. A movement from 12 to 8 is an improvement even though the numeric value decreased." })}
        <div class="actions" style="margin-top:18px;"><button id="createReportButton" class="btn" type="submit" ${sourceType === "gsc" && !sites.length ? "disabled" : ""}>Generate Preview</button><a class="btn btn-secondary" href="/reports">Saved Reports</a><a class="btn btn-secondary" href="/">Cancel</a></div>
      </form>
      <script>
        const sourceType = document.getElementById("sourceType");
        const reportType = document.getElementById("reportType");
        const reportPeriod = document.getElementById("reportPeriod");
        const sourceLookerFields = Array.from(document.querySelectorAll(".source-looker"));
        const customReportControls = Array.from(document.querySelectorAll(".custom-report-controls"));
        const customDateFields = Array.from(document.querySelectorAll(".custom-date input"));
        const monthlyHelper = document.querySelector(".monthly-report-helper");
        const quarterlyHelper = document.querySelector(".quarterly-report-helper");
        const createReportButton = document.getElementById("createReportButton");
        const hasGscProperties = ${sites.length > 0 ? "true" : "false"};
        function syncSource() {
          const looker = sourceType.value === "looker";
          sourceLookerFields.forEach((field) => {
            field.classList.toggle("field-hidden", !looker);
            field.querySelectorAll("input").forEach((input) => {
              input.disabled = !looker;
              if (looker && !input.value && input.dataset.default) input.value = input.dataset.default;
            });
          });
          if (createReportButton) createReportButton.disabled = !looker && !hasGscProperties;
        }
        function syncDates() {
          const monthly = reportType.value === "monthly";
          const quarterly = reportType.value === "quarterly";
          const customReport = reportType.value === "custom";
          customReportControls.forEach((field) => field.classList.toggle("field-hidden", !customReport));
          if (monthlyHelper) monthlyHelper.classList.toggle("field-hidden", !monthly);
          if (quarterlyHelper) quarterlyHelper.classList.toggle("field-hidden", !quarterly);
          const customDatesEnabled = customReport && reportPeriod.value === "custom";
          customDateFields.forEach((input) => { input.disabled = !customDatesEnabled; });
          if (createReportButton) createReportButton.disabled = quarterly || (sourceType.value !== "looker" && !hasGscProperties);
        }
        sourceType.addEventListener("change", () => { syncSource(); syncDates(); });
        reportType.addEventListener("change", syncDates);
        reportPeriod.addEventListener("change", syncDates);
        syncSource(); syncDates();
      </script>`}
  `;

  return renderLayout({ title: "Create New Report · SEO Reporter", body, user, authenticated, activeNav: "new-report" });
}
