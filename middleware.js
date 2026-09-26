import { NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth";

const PAGE_PREFIXES = ["/audio", "/video", "/criativos", "/ferramentas"];
const API_PREFIXES = ["/api/studio", "/api/audio-merge", "/api/video-clean"];

function isProtected(pathname) {
  return (
    PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/audio",
    "/audio/:path*",
    "/video",
    "/video/:path*",
    "/criativos",
    "/criativos/:path*",
    "/ferramentas",
    "/ferramentas/:path*",
    "/api/studio/:path*",
    "/api/audio-merge",
    "/api/video-clean",
  ],
};
