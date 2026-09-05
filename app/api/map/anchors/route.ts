import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validateTelegramInitData } from "@/src/lib/telegram-init-data";
import { deleteAnchor, isMapAdmin, listAnchors, saveAnchor } from "@/src/lib/map-model";
import { isNearVenue } from "@/src/lib/venue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BaseSchema = z.object({ initData: z.string().min(1) });
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
    const data = validateTelegramInitData(input.initData);

    if (!isMapAdmin(data.user.id)) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    if (input.action === "list") {
      const anchors = await listAnchors();
      return NextResponse.json({ anchors, admin: true });
    }

    if (input.action === "delete") {
      await deleteAnchor(input.id);
      return NextResponse.json({ ok: true });
    }

    if (!isNearVenue(input)) {
      return NextResponse.json({ error: "Kalibratiepunt ligt buiten het festivalterrein." }, { status: 422 });
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
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
