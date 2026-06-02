# SEO Report App (Express / Vercel Serverless)

SEO Reporter is an Express-based reporting app that can generate HTML SEO reports from Google Search Console API data or the bundled Looker-style CSV sample data. It keeps the existing Express entry points:

- Local app: `src/server.js`
- Main Express app: `src/app.js`
- Vercel serverless entry: `api/index.js`
- Vercel routing: `vercel.json` rewrites all paths to the Express serverless function so `/` shows the Express SEO Reporter UI instead of the legacy Next.js shell.

## Features

- Google OAuth sign-in for Search Console reporting.
- Search Console property selection with visible permission level.
- Report period selector:
  - 1 week (`7d`)
  - 1 month (`30d`)
  - 3 months (`90d`)
  - 6 months (`180d`)
  - custom start/end dates
- Event/page URL filtering with `pageContains` (for example `/ten-su-kien/`).
- Page-level GSC reporting and keyword-level GSC reporting.
- Tracked keyword input with one keyword per line or comma-separated keywords.
- Keyword movement analysis across comparable current/previous periods.
- Automatic keyword opportunity sections:
  - high-impression ranking drops
  - high-impression keywords near page 1
  - CTR opportunities
  - keyword winners
- Existing URL trend, publishing, and 6-month movement sections.
- Optional Gemini AI SEO insights in Vietnamese when `GEMINI_API_KEY` is configured.
- Optional SEO alert generation with severity labels and Slack/email notifications for high-severity issues only.

## Environment Variables

Copy `.env.example` to `.env` for local development and fill in values that already belong to your environment. Do not commit real secrets, API keys, OAuth tokens, or service account files.

Required for Google OAuth/GSC usage:

```bash
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
GOOGLE_GSC_SCOPE=https://www.googleapis.com/auth/webmasters.readonly
SESSION_SECRET=replace-with-a-random-local-secret
```

Production OAuth is pinned to a single Vercel domain, regardless of preview host or environment overrides:

```text
Production app URL: https://seo-reporter-indol.vercel.app
Production OAuth callback: https://seo-reporter-indol.vercel.app/auth/callback
```

Add only that production callback URL to the Google OAuth client's authorized redirect URIs for production. Local development can still use `GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback`.

Optional:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-1.5-flash
SEO_ALERTS_ENABLED=false
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/example/example/example
ALERT_EMAIL_PROVIDER_URL=https://email-provider.example/send
ALERT_EMAIL_PROVIDER_API_KEY=your-email-provider-api-key
ALERT_EMAIL_FROM=seo-reporter@example.com
ALERT_EMAIL_TO=marketing@example.com
SEO_ALERT_HIGH_POSITION_LOSS=3
SEO_ALERT_HIGH_IMPRESSIONS=500
SEO_ALERT_TRACKED_CLICK_LOSS=25
SEO_ALERT_TRACKED_CLICK_LOSS_PERCENT=30
SEO_ALERT_CTR_HIGH_IMPRESSIONS=1000
```

`GEMINI_API_KEY` is optional. If it is not configured, the report still renders and shows an AI-unavailable note. SEO alerts can be enabled from the report form or globally with `SEO_ALERTS_ENABLED=true`; notification delivery requires either `SLACK_WEBHOOK_URL` or `ALERT_EMAIL_PROVIDER_URL` plus `ALERT_EMAIL_TO`. The `/generate` flow sends a summary only when at least one high-severity alert exists, such as a position loss of at least 3 with at least 500 impressions or a tracked keyword with a large click loss.

## Local Test Instructions

Install dependencies:

```bash
npm install
```

Start the Express app:

```bash
npm start
```

Open the home page:

```text
http://localhost:3000
```

Generate a sample report without Google credentials by choosing `Looker CSV` and keeping the sample paths:

- Looker CSV path: `samples/gsc-looker-sample.csv`
- Content metadata CSV path: `samples/content-sample.csv`

To test the GSC reporting flow locally after OAuth environment variables are present:

1. Open `/`.
2. Click **Authenticate Google**.
3. Confirm the page shows **Google connected**.
4. Select a Search Console property.
5. Confirm the property permission level is visible under the selector.
6. Choose a report period or custom dates.
7. Optionally enter a page URL filter such as `/ten-su-kien/`.
8. Optionally enter tracked keywords, one per line or separated by commas.
9. Optionally enable Gemini AI insights if `GEMINI_API_KEY` is configured.
10. Optionally enable SEO alerts after configuring Slack or email alert environment variables.
11. Submit **Generate HTML Report**.

## Report Sections

The generated HTML report includes the existing SEO sections plus new GSC keyword sections:

- Active filters: property, search type, date range, report period, page filter, tracked keyword count.
- Tracked Keyword Ranking Movement.
- High Impression Keywords With Ranking Drop.
- High Impression Keywords Near Page 1.
- CTR Opportunity Keywords.
- Keyword Winners.
- Gemini AI SEO Insights when enabled and configured.
- SEO Alerts with severity labels, generated from high-impression ranking drops, tracked keyword movement, and CTR opportunities.

Average position uses Google Search Console semantics: lower is better.

## CLI Generate

The CLI remains available for CSV-based local generation:

```bash
npm run generate -- --source looker --lookerCsvPath samples/gsc-looker-sample.csv --contentCsvPath samples/content-sample.csv
```

Output files are written to `output/` in local environments.

## Data Files

- `samples/gsc-looker-sample.csv`
- `samples/content-sample.csv`

## Notes

- This project remains an Express + Vercel serverless app for the SEO Reporter flow.
- `api/index.js` continues to export the Express app for serverless usage.
- `vercel.json` rewrites requests to the Express function, including `/`, `/auth/*`, and existing `/api/google/*` OAuth paths.
- The legacy `/dashboard/integrations/google-search-console` path redirects to `/` so users land on the upgraded Express report builder.
- No real API keys or secrets are stored in this repository.
