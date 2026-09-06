import { describe, expect, it } from "vitest";
import { festivalImageCorners, mapPointToLngLat, type GeoAnchor } from "@/src/lib/map-georef";

const anchors: GeoAnchor[] = [
  { latitude: 50.1550, longitude: 4.8530, mapX: 0.2, mapY: 0.25 },
  { latitude: 50.1550, longitude: 4.8570, mapX: 0.8, mapY: 0.25 },
  { latitude: 50.1520, longitude: 4.8530, mapX: 0.2, mapY: 0.8 },
];

describe("map georeferencing", () => {
  it("maps calibrated points back to their geographic coordinates", () => {
    for (const anchor of anchors) {
      const result = mapPointToLngLat(anchor.mapX, anchor.mapY, anchors);
      expect(result).not.toBeNull();
      expect(result![0]).toBeCloseTo(anchor.longitude, 5);
      expect(result![1]).toBeCloseTo(anchor.latitude, 5);
    }
  });

  it("derives four image corners from three anchors", () => {
    const corners = festivalImageCorners(anchors);
    expect(corners).not.toBeNull();
    expect(corners).toHaveLength(4);
    corners!.flat().forEach((value) => expect(Number.isFinite(value)).toBe(true));
  });

  it("supports a two-anchor similarity transform", () => {
    const result = mapPointToLngLat(anchors[0].mapX, anchors[0].mapY, anchors.slice(0, 2));
    expect(result).not.toBeNull();
    expect(result![0]).toBeCloseTo(anchors[0].longitude, 5);
    expect(result![1]).toBeCloseTo(anchors[0].latitude, 5);
  });

  it("requires at least two anchors", () => {
    expect(mapPointToLngLat(0.5, 0.5, anchors.slice(0, 1))).toBeNull();
    expect(festivalImageCorners([])).toBeNull();
  });
});
