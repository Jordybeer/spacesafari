import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  createTelegramOAuthFlow,
  safeReturnTo,
  telegramLoginClientId,
  telegramLoginConfigured,
} from "@/src/lib/web-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appOrigin(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

function withError(origin: string, returnTo: string, error: string): URL {
  const target = new URL(returnTo, origin);
  target.searchParams.set("auth_error", error);
  return target;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = appOrigin(request);
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));
  if (!telegramLoginConfigured()) {
    return NextResponse.redirect(withError(origin, returnTo, "not_configured"));
  }

  const { flow, cookie } = createTelegramOAuthFlow(returnTo);
  const challenge = crypto.createHash("sha256").update(flow.verifier).digest("base64url");
  const redirectUri = new URL("/api/auth/telegram/callback", origin).toString();
  const authorizationUrl = new URL("https://oauth.telegram.org/auth");
  authorizationUrl.searchParams.set("client_id", telegramLoginClientId());
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid profile");
  authorizationUrl.searchParams.set("state", flow.state);
  authorizationUrl.searchParams.set("nonce", flow.nonce);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizationUrl);
  response.headers.append("set-cookie", cookie);
  response.headers.set("cache-control", "no-store");
  return response;
}
