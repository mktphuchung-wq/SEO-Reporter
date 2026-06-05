import { escapeHtml } from "./html.js";

export function renderNav({ activeNav = "dashboard" } = {}) {
  const links = [
    { id: "dashboard", href: "/", label: "Dashboard" },
    { id: "new-report", href: "/reports/new", label: "Generate Preview" },
    { id: "reports", href: "/reports", label: "Saved Reports" },
    { id: "settings", href: "/settings", label: "Settings" },
  ];
  return `<nav class="app-nav" aria-label="Primary navigation">${links
    .map((link) => `<a class="${activeNav === link.id ? "active" : ""}" href="${link.href}">${escapeHtml(link.label)}</a>`)
    .join("")}</nav>`;
}

export function renderHeader({ authenticated = false, user = null } = {}) {
  const email = user?.email || user?.name || "Google connected";
  return `
    <header class="topbar">
      <a class="brand" href="/">
        <span class="brand-mark">SR</span>
        <span><strong>SEO Reporter</strong><small>Google Search Console dashboard</small></span>
      </a>
      <div class="account-actions">
        ${authenticated ? `<span class="account-pill">${escapeHtml(email)}</span><a class="btn btn-secondary" href="/auth/logout">Logout Google</a>` : `<a class="btn" href="/auth/google">Authenticate Google</a>`}
      </div>
    </header>`;
}

export function renderLayout({ title = "SEO Reporter", body = "", user = null, activeNav = "dashboard", authenticated = Boolean(user) } = {}) {
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
    :root{--bg:#f4f7fb;--panel:#fff;--panel-2:#f8fafc;--ink:#102027;--muted:#64748b;--line:#dbe4ee;--brand:#176b87;--brand-dark:#0f4c5c;--green:#15803d;--green-bg:#dcfce7;--orange:#c2410c;--orange-bg:#ffedd5;--blue:#1d4ed8;--blue-bg:#dbeafe;--red:#b91c1c;--red-bg:#fee2e2;--gray:#475569;--gray-bg:#e2e8f0;--shadow:0 18px 55px rgba(15,23,42,.08)}
    *{box-sizing:border-box} body{margin:0;font-family:"Public Sans",system-ui,sans-serif;color:var(--ink);background:radial-gradient(circle at 10% 0%,rgba(23,107,135,.14),transparent 28%),radial-gradient(circle at 94% 10%,rgba(249,115,22,.12),transparent 28%),var(--bg)}
    a{color:inherit}.shell{width:min(1180px,94vw);margin:0 auto;padding:20px 0 48px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0}.brand{display:flex;align-items:center;gap:12px;text-decoration:none}.brand-mark{width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,var(--brand),#22c55e);color:#fff;display:grid;place-items:center;font-family:"Space Grotesk";font-weight:800}.brand small{display:block;color:var(--muted);font-weight:500}.account-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}.account-pill{border:1px solid var(--line);background:#fff;border-radius:999px;padding:9px 12px;color:var(--muted);font-size:.9rem}.app-nav{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 22px}.app-nav a{padding:10px 14px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.72);text-decoration:none;color:var(--muted);font-weight:700}.app-nav a.active,.app-nav a:hover{background:var(--brand);border-color:var(--brand);color:#fff}.hero,.card{background:rgba(255,255,255,.88);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow)}.hero{padding:26px;margin-bottom:16px;display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.hero h1,.card h2,.empty-state h2{font-family:"Space Grotesk";letter-spacing:-.02em;margin:0}.hero p{color:var(--muted);max-width:720px}.grid{display:grid;gap:14px}.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.card{padding:20px}.metric-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;min-height:132px}.metric-card span{display:block;color:var(--muted);font-weight:700;font-size:.88rem}.metric-card strong{display:block;font-family:"Space Grotesk";font-size:clamp(1.5rem,4vw,2rem);margin:10px 0 5px;word-break:break-word}.metric-card small,.helper,.muted{color:var(--muted);line-height:1.5}.metric-green{border-color:rgba(21,128,61,.25)}.metric-orange{border-color:rgba(194,65,12,.28)}.metric-blue{border-color:rgba(29,78,216,.25)}.metric-red{border-color:rgba(185,28,28,.24)}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 15px;border-radius:12px;background:var(--brand);color:#fff;text-decoration:none;border:1px solid var(--brand);font-weight:800;cursor:pointer}.btn:hover{background:var(--brand-dark)}.btn-secondary{background:#fff;color:var(--brand);border-color:rgba(23,107,135,.35)}.btn-secondary:hover{background:#edf8fb;color:var(--brand-dark)}.status-badge{display:inline-flex;border-radius:999px;padding:6px 10px;font-weight:800;font-size:.78rem;text-transform:capitalize}.status-green{background:var(--green-bg);color:var(--green)}.status-orange{background:var(--orange-bg);color:var(--orange)}.status-blue{background:var(--blue-bg);color:var(--blue)}.status-red{background:var(--red-bg);color:var(--red)}.status-gray{background:var(--gray-bg);color:var(--gray)}.alert{border-radius:14px;padding:12px 14px;margin-bottom:14px;font-weight:700}.alert-success{background:var(--green-bg);color:var(--green)}.alert-warning{background:var(--orange-bg);color:var(--orange)}.alert-error{background:var(--red-bg);color:var(--red)}.alert-info,.alert-neutral{background:var(--blue-bg);color:var(--blue)}.empty-state{text-align:center;border:1px dashed #cbd5e1;border-radius:18px;background:var(--panel-2);padding:28px}.empty-state p{color:var(--muted)}.empty-icon{width:46px;height:46px;border-radius:999px;background:#e0f2fe;color:var(--brand);display:grid;place-items:center;margin:0 auto 12px;font-size:1.4rem}.help-box{border-left:4px solid var(--brand);background:#eff6ff;border-radius:12px;padding:12px 14px}.help-box p{margin:5px 0 0;color:var(--muted)}label{font-weight:800;display:block;margin-bottom:7px}.field{margin-bottom:15px}input,select,textarea{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:11px 12px;font:inherit;background:#fff;color:var(--ink)}textarea{min-height:132px;resize:vertical}.checkbox-row{display:flex;gap:10px;align-items:flex-start}.checkbox-row input{width:auto;margin-top:3px}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px}table{width:100%;border-collapse:collapse;background:#fff;min-width:620px}th,td{text-align:left;border-bottom:1px solid var(--line);padding:11px;vertical-align:top}th{background:#f1f5f9;color:#334155;font-size:.82rem;text-transform:uppercase;letter-spacing:.04em}.actions{display:flex;gap:10px;flex-wrap:wrap}.split{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.field-hidden{display:none!important}
    @media(max-width:780px){.topbar,.hero,.split{display:block}.account-actions{justify-content:flex-start;margin-top:12px}.grid-2,.grid-3{grid-template-columns:1fr}.hero,.card{padding:18px}.app-nav a{flex:1;text-align:center}.actions .btn{width:100%}}
  </style>
</head>
<body>
  <main class="shell">
    ${renderHeader({ authenticated, user })}
    ${renderNav({ activeNav })}
    ${body}
  </main>
</body>
</html>`;
}
