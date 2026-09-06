import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const target = path.join(process.cwd(), "public", "hastiere-offline.webp");
const url = "https://mapmap.ai/api/static-map?bbox=4.82,50.135,4.90,50.18&size=1280x1280@2x&format=webp&quality=90&lang=local";
const minimumBytes = 5_000;
const minimumDimension = 2_000;

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function u16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u24(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function u32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function webpDimensions(bytes) {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = u32(bytes, offset + 4);
    const data = offset + 8;
    if (data + size > bytes.length) return null;

    if (type === "VP8X" && size >= 10) {
      return { width: 1 + u24(bytes, data + 4), height: 1 + u24(bytes, data + 7) };
    }
    if (type === "VP8 " && size >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
      return { width: u16(bytes, data + 6) & 0x3fff, height: u16(bytes, data + 8) & 0x3fff };
    }
    if (type === "VP8L" && size >= 5 && bytes[data] === 0x2f) {
      const b1 = bytes[data + 1];
      const b2 = bytes[data + 2];
      const b3 = bytes[data + 3];
      const b4 = bytes[data + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
      };
    }

    offset = data + size + (size % 2);
  }
  return null;
}

function validateMap(bytes) {
  if (bytes.byteLength < minimumBytes) throw new Error(`image unexpectedly small (${bytes.byteLength} bytes)`);
  const dimensions = webpDimensions(bytes);
  if (!dimensions) throw new Error("response is not a readable WebP image");
  if (dimensions.width < minimumDimension || dimensions.height < minimumDimension) {
    throw new Error(`image resolution too low (${dimensions.width}x${dimensions.height})`);
  }
  return dimensions;
}

async function existingLooksUsable() {
  try {
    validateMap(new Uint8Array(await readFile(target)));
    return true;
  } catch {
    return false;
  }
}

async function fetchMap() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "SpaceSafariFestivalAssistant/1.0 (+https://spacesafari.jordy.beer)" },
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) throw new Error(`unexpected content-type ${contentType}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const dimensions = validateMap(bytes);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      console.log(`[offline-map] wrote ${bytes.byteLength} bytes (${dimensions.width}x${dimensions.height}) to public/hastiere-offline.webp`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[offline-map] attempt ${attempt}/3 failed: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }
  }

  if (await existingLooksUsable()) {
    console.warn("[offline-map] keeping existing local basemap after download failure");
    return;
  }

  // GitHub Actions validates the application without depending on a third-party
  // renderer. Production on Vercel must contain the actual local map asset.
  if (process.env.VERCEL_ENV === "production") {
    throw lastError instanceof Error ? lastError : new Error("offline basemap download failed");
  }
  console.warn("[offline-map] no basemap generated outside production; continuing build");
}

await fetchMap();
