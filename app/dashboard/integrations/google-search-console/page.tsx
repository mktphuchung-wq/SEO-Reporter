type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GoogleSearchConsoleIntegrationPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const connected = firstParam(params.connected) === "1";
  const error = firstParam(params.error);

  return (
    <main style={{ minHeight: "100vh", padding: "48px 20px", background: "#f6f8fb", color: "#172033" }}>
      <section
        style={{
          maxWidth: "860px",
          margin: "0 auto",
          border: "1px solid #dbe3ef",
          borderRadius: "18px",
          padding: "32px",
          background: "white",
          boxShadow: "0 18px 45px rgba(20, 32, 54, 0.08)",
        }}
      >
        <p style={{ margin: "0 0 8px", color: "#52657a", fontWeight: 700, letterSpacing: "0.06em" }}>
          INTEGRATION
        </p>
        <h1 style={{ margin: "0 0 12px", fontSize: "2rem" }}>Google Search Console</h1>
        <p style={{ margin: "0 0 24px", lineHeight: 1.6, color: "#52657a" }}>
          Connect a Google account to list verified Search Console properties and query Search Analytics data through
          the new App Router API endpoints.
        </p>

        {connected ? (
          <div
            role="status"
            style={{
              marginBottom: "20px",
              border: "1px solid #b6e3c6",
              borderRadius: "12px",
              padding: "14px 16px",
              background: "#effaf3",
              color: "#176338",
            }}
          >
            Google Search Console is connected for this database-backed app session.
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            style={{
              marginBottom: "20px",
              border: "1px solid #f2b8b5",
              borderRadius: "12px",
              padding: "14px 16px",
              background: "#fff1f0",
              color: "#8c1d18",
            }}
          >
            {error}
          </div>
        ) : null}

        <a
          href="/api/google/connect"
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: "10px",
            padding: "12px 18px",
            background: "#1a73e8",
            color: "white",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Connect Google Search Console
        </a>

        <div style={{ marginTop: "28px", borderTop: "1px solid #e7edf5", paddingTop: "22px" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem" }}>Available endpoints</h2>
          <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: 1.8, color: "#52657a" }}>
            <li>
              <code>GET /api/google/connect</code> starts OAuth.
            </li>
            <li>
              <code>GET /api/google/callback</code> validates state and stores tokens for the current database user.
            </li>
            <li>
              <code>GET /api/gsc/sites</code> returns verified Search Console properties.
            </li>
            <li>
              <code>POST /api/gsc/search-analytics</code> accepts <code>siteUrl</code>, <code>startDate</code>, and{" "}
              <code>endDate</code> JSON fields.
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
