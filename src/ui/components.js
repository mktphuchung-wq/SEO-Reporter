import { escapeHtml } from "./html.js";
const STATUS_TONES = {
  connected: "green",
  completed: "green",
  verified: "green",
  warning: "orange",
  queued: "orange",
  running: "blue",
  failed: "red",
  error: "red",
  disconnected: "gray",
  neutral: "gray",
  unknown: "gray",
};

export function renderStatusBadge(status) {
  const normalized = String(status || "neutral").trim().toLowerCase();
  const tone = STATUS_TONES[normalized] || "gray";
  return `<span class="status-badge status-${tone}">${escapeHtml(status || "Neutral")}</span>`;
}

export function renderAlert({ type = "neutral", message = "" } = {}) {
  if (!message) return "";
  const normalized = ["success", "warning", "error", "info", "neutral"].includes(type) ? type : "neutral";
  return `<div class="alert alert-${normalized}" role="status">${escapeHtml(message)}</div>`;
}

export function renderHelpBox({ title = "Help", body = "" } = {}) {
  return `<aside class="help-box"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></aside>`;
}

export function renderEmptyState({ title = "Nothing here yet", body = "", actionHtml = "" } = {}) {
  return `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">◇</div>
      <h2>${escapeHtml(title)}</h2>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
      ${actionHtml ? `<div class="empty-actions">${actionHtml}</div>` : ""}
    </div>`;
}

export function renderMetricCard({ label, value, helper = "", tone = "neutral" } = {}) {
  const safeTone = ["green", "orange", "blue", "red", "gray", "neutral"].includes(tone) ? tone : "neutral";
  return `
    <article class="metric-card metric-${safeTone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${helper ? `<small>${escapeHtml(helper)}</small>` : ""}
    </article>`;
}
