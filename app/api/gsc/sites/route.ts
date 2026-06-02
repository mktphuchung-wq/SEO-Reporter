import { NextRequest, NextResponse } from "next/server";
import { getRequestUserId } from "../../../../src/lib/auth/currentUser";
import { listGscProperties } from "../../../../src/lib/gsc/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = getRequestUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const sites = await listGscProperties(userId);
    return NextResponse.json({ sites });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch GSC properties." },
      { status: 400 },
    );
  }
}
