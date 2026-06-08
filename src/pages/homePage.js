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
    { title: "Generate SEO Report", href: "/reports/new", body: "Create a new Search Console or CSV-powered SEO report preview." },
    { title: "Compare URL Performance", href: "/tools/url-performance", body: "Review URL-level performance changes and spot movement across pages." },
    { title: "Saved Reports", href: "/reports", body: "Open previews that were explicitly saved for reporting history." },
    { title: "Settings", href: "/settings", body: "Manage account preferences and reporting configuration." },
  ];

  const dashboardCardSection = `
    <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-bottom:16px;">
      ${dashboardCards.map((card) => `
        <article class="card">
          <h2>${escapeHtml(card.title)}</h2>
          <p class="muted">${escapeHtml(card.body)}</p>
          <a class="btn" href="${escapeHtml(card.href)}">${escapeHtml(card.title)}</a>
        </article>
      `).join("")}
    </section>
  `;

  const body = `
    ${renderAlert({ type: "success", message: success })}
    ${renderAlert({ type: "warning", message: warning || (googleApiError ? propertyMessage : "") })}
    ${renderAlert({ type: "error", message: error })}
    <section class="hero">
      <div>
        <p class="muted">Internal SaaS dashboard</p>
        <h1>Dashboard Overview</h1>
        <p>Build Google Search Console reports, track URL and keyword movement, and prepare SEO insights for stakeholders.</p>
      </div>
      <div class="actions">
        ${authenticated ? `<a class="btn" href="/reports/new">Generate Preview</a>` : `<a class="btn" href="/auth/google">Authenticate Google</a>`}
        ${authenticated ? `<a class="btn btn-secondary" href="/auth/logout">Logout Google</a>` : ""}
      </div>
    </section>

    ${dashboardCardSection}

    ${!authenticated ? renderEmptyState({
      title: "Authenticate Google first",
      body: "Connect a Google account with Search Console access to view properties and create reports.",
      actionHtml: '<a class="btn" href="/auth/google">Authenticate Google</a>',
    }) : `
      <section class="grid grid-3">
        ${renderMetricCard({ label: "Google connection", value: googleStatus, helper: propertyMessage, tone: googleApiError ? "orange" : "green" })}
        ${renderMetricCard({ label: "GSC properties found", value: sites.length, helper: "Verified site and domain properties available to this account.", tone: sites.length > 0 ? "blue" : "orange" })}
        ${renderMetricCard({ label: "Selected/default property", value: selectedSiteUrl || "None", helper: selectedPermission ? `Permission: ${selectedPermission}` : "Select a property when creating a report.", tone: selectedSiteUrl ? "green" : "gray" })}
      </section>

      <section class="card" style="margin-top:14px;">
        <div class="split">
          <div>
            <h2>Google Search Console</h2>
            <p class="muted">Status: ${renderStatusBadge(googleStatus)} ${selectedSiteUrl ? `Default property: <strong>${escapeHtml(selectedSiteUrl)}</strong>` : ""}</p>
          </div>
          <div class="actions"><a class="btn" href="/reports/new">Generate Preview</a><a class="btn btn-secondary" href="/settings">Review Settings</a></div>
        </div>
      </section>

      <section class="card" style="margin-top:14px;">
        <div class="split">
          <div>
            <h2>Saved Reports</h2>
            <p class="muted">Saved report history includes only previews that were explicitly saved.</p>
          </div>
          <a class="btn btn-secondary" href="/reports">Open Saved Reports</a>
        </div>
        ${renderTable({
          columns: [
            { key: "name", label: "Report" },
            { key: "status", label: "Status", render: (row) => renderStatusBadge(row.status) },
            { key: "updated", label: "Updated" },
          ],
          rows: [],
        })}
      </section>`}
  `;

  return renderLayout({ title: "Dashboard Overview · SEO Reporter", body, user, authenticated, activeNav: "dashboard" });
}
