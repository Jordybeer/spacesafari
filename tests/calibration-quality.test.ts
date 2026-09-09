import { describe, expect, it } from "vitest";
import { assessCalibrationQuality, checkCalibrationAtPoint } from "@/src/lib/calibration-quality";

const anchor = (latitude: number, longitude: number, mapX: number, mapY: number) => ({
  latitude,
  longitude,
  mapX,
  mapY,
});

const good = [
  anchor(50.1550, 4.8530, 0.12, 0.15),
  anchor(50.1552, 4.8570, 0.86, 0.18),
  anchor(50.1520, 4.8531, 0.14, 0.84),
  anchor(50.1522, 4.8568, 0.84, 0.82),
];

describe("assessCalibrationQuality", () => {
  it("requires at least two anchors", () => {
    expect(assessCalibrationQuality([]).level).toBe("insufficient");
    expect(assessCalibrationQuality([good[0]]).level).toBe("insufficient");
  });

  it("treats two anchors as provisional", () => {
    const result = assessCalibrationQuality(good.slice(0, 2));
    expect(result.level).toBe("weak");
    expect(result.summary).toContain("voorlopige");
  });

  it("rates a well-spread four-point calibration highly", () => {
    const result = assessCalibrationQuality(good);
    expect(result.level).toBe("good");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.outlierIndex).toBeNull();
  });

  it("flags four-point disagreement without falsely naming one culprit", () => {
    const bad = [...good.slice(0, 3), anchor(50.1522, 4.8568, 0.35, 0.35)];
    const result = assessCalibrationQuality(bad);
    expect(result.level).toBe("weak");
    expect(result.outlierIndex).toBeNull();
    expect(result.summary).toContain("spreken elkaar tegen");
  });
});

describe("checkCalibrationAtPoint", () => {
  it("accepts an independent point close to the fitted transform", () => {
    const check = checkCalibrationAtPoint(good, anchor(50.1536, 4.8550, 0.49, 0.50));
    expect(check.level).toBe("good");
    expect(check.mapError).not.toBeNull();
  });

  it("rejects a clearly mismatched onsite point", () => {
    const check = checkCalibrationAtPoint(good, anchor(50.1536, 4.8550, 0.80, 0.20));
    expect(check.level).toBe("poor");
  });
});
