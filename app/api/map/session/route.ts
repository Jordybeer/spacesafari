import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeRoomToken, optionalMapAuth } from "@/src/lib/map-auth";
import { hasGroupRoom, isMapAdmin, listAnchors, listPresence, roomFor } from "@/src/lib/map-model";
import { projectPresence } from "@/src/lib/map-projection";
import { isRedisConfigured } from "@/src/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  initData: z.string().min(1).optional(),
  roomToken: z.string().optional(),
  mode: z.enum(["group", "public"]).default("public"),
});

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    const roomToken = normalizeRoomToken(input.roomToken);
    const data = optionalMapAuth(request, input.initData, roomToken);
    if (input.mode === "group" && !data) {
      return NextResponse.json({ error: "Log in met Telegram om de groepskaart te openen" }, { status: 401 });
    }

    const room = data ? roomFor(data, input.mode) : "public";
    const storageReady = isRedisConfigured();
    const [anchors, rawPresence] = storageReady
      ? await Promise.all([listAnchors(), listPresence(room)])
      : [[], []];

    const projected = projectPresence(rawPresence, anchors).map((member) => ({
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
    }));

    return NextResponse.json({
      room,
      mode: input.mode,
      storageReady,
      groupAvailable: data ? hasGroupRoom(data) : false,
      chatType: data?.chatType ?? null,
      authSource: data?.source ?? null,
      user: data ? {
        id: data.user.id,
        firstName: data.user.first_name,
        username: data.user.username ?? null,
        photoUrl: data.user.photo_url ?? null,
      } : null,
      admin: data ? isMapAdmin(data.user.id) : false,
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
      serverTime: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
