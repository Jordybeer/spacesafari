import { NextResponse } from "next/server";
import { z } from "zod";
import {
  setupStatusFor,
  updatePersistedFestival,
  verifyFestivalSetupToken,
} from "@/src/lib/festival-store";
import { deleteAnchor, listAnchors, saveAnchor } from "@/src/lib/map-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AnchorSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  mapX: z.number().min(0).max(1),
  mapY: z.number().min(0).max(1),
});

const RequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("load"),
    festivalId: z.string().trim().min(1).max(64),
    token: z.string().min(16).max(256),
  }),
  z.object({
    action: z.literal("save"),
    festivalId: z.string().trim().min(1).max(64),
    token: z.string().min(16).max(256),
    mapImageUrl: z.string().trim().min(1).max(2048),
    mapImageWidth: z.number().int().min(64).max(12000),
    mapImageHeight: z.number().int().min(64).max(12000),
    venueCenter: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }),
    venueMaxDistanceMeters: z.number().int().min(100).max(50_000),
    anchors: z.array(AnchorSchema).max(30),
  }),
]);

function publicFestival(festival: Awaited<ReturnType<typeof verifyFestivalSetupToken>>) {
  return {
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
    chatTitle: festival.chatTitle,
  };
}

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    let festival = await verifyFestivalSetupToken(input.festivalId, input.token);

    if (input.action === "save") {
      const oldAnchors = await listAnchors(festival.id);
      await Promise.all(oldAnchors.map((anchor) => deleteAnchor(anchor.id, festival.id)));
      const createdAt = new Date().toISOString();
      await Promise.all(input.anchors.map((anchor) => saveAnchor({
        ...anchor,
        horizontalAccuracy: null,
        createdBy: festival.ownerTelegramId,
        createdAt,
      }, festival.id)));

      const status = setupStatusFor({
        mapImageUrl: input.mapImageUrl,
        venueCenter: input.venueCenter,
        anchors: input.anchors.length,
      });
      festival = await updatePersistedFestival(festival.id, {
        mapImageUrl: input.mapImageUrl,
        mapImageWidth: input.mapImageWidth,
        mapImageHeight: input.mapImageHeight,
        venueCenter: input.venueCenter,
        venueMaxDistanceMeters: input.venueMaxDistanceMeters,
        status,
        ...(input.mapImageUrl.includes(`/api/festivals/${festival.id}/map-image`)
          ? {}
          : { telegramMapFileId: null }),
      });
    }

    const anchors = await listAnchors(festival.id);
    return NextResponse.json({
      ok: true,
      festival: publicFestival(festival),
      anchors: anchors.map((anchor) => ({
        id: anchor.id,
        name: anchor.name,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        mapX: anchor.mapX,
        mapY: anchor.mapY,
      })),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Festivalsetup mislukt.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
