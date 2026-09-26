export const SESSION_COOKIE = "dgt_tools";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

function bytesToBase64Url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeString(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlDecodeString(value) {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(digest);
}

function authSecret() {
  return process.env.AUTH_SECRET || "";
}

export function authConfigured() {
  return Boolean(process.env.TOOLS_USER && process.env.TOOLS_PASSWORD && authSecret());
}

async function sign(body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return bytesToBase64Url(sig);
}

export async function credentialsMatch(username, password) {
  if (!authConfigured()) return false;
  const [given, expected] = await Promise.all([
    sha256(`${username}\n${password}`),
    sha256(`${process.env.TOOLS_USER}\n${process.env.TOOLS_PASSWORD}`),
  ]);
  return safeEqual(given, expected);
}

export async function createSessionToken(username) {
  const body = base64UrlEncodeString(
    JSON.stringify({ u: username, exp: Date.now() + MAX_AGE_SEC * 1000 })
  );
  const sig = await sign(body);
  return `${body}.${sig}`;
}

export async function readSessionToken(token) {
  if (!token || !authSecret()) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await sign(body);
  if (!safeEqual(expected, sig)) return null;
  try {
    const data = JSON.parse(base64UrlDecodeString(body));
    if (!data?.exp || data.exp < Date.now() || !data.u) return null;
    return data;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(secure),
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

export function isHttpsRequest(request) {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function safeNextPath(value) {
  if (typeof value !== "string") return "/ferramentas";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) {
    return "/ferramentas";
  }
  return value;
}
