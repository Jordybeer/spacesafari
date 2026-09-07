import { NextResponse } from "next/server";
import { z } from "zod";
import { festivalSelectorForContext } from "@/src/lib/festival-links";
import { isFestivalOwner, requireResolvedFestivalDefinition } from "@/src/lib/festival-store";
import { normalizeRoomToken, requireMapAuth } from "@/src/lib/map-auth";
import { isMapAdmin, listAnchors, putPresence, roomFor, stopPresence } from "@/src/lib/map-model";
import { isRedisConfigured } from "@/src/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CommonFields = {
  initData: z.string().min(1).optional(),
  roomToken: z.string().optional(),
  mode: z.enum(["group", "public"]),
  festivalId: z.string().trim().min(1).max(64).optional(),
};

const RequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    ...CommonFields,
    anchorName: z.string().trim().max(64).optional(),
  }),
  z.object({
    action: z.literal("stop"),
    ...CommonFields,
  }),
]);

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    const data = requireMapAuth(request, input.initData, normalizeRoomToken(input.roomToken));
    const festival = await requireResolvedFestivalDefinition(
      festivalSelectorForContext(data.source, data.startParam, input.festivalId),
    );
    if (!isMapAdmin(data.user.id) && !isFestivalOwner(festival, data.user.id)) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (!isRedisConfigured()) {
      return NextResponse.json({ error: "Live locatie-opslag is niet gekoppeld." }, { status: 503 });
    }

    const room = roomFor(data, input.mode);
    if (input.action === "stop") {
      await stopPresence(room, data.user.id, festival.id);
      return NextResponse.json({ ok: true, festivalId: festival.id });
    }

    const anchors = await listAnchors(festival.id);
    if (!anchors.length) return NextResponse.json({ error: "Geen festivalankers beschikbaar." }, { status: 409 });
    const requested = input.anchorName?.toLowerCase();
    const anchor = (requested ? anchors.find((item) => item.name.toLowerCase() === requested) : undefined)
      ?? anchors[0];

    await putPresence(
      room,
      data.user,
      {
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        horizontalAccuracy: anchor.horizontalAccuracy,
      },
      undefined,
      { simulated: true, persistent: true, festivalId: festival.id },
    );

    return NextResponse.json({ ok: true, festivalId: festival.id, anchor: anchor.name, persistent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
