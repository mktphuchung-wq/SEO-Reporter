import { renderLayout } from "../ui/layout.js";
import { escapeHtml } from "../ui/html.js";
import { renderAlert, renderEmptyState, renderMetricCard, renderStatusBadge } from "../ui/components.js";
import { renderTable } from "../ui/tables.js";

function findSitePermission(sites, siteUrl) {
  return sites.find((site) => site.siteUrl === siteUrl)?.permissionLevel || "";
}

export function renderHomePage({ sites = [], authenticated = false, user = null, defaultValues = {}, error = "", warning = "", success = "", googleApiError = null } = {}) {
  const selectedSiteUrl = defaultValues.siteUrl || defaultValues.selectedSiteUrl || sites[0]?.siteUrl || "";
  const selectedPermission = findSitePermission(sites, selectedSiteUrl);
  const googleStatus = authenticated ? (googleApiError ? "warning" : "connected") : "disconnected";
  const propertyMessage = googleApiError
    ? `Search Console API error: ${googleApiError.message}`
    : authenticated && sites.length === 0
      ? "No Search Console properties found for this Google account. Make sure this account has access in Google Search Console."
      : "Google Search Console properties are loaded from the authenticated Google account.";

  const dashboardCards = [
    { title: "SEO Reports", href: "/reports/new", cta: "New Report", body: "Generate monthly, quarterly, or custom SEO reports from Google Search Console." },
    { title: "URL Performance Compare", href: "/tools/url-performance", cta: "Compare URLs", body: "Paste URL lists and compare page performance across 1M, 2M, and 3M windows." },
    { title: "Saved Reports", href: "/reports", cta: "Open Reports", body: "Review saved previews and historical reporting outputs." },
    { title: "Settings", href: "/settings", cta: "Open Settings", body: "Manage Google connection and app configuration." },
  ];

  const featureOverview = `
    <section class="feature-grid">
      ${dashboardCards.map((card) => `
        <article class="feature-card">
          <h2>${escapeHtml(card.title)}</h2>
          <p>${escapeHtml(card.body)}</p>
          <a class="btn btn-secondary" href="${escapeHtml(card.href)}">${escapeHtml(card.cta)}</a>
        </article>
      `).join("")}
    </section>
  `;

  const body = `
    ${renderAlert({ type: "success", message: success })}
    ${renderAlert({ type: "warning", message: warning || (googleApiError ? propertyMessage : "") })}
    ${renderAlert({ type: "error", message: error })}

    <section class="dashboard-hero">
      <div>
        <p class="muted">Internal SEO workspace</p>
        <h1>SEO Dashboard</h1>
        <p>Manage Google Search Console reports, URL comparisons, saved reports, and SEO insights from one workspace.</p>
      </div>
      <div class="dashboard-actions">
        <a class="btn" href="/reports/new">Generate SEO Report</a>
        <a class="btn btn-secondary" href="/tools/url-performance">Compare URL Performance</a>
      </div>
    </section>

    <section class="metric-grid" style="margin-bottom:16px;">
      ${renderMetricCard({ label: "Google connection", value: authenticated ? (googleApiError ? "Needs review" : "Connected") : "Disconnected", helper: authenticated ? propertyMessage : "Authenticate Google to load Search Console properties.", tone: authenticated ? (googleApiError ? "orange" : "green") : "gray" })}
      ${renderMetricCard({ label: "GSC properties found", value: authenticated ? sites.length : "—", helper: "Verified site and domain properties available to this account.", tone: authenticated && sites.length > 0 ? "blue" : "gray" })}
      ${renderMetricCard({ label: "Default property", value: selectedSiteUrl || "None", helper: selectedPermission ? `Permission: ${selectedPermission}` : "Select a property when creating a report.", tone: selectedSiteUrl ? "green" : "gray" })}
      ${renderMetricCard({ label: "Saved reports", value: "—", helper: "Open saved reports to review historical previews.", tone: "blue" })}
    </section>

    <div class="dashboard-grid">
      <div class="grid">
        ${featureOverview}

        <section class="card">
          <div class="split">
            <div>
              <h2>Recent activity</h2>
              <p class="muted">Saved report previews and recent workflow activity will appear here when available.</p>
            </div>
            <a class="btn btn-secondary" href="/reports">View saved reports</a>
          </div>
          ${renderTable({
            columns: [
              { key: "name", label: "Activity" },
              { key: "status", label: "Status", render: (row) => renderStatusBadge(row.status) },
              { key: "updated", label: "Updated" },
            ],
            rows: [],
          })}
        </section>
      </div>

      <aside class="quick-panel">
        <h2>Google Search Console</h2>
        <p class="muted">Connection status and quick actions for the current workspace.</p>
        <div class="grid" style="margin:16px 0;">
          <p><strong>Status:</strong> ${renderStatusBadge(googleStatus)}</p>
          <p><strong>Properties:</strong> ${escapeHtml(String(authenticated ? sites.length : "—"))}</p>
          <p><strong>Selected/default property:</strong><br>${escapeHtml(selectedSiteUrl || "None selected")}</p>
        </div>
        <div class="actions">
          <a class="btn" href="/reports/new">New Report</a>
          <a class="btn btn-secondary" href="/tools/url-performance">URL Compare</a>
          <a class="btn btn-secondary" href="/settings">Settings</a>
        </div>
        ${!authenticated ? `<div class="help-box" style="margin-top:16px;"><strong>Authenticate Google first</strong><p>Connect a Google account with Search Console access to view properties and create reports.</p></div>` : ""}
      </aside>
    </div>
  `;

  return renderLayout({ title: "Dashboard · SEO Reporter", pageTitle: "Dashboard", pageDescription: "Overview of Search Console reporting tools and SEO workflows.", body, user, authenticated, activeNav: "dashboard" });
}
