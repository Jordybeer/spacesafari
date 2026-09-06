import crypto from "node:crypto";
import type { TelegramUser } from "./telegram";

export const WEB_SESSION_COOKIE = "ss_tg_session";
export const TELEGRAM_OAUTH_COOKIE = "ss_tg_oauth";

const WEB_SESSION_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_FLOW_SECONDS = 10 * 60;

type SignedPayload = { exp: number };

export type WebSession = {
  exp: number;
  user: TelegramUser;
};

export type TelegramOAuthFlow = {
  exp: number;
  state: string;
  verifier: string;
  nonce: string;
  returnTo: string;
};

function sessionSecret(): string {
  const value = process.env.MAP_ROOM_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!value) throw new Error("MAP_ROOM_SECRET or TELEGRAM_WEBHOOK_SECRET is not configured");
  return value;
}

function signPayload(payload: SignedPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyPayload<T extends SignedPayload>(token: string): T {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) throw new Error("Invalid session token");
  const expected = crypto.createHmac("sha256", sessionSecret()).update(body).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Error("Invalid session signature");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Expired session");
  }
  return payload;
}

function requestCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function cookie(name: string, value: string, maxAge: number): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function createWebSessionCookie(user: TelegramUser): string {
  const now = Math.floor(Date.now() / 1000);
  return cookie(WEB_SESSION_COOKIE, signPayload({ exp: now + WEB_SESSION_SECONDS, user }), WEB_SESSION_SECONDS);
}

export function readWebSession(request: Request): WebSession | null {
  const token = requestCookie(request, WEB_SESSION_COOKIE);
  if (!token) return null;
  try {
    return verifyPayload<WebSession>(token);
  } catch {
    return null;
  }
}

export function clearWebSessionCookie(): string {
  return cookie(WEB_SESSION_COOKIE, "", 0);
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\n") || value.includes("\r")) {
    return "/map";
  }
  return value;
}

export function createTelegramOAuthFlow(returnTo: string): { flow: TelegramOAuthFlow; cookie: string } {
  const now = Math.floor(Date.now() / 1000);
  const flow: TelegramOAuthFlow = {
    exp: now + OAUTH_FLOW_SECONDS,
    state: crypto.randomBytes(24).toString("base64url"),
    verifier: crypto.randomBytes(48).toString("base64url"),
    nonce: crypto.randomBytes(24).toString("base64url"),
    returnTo: safeReturnTo(returnTo),
  };
  return { flow, cookie: cookie(TELEGRAM_OAUTH_COOKIE, signPayload(flow), OAUTH_FLOW_SECONDS) };
}

export function readTelegramOAuthFlow(request: Request): TelegramOAuthFlow | null {
  const token = requestCookie(request, TELEGRAM_OAUTH_COOKIE);
  if (!token) return null;
  try {
    return verifyPayload<TelegramOAuthFlow>(token);
  } catch {
    return null;
  }
}

export function clearTelegramOAuthCookie(): string {
  return cookie(TELEGRAM_OAUTH_COOKIE, "", 0);
}

export function telegramLoginConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_LOGIN_CLIENT_ID && process.env.TELEGRAM_LOGIN_CLIENT_SECRET);
}

export function telegramLoginClientId(): string {
  const value = process.env.TELEGRAM_LOGIN_CLIENT_ID;
  if (!value) throw new Error("TELEGRAM_LOGIN_CLIENT_ID is not configured");
  return value;
}

export function telegramLoginClientSecret(): string {
  const value = process.env.TELEGRAM_LOGIN_CLIENT_SECRET;
  if (!value) throw new Error("TELEGRAM_LOGIN_CLIENT_SECRET is not configured");
  return value;
}
