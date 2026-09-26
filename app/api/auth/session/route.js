import { NextResponse } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ ok: Boolean(session) });
}
