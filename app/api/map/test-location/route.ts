import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeRoomToken, requireMapAuth } from "@/src/lib/map-auth";
import { isMapAdmin, listAnchors, putPresence, roomFor, stopPresence } from "@/src/lib/map-model";
import { isRedisConfigured } from "@/src/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    initData: z.string().min(1).optional(),
    roomToken: z.string().optional(),
    mode: z.enum(["group", "public"]),
    anchorName: z.string().trim().max(64).optional(),
  }),
  z.object({
    action: z.literal("stop"),
    initData: z.string().min(1).optional(),
    roomToken: z.string().optional(),
    mode: z.enum(["group", "public"]),
  }),
]);

const TEST_TTL_SECONDS = 10 * 60;

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    const data = requireMapAuth(request, input.initData, normalizeRoomToken(input.roomToken));
    if (!isMapAdmin(data.user.id)) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (!isRedisConfigured()) {
      return NextResponse.json({ error: "Live locatie-opslag is niet gekoppeld." }, { status: 503 });
    }

    const room = roomFor(data, input.mode);
    if (input.action === "stop") {
      await stopPresence(room, data.user.id);
      return NextResponse.json({ ok: true });
    }

    const anchors = await listAnchors();
    if (!anchors.length) return NextResponse.json({ error: "Geen festivalankers beschikbaar." }, { status: 409 });
    const requested = input.anchorName?.toLowerCase();
    const anchor = (requested ? anchors.find((item) => item.name.toLowerCase() === requested) : undefined)
      ?? anchors.find((item) => item.name.toLowerCase().includes("nebula"))
      ?? anchors[0];

    await putPresence(
      room,
      data.user,
      {
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        horizontalAccuracy: anchor.horizontalAccuracy,
      },
      TEST_TTL_SECONDS,
      { simulated: true },
    );

    return NextResponse.json({ ok: true, anchor: anchor.name, ttlSeconds: TEST_TTL_SECONDS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
