import { describe, expect, it } from "vitest";
import { MAX_PRESENCE_TTL_SECONDS, PRESENCE_TTL_SECONDS } from "@/src/lib/map-model";

describe("map share duration presets", () => {
  it("keeps the default presence at 15 minutes", () => {
    expect(PRESENCE_TTL_SECONDS).toBe(15 * 60);
  });

  it("keeps the festival-long constant mode bounded", () => {
    expect(MAX_PRESENCE_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });
});
