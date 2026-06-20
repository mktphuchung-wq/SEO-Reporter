import { renderLayout } from "../ui/layout.js";
import { escapeHtml } from "../ui/html.js";
import { renderMetricCard, renderStatusBadge } from "../ui/components.js";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function td(value) {
  return `<td>${value == null ? "" : value}</td>`;
}

export function renderTeamPerformancePage({ rowsData = [], user = null, authenticated = Boolean(user) } = {}) {
  const summary = rowsData.reduce((acc, row) => {
    acc.totalManagedUrls += Number(row.url_count || 0);
    acc.totalCurrentClicks += Number(row.current_clicks || 0);
    acc.totalCurrentImpressions += Number(row.current_impressions || 0);
    acc.growingUrls += Number(row.growing_urls || 0);
    acc.decliningUrls += Number(row.declining_urls || 0);
    if (row.status === "active") acc.activeMembers += 1;
    return acc;
  }, { totalMembers: rowsData.length, activeMembers: 0, totalManagedUrls: 0, totalCurrentClicks: 0, totalCurrentImpressions: 0, growingUrls: 0, decliningUrls: 0 });

  const cards = `<div class="metric-grid">${renderMetricCard({ label: "Total members", value: formatNumber(summary.totalMembers) })}${renderMetricCard({ label: "Active members", value: formatNumber(summary.activeMembers) })}${renderMetricCard({ label: "Total managed URLs", value: formatNumber(summary.totalManagedUrls) })}${renderMetricCard({ label: "Total current clicks", value: formatNumber(summary.totalCurrentClicks), tone: "green" })}${renderMetricCard({ label: "Total current impressions", value: formatNumber(summary.totalCurrentImpressions), tone: "blue" })}${renderMetricCard({ label: "Growing URLs", value: formatNumber(summary.growingUrls), tone: "green" })}${renderMetricCard({ label: "Declining URLs", value: formatNumber(summary.decliningUrls), tone: "red" })}</div>`;
  const rows = rowsData.map((row) => {
    const actions = [
      row.latest_job_id ? `<a class="btn btn-secondary" href="/team/quarterly-jobs/${row.latest_job_id}/results">View Latest Results</a>` : "",
      `<form method="post" action="/team/${row.id}/run-quarterly" style="display:inline"><button class="btn btn-secondary" type="submit">Run</button></form>`,
    ].filter(Boolean).join(" ");
    return `<tr>${td(`<a href="/team/${row.id}">${escapeHtml(row.name)}</a>`)}${td(escapeHtml(row.email || "—"))}${td(escapeHtml(row.default_property_url || "—"))}${td(formatNumber(row.url_count))}${td(escapeHtml(row.latest_period || row.latest_quarter || "—"))}${td(formatNumber(row.previous_clicks))}${td(formatNumber(row.current_clicks))}${td(formatNumber(row.click_delta))}${td(formatNumber(row.previous_impressions))}${td(formatNumber(row.current_impressions))}${td(formatNumber(row.impression_delta))}${td(formatNumber(row.growing_urls))}${td(formatNumber(row.declining_urls))}${td(formatNumber(row.new_traffic))}${td(formatNumber(row.lost_traffic))}${td(row.last_job_status ? renderStatusBadge(row.last_job_status) : "—")}${td(actions)}</tr>`;
  });
  const performanceTable = rows.length ? table(["Member", "Email", "Property", "URL Count", "Latest Period", "Previous Clicks", "Current Clicks", "Click Δ", "Previous Impressions", "Current Impressions", "Impression Δ", "Growing URLs", "Declining URLs", "New Traffic", "Lost Traffic", "Latest Job Status", "Actions"], rows) : '<div class="empty-state"><p>No team performance data yet. Add members and run quarterly tracking.</p></div>';
  return renderLayout({ title: "Team Performance", pageTitle: "Team Performance", activeNav: "team-performance", pageDescription: "Monitor quarterly URL performance by member.", body: `${cards}<br>${performanceTable}`, authenticated, user });
}
