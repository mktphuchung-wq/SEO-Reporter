import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

export const APP_USER_COOKIE = "app_user_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function createAppUserId(): string {
  return crypto.randomUUID();
}

export function getRequestUserId(request: NextRequest): string | null {
  return request.cookies.get(APP_USER_COOKIE)?.value ?? null;
}

export function ensureRequestUserId(request: NextRequest, response: NextResponse): string {
  const existingUserId = getRequestUserId(request);
  if (existingUserId) {
    return existingUserId;
  }

  const userId = createAppUserId();
  response.cookies.set(APP_USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return userId;
}

export async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(APP_USER_COOKIE)?.value ?? null;
}
