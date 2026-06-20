import { renderLayout } from "../ui/layout.js";
import { escapeHtml } from "../ui/html.js";

function selected(value, current) {
  return value === current ? " selected" : "";
}

export function renderTeamMemberUrlListPage({ lists = [], user = null, authenticated = Boolean(user) } = {}) {
  const active = lists.find((list) => list.status === "active") || lists[0] || {};
  const urls = Array.isArray(active.urls_json) ? active.urls_json.join("\n") : "";
  const searchType = active.search_type || "web";
  const body = `<form class="card" method="post"><div class="field"><label>List name</label><input name="listName" value="${escapeHtml(active.name || "Default URL List")}"></div><div class="field"><label>Property URL</label><input name="propertyUrl" value="${escapeHtml(active.property_url || "")}" required></div><div class="field"><label>Search type</label><select name="searchType"><option value="web"${selected("web", searchType)}>web</option><option value="image"${selected("image", searchType)}>image</option><option value="video"${selected("video", searchType)}>video</option><option value="news"${selected("news", searchType)}>news</option></select></div><div class="field"><label>URLs</label><textarea name="urlsText" required>${escapeHtml(urls)}</textarea><p class="helper">Mỗi URL một dòng. Nếu danh sách dài, app sẽ tự chia batch 50 URL khi chạy quarterly report.</p></div><button class="btn">Save URL list</button></form>`;
  return renderLayout({ title: "URL List", pageTitle: "URL List", body, activeNav: "team", authenticated, user });
}
