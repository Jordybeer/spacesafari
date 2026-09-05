import { describe, expect, it } from "vitest";
import {
  FESTIVAL_MAP_BASE64,
  FESTIVAL_MAP_BYTES,
  FESTIVAL_MAP_HEIGHT,
  FESTIVAL_MAP_WIDTH,
} from "@/src/data/map-image";

describe("festival map asset", () => {
  it("reassembles the clear JPEG source without truncation", () => {
    const bytes = Buffer.from(FESTIVAL_MAP_BASE64, "base64");

    expect(bytes.length).toBe(FESTIVAL_MAP_BYTES);
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(bytes.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(FESTIVAL_MAP_WIDTH).toBe(640);
    expect(FESTIVAL_MAP_HEIGHT).toBe(800);
  });

  it("is substantially larger than the old 15 KB placeholder", () => {
    expect(FESTIVAL_MAP_BYTES).toBeGreaterThan(45_000);
  });
});
