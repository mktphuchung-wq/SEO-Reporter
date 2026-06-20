import { escapeHtml } from "./html.js";

const sidebarGroups = [
  { label: "Overview", links: [{ id: "dashboard", href: "/", label: "Dashboard", icon: "⌂" }] },
  { label: "Reports", links: [{ id: "new-report", href: "/reports/new", label: "New SEO Report", icon: "+" }, { id: "reports", href: "/reports", label: "Saved Reports", icon: "▤" }] },
  { label: "Tools", links: [{ id: "url-performance", href: "/tools/url-performance", label: "URL Performance Compare", icon: "↗" }] },
  { label: "Team", links: [{ id: "team", href: "/team", label: "Team Members", icon: "◎" }, { id: "team-performance", href: "/team/performance", label: "Team Performance", icon: "▣" }] },
  { label: "System", links: [{ id: "settings", href: "/settings", label: "Settings", icon: "⚙" }] },
];

function googleStatusLabel({ authenticated = false } = {}) {
  return authenticated ? "Google connected" : "Google disconnected";
}

export function renderAppNav({ active = "new-report", authenticated = false } = {}) {
  return `<aside class="app-sidebar" id="appSidebar" aria-label="Primary navigation">
    <a class="sidebar-brand" href="/">
      <span class="sidebar-logo">SR</span>
      <span><span class="sidebar-title">SEO Reporter</span><span class="sidebar-subtitle">GSC Intelligence Suite</span></span>
    </a>
    <nav class="sidebar-nav" aria-label="Workspace sections">
      ${sidebarGroups.map((group) => `<div class="sidebar-section">
        <div class="sidebar-section-title">${escapeHtml(group.label)}</div>
        ${group.links.map((link) => {
          const isActive = active === link.id;
          return `<a class="sidebar-link${isActive ? " active" : ""}" href="${escapeHtml(link.href)}"${isActive ? ' aria-current="page"' : ""}><span class="sidebar-icon" aria-hidden="true">${escapeHtml(link.icon)}</span><span>${escapeHtml(link.label)}</span></a>`;
        }).join("")}
      </div>`).join("")}
    </nav>
    <div class="sidebar-footer">
      <span class="sidebar-status-dot ${authenticated ? "is-connected" : ""}" aria-hidden="true"></span>
      <div><strong>${escapeHtml(googleStatusLabel({ authenticated }))}</strong><small>Internal SEO workspace</small></div>
    </div>
  </aside>`;
}

export function renderNav({ activeNav = "new-report", authenticated = false } = {}) {
  return renderAppNav({ active: activeNav, authenticated });
}

export function renderHeader({ authenticated = false, user = null, pageTitle = "SEO Reporter", pageDescription = "" } = {}) {
  const email = user?.email || user?.name || "Google connected";
  return `<header class="app-topbar">
    <div class="topbar-heading">
      <button class="mobile-menu-button" type="button" aria-label="Open navigation menu" aria-controls="appSidebar" aria-expanded="false">☰ <span>Menu</span></button>
      <div><h1 class="topbar-title">${escapeHtml(pageTitle)}</h1>${pageDescription ? `<p class="topbar-description">${escapeHtml(pageDescription)}</p>` : ""}</div>
    </div>
    <div class="topbar-actions">
      <span class="status-badge ${authenticated ? "status-green" : "status-gray"}">${authenticated ? "Connected" : "Disconnected"}</span>
      ${authenticated ? `<span class="account-pill">${escapeHtml(email)}</span><a class="btn btn-secondary" href="/auth/logout">Logout Google</a>` : `<a class="btn" href="/auth/google">Authenticate Google</a>`}
    </div>
  </header>`;
}

export function renderLayout({ title = "SEO Reporter", pageTitle = "", pageDescription = "", body = "", user = null, activeNav = "dashboard", authenticated = Boolean(user) } = {}) {
  const resolvedPageTitle = pageTitle || title.replace(/\s*[·|-]\s*SEO Reporter\s*$/i, "") || "SEO Reporter";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#f6f8fb;--panel:#fff;--panel-2:#f8fafc;--ink:#102027;--muted:#64748b;--line:#dbe4ee;--brand:#176b87;--brand-dark:#0f4c5c;--green:#15803d;--green-bg:#dcfce7;--orange:#c2410c;--orange-bg:#ffedd5;--blue:#1d4ed8;--blue-bg:#dbeafe;--red:#b91c1c;--red-bg:#fee2e2;--gray:#475569;--gray-bg:#e2e8f0;--sidebar:#0f172a;--sidebar-soft:#172554;--shadow:0 18px 55px rgba(15,23,42,.08)}
    *{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;font-family:"Public Sans",system-ui,sans-serif;color:var(--ink);background:var(--bg)}a{color:inherit}.app-shell{min-height:100vh;display:flex;width:100%}.app-sidebar{position:sticky;top:0;width:272px;height:100vh;flex:0 0 272px;background:linear-gradient(180deg,var(--sidebar),#102027);color:#e5eef7;padding:18px;display:flex;flex-direction:column;z-index:30}.sidebar-brand{display:flex;align-items:center;gap:12px;text-decoration:none;padding:8px 6px 20px}.sidebar-logo{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--brand),#22c55e);display:grid;place-items:center;color:#fff;font-family:"Space Grotesk";font-weight:800}.sidebar-title,.sidebar-subtitle{display:block}.sidebar-title{font-weight:800}.sidebar-subtitle{font-size:.78rem;color:#9fb0c6;margin-top:2px}.sidebar-nav{display:grid;gap:18px;overflow:auto;padding-right:2px}.sidebar-section-title{color:#94a3b8;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em;margin:0 0 8px 8px}.sidebar-link{display:flex;align-items:center;gap:10px;min-height:42px;padding:10px 12px;border-radius:13px;text-decoration:none;color:#cbd5e1;font-weight:800;border:1px solid transparent;transition:background .18s ease,color .18s ease,transform .18s ease,border-color .18s ease}.sidebar-link:hover{background:rgba(255,255,255,.08);color:#fff;transform:translateX(2px)}.sidebar-link.active{background:linear-gradient(135deg,var(--brand),#22c55e);color:#fff;box-shadow:0 14px 30px rgba(0,0,0,.22)}.sidebar-icon{width:22px;height:22px;border-radius:8px;background:rgba(255,255,255,.10);display:grid;place-items:center}.sidebar-footer{margin-top:auto;border-top:1px solid rgba(255,255,255,.12);padding-top:14px;display:flex;gap:10px;align-items:center;color:#dbeafe}.sidebar-footer small{display:block;color:#94a3b8;margin-top:3px}.sidebar-status-dot{width:10px;height:10px;border-radius:999px;background:#f97316;box-shadow:0 0 0 4px rgba(249,115,22,.14)}.sidebar-status-dot.is-connected{background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.14)}.app-workspace{min-width:0;flex:1;display:flex;flex-direction:column}.app-topbar{position:sticky;top:0;z-index:20;background:rgba(246,248,251,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);padding:16px 28px;display:flex;align-items:center;justify-content:space-between;gap:18px}.topbar-heading{display:flex;align-items:center;gap:14px;min-width:0}.topbar-title{font-family:"Space Grotesk";font-size:clamp(1.35rem,2vw,1.8rem);letter-spacing:-.02em;margin:0}.topbar-description{margin:4px 0 0;color:var(--muted);line-height:1.45}.topbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}.mobile-menu-button{display:none;border:1px solid var(--line);background:#fff;border-radius:12px;padding:10px 12px;font-weight:800;color:var(--ink)}.app-content{width:100%;max-width:1440px;padding:28px;margin:0 auto}.sidebar-backdrop{display:none}.hero,.card,.dashboard-hero,.feature-card,.quick-panel{background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow)}.hero,.dashboard-hero{padding:24px;margin-bottom:16px;display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.hero h1,.card h2,.empty-state h2,.dashboard-hero h1{font-family:"Space Grotesk";letter-spacing:-.02em;margin:0}.hero p,.dashboard-hero p{color:var(--muted);max-width:780px}.dashboard-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,.65fr);gap:16px}.dashboard-actions,.actions{display:flex;gap:10px;flex-wrap:wrap}.feature-grid,.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.feature-card{padding:20px;display:flex;flex-direction:column;gap:10px}.feature-card p{color:var(--muted);line-height:1.5;flex:1}.quick-panel{padding:20px}.grid{display:grid;gap:14px}.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.card{padding:20px;margin-bottom:16px;animation:ui-card-in .28s ease both}.metric-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;min-height:132px;animation:ui-card-in .28s ease both}.metric-card span{display:block;color:var(--muted);font-weight:700;font-size:.88rem}.metric-card strong{display:block;font-family:"Space Grotesk";font-size:clamp(1.35rem,3vw,1.9rem);margin:10px 0 5px;word-break:break-word}.metric-card small,.helper,.muted{color:var(--muted);line-height:1.5}.metric-green{border-color:rgba(21,128,61,.25)}.metric-orange{border-color:rgba(194,65,12,.28)}.metric-blue{border-color:rgba(29,78,216,.25)}.metric-red{border-color:rgba(185,28,28,.24)}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 15px;border-radius:12px;background:var(--brand);color:#fff;text-decoration:none;border:1px solid var(--brand);font-weight:800;cursor:pointer;transition:transform .18s ease,background .18s ease,box-shadow .18s ease,opacity .18s ease}.btn:hover{background:var(--brand-dark);transform:translateY(-1px);box-shadow:0 12px 24px rgba(15,76,92,.16)}.btn:focus-visible,.sidebar-link:focus-visible,.mobile-menu-button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid rgba(34,197,94,.35);outline-offset:2px}.btn:disabled,.btn[aria-disabled="true"]{cursor:not-allowed;opacity:.58;transform:none;box-shadow:none}.btn-secondary{background:#fff;color:var(--brand);border-color:rgba(23,107,135,.35)}.btn-secondary:hover{background:#edf8fb;color:var(--brand-dark)}.account-pill{border:1px solid var(--line);background:#fff;border-radius:999px;padding:9px 12px;color:var(--muted);font-size:.9rem;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status-badge{display:inline-flex;border-radius:999px;padding:6px 10px;font-weight:800;font-size:.78rem;text-transform:capitalize}.status-green{background:var(--green-bg);color:var(--green)}.status-orange{background:var(--orange-bg);color:var(--orange)}.status-blue{background:var(--blue-bg);color:var(--blue)}.status-red{background:var(--red-bg);color:var(--red)}.status-gray{background:var(--gray-bg);color:var(--gray)}.alert{border-radius:14px;padding:12px 14px;margin-bottom:14px;font-weight:700}.alert-success{background:var(--green-bg);color:var(--green)}.alert-warning{background:var(--orange-bg);color:var(--orange)}.alert-error{background:var(--red-bg);color:var(--red)}.alert-info,.alert-neutral{background:var(--blue-bg);color:var(--blue)}.empty-state{text-align:center;border:1px dashed #cbd5e1;border-radius:18px;background:var(--panel-2);padding:28px}.empty-state p{color:var(--muted)}.empty-icon{width:46px;height:46px;border-radius:999px;background:#e0f2fe;color:var(--brand);display:grid;place-items:center;margin:0 auto 12px;font-size:1.4rem}.help-box{border-left:4px solid var(--brand);background:#eff6ff;border-radius:12px;padding:12px 14px}.help-box p{margin:5px 0 0;color:var(--muted)}label{font-weight:800;display:block;margin-bottom:7px}.field{margin-bottom:15px}input,select,textarea{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:11px 12px;font:inherit;background:#fff;color:var(--ink)}textarea{min-height:132px;resize:vertical}.checkbox-row{display:flex;gap:10px;align-items:flex-start}.checkbox-row input{width:auto;margin-top:3px}.table-wrap,.table-scroll{overflow:auto;border:1px solid var(--line);border-radius:16px;max-width:100%}table{width:100%;border-collapse:collapse;background:#fff;min-width:720px}th,td{text-align:left;border-bottom:1px solid var(--line);padding:11px;vertical-align:top}td{overflow-wrap:anywhere}th{background:#f1f5f9;color:#334155;font-size:.82rem;text-transform:uppercase;letter-spacing:.04em}tbody tr{transition:background .16s ease}tbody tr:hover{background:#f8fafc}td a:hover{color:var(--brand);text-decoration:underline;text-underline-offset:2px}.split{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.field-hidden{display:none!important}.loading-overlay{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.48);backdrop-filter:blur(5px)}.loading-overlay.is-visible{display:flex}.loading-card{width:min(460px,92vw);border:1px solid rgba(255,255,255,.5);border-radius:24px;background:rgba(255,255,255,.96);box-shadow:0 28px 70px rgba(15,23,42,.24);padding:26px;text-align:center}.tea-scene{position:relative;display:inline-flex;align-items:end;gap:10px;font-size:3rem;margin-bottom:10px}.steam{position:absolute;top:-18px;left:26px;width:7px;height:24px;border-radius:999px;background:linear-gradient(rgba(23,107,135,.42),rgba(23,107,135,0));animation:steam-rise 1.6s ease-in-out infinite}.steam:nth-child(2){left:44px;animation-delay:.25s}.steam:nth-child(3){left:62px;animation-delay:.5s}.loading-card h2{margin:0 0 8px}.loading-message{color:var(--brand);font-weight:800;min-height:1.5em}.loading-subcopy{color:var(--muted);margin-bottom:0}.loading-dots{display:inline-flex;gap:5px;margin-left:4px}.loading-dots span{width:6px;height:6px;border-radius:999px;background:var(--brand);animation:dot-bounce 1s infinite ease-in-out}.loading-dots span:nth-child(2){animation-delay:.15s}.loading-dots span:nth-child(3){animation-delay:.3s}@keyframes steam-rise{0%,100%{opacity:.28;transform:translateY(7px) scale(.9)}50%{opacity:.8;transform:translateY(-4px) scale(1.05)}}@keyframes dot-bounce{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-5px);opacity:1}}@keyframes ui-card-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    @media(max-width:1180px){.feature-grid,.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-grid{grid-template-columns:1fr}}
    @media(max-width:900px){.app-shell{display:block}.app-sidebar{position:fixed;left:0;top:0;transform:translateX(-100%);transition:transform .2s ease;width:min(82vw,300px);height:100dvh}.app-sidebar.is-open{transform:translateX(0)}.mobile-menu-button{display:inline-flex;align-items:center;gap:8px}.sidebar-backdrop{display:block;position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:25;opacity:0;pointer-events:none;transition:opacity .2s ease}.sidebar-backdrop.is-visible{opacity:1;pointer-events:auto}.app-topbar{position:relative;padding:14px 16px;align-items:flex-start;flex-direction:column}.topbar-actions{justify-content:flex-start}.app-content{padding:18px 14px}.hero,.split,.dashboard-hero{display:block}.grid-2,.grid-3,.feature-grid,.metric-grid{grid-template-columns:1fr}.actions .btn,.dashboard-actions .btn{width:100%}.account-pill{max-width:100%}}
    noscript .app-sidebar{position:static!important;transform:none!important;width:100%!important;height:auto!important}.app-nav{display:none!important}
  </style>
  <noscript><style>@media(max-width:900px){.app-shell{display:block}.app-sidebar{position:static!important;transform:none!important;width:100%!important;height:auto!important}.app-workspace{display:block}}</style></noscript>
</head>
<body>
  <div class="app-shell">
    ${renderAppNav({ active: activeNav, authenticated })}
    <div class="sidebar-backdrop" data-sidebar-backdrop></div>
    <div class="app-workspace">
      ${renderHeader({ authenticated, user, pageTitle: resolvedPageTitle, pageDescription })}
      <main class="app-content">${body}</main>
    </div>
  </div>
  <script>
    (() => {
      const sidebar = document.getElementById("appSidebar");
      const button = document.querySelector(".mobile-menu-button");
      const backdrop = document.querySelector("[data-sidebar-backdrop]");
      if (!sidebar || !button || !backdrop) return;
      const setOpen = (open) => { sidebar.classList.toggle("is-open", open); backdrop.classList.toggle("is-visible", open); button.setAttribute("aria-expanded", String(open)); document.body.classList.toggle("sidebar-open", open); };
      button.addEventListener("click", () => setOpen(!sidebar.classList.contains("is-open")));
      backdrop.addEventListener("click", () => setOpen(false));
      document.addEventListener("keydown", (event) => { if (event.key === "Escape") setOpen(false); });
      sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
    })();
  </script>
</body>
</html>`;
}
