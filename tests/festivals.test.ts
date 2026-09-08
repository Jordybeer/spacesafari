import { describe, expect, it } from "vitest";
import {
  DEFAULT_FESTIVAL_ID,
  SPACE_SAFARI_2026,
  festivalStoragePrefix,
  getFestivalDefinition,
  normalizeFestivalId,
} from "@/src/lib/festivals";

describe("festival platform model", () => {
  it("treats Space Safari 2026 as Ginder's default festival instance", () => {
    expect(normalizeFestivalId()).toBe(DEFAULT_FESTIVAL_ID);
    expect(getFestivalDefinition()).toEqual(SPACE_SAFARI_2026);
    expect(getFestivalDefinition("SPACE-SAFARI-2026")).toEqual(SPACE_SAFARI_2026);
    expect(SPACE_SAFARI_2026.name).toBe("Space Safari");
    expect(SPACE_SAFARI_2026.status).toBe("ready");
  });

  it("preserves opaque custom selector casing while canonicalizing storage namespaces", () => {
    expect(normalizeFestivalId("  voodoo-village-2026-EiEu  ")).toBe("voodoo-village-2026-EiEu");
    expect(festivalStoragePrefix("voodoo-village-2026-EiEu"))
      .toBe("ginder:festival:voodoo-village-2026-eieu");
  });

  it("keeps the legacy Space Safari Redis namespace during migration", () => {
    expect(festivalStoragePrefix(DEFAULT_FESTIVAL_ID)).toBe("ss");
    expect(festivalStoragePrefix("other-festival-2027")).toBe("ginder:festival:other-festival-2027");
  });

  it("does not silently fall back for an explicit unknown festival", () => {
    expect(getFestivalDefinition("not-a-real-festival")).toBeNull();
  });
});
