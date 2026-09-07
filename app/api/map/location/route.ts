import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeRoomToken, requireMapAuth } from "@/src/lib/map-auth";
import { MAX_PRESENCE_TTL_SECONDS, putPresence, roomFor, stopPresence } from "@/src/lib/map-model";
import { isNearVenue } from "@/src/lib/venue";
import { isRedisConfigured } from "@/src/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  horizontalAccuracy: z.number().nonnegative().max(10_000).nullable().optional(),
});

const AuthFields = {
  initData: z.string().min(1).optional(),
  roomToken: z.string().optional(),
  mode: z.enum(["group", "public"]),
};

const RequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    ...AuthFields,
    location: LocationSchema,
    ttlSeconds: z.number().int().min(60).max(MAX_PRESENCE_TTL_SECONDS).optional(),
  }),
  z.object({
    action: z.literal("stop"),
    ...AuthFields,
  }),
]);

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    const roomToken = normalizeRoomToken(input.roomToken);
    const data = requireMapAuth(request, input.initData, roomToken);
    const room = roomFor(data, input.mode);

    if (!isRedisConfigured()) {
      return NextResponse.json(
        { error: "Live locatie-opslag is nog niet gekoppeld. De festivalkaart zelf werkt wel." },
        { status: 503 },
      );
    }

    if (input.action === "stop") {
      await stopPresence(room, data.user.id);
      return NextResponse.json({ ok: true });
    }

    if (!isNearVenue(input.location)) {
      return NextResponse.json({ error: "Locatie ligt buiten het Space Safari-terrein." }, { status: 422 });
    }
    await putPresence(room, data.user, input.location, input.ttlSeconds);
    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
