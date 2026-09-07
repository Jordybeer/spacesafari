import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireResolvedFestivalDefinition } from "@/src/lib/festival-store";
import { DEFAULT_FESTIVAL_ID } from "@/src/lib/festivals";
import { normalizeRoomToken, requireMapAuth } from "@/src/lib/map-auth";
import { deleteAnchor, isMapAdmin, listAnchors, saveAnchor } from "@/src/lib/map-model";
import { isNearFestival } from "@/src/lib/venue";
import { isRedisConfigured } from "@/src/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BaseSchema = z.object({
  initData: z.string().min(1).optional(),
  roomToken: z.string().optional(),
  festivalId: z.string().trim().min(1).max(64).optional().default(DEFAULT_FESTIVAL_ID),
});
const RequestSchema = z.discriminatedUnion("action", [
  BaseSchema.extend({ action: z.literal("list") }),
  BaseSchema.extend({
    action: z.literal("save"),
    name: z.string().trim().min(1).max(64),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    horizontalAccuracy: z.number().nonnegative().max(10_000).nullable().optional(),
    mapX: z.number().min(0).max(1),
    mapY: z.number().min(0).max(1),
  }),
  BaseSchema.extend({ action: z.literal("delete"), id: z.string().min(1).max(100) }),
]);

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    const festival = await requireResolvedFestivalDefinition(input.festivalId);
    const data = requireMapAuth(request, input.initData, normalizeRoomToken(input.roomToken));

    if (!isMapAdmin(data.user.id)) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    if (!isRedisConfigured()) {
      return NextResponse.json(
        { error: "Kalibratie-opslag is nog niet gekoppeld. Voeg eerst Upstash Redis toe." },
        { status: 503 },
      );
    }

    if (input.action === "list") {
      const anchors = await listAnchors(festival.id);
      return NextResponse.json({ festivalId: festival.id, anchors, admin: true });
    }

    if (input.action === "delete") {
      await deleteAnchor(input.id, festival.id);
      return NextResponse.json({ ok: true, festivalId: festival.id });
    }

    if (!isNearFestival(festival, input)) {
      return NextResponse.json({ error: `Kalibratiepunt ligt buiten het ${festival.name}-terrein.` }, { status: 422 });
    }

    const id = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "anchor"}-${crypto.randomUUID().slice(0, 8)}`;
    await saveAnchor({
      id,
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
      horizontalAccuracy: input.horizontalAccuracy ?? null,
      mapX: input.mapX,
      mapY: input.mapY,
      createdBy: data.user.id,
      createdAt: new Date().toISOString(),
    }, festival.id);
    return NextResponse.json({ ok: true, festivalId: festival.id, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
