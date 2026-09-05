import { describe, expect, it } from "vitest";
import { findArtistSets, normalizeArtist } from "@/src/lib/artist-search";

describe("artist search", () => {
  it("normalizes punctuation, whitespace and case", () => {
    expect(normalizeArtist("  SEVENUM-SIX  ")).toBe("sevenum six");
    expect(findArtistSets("sevenum six").exact[0]?.artist).toBe("Sevenum Six");
  });

  it("accepts a small typo without silently jumping to a distant artist", () => {
    expect(findArtistSets("technosomy").suggestions[0]?.artist).toBe("Technossomy");
    expect(findArtistSets("completely unrelated name").suggestions).toHaveLength(0);
  });

  it("keeps repeated artist appearances ambiguous", () => {
    const collision = findArtistSets("collision");
    expect(collision.exact).toHaveLength(2);
  });
});
