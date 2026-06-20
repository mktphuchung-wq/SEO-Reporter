import { renderLayout } from "../ui/layout.js";
import { escapeHtml } from "../ui/html.js";
import { renderStatusBadge } from "../ui/components.js";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function td(value) {
  return `<td>${value == null ? "" : value}</td>`;
}

function layout({ title, pageTitle, pageDescription = "", body, activeNav = "team", user = null, authenticated = Boolean(user) }) {
  return renderLayout({ title, pageTitle, pageDescription, body, activeNav, authenticated, user });
}

export function renderTeamMemberListPage({ members = [], user = null, authenticated = Boolean(user) } = {}) {
  const rows = members.map((member) => `<tr>${td(`<a href="/team/${member.id}">${escapeHtml(member.name)}</a>`)}${td(escapeHtml(member.email || "—"))}${td(escapeHtml(member.default_property_url || "—"))}${td(formatNumber(member.url_count))}${td(member.latest_job_status ? renderStatusBadge(member.latest_job_status) : "—")}${td(formatNumber(member.latest_current_clicks))}${td(formatNumber(member.latest_current_impressions))}${td(`<form method="post" action="/team/${member.id}/run-quarterly" style="display:inline"><button class="btn btn-secondary" type="submit">Run quarterly report</button></form>`)}</tr>`);
  const body = `<div class="actions"><a class="btn" href="/team/new">Add Member</a><a class="btn btn-secondary" href="/team/performance">Team Performance</a></div><br>${members.length ? table(["Member", "Email", "Default property", "URLs", "Last job", "Latest clicks", "Latest impressions", "Action"], rows) : '<div class="empty-state"><h2>No team members yet</h2><p>Create the first internal team member.</p></div>'}`;

  return layout({
    title: "Team Members · SEO Reporter",
    pageTitle: "Team Members",
    pageDescription: "Manage internal users, their GSC properties, and URL lists.",
    body,
    user,
    authenticated,
  });
}

export function renderNewTeamMemberForm({ user = null, authenticated = Boolean(user) } = {}) {
  const body = `<form class="card" method="post" action="/team"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Email</label><input name="email" type="email"></div><div class="grid grid-2"><div class="field"><label>Role</label><select name="role"><option value="member">member</option><option value="admin">admin</option></select></div><div class="field"><label>Status</label><select name="status"><option value="active">active</option><option value="inactive">inactive</option></select></div></div><div class="field"><label>Default property URL</label><input name="defaultPropertyUrl"></div><div class="field"><label>Notes</label><textarea name="notes"></textarea></div><button class="btn" type="submit">Create member</button></form>`;
  return layout({ title: "Add Team Member", pageTitle: "Add Team Member", body, user, authenticated });
}

export function renderTeamMemberDetailPage({ member, lists = [], jobs = [], user = null, authenticated = Boolean(user) } = {}) {
  const form = `<form class="card" method="post"><div class="grid grid-2"><div class="field"><label>Name</label><input name="name" value="${escapeHtml(member.name)}" required></div><div class="field"><label>Email</label><input name="email" value="${escapeHtml(member.email || "")}"></div></div><div class="field"><label>Default property</label><input name="defaultPropertyUrl" value="${escapeHtml(member.default_property_url || "")}"></div><button class="btn">Update member</button></form>`;
  const listRows = lists.map((list) => `<tr>${td(escapeHtml(list.name))}${td(escapeHtml(list.property_url))}${td(escapeHtml(list.search_type))}${td(formatNumber(list.url_count))}${td(renderStatusBadge(list.status))}</tr>`);
  const jobRows = jobs.map((job) => `<tr>${td(escapeHtml(job.quarter_label))}${td(renderStatusBadge(job.status))}${td(formatNumber(job.total_urls))}${td(`${formatNumber(job.completed_batches)}/${formatNumber(job.total_batches)}`)}${td(`<a href="/team/quarterly-jobs/${job.id}/status">Status</a> · <a href="/team/quarterly-jobs/${job.id}/results">Results</a>`)}</tr>`);
  const body = `<div class="actions"><a class="btn" href="/team/${member.id}/url-list">Add/Edit URL list</a><form method="post" action="/team/${member.id}/run-quarterly"><button class="btn btn-secondary">Run quarterly report</button></form></div>${form}<h2>URL Lists</h2>${table(["Name", "Property", "Search type", "URLs", "Status"], listRows)}<h2>Quarterly Jobs</h2>${table(["Quarter", "Status", "URLs", "Batches", "Action"], jobRows)}`;

  return layout({ title: member.name, pageTitle: member.name, body, user, authenticated });
}
