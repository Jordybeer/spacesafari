import crypto from "node:crypto";
import { getRedis } from "./storage";
import type { TelegramUser } from "./telegram";
import type { ValidatedMiniAppData } from "./telegram-init-data";

export const PRESENCE_TTL_SECONDS = 15 * 60;
const BUILT_IN_MAP_ADMIN_TELEGRAM_IDS: readonly number[] = [1303637520];

export interface MapAnchor {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  horizontalAccuracy: number | null;
  mapX: number;
  mapY: number;
  createdBy: number;
  createdAt: string;
}

export interface MapPresence {
  userId: number;
  displayName: string;
  username?: string;
  photoUrl?: string;
  latitude: number;
  longitude: number;
  horizontalAccuracy: number | null;
  updatedAt: string;
}

export interface ProjectedPresence extends MapPresence {
  mapX: number | null;
  mapY: number | null;
}

export type RoomMode = "group" | "public";

function shortHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url").slice(0, 22);
}

export function privateRoomToken(chatId: string | number): string {
  const secret = process.env.MAP_ROOM_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error("MAP_ROOM_SECRET or TELEGRAM_WEBHOOK_SECRET is not configured");
  return crypto.createHmac("sha256", secret).update(String(chatId)).digest("base64url").slice(0, 22);
}

export function hasGroupRoom(data: ValidatedMiniAppData): boolean {
  return Boolean(data.startParam?.match(/^room_[A-Za-z0-9_-]{20,32}$/) || data.chatInstance);
}

export function roomFor(data: ValidatedMiniAppData, mode: RoomMode): string {
  if (mode === "public") return "public";
  const directRoom = data.startParam?.match(/^room_([A-Za-z0-9_-]{20,32})$/)?.[1];
  if (directRoom) return `g_${directRoom}`;
  if (data.chatInstance) return `g_${shortHash(data.chatInstance)}`;
  return `u_${data.user.id}`;
}

export function displayName(user: TelegramUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ");
}

function configuredMapAdminIds(): number[] {
  return (process.env.MAP_ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
}

export function hasMapAdminConfiguration(): boolean {
  return BUILT_IN_MAP_ADMIN_TELEGRAM_IDS.length > 0 || configuredMapAdminIds().length > 0;
}

export function isMapAdmin(userId: number): boolean {
  // Telegram initData is signature-verified server-side before this check, so a
  // numeric ID in this allowlist cannot be used to impersonate the admin.
  return BUILT_IN_MAP_ADMIN_TELEGRAM_IDS.includes(userId) || configuredMapAdminIds().includes(userId);
}

export async function putPresence(room: string, user: TelegramUser, location: {
  latitude: number;
  longitude: number;
  horizontalAccuracy?: number | null;
}): Promise<MapPresence> {
  const redis = getRedis();
  const presence: MapPresence = {
    userId: user.id,
    displayName: displayName(user),
    ...(user.username ? { username: user.username } : {}),
    ...(user.photo_url ? { photoUrl: user.photo_url } : {}),
    latitude: location.latitude,
    longitude: location.longitude,
    horizontalAccuracy: location.horizontalAccuracy ?? null,
    updatedAt: new Date().toISOString(),
  };
  const userKey = `ss:room:${room}:presence:${user.id}`;
  const membersKey = `ss:room:${room}:members`;
  await Promise.all([
    redis.set(userKey, presence, { ex: PRESENCE_TTL_SECONDS }),
    redis.sadd(membersKey, String(user.id)),
    redis.expire(membersKey, PRESENCE_TTL_SECONDS * 2),
  ]);
  return presence;
}

export async function stopPresence(room: string, userId: number): Promise<void> {
  const redis = getRedis();
  await Promise.all([
    redis.del(`ss:room:${room}:presence:${userId}`),
    redis.srem(`ss:room:${room}:members`, String(userId)),
  ]);
}

export async function listPresence(room: string): Promise<MapPresence[]> {
  const redis = getRedis();
  const members = await redis.smembers<string[]>(`ss:room:${room}:members`);
  if (!members.length) return [];

  const values = await Promise.all(
    members.map((id: string) => redis.get<MapPresence>(`ss:room:${room}:presence:${id}`)),
  );
  const stale: string[] = [];
  const current: MapPresence[] = [];
  values.forEach((value: MapPresence | null, index: number) => {
    if (value) current.push(value);
    else stale.push(members[index]);
  });
  if (stale.length) await redis.srem(`ss:room:${room}:members`, ...stale);
  return current;
}

export async function listAnchors(): Promise<MapAnchor[]> {
  const redis = getRedis();
  const all = await redis.hgetall<Record<string, MapAnchor>>("ss:map:anchors");
  return Object.values(all ?? {}).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveAnchor(anchor: MapAnchor): Promise<void> {
  if (
    !Number.isFinite(anchor.latitude) ||
    !Number.isFinite(anchor.longitude) ||
    anchor.mapX < 0 || anchor.mapX > 1 ||
    anchor.mapY < 0 || anchor.mapY > 1
  ) {
    throw new Error("Invalid map anchor");
  }
  await getRedis().hset("ss:map:anchors", { [anchor.id]: anchor });
}

export async function deleteAnchor(id: string): Promise<void> {
  await getRedis().hdel("ss:map:anchors", id);
}
