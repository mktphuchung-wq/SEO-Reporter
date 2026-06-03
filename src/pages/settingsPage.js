import { renderLayout } from "../ui/layout.js";
import { renderMetricCard, renderStatusBadge } from "../ui/components.js";
import { renderTable } from "../ui/tables.js";

function yesNoBadge(value) {
  return renderStatusBadge(value ? "connected" : "warning");
}

export function renderSettingsPage({ authenticated = false, user = null, sessionActive = false, debugRoutesEnabled = false, envHealth = {} } = {}) {
  const rows = [
    ["GOOGLE_CLIENT_ID", envHealth.GOOGLE_CLIENT_ID],
    ["GOOGLE_CLIENT_SECRET", envHealth.GOOGLE_CLIENT_SECRET],
    ["GOOGLE_REDIRECT_URI", envHealth.GOOGLE_REDIRECT_URI],
    ["SESSION_SECRET", envHealth.SESSION_SECRET],
    ["DATABASE_URL", envHealth.DATABASE_URL],
    ["GEMINI_API_KEY", envHealth.GEMINI_API_KEY],
  ].map(([name, configured]) => ({ name, configured }));

  const body = `
    <section class="hero">
      <div>
        <p class="muted">Admin checks</p>
        <h1>Settings</h1>
        <p>Review OAuth, session, debug-route, and environment configuration status without exposing secret values.</p>
      </div>
      <div class="actions"><a class="btn btn-secondary" href="/">Back to dashboard</a></div>
    </section>
    <section class="grid grid-3">
      ${renderMetricCard({ label: "Google OAuth status", value: authenticated ? "Connected" : "Not connected", helper: authenticated ? "OAuth tokens are present for this session." : "Authenticate Google to access Search Console.", tone: authenticated ? "green" : "gray" })}
      ${renderMetricCard({ label: "Session status", value: sessionActive ? "Active" : "Not active", helper: "Server session cookie state only; values are not displayed.", tone: sessionActive ? "blue" : "gray" })}
      ${renderMetricCard({ label: "Debug routes", value: debugRoutesEnabled ? "Enabled" : "Disabled", helper: "Controlled by ENABLE_DEBUG_ROUTES when present.", tone: debugRoutesEnabled ? "orange" : "green" })}
    </section>
    <section class="card" style="margin-top:14px;">
      <h2>Environment health checklist</h2>
      <p class="muted">Only yes/no configuration state is shown. Secret values are never printed.</p>
      ${renderTable({
        columns: [
          { key: "name", label: "Variable" },
          { key: "configured", label: "Configured", render: (row) => yesNoBadge(Boolean(row.configured)) },
        ],
        rows,
      })}
    </section>
  `;

  return renderLayout({ title: "Settings · SEO Reporter", body, user, authenticated, activeNav: "settings" });
}
