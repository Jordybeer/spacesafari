import chunk00 from "../../src/data/map-chunks/chunk00";
import chunk01 from "../../src/data/map-chunks/chunk01";
import chunk02 from "../../src/data/map-chunks/chunk02";
import chunk03 from "../../src/data/map-chunks/chunk03";
import chunk04 from "../../src/data/map-chunks/chunk04";
import chunk05 from "../../src/data/map-chunks/chunk05";
import chunk06 from "../../src/data/map-chunks/chunk06";
import chunk07 from "../../src/data/map-chunks/chunk07";
import chunk08 from "../../src/data/map-chunks/chunk08";

export const runtime = "nodejs";
export const dynamic = "force-static";

const IMAGE = Buffer.from(
  [chunk00, chunk01, chunk02, chunk03, chunk04, chunk05, chunk06, chunk07, chunk08].join(""),
  "base64",
);

export async function GET() {
  return new Response(IMAGE, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(IMAGE.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
