import { NextResponse } from "next/server";
import { authConfigured, credentialsMatch, createSessionToken, isHttpsRequest, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map();

function clientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function locked(ip) {
  const row = attempts.get(ip);
  if (!row) return false;
  if (Date.now() > row.reset) {
    attempts.delete(ip);
    return false;
  }
  return row.count >= 8;
}

function fail(ip) {
  const row = attempts.get(ip);
  if (!row || Date.now() > row.reset) {
    attempts.set(ip, { count: 1, reset: Date.now() + 60_000 });
    return;
  }
  row.count += 1;
}

export async function POST(request) {
  const ip = clientIp(request);
  if (locked(ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Espere um minuto e tente de novo." },
      { status: 429 }
    );
  }

  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Login ainda não configurado. Defina TOOLS_USER, TOOLS_PASSWORD e AUTH_SECRET no .env e reinicie o servidor." },
      { status: 500 }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const username = String(body.username || "");
  const password = String(body.password || "");
  const ok = await credentialsMatch(username, password);
  if (!ok) {
    fail(ip);
    await new Promise((resolve) => setTimeout(resolve, 400));
    return NextResponse.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
  }

  attempts.delete(ip);
  const token = await createSessionToken(username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(isHttpsRequest(request)));
  return res;
}
