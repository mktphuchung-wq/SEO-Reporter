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
    a{color:inherit}.shell{width:min(1180px,94vw);margin:0 auto;padding:20px 0 48px}html,body{max-width:100%;overflow-x:hidden}.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0}.brand{display:flex;align-items:center;gap:12px;text-decoration:none}.brand-mark{width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,var(--brand),#22c55e);color:#fff;display:grid;place-items:center;font-family:"Space Grotesk";font-weight:800}.brand small{display:block;color:var(--muted);font-weight:500}.account-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}.account-pill{border:1px solid var(--line);background:#fff;border-radius:999px;padding:9px 12px;color:var(--muted);font-size:.9rem}.app-nav{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 22px}.app-nav a{padding:10px 14px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.72);text-decoration:none;color:var(--muted);font-weight:700;transition:transform .18s ease,background .18s ease,color .18s ease,border-color .18s ease}.app-nav a:hover{transform:translateY(-1px)}.app-nav a:focus-visible{outline:3px solid rgba(249,115,22,.35);outline-offset:2px}.app-nav a.active,.app-nav a:hover{background:var(--brand);border-color:var(--brand);color:#fff}.hero,.card{background:rgba(255,255,255,.88);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow)}.hero{padding:26px;margin-bottom:16px;display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.hero h1,.card h2,.empty-state h2{font-family:"Space Grotesk";letter-spacing:-.02em;margin:0}.hero p{color:var(--muted);max-width:720px}.grid{display:grid;gap:14px}.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.card{padding:20px;animation:ui-card-in .28s ease both}.metric-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;min-height:132px;animation:ui-card-in .28s ease both}.metric-card:nth-child(2){animation-delay:.03s}.metric-card:nth-child(3){animation-delay:.06s}.metric-card span{display:block;color:var(--muted);font-weight:700;font-size:.88rem}.metric-card strong{display:block;font-family:"Space Grotesk";font-size:clamp(1.5rem,4vw,2rem);margin:10px 0 5px;word-break:break-word}.metric-card small,.helper,.muted{color:var(--muted);line-height:1.5}.metric-green{border-color:rgba(21,128,61,.25)}.metric-orange{border-color:rgba(194,65,12,.28)}.metric-blue{border-color:rgba(29,78,216,.25)}.metric-red{border-color:rgba(185,28,28,.24)}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 15px;border-radius:12px;background:var(--brand);color:#fff;text-decoration:none;border:1px solid var(--brand);font-weight:800;cursor:pointer;transition:transform .18s ease,background .18s ease,box-shadow .18s ease,opacity .18s ease}.btn:hover{background:var(--brand-dark);transform:translateY(-1px);box-shadow:0 12px 24px rgba(15,76,92,.16)}.btn:active{transform:translateY(0);box-shadow:none}.btn:focus-visible{outline:3px solid rgba(249,115,22,.38);outline-offset:2px}.btn:disabled,.btn[aria-disabled="true"]{cursor:not-allowed;opacity:.58;transform:none;box-shadow:none}.btn-secondary{background:#fff;color:var(--brand);border-color:rgba(23,107,135,.35)}.btn-secondary:hover{background:#edf8fb;color:var(--brand-dark)}.status-badge{display:inline-flex;border-radius:999px;padding:6px 10px;font-weight:800;font-size:.78rem;text-transform:capitalize}.status-green{background:var(--green-bg);color:var(--green)}.status-orange{background:var(--orange-bg);color:var(--orange)}.status-blue{background:var(--blue-bg);color:var(--blue)}.status-red{background:var(--red-bg);color:var(--red)}.status-gray{background:var(--gray-bg);color:var(--gray)}.alert{border-radius:14px;padding:12px 14px;margin-bottom:14px;font-weight:700}.alert-success{background:var(--green-bg);color:var(--green)}.alert-warning{background:var(--orange-bg);color:var(--orange)}.alert-error{background:var(--red-bg);color:var(--red)}.alert-info,.alert-neutral{background:var(--blue-bg);color:var(--blue)}.empty-state{text-align:center;border:1px dashed #cbd5e1;border-radius:18px;background:var(--panel-2);padding:28px}.empty-state p{color:var(--muted)}.empty-icon{width:46px;height:46px;border-radius:999px;background:#e0f2fe;color:var(--brand);display:grid;place-items:center;margin:0 auto 12px;font-size:1.4rem}.help-box{border-left:4px solid var(--brand);background:#eff6ff;border-radius:12px;padding:12px 14px}.help-box p{margin:5px 0 0;color:var(--muted)}label{font-weight:800;display:block;margin-bottom:7px}.field{margin-bottom:15px}input,select,textarea{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:11px 12px;font:inherit;background:#fff;color:var(--ink)}textarea{min-height:132px;resize:vertical}.checkbox-row{display:flex;gap:10px;align-items:flex-start}.checkbox-row input{width:auto;margin-top:3px}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px}table{width:100%;border-collapse:collapse;background:#fff;min-width:620px}th,td{text-align:left;border-bottom:1px solid var(--line);padding:11px;vertical-align:top}th{background:#f1f5f9;color:#334155;font-size:.82rem;text-transform:uppercase;letter-spacing:.04em}tbody tr{transition:background .16s ease}tbody tr:hover{background:#f8fafc}td a:hover{color:var(--brand);text-decoration:underline;text-underline-offset:2px}.actions{display:flex;gap:10px;flex-wrap:wrap}.split{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.field-hidden{display:none!important}.loading-overlay{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.48);backdrop-filter:blur(5px)}.loading-overlay.is-visible{display:flex}.loading-card{width:min(460px,92vw);border:1px solid rgba(255,255,255,.5);border-radius:24px;background:rgba(255,255,255,.96);box-shadow:0 28px 70px rgba(15,23,42,.24);padding:26px;text-align:center}.tea-scene{position:relative;display:inline-flex;align-items:end;gap:10px;font-size:3rem;margin-bottom:10px}.steam{position:absolute;top:-18px;left:26px;width:7px;height:24px;border-radius:999px;background:linear-gradient(rgba(23,107,135,.42),rgba(23,107,135,0));animation:steam-rise 1.6s ease-in-out infinite}.steam:nth-child(2){left:44px;animation-delay:.25s}.steam:nth-child(3){left:62px;animation-delay:.5s}.loading-card h2{margin:0 0 8px}.loading-message{color:var(--brand);font-weight:800;min-height:1.5em}.loading-subcopy{color:var(--muted);margin-bottom:0}.loading-dots{display:inline-flex;gap:5px;margin-left:4px}.loading-dots span{width:6px;height:6px;border-radius:999px;background:var(--brand);animation:dot-bounce 1s infinite ease-in-out}.loading-dots span:nth-child(2){animation-delay:.15s}.loading-dots span:nth-child(3){animation-delay:.3s}@keyframes steam-rise{0%,100%{opacity:.28;transform:translateY(7px) scale(.9)}50%{opacity:.8;transform:translateY(-4px) scale(1.05)}}@keyframes dot-bounce{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-5px);opacity:1}}@keyframes ui-card-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    @media(max-width:780px){.topbar,.hero,.split{display:block}.account-actions{justify-content:flex-start;margin-top:12px}.grid-2,.grid-3{grid-template-columns:1fr}.hero,.card{padding:18px}.app-nav a{flex:1;text-align:center}.actions .btn{width:100%}.loading-card{padding:22px 18px}.tea-scene{font-size:2.6rem}}
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
