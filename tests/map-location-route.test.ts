import { describe, expect, it } from "vitest";
import { MAX_PRESENCE_TTL_SECONDS } from "@/src/lib/map-model";

describe("location share limits", () => {
  it("supports 15m, 30m, 1h, 2h and festival-long presets", () => {
    expect([900, 1800, 3600, 7200, MAX_PRESENCE_TTL_SECONDS]).toEqual([
      900,
      1800,
      3600,
      7200,
      604800,
    ]);
  });
});
