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
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_GSC_SCOPE=https://www.googleapis.com/auth/webmasters.readonly
```

`NEXT_PUBLIC_APP_URL` is used only as the post-OAuth redirect origin. If it is missing or accidentally pasted with extra text, the app falls back to the origin from `GOOGLE_REDIRECT_URI` instead of blocking OAuth startup. The `npm warn deprecated node-domexception@1.0.0` message is emitted by a transitive dependency during install and is not the cause of the app URL validation error.

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

If you later promote a different production domain, update both Vercel environment variables and the authorized redirect URI in Google Cloud to use that exact domain.

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
