# SEO Report App (GSC / Looker CSV)

SEO reporting app with weekly, monthly, 3-month, and 6-month insights.

## Features

- This month publishing summary (count, topic, URL)
- Last 3 months SEO performance
- Trending up/down URLs in last 30 days
- 6-month URL movement signals
- Custom Google OAuth 2.0 flow for Google Search Console, without NextAuth/Auth.js
- Search Console property listing and Search Analytics API routes

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Google Search Console OAuth Setup

Required environment variables:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback # optional fallback outside OAuth route handlers
GOOGLE_GSC_SCOPE=https://www.googleapis.com/auth/webmasters.readonly
```

`NEXT_PUBLIC_APP_URL` is used only as the post-OAuth redirect origin. During the OAuth browser flow, the app now sends Google a callback URL based on the domain that received `/api/google/connect` (for example `https://your-domain.vercel.app/api/google/callback`) so Vercel production/custom domains do not accidentally use a stale preview-domain redirect URI. `GOOGLE_REDIRECT_URI` remains useful as a fallback for server-side helpers, but the active callback URL still must be added exactly in Google Cloud Console. If an environment value is accidentally pasted with extra text, the app normalizes the URL before using it. The `npm warn deprecated node-domexception@1.0.0` message is emitted by a transitive dependency during install and is not the cause of the app URL validation error.

Optional local token database path:

```bash
GOOGLE_TOKEN_DB_PATH=.data/google-tokens.json
```

> Do not commit Google client secrets or Google OAuth tokens. If a secret is exposed, rotate it in Google Cloud Console before deploying.

## Google Cloud redirect URI

For local development, add this redirect URI to the Google OAuth client:

`http://localhost:3000/api/google/callback`

For the current Vercel deployment, set:

```bash
NEXT_PUBLIC_APP_URL="https://seo-reporter-git-main-hung-s-projects17xx.vercel.app/"
GOOGLE_REDIRECT_URI=https://seo-reporter-git-main-hung-s-projects17xx.vercel.app/api/google/callback
```

and add this exact redirect URI in Google Cloud OAuth client settings:

`https://seo-reporter-git-main-hung-s-projects17xx.vercel.app/api/google/callback`

If you later promote a different production domain, add the exact new callback URI in Google Cloud OAuth client settings. The callback sent to Google is derived from the current request origin, so each Vercel preview, production, or custom domain you use for OAuth needs its own authorized redirect URI entry.

### Fix `Error 403: access_denied` after choosing a Google account

If Google shows `Error 403: access_denied` with request details such as `scope=https://www.googleapis.com/auth/webmasters.readonly`, the redirect URI is already reaching Google and the failure is usually in the Google Cloud OAuth app audience/consent configuration. Check these items in the same Google Cloud project that owns your `GOOGLE_CLIENT_ID`:

1. Go to **Google Auth Platform > Audience** and confirm the app is either published for production, or still in testing with your exact Google email added under **Test users**.
2. Go to **Google Auth Platform > Data Access** and make sure `https://www.googleapis.com/auth/webmasters.readonly` is configured as an OAuth scope for the app.
3. If the account is a Google Workspace account, ask the Workspace administrator to allow this third-party app/scopes, or test with a personal Google account that is listed as a test user.
4. After changing Google Cloud settings, wait a few minutes, reopen `/dashboard/integrations/google-search-console`, and click **Reconnect Google Search Console**.

## Google Search Console integration

- Start OAuth: `GET /api/google/connect`
- OAuth callback: `GET /api/google/callback`
- List properties: `GET /api/gsc/sites`
- Query Search Analytics: `POST /api/gsc/search-analytics`
- Dashboard page: `/dashboard/integrations/google-search-console`

Search Analytics request body:

```json
{
  "siteUrl": "https://example.com/",
  "startDate": "2026-05-01",
  "endDate": "2026-05-31",
  "dimensions": ["date", "page"],
  "rowLimit": 1000
}
```

## Vercel Deployment

This project is configured for the Next.js framework on Vercel.

### Steps

1. Import GitHub repo into Vercel.
2. Framework preset: `Next.js`.
3. Root Directory: repo root (where `package.json` exists).
4. Add the required Google OAuth environment variables listed above.
5. Deploy.

## CLI Generate

The legacy Express/CLI reporting code remains available for local generation:

```bash
npm run generate -- --source looker --lookerCsvPath samples/gsc-looker-sample.csv --contentCsvPath samples/content-sample.csv
```

Output file is written to `output/` in local environment.

## Data Files

- `samples/gsc-looker-sample.csv`
- `samples/content-sample.csv`
