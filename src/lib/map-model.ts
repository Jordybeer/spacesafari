import crypto from "node:crypto";
import { DEFAULT_FESTIVAL_ID, festivalStoragePrefix } from "./festivals";
import { getRedis } from "./storage";
import type { TelegramUser } from "./telegram";
import type { ValidatedMiniAppData } from "./telegram-init-data";

export const PRESENCE_TTL_SECONDS = 15 * 60;
export const MAX_PRESENCE_TTL_SECONDS = 7 * 24 * 60 * 60;
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
  simulated?: boolean;
}

export interface ProjectedPresence extends MapPresence {
  mapX: number | null;
  mapY: number | null;
}

export type RoomMode = "group" | "public";

function shortHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url").slice(0, 22);
}

function roomStorageKey(festivalId: string, room: string, suffix: string): string {
  return `${festivalStoragePrefix(festivalId)}:room:${room}:${suffix}`;
}

function anchorsStorageKey(festivalId: string): string {
  return `${festivalStoragePrefix(festivalId)}:map:anchors`;
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
  return BUILT_IN_MAP_ADMIN_TELEGRAM_IDS.includes(userId) || configuredMapAdminIds().includes(userId);
}

export async function putPresence(room: string, user: TelegramUser, location: {
  latitude: number;
  longitude: number;
  horizontalAccuracy?: number | null;
}, ttlSeconds = PRESENCE_TTL_SECONDS, options?: {
  simulated?: boolean;
  persistent?: boolean;
  festivalId?: string;
}): Promise<MapPresence> {
  const redis = getRedis();
  const ttl = Math.max(60, Math.min(MAX_PRESENCE_TTL_SECONDS, Math.round(ttlSeconds)));
  const festivalId = options?.festivalId ?? DEFAULT_FESTIVAL_ID;
  const presence: MapPresence = {
    userId: user.id,
    displayName: displayName(user),
    ...(user.username ? { username: user.username } : {}),
    ...(user.photo_url ? { photoUrl: user.photo_url } : {}),
    latitude: location.latitude,
    longitude: location.longitude,
    horizontalAccuracy: location.horizontalAccuracy ?? null,
    updatedAt: new Date().toISOString(),
    ...(options?.simulated ? { simulated: true } : {}),
  };
  const userKey = roomStorageKey(festivalId, room, `presence:${user.id}`);
  const membersKey = roomStorageKey(festivalId, room, "members");
  const persistentMembersKey = roomStorageKey(festivalId, room, "persistent-members");

  if (options?.persistent) {
    await Promise.all([
      redis.set(userKey, presence),
      redis.sadd(persistentMembersKey, String(user.id)),
      redis.srem(membersKey, String(user.id)),
    ]);
    return presence;
  }

  await Promise.all([
    redis.set(userKey, presence, { ex: ttl }),
    redis.sadd(membersKey, String(user.id)),
    redis.srem(persistentMembersKey, String(user.id)),
    redis.expire(membersKey, Math.max(PRESENCE_TTL_SECONDS * 2, ttl * 2)),
  ]);
  return presence;
}

export async function stopPresence(
  room: string,
  userId: number,
  festivalId = DEFAULT_FESTIVAL_ID,
): Promise<void> {
  const redis = getRedis();
  await Promise.all([
    redis.del(roomStorageKey(festivalId, room, `presence:${userId}`)),
    redis.srem(roomStorageKey(festivalId, room, "members"), String(userId)),
    redis.srem(roomStorageKey(festivalId, room, "persistent-members"), String(userId)),
  ]);
}

export async function listPresence(
  room: string,
  festivalId = DEFAULT_FESTIVAL_ID,
): Promise<MapPresence[]> {
  const redis = getRedis();
  const membersKey = roomStorageKey(festivalId, room, "members");
  const persistentMembersKey = roomStorageKey(festivalId, room, "persistent-members");
  const [members, persistentMembers] = await Promise.all([
    redis.smembers<string[]>(membersKey),
    redis.smembers<string[]>(persistentMembersKey),
  ]);
  const allMembers = Array.from(new Set([...(members ?? []), ...(persistentMembers ?? [])]));
  if (!allMembers.length) return [];

  const values = await Promise.all(
    allMembers.map((id: string) => redis.get<MapPresence>(roomStorageKey(festivalId, room, `presence:${id}`))),
  );
  const stale: string[] = [];
  const current: MapPresence[] = [];
  values.forEach((value: MapPresence | null, index: number) => {
    if (value) current.push(value);
    else stale.push(allMembers[index]);
  });
  if (stale.length) {
    await Promise.all([
      redis.srem(membersKey, ...stale),
      redis.srem(persistentMembersKey, ...stale),
    ]);
  }
  return current;
}

export async function listAnchors(festivalId = DEFAULT_FESTIVAL_ID): Promise<MapAnchor[]> {
  const redis = getRedis();
  const all = await redis.hgetall<Record<string, MapAnchor>>(anchorsStorageKey(festivalId));
  return Object.values(all ?? {}).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveAnchor(
  anchor: MapAnchor,
  festivalId = DEFAULT_FESTIVAL_ID,
): Promise<void> {
  if (
    !Number.isFinite(anchor.latitude) ||
    !Number.isFinite(anchor.longitude) ||
    anchor.mapX < 0 || anchor.mapX > 1 ||
    anchor.mapY < 0 || anchor.mapY > 1
  ) {
    throw new Error("Invalid map anchor");
  }
  await getRedis().hset(anchorsStorageKey(festivalId), { [anchor.id]: anchor });
}

export async function deleteAnchor(id: string, festivalId = DEFAULT_FESTIVAL_ID): Promise<void> {
  await getRedis().hdel(anchorsStorageKey(festivalId), id);
}
