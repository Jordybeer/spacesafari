import crypto from "node:crypto";
import { getRedis } from "./storage";
import type { MapPresence } from "./map-model";
import type { TelegramUser } from "./telegram";

export type GroupMeetStatus = "going" | "arrived";

export interface GroupMeetPoint {
  id: string;
  anchorId: string;
  name: string;
  latitude: number;
  longitude: number;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  expiresAt: string;
}

export interface GroupMeetStatusEntry {
  userId: number;
  displayName: string;
  username?: string;
  status: GroupMeetStatus;
  updatedAt: string;
}

export interface GroupTentPoint {
  userId: number;
  displayName: string;
  username?: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

const MEET_TTL_SECONDS = 2 * 60 * 60;

function meetStatusKey(room: string, meetId: string): string {
  return `ss:room:${room}:meet-status:${meetId}`;
}

export async function setGroupMeetPoint(
  room: string,
  point: Omit<GroupMeetPoint, "id" | "createdAt" | "expiresAt">,
): Promise<GroupMeetPoint> {
  const now = new Date();
  const meet: GroupMeetPoint = {
    ...point,
    id: crypto.randomBytes(6).toString("base64url"),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MEET_TTL_SECONDS * 1000).toISOString(),
  };
  await getRedis().set(`ss:room:${room}:meet`, meet, { ex: MEET_TTL_SECONDS });
  return meet;
}

export async function getGroupMeetPoint(room: string): Promise<GroupMeetPoint | null> {
  return getRedis().get<GroupMeetPoint>(`ss:room:${room}:meet`);
}

export async function setGroupMeetStatus(
  room: string,
  meetId: string,
  user: TelegramUser,
  status: GroupMeetStatus,
): Promise<GroupMeetStatusEntry | null> {
  const meet = await getGroupMeetPoint(room);
  if (!meet || meet.id !== meetId) return null;

  const entry: GroupMeetStatusEntry = {
    userId: user.id,
    displayName: user.username ? `@${user.username}` : [user.first_name, user.last_name].filter(Boolean).join(" "),
    ...(user.username ? { username: user.username } : {}),
    status,
    updatedAt: new Date().toISOString(),
  };
  const ttl = Math.max(60, Math.ceil((Date.parse(meet.expiresAt) - Date.now()) / 1000));
  const redis = getRedis();
  const key = meetStatusKey(room, meetId);
  await Promise.all([
    redis.hset(key, { [String(user.id)]: entry }),
    redis.expire(key, ttl),
  ]);
  return entry;
}

export async function getGroupMeetStatuses(room: string, meetId: string): Promise<GroupMeetStatusEntry[]> {
  const all = await getRedis().hgetall<Record<string, GroupMeetStatusEntry>>(meetStatusKey(room, meetId));
  return Object.values(all ?? {}).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function saveGroupTentPoint(room: string, presence: MapPresence): Promise<GroupTentPoint> {
  const tent: GroupTentPoint = {
    userId: presence.userId,
    displayName: presence.displayName,
    ...(presence.username ? { username: presence.username } : {}),
    latitude: presence.latitude,
    longitude: presence.longitude,
    createdAt: new Date().toISOString(),
  };
  await getRedis().hset(`ss:room:${room}:tents`, { [String(presence.userId)]: tent });
  return tent;
}

export async function listGroupTentPoints(room: string): Promise<GroupTentPoint[]> {
  const all = await getRedis().hgetall<Record<string, GroupTentPoint>>(`ss:room:${room}:tents`);
  return Object.values(all ?? {}).sort((a, b) => a.displayName.localeCompare(b.displayName));
}
