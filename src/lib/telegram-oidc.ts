import crypto from "node:crypto";
import type { TelegramUser } from "./telegram";
import { telegramLoginClientId, telegramLoginClientSecret } from "./web-auth";

const ISSUER = "https://oauth.telegram.org";
const TOKEN_ENDPOINT = `${ISSUER}/token`;
const JWKS_ENDPOINT = `${ISSUER}/.well-known/jwks.json`;

type TelegramIdTokenHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type TelegramIdTokenClaims = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  iat?: number;
  exp?: number;
  nonce?: string;
  id?: number;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
};

type TelegramJwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

type TelegramJwks = { keys?: TelegramJwk[] };

function parseJsonPart<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function audienceMatches(aud: string | string[] | undefined, clientId: string): boolean {
  if (typeof aud === "string") return aud === clientId;
  return Array.isArray(aud) && aud.includes(clientId);
}

export async function exchangeTelegramCode(input: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<string> {
  const clientId = telegramLoginClientId();
  const clientSecret = telegramLoginClientSecret();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: clientId,
    code_verifier: input.verifier,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
    },
    body,
    cache: "no-store",
  });
  const payload = await response.json() as { id_token?: string; error?: string; error_description?: string };
  if (!response.ok || !payload.id_token) {
    throw new Error(payload.error_description || payload.error || "Telegram token exchange failed");
  }
  return payload.id_token;
}

export async function verifyTelegramIdToken(idToken: string, nonce: string): Promise<TelegramUser> {
  const [encodedHeader, encodedClaims, encodedSignature, extra] = idToken.split(".");
  if (!encodedHeader || !encodedClaims || !encodedSignature || extra) throw new Error("Invalid Telegram id_token");

  const header = parseJsonPart<TelegramIdTokenHeader>(encodedHeader);
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Telegram Login must use the default RS256 signing algorithm");
  }

  const jwksResponse = await fetch(JWKS_ENDPOINT, { next: { revalidate: 3600 } });
  if (!jwksResponse.ok) throw new Error("Telegram JWKS could not be loaded");
  const jwks = await jwksResponse.json() as TelegramJwks;
  const jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!jwk) throw new Error("Telegram signing key not found");

  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const signed = Buffer.from(`${encodedHeader}.${encodedClaims}`);
  const signature = Buffer.from(encodedSignature, "base64url");
  if (!crypto.verify("RSA-SHA256", signed, key, signature)) throw new Error("Invalid Telegram id_token signature");

  const claims = parseJsonPart<TelegramIdTokenClaims>(encodedClaims);
  const clientId = telegramLoginClientId();
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER) throw new Error("Invalid Telegram issuer");
  if (!audienceMatches(claims.aud, clientId)) throw new Error("Invalid Telegram audience");
  if (!Number.isFinite(claims.exp) || (claims.exp as number) < now - 30) throw new Error("Expired Telegram id_token");
  if (!Number.isFinite(claims.iat) || (claims.iat as number) > now + 60) throw new Error("Invalid Telegram issued-at time");
  if (claims.nonce !== nonce) throw new Error("Invalid Telegram login nonce");
  if (!Number.isSafeInteger(claims.id) || (claims.id as number) <= 0) throw new Error("Telegram user id is missing");

  const firstName = claims.given_name?.trim() || claims.name?.trim().split(/\s+/)[0] || claims.preferred_username?.trim();
  if (!firstName) throw new Error("Telegram profile name is missing");

  return {
    id: claims.id as number,
    first_name: firstName,
    ...(claims.family_name?.trim() ? { last_name: claims.family_name.trim() } : {}),
    ...(claims.preferred_username?.trim() ? { username: claims.preferred_username.trim() } : {}),
    ...(claims.picture?.trim() ? { photo_url: claims.picture.trim() } : {}),
  };
}
