import type { ValidatedMiniAppData } from "./telegram-init-data";
import { validateTelegramInitData } from "./telegram-init-data";
import { readWebSession } from "./web-auth";

const ROOM_TOKEN_RE = /^[A-Za-z0-9_-]{20,32}$/;

export type MapAuthData = ValidatedMiniAppData & {
  source: "miniapp" | "web";
};

export function normalizeRoomToken(value: string | null | undefined): string | undefined {
  if (!value || !ROOM_TOKEN_RE.test(value)) return undefined;
  return value;
}

export function optionalMapAuth(
  request: Request,
  initData?: string,
  roomToken?: string,
): MapAuthData | null {
  if (initData) {
    return { ...validateTelegramInitData(initData), source: "miniapp" };
  }
  const session = readWebSession(request);
  if (!session) return null;
  const token = normalizeRoomToken(roomToken);
  return {
    user: session.user,
    authDate: Math.floor(Date.now() / 1000),
    ...(token ? { startParam: `room_${token}` } : {}),
    source: "web",
  };
}

export function requireMapAuth(
  request: Request,
  initData?: string,
  roomToken?: string,
): MapAuthData {
  const data = optionalMapAuth(request, initData, roomToken);
  if (!data) throw new Error("Log in met Telegram om deze functie te gebruiken");
  return data;
}
