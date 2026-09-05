import { describe, expect, it } from "vitest";
import { projectLocation } from "@/src/lib/map-projection";
import type { MapAnchor } from "@/src/lib/map-model";

const anchor = (id: string, lat: number, lon: number, x: number, y: number): MapAnchor => ({
  id, name: id, latitude: lat, longitude: lon, horizontalAccuracy: 5, mapX: x, mapY: y, createdBy: 1, createdAt: "2026-09-05T00:00:00Z",
});

describe("festival image projection", () => {
  it("uses two points for a similarity transform", () => {
    const result = projectLocation(50.0000, 4.0010, [
      anchor("a", 50, 4, 0.2, 0.5),
      anchor("b", 50, 4.002, 0.8, 0.5),
    ]);
    expect(result?.mapX).toBeCloseTo(0.5, 2);
    expect(result?.mapY).toBeCloseTo(0.5, 2);
  });

  it("uses 3+ non-collinear anchors for local affine projection", () => {
    const result = projectLocation(50.001, 4.001, [
      anchor("a", 50, 4, 0, 0),
      anchor("b", 50, 4.002, 1, 0),
      anchor("c", 50.002, 4, 0, 1),
    ]);
    expect(result?.mapX).toBeCloseTo(0.5, 2);
    expect(result?.mapY).toBeCloseTo(0.5, 2);
  });
});
