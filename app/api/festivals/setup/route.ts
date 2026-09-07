import { NextResponse } from "next/server";
import { z } from "zod";
import {
  setupStatusFor,
  updatePersistedFestival,
  verifyFestivalSetupToken,
} from "@/src/lib/festival-store";
import {
  getFestivalSchedule,
  localDateTimeToIso,
  performerEntries,
  saveFestivalSchedule,
  scheduleTime,
  type FestivalScheduleEntry,
} from "@/src/lib/festival-schedule";
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

const TimetableEntrySchema = z.object({
  id: z.string().trim().min(1).max(120),
  artist: z.string().trim().min(1).max(160),
  stage: z.string().trim().min(1).max(100),
  startsLocal: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  endsLocal: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  live: z.boolean().optional().default(false),
  note: z.string().trim().max(300).nullable().optional(),
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
  z.object({
    action: z.literal("save-timetable"),
    festivalId: z.string().trim().min(1).max(64),
    token: z.string().min(16).max(256),
    entries: z.array(TimetableEntrySchema).max(500),
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

function publicSchedule(entries: FestivalScheduleEntry[], timezone: string) {
  return entries.map((entry) => ({
    id: entry.id,
    artist: entry.artist,
    stage: entry.stage,
    startsLocal: scheduleTime(entry.startsAt, timezone).toFormat("yyyy-MM-dd'T'HH:mm"),
    endsLocal: scheduleTime(entry.endsAt, timezone).toFormat("yyyy-MM-dd'T'HH:mm"),
    live: entry.live,
    note: entry.note,
  }));
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

      const currentSchedule = await getFestivalSchedule(festival);
      const status = setupStatusFor({
        mapImageUrl: input.mapImageUrl,
        venueCenter: input.venueCenter,
        anchors: input.anchors.length,
        timetableReady: performerEntries(currentSchedule).length > 0,
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

    if (input.action === "save-timetable") {
      const anchors = await listAnchors(festival.id);
      if (!festival.mapImageUrl || !festival.venueCenter || !anchors.length) {
        throw new Error("Werk eerst kaart + ankers af.");
      }

      const ids = new Set<string>();
      const entries: FestivalScheduleEntry[] = input.entries.map((entry) => {
        if (ids.has(entry.id)) throw new Error("Dubbele timetable-id.");
        ids.add(entry.id);
        const startsAt = localDateTimeToIso(entry.startsLocal, festival.timezone);
        const endsAt = localDateTimeToIso(entry.endsLocal, festival.timezone);
        if (Date.parse(endsAt) <= Date.parse(startsAt)) {
          throw new Error(`${entry.artist}: eindtijd moet na de starttijd liggen.`);
        }
        return {
          id: entry.id,
          artist: entry.artist,
          stage: entry.stage,
          startsAt,
          endsAt,
          kind: "set",
          live: entry.live,
          note: entry.note?.trim() || null,
        };
      });

      const saved = await saveFestivalSchedule(festival, entries);
      const status = setupStatusFor({
        mapImageUrl: festival.mapImageUrl,
        venueCenter: festival.venueCenter,
        anchors: anchors.length,
        timetableReady: performerEntries(saved).length > 0,
      });
      festival = await updatePersistedFestival(festival.id, { status });
    }

    const [anchors, schedule] = await Promise.all([
      listAnchors(festival.id),
      getFestivalSchedule(festival),
    ]);
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
      timetable: publicSchedule(schedule, festival.timezone),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Festivalsetup mislukt.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
