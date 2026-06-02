import { google } from "googleapis";
import { NextResponse, type NextRequest } from "next/server";
import { createGoogleOAuthClient } from "../../../../src/lib/googleSearchConsoleAuth";
import { getAppSession, getGoogleTokens } from "../../../../src/lib/appSession";

export const runtime = "nodejs";

const MAX_ROW_LIMIT = 25000;

function normalizeSearchType(value: unknown) {
  const searchType = String(value || "web").toLowerCase();
  return ["web", "image", "video", "news"].includes(searchType) ? searchType : "web";
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const session = getAppSession(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const tokens = getGoogleTokens(session.user_id);
    if (!tokens) {
      return NextResponse.json({ error: "Google Search Console is not connected." }, { status: 401 });
    }

    const body = await request.json();
    const siteUrl = typeof body.siteUrl === "string" ? body.siteUrl : "";
    const startDate = normalizeDate(body.startDate);
    const endDate = normalizeDate(body.endDate);

    if (!siteUrl) {
      return NextResponse.json({ error: "siteUrl is required." }, { status: 400 });
    }
    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate must use YYYY-MM-DD format." }, { status: 400 });
    }

    const auth = createGoogleOAuthClient(request);
    auth.setCredentials(tokens);
    const webmasters = google.webmasters({ version: "v3", auth });
    const rows = [];
    let startRow = 0;

    while (true) {
      const response = await webmasters.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: Array.isArray(body.dimensions) && body.dimensions.length ? body.dimensions : ["date", "page"],
          type: normalizeSearchType(body.searchType),
          rowLimit: MAX_ROW_LIMIT,
          startRow,
        },
      });

      const pageRows = response.data.rows || [];
      rows.push(...pageRows);

      if (pageRows.length < MAX_ROW_LIMIT) {
        break;
      }
      startRow += MAX_ROW_LIMIT;
    }

    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to query Google Search Console analytics." },
      { status: 500 },
    );
  }
}
