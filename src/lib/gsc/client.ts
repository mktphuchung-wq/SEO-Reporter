import { getValidGoogleAccessToken } from "../google/getValidGoogleAccessToken";

export type GscSite = {
  siteUrl: string;
  permissionLevel: string;
};

export type SearchAnalyticsRequest = {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
};

const MAX_ROW_LIMIT = 25000;
const ALLOWED_DIMENSIONS = new Set(["date", "page", "query", "country", "device", "searchAppearance"]);

async function googleFetch(userId: string, url: string, init?: RequestInit): Promise<Response> {
  const accessToken = await getValidGoogleAccessToken(userId);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(url, {
    ...init,
    headers,
  });
}

export async function listGscProperties(userId: string): Promise<GscSite[]> {
  const response = await googleFetch(userId, "https://www.googleapis.com/webmasters/v3/sites");
  const data = (await response.json()) as { siteEntry?: GscSite[]; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to fetch Google Search Console properties.");
  }

  return (data.siteEntry || [])
    .filter((site) => site.siteUrl && site.permissionLevel && site.permissionLevel !== "siteUnverifiedUser")
    .map((site) => ({ siteUrl: site.siteUrl, permissionLevel: site.permissionLevel }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

export function validateSearchAnalyticsRequest(input: Partial<SearchAnalyticsRequest>): SearchAnalyticsRequest {
  if (!input.siteUrl || typeof input.siteUrl !== "string") {
    throw new Error("siteUrl is required.");
  }
  if (!input.startDate || typeof input.startDate !== "string") {
    throw new Error("startDate is required.");
  }
  if (!input.endDate || typeof input.endDate !== "string") {
    throw new Error("endDate is required.");
  }

  const dimensions = Array.isArray(input.dimensions) && input.dimensions.length > 0 ? input.dimensions : ["date", "page"];
  for (const dimension of dimensions) {
    if (!ALLOWED_DIMENSIONS.has(dimension)) {
      throw new Error(`Unsupported Search Analytics dimension: ${dimension}`);
    }
  }

  const requestedLimit = Number(input.rowLimit || 1000);
  const rowLimit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 1000, 1), MAX_ROW_LIMIT);

  return {
    siteUrl: input.siteUrl,
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions,
    rowLimit,
  };
}

export async function fetchSearchAnalytics(userId: string, request: SearchAnalyticsRequest): Promise<unknown> {
  const body = {
    startDate: request.startDate,
    endDate: request.endDate,
    dimensions: request.dimensions,
    rowLimit: request.rowLimit,
  };

  const response = await googleFetch(
    userId,
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(request.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    const error = data as { error?: { message?: string } };
    throw new Error(error.error?.message || "Failed to fetch Search Analytics data.");
  }

  return data;
}
