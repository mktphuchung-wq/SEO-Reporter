# SEO Report App (GSC / Looker CSV)

SEO reporting app with weekly, monthly, 3-month, and 6-month insights.

## Features

- This month publishing summary (count, topic, URL)
- Last 3 months SEO performance
- Trending up/down URLs in last 30 days
- 6-month URL movement signals
- HTML visualization report
- Google Search Console OAuth connect flow with database-backed user/session/token storage

## Local Setup

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Google OAuth Setup

Create a Google OAuth **Web application** client and configure this callback URL:

```text
http://localhost:3000/api/auth/callback/google
```

Required environment variables:

```bash
SESSION_SECRET=replace-with-strong-random-secret
GOOGLE_CLIENT_ID=your-web-oauth-client-id
GOOGLE_CLIENT_SECRET=your-web-oauth-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google
GOOGLE_GSC_SCOPE=https://www.googleapis.com/auth/webmasters.readonly
```

The app starts the Google flow from:

```text
/api/google/connect
```

The connect route uses `access_type=offline` and `prompt=consent`, so Google can return a `refresh_token`. The callback route stores the token set in the auth database and later refreshes access tokens when they are near expiry.

## Production Session + Token Database

Production needs persistent storage for users, sessions, OAuth state, and Google tokens. Configure Vercel KV / Upstash Redis REST credentials:

```bash
KV_REST_API_URL=https://your-kv-endpoint.upstash.io
KV_REST_API_TOKEN=your-kv-rest-token
AUTH_DB_KEY_PREFIX=seo-reporter
```

When `NODE_ENV=production`, auth/session/token routes fail fast if the KV REST variables are missing. Local development can use the file-backed fallback at `.data/auth-db.json`.

## Vercel Deployment

This project is configured for Vercel serverless with:

- `api/index.js` as serverless entrypoint
- `vercel.json` rewrite all routes to `api/index.js`
- `src/app.js` (Express app, no direct `listen`)

### Steps

1. Import GitHub repo into Vercel.
2. Framework preset: `Other`.
3. Root Directory: repo root (where `package.json` exists).
4. Add environment variables:
   - `SESSION_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `GOOGLE_GSC_SCOPE`
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
5. Deploy.

### OAuth Redirect URI for production

For the current production domain, configure Google Cloud OAuth with this exact callback URI:

```text
https://seo-reporter-indol.vercel.app/api/auth/callback/google
```

Set Vercel env:

```bash
GOOGLE_REDIRECT_URI=https://seo-reporter-indol.vercel.app/api/auth/callback/google
GOOGLE_GSC_SCOPE=https://www.googleapis.com/auth/webmasters.readonly
```

Do not commit `GOOGLE_CLIENT_SECRET` or token database credentials to the repository. Store them only in environment variables.

## Google Search Console Sites API

After connecting Google, fetch authorized GSC properties from:

```text
GET /api/google/sites
```

Response shape:

```json
{
  "sites": [
    {
      "siteUrl": "sc-domain:example.com",
      "permissionLevel": "siteOwner"
    }
  ]
}
```

## Service Account Mode

Optional service-account fallback:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./keys/service-account.json
```

For service account mode, add the service account email to the target Google Search Console property and pass the exact property id, such as `sc-domain:example.com` or the exact URL property.

## CLI Generate

```bash
npm run generate -- --source looker --lookerCsvPath samples/gsc-looker-sample.csv --contentCsvPath samples/content-sample.csv
```

Output file is written to `output/` in local environment.

GSC CLI example:

```bash
npm run generate -- --source gsc --siteUrl sc-domain:example.com --startDate 2026-01-01 --endDate 2026-05-27 --keyFile ./keys/service-account.json
```

## Data Files

- `samples/gsc-looker-sample.csv`
- `samples/content-sample.csv`
