import { FESTIVAL_MAP_BASE64 } from "@/src/data/map-image";

export function GET() {
  const bytes = Buffer.from(FESTIVAL_MAP_BASE64, "base64");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
