import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Ginder offline multi-festival shell", () => {
  it("keeps user-created festival map images out of the generic API bypass and caches them network-first", async () => {
    const source = await readFile("public/sw.js", "utf8");

    expect(source).toContain('const CACHE = "ginder-static-v13";');
    expect(source).toContain('/^\\/api\\/festivals\\/[^/]+\\/map-image$/');
    expect(source).toContain('url.pathname.startsWith("/api/") && !festivalMapImage');

    const branchStart = source.indexOf("if (festivalMapImage)");
    const genericNavigation = source.indexOf('if (event.request.mode === "navigate")');
    expect(branchStart).toBeGreaterThan(-1);
    expect(branchStart).toBeLessThan(genericNavigation);

    const festivalBranch = source.slice(branchStart, genericNavigation);
    expect(festivalBranch).toContain("const response = await fetch(event.request)");
    expect(festivalBranch).toContain("await cache.put(event.request, response.clone())");
    expect(festivalBranch).toContain("await cache.match(event.request)");
  });

  it("uses Ginder rather than the retired Space Safari product identity for basemap requests", async () => {
    const source = await readFile("scripts/fetch-offline-basemap.mjs", "utf8");
    expect(source).toContain("GinderFestivalCompanion/1.0 (+https://ginder.jordy.beer)");
    expect(source).not.toContain("SpaceSafariFestivalAssistant");
    expect(source).not.toContain("spacesafari.jordy.beer");
  });
});
