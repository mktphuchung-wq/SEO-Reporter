import { renderLayout } from "../ui/layout.js";

export function renderUrlPerformancePage({ user = null, authenticated = false } = {}) {
  const body = `
    <section class="hero">
      <div>
        <p class="muted">SEO tools</p>
        <h1>URL Performance Compare</h1>
        <p>Compare custom URL performance across previous and next date ranges.</p>
      </div>
      <div class="actions"><a class="btn btn-secondary" href="/reports/new">Back to reports</a></div>
    </section>
    <section class="card">
      <h2>Coming soon</h2>
      <p class="muted">This tool will let you paste URL, previous_start, previous_end, next_start, next_end.</p>
    </section>
  `;

  return renderLayout({
    title: "URL Performance Compare · SEO Reporter",
    body,
    user,
    authenticated,
    activeNav: "url-performance",
  });
}
