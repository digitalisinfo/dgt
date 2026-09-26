import { NextResponse } from "next/server";
import { isHttpsRequest, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(isHttpsRequest(request)),
    maxAge: 0,
  });
  return res;
}
