import { describe, expect, it } from "vitest";
import { fitMapTransform, projectWithFit, unprojectWithFit } from "@/src/lib/map-similarity";

const anchors = [
  { latitude: 50.1550, longitude: 4.8530, mapX: 0.18, mapY: 0.70 },
  { latitude: 50.1550, longitude: 4.8550, mapX: 0.48, mapY: 0.70 },
  { latitude: 50.1530, longitude: 4.8530, mapX: 0.18, mapY: 0.92 },
  { latitude: 50.1530, longitude: 4.8550, mapX: 0.48, mapY: 0.92 },
];

describe("multi-anchor map transform", () => {
  it("fits all four non-collinear calibration points consistently", () => {
    const fit = fitMapTransform(anchors);
    expect(fit).not.toBeNull();
    for (const anchor of anchors) {
      const point = projectWithFit(anchor.latitude, anchor.longitude, fit!);
      expect(point.mapX).toBeCloseTo(anchor.mapX, 5);
      expect(point.mapY).toBeCloseTo(anchor.mapY, 5);
    }
  });

  it("round-trips a live GPS position through the festival map", () => {
    const fit = fitMapTransform(anchors);
    expect(fit).not.toBeNull();
    const original = { latitude: 50.1542, longitude: 4.8542 };
    const projected = projectWithFit(original.latitude, original.longitude, fit!);
    const restored = unprojectWithFit(projected.mapX, projected.mapY, fit!);
    expect(restored).not.toBeNull();
    expect(restored![0]).toBeCloseTo(original.longitude, 6);
    expect(restored![1]).toBeCloseTo(original.latitude, 6);
  });
});
