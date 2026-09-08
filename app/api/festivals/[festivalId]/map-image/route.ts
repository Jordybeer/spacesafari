import { NextResponse } from "next/server";
import { getPersistedFestival } from "@/src/lib/festival-store";
import { getTelegramFilePath, telegramFileUrl } from "@/src/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ festivalId: string }> },
) {
  const { festivalId } = await context.params;
  const festival = await getPersistedFestival(festivalId);
  if (!festival?.telegramMapFileId || festival.archivedAt) {
    return NextResponse.json({ error: "Geen festivalkaart gevonden." }, { status: 404 });
  }

  try {
    const filePath = await getTelegramFilePath(festival.telegramMapFileId);
    const source = await fetch(telegramFileUrl(filePath), { cache: "no-store" });
    if (!source.ok) throw new Error(`Telegram file HTTP ${source.status}`);
    const bytes = await source.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": source.headers.get("content-type") || "image/jpeg",
        "cache-control": "private, max-age=300",
        "content-length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    console.error("Festival map proxy failed", error);
    return NextResponse.json({ error: "Festivalkaart kon niet worden geladen." }, { status: 502 });
  }
}
