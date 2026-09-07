import { NextResponse } from "next/server";
import { z } from "zod";
import { festivalSelectorForContext } from "@/src/lib/festival-links";
import { isFestivalOwner, requireResolvedFestivalDefinition } from "@/src/lib/festival-store";
import { normalizeRoomToken, optionalMapAuth } from "@/src/lib/map-auth";
import { getGroupMeetPoint, getGroupMeetStatuses, listGroupTentPoints } from "@/src/lib/group-tools";
import { hasGroupRoom, isMapAdmin, listAnchors, listPresence, roomFor } from "@/src/lib/map-model";
import { projectPresence } from "@/src/lib/map-projection";
import { isRedisConfigured } from "@/src/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  initData: z.string().min(1).optional(),
  roomToken: z.string().optional(),
  mode: z.enum(["group", "public"]).default("public"),
  festivalId: z.string().trim().min(1).max(64).optional(),
});

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    const roomToken = normalizeRoomToken(input.roomToken);
    const data = optionalMapAuth(request, input.initData, roomToken);
    const festival = await requireResolvedFestivalDefinition(
      festivalSelectorForContext(data?.source, data?.startParam, input.festivalId),
    );
    if (input.mode === "group" && !data) {
      return NextResponse.json({ error: "Log in met Telegram om de groepskaart te openen" }, { status: 401 });
    }

    const room = data ? roomFor(data, input.mode) : "public";
    const storageReady = isRedisConfigured();
    const [anchors, rawPresence, meet, tents] = storageReady
      ? await Promise.all([
          listAnchors(festival.id),
          listPresence(room, festival.id),
          input.mode === "group" ? getGroupMeetPoint(room, festival.id) : Promise.resolve(null),
          input.mode === "group" ? listGroupTentPoints(room, festival.id) : Promise.resolve([]),
        ])
      : [[], [], null, []];
    const meetStatuses = meet ? await getGroupMeetStatuses(room, meet.id, festival.id) : [];
    const statusByUserId = new Map(meetStatuses.map((status) => [status.userId, status.status]));

    const ownVisible = input.mode !== "group"
      || !data
      || rawPresence.some((member) => member.userId === data.user.id);
    const visiblePresence = ownVisible ? rawPresence : [];
    const projected = projectPresence(visiblePresence, anchors).map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      username: member.username,
      photoUrl: member.photoUrl,
      horizontalAccuracy: member.horizontalAccuracy,
      updatedAt: member.updatedAt,
      latitude: member.latitude,
      longitude: member.longitude,
      mapX: member.mapX,
      mapY: member.mapY,
      simulated: member.simulated ?? false,
      meetStatus: statusByUserId.get(member.userId) ?? null,
    }));

    const serverTime = new Date().toISOString();
    const admin = data
      ? isMapAdmin(data.user.id) || isFestivalOwner(festival, data.user.id)
      : false;
    return NextResponse.json({
      festival: {
        id: festival.id,
        name: festival.name,
        year: festival.year,
        timezone: festival.timezone,
        status: festival.status,
        mapImageUrl: festival.mapImageUrl,
        mapImageWidth: festival.mapImageWidth,
        mapImageHeight: festival.mapImageHeight,
        venueCenter: festival.venueCenter,
        venueMaxDistanceMeters: festival.venueMaxDistanceMeters,
      },
      room,
      mode: input.mode,
      storageReady,
      groupAvailable: data ? hasGroupRoom(data) : false,
      groupLocationsLocked: input.mode === "group" && Boolean(data) && !ownVisible,
      chatType: data?.chatType ?? null,
      authSource: data?.source ?? null,
      user: data ? {
        id: data.user.id,
        firstName: data.user.first_name,
        username: data.user.username ?? null,
        photoUrl: data.user.photo_url ?? null,
      } : null,
      admin,
      anchorCount: anchors.length,
      anchors: anchors.map((anchor) => ({
        id: anchor.id,
        name: anchor.name,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        mapX: anchor.mapX,
        mapY: anchor.mapY,
        horizontalAccuracy: anchor.horizontalAccuracy,
        createdAt: anchor.createdAt,
      })),
      members: projected,
      meet: meet ? {
        id: meet.id,
        name: meet.name,
        latitude: meet.latitude,
        longitude: meet.longitude,
        createdByName: meet.createdByName,
        createdAt: meet.createdAt,
        expiresAt: meet.expiresAt,
        goingCount: meetStatuses.filter((status) => status.status === "going").length,
        arrivedCount: meetStatuses.filter((status) => status.status === "arrived").length,
      } : null,
      tents: tents.map((tent) => ({
        userId: tent.userId,
        displayName: tent.displayName,
        username: tent.username ?? null,
        latitude: tent.latitude,
        longitude: tent.longitude,
        createdAt: tent.createdAt,
      })),
      serverTime,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
