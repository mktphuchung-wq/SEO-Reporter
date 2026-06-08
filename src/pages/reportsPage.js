import { renderLayout } from "../ui/layout.js";
import { escapeHtml } from "../ui/html.js";

function formatJobTimestamp(value) {
  if (!value) {
    return "—";
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

function reportPeriodLabelForFilters(filters = {}) {
  if (filters.reportType === "monthly") return "monthly";
  if (filters.reportType === "quarterly") return "quarterly";
  return filters.reportPeriod || "custom";
}

function renderReportRows(jobs) {
  return jobs
    .map((job) => {
      const encodedId = encodeURIComponent(job.id);
      const filters = job.filters || job.report_json?.filters || {};
      const ai = job.ai_insights || job.report_json?.aiInsights || job.report_json?.keywordOpportunities?.aiInsights || {};
      const aiLabel = ai.available ? "Enabled / available" : (ai.message === "AI insight not requested." ? "Not enabled" : "Unavailable");
      return `<tr><td>${escapeHtml(formatJobTimestamp(job.completed_at || job.created_at))}</td><td>${escapeHtml(job.property_url || job.source_info?.property || "—")}</td><td>${escapeHtml(job.start_date || job.source_info?.range?.start || "—")} → ${escapeHtml(job.end_date || job.source_info?.range?.end || "—")}</td><td>${escapeHtml(job.report_period || reportPeriodLabelForFilters(filters))}</td><td>${escapeHtml(job.page_contains || filters.pageContains || "None")}</td><td>${escapeHtml(aiLabel)}</td><td><a href="/reports/${encodedId}/view">View</a></td></tr>`;
    })
    .join("");
}

export function renderReportsPage({ jobs = [], user = null, authenticated = false, activeNav = "reports" } = {}) {
  const rows = renderReportRows(jobs);
  const reportsContent = jobs.length
    ? `<div class="table-wrap"><table><thead><tr><th>Saved</th><th>Property</th><th>Date range</th><th>Report period</th><th>Page filter</th><th>AI</th><th>View</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : "<p>No saved reports found for this signed-in user yet.</p>";

  const body = `
    <section class="card">
      <div class="split">
        <div>
          <p class="muted">Report history</p>
          <h1>Saved Reports</h1>
          <p>Only reports explicitly saved from a generated preview appear here.</p>
        </div>
        <div class="actions"><a class="btn" href="/reports/new">Generate Preview</a></div>
      </div>
      ${reportsContent}
    </section>
  `;
  return renderLayout({ title: "Saved Reports · SEO Reporter", body, user, authenticated, activeNav });
}
