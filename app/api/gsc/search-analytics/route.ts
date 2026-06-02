import { NextRequest, NextResponse } from "next/server";
import { getRequestUserId } from "../../../../src/lib/auth/currentUser";
import { fetchSearchAnalytics, validateSearchAnalyticsRequest } from "../../../../src/lib/gsc/client";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = getRequestUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const payload = await request.json();
    const gscRequest = validateSearchAnalyticsRequest(payload);
    const data = await fetchSearchAnalytics(userId, gscRequest);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Search Analytics data." },
      { status: 400 },
    );
  }
}
