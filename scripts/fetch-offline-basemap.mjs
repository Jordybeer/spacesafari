import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const target = path.join(process.cwd(), "public", "hastiere-offline.webp");
const url = "https://mapmap.ai/api/static-map?bbox=4.82,50.135,4.90,50.18&size=1280x1280@2x&format=webp&quality=90&lang=local";
const minimumBytes = 80_000;

async function existingLooksUsable() {
  try {
    return (await stat(target)).size >= minimumBytes;
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
      if (bytes.byteLength < minimumBytes) throw new Error(`image unexpectedly small (${bytes.byteLength} bytes)`);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      console.log(`[offline-map] wrote ${bytes.byteLength} bytes to public/hastiere-offline.webp`);
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
