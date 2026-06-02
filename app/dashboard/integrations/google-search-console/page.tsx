import Link from "next/link";
import { getCurrentUserId } from "../../../../src/lib/auth/currentUser";
import { hasGoogleTokenForUser } from "../../../../src/lib/db/googleTokens";
import { listGscProperties, type GscSite } from "../../../../src/lib/gsc/client";

type PageProps = {
  searchParams?: Promise<{
    google?: string;
    message?: string;
  }>;
};

async function getSites(userId: string | null, connected: boolean): Promise<{ sites: GscSite[]; error?: string }> {
  if (!userId || !connected) {
    return { sites: [] };
  }

  try {
    return { sites: await listGscProperties(userId) };
  } catch (error) {
    return { sites: [], error: error instanceof Error ? error.message : "Failed to load GSC properties." };
  }
}

export default async function GoogleSearchConsoleIntegrationPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const userId = await getCurrentUserId();
  const connected = userId ? await hasGoogleTokenForUser(userId) : false;
  const { sites, error } = await getSites(userId, connected);

  return (
    <main className="page-shell">
      <section className="card">
        <p className="eyebrow">Integration</p>
        <h1>Google Search Console</h1>
        <p>
          Connect your Google account with Search Console readonly access. Tokens stay on the server and are never exposed
          to the browser.
        </p>

        {params.google === "connected" ? <div className="status status-success">Google Search Console connected.</div> : null}
        {params.google === "error" ? <div className="status status-error">{params.message || "Google connection failed."}</div> : null}
        {error ? <div className="status status-error">{error}</div> : null}

        <div className={connected ? "status status-success" : "status status-error"}>
          Status: {connected ? "Connected" : "Not connected"}
        </div>

        <Link className="button" href="/api/google/connect">
          {connected ? "Reconnect Google Search Console" : "Connect Google Search Console"}
        </Link>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <h2>Search Console properties</h2>
        {!connected ? <p>Connect Google Search Console to list your verified properties.</p> : null}
        {connected && sites.length === 0 && !error ? <p>No verified Search Console properties were returned.</p> : null}
        {sites.length > 0 ? (
          <ul className="property-list">
            {sites.map((site) => (
              <li key={site.siteUrl}>
                <div className="property-url">{site.siteUrl}</div>
                <div className="property-permission">Permission: {site.permissionLevel}</div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
