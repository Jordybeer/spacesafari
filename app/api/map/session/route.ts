import { NextResponse } from "next/server";
import { z } from "zod";
import { validateTelegramInitData } from "@/src/lib/telegram-init-data";
import { hasGroupRoom, isMapAdmin, listAnchors, listPresence, roomFor } from "@/src/lib/map-model";
import { projectPresence } from "@/src/lib/map-projection";
import { isRedisConfigured } from "@/src/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  initData: z.string().min(1),
  mode: z.enum(["group", "public"]).default("group"),
});

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    const data = validateTelegramInitData(input.initData);
    const room = roomFor(data, input.mode);
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
      mapX: member.mapX,
      mapY: member.mapY,
    }));

    return NextResponse.json({
      room,
      mode: input.mode,
      storageReady,
      groupAvailable: hasGroupRoom(data),
      chatType: data.chatType ?? null,
      user: {
        id: data.user.id,
        firstName: data.user.first_name,
        username: data.user.username ?? null,
        photoUrl: data.user.photo_url ?? null,
      },
      admin: isMapAdmin(data.user.id),
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
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
