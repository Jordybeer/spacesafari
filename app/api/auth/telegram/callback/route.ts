import { NextResponse } from "next/server";
import { exchangeTelegramCode, verifyTelegramIdToken } from "@/src/lib/telegram-oidc";
import {
  clearTelegramOAuthCookie,
  createWebSessionCookie,
  readTelegramOAuthFlow,
  safeReturnTo,
} from "@/src/lib/web-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appOrigin(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

function redirectWithError(origin: string, returnTo: string, code: string): NextResponse {
  const target = new URL(safeReturnTo(returnTo), origin);
  target.searchParams.set("auth_error", code);
  const response = NextResponse.redirect(target);
  response.headers.append("set-cookie", clearTelegramOAuthCookie());
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = appOrigin(request);
  const flow = readTelegramOAuthFlow(request);
  if (!flow) return redirectWithError(origin, "/map", "expired");

  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const oauthError = requestUrl.searchParams.get("error");
  if (oauthError) return redirectWithError(origin, flow.returnTo, "cancelled");
  if (!state || state !== flow.state || !code) return redirectWithError(origin, flow.returnTo, "invalid_state");

  try {
    const redirectUri = new URL("/api/auth/telegram/callback", origin).toString();
    const idToken = await exchangeTelegramCode({ code, verifier: flow.verifier, redirectUri });
    const user = await verifyTelegramIdToken(idToken, flow.nonce);
    const response = NextResponse.redirect(new URL(flow.returnTo, origin));
    response.headers.append("set-cookie", createWebSessionCookie(user));
    response.headers.append("set-cookie", clearTelegramOAuthCookie());
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    console.error("Telegram web login failed", error);
    return redirectWithError(origin, flow.returnTo, "failed");
  }
}
