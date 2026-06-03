import { renderLayout } from "../ui/layout.js";
import { renderEmptyState } from "../ui/components.js";

export function renderReportsPage({ user = null, authenticated = false } = {}) {
  const body = `
    <section class="hero">
      <div>
        <p class="muted">Report history</p>
        <h1>Reports</h1>
        <p>Browse generated reports once persistent storage is connected.</p>
      </div>
      <div class="actions"><a class="btn" href="/reports/new">Create New Report</a></div>
    </section>
    ${renderEmptyState({
      title: "Report history will appear here after Supabase job storage is connected.",
      body: "Current report jobs are in-memory and may be lost on serverless cold starts, so this placeholder avoids promising persisted history.",
      actionHtml: '<a class="btn" href="/reports/new">Create New Report</a>',
    })}
  `;
  return renderLayout({ title: "Reports · SEO Reporter", body, user, authenticated, activeNav: "reports" });
}
