import { NextResponse } from "next/server";
import { resolveMapFestivalDefinition } from "@/src/lib/map-festival-resolver";
import { DEFAULT_FESTIVAL_ID } from "@/src/lib/festivals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const selector = url.searchParams.get("selector")?.trim() || DEFAULT_FESTIVAL_ID;
    if (selector.length > 64) throw new Error("Ongeldige festivalselector.");
    const festival = await resolveMapFestivalDefinition(selector);
    if (!festival) {
      return NextResponse.json({ error: "Festival niet gevonden." }, { status: 404 });
    }
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
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Festival kon niet worden geladen.",
    }, { status: 400 });
  }
}
