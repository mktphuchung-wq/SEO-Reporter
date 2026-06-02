import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="card hero-card">
        <p className="eyebrow">SEO Reporter</p>
        <h1>Google Search Console integrations</h1>
        <p>Connect Search Console to list verified properties and query Search Analytics data.</p>
        <Link className="button" href="/dashboard/integrations/google-search-console">
          Open integration settings
        </Link>
      </section>
    </main>
  );
}
