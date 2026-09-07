import { getRedis } from "./storage";
import type { MapPresence } from "./map-model";

export interface GroupMeetPoint {
  anchorId: string;
  name: string;
  latitude: number;
  longitude: number;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  expiresAt: string;
}

export interface GroupTentPoint {
  userId: number;
  displayName: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

const MEET_TTL_SECONDS = 2 * 60 * 60;

export async function setGroupMeetPoint(
  room: string,
  point: Omit<GroupMeetPoint, "createdAt" | "expiresAt">,
): Promise<GroupMeetPoint> {
  const now = new Date();
  const meet: GroupMeetPoint = {
    ...point,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MEET_TTL_SECONDS * 1000).toISOString(),
  };
  await getRedis().set(`ss:room:${room}:meet`, meet, { ex: MEET_TTL_SECONDS });
  return meet;
}

export async function getGroupMeetPoint(room: string): Promise<GroupMeetPoint | null> {
  return getRedis().get<GroupMeetPoint>(`ss:room:${room}:meet`);
}

export async function saveGroupTentPoint(room: string, presence: MapPresence): Promise<GroupTentPoint> {
  const tent: GroupTentPoint = {
    userId: presence.userId,
    displayName: presence.displayName,
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
