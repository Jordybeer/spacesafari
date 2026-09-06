export interface CalibrationAnchor {
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
}

const EARTH_RADIUS_M = 6_371_000;

interface XY {
  x: number;
  y: number;
}

export interface SimilarityFit {
  lat0: number;
  worldCenter: XY;
  mapCenter: XY;
  a: number;
  b: number;
}

function worldPoint(latitude: number, longitude: number, lat0: number): XY {
  const lat = (latitude * Math.PI) / 180;
  const lon = (longitude * Math.PI) / 180;
  const ref = (lat0 * Math.PI) / 180;
  return {
    x: EARTH_RADIUS_M * lon * Math.cos(ref),
    y: EARTH_RADIUS_M * lat,
  };
}

function locationFromWorld(point: XY, lat0: number): [number, number] {
  const ref = (lat0 * Math.PI) / 180;
  return [
    (point.x / (EARTH_RADIUS_M * Math.cos(ref))) * (180 / Math.PI),
    (point.y / EARTH_RADIUS_M) * (180 / Math.PI),
  ];
}

export function fitSimilarity(anchors: CalibrationAnchor[]): SimilarityFit | null {
  if (anchors.length < 2) return null;

  const lat0 = anchors.reduce((sum, anchor) => sum + anchor.latitude, 0) / anchors.length;
  const worlds = anchors.map((anchor) => worldPoint(anchor.latitude, anchor.longitude, lat0));
  const worldCenter = worlds.reduce(
    (center, point) => ({ x: center.x + point.x / worlds.length, y: center.y + point.y / worlds.length }),
    { x: 0, y: 0 },
  );
  const mapCenter = anchors.reduce(
    (center, anchor) => ({ x: center.x + anchor.mapX / anchors.length, y: center.y + anchor.mapY / anchors.length }),
    { x: 0, y: 0 },
  );

  let denom = 0;
  let dot = 0;
  let cross = 0;
  for (let index = 0; index < anchors.length; index += 1) {
    const wx = worlds[index].x - worldCenter.x;
    const wy = worlds[index].y - worldCenter.y;
    const mx = anchors[index].mapX - mapCenter.x;
    const my = anchors[index].mapY - mapCenter.y;
    denom += wx * wx + wy * wy;
    dot += wx * mx + wy * my;
    cross += wx * my - wy * mx;
  }

  if (denom < 0.25) return null;
  const a = dot / denom;
  const b = cross / denom;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a * a + b * b < 1e-14) return null;

  return { lat0, worldCenter, mapCenter, a, b };
}

export function projectWithFit(latitude: number, longitude: number, fit: SimilarityFit): { mapX: number; mapY: number } {
  const point = worldPoint(latitude, longitude, fit.lat0);
  const dx = point.x - fit.worldCenter.x;
  const dy = point.y - fit.worldCenter.y;
  return {
    mapX: fit.mapCenter.x + fit.a * dx - fit.b * dy,
    mapY: fit.mapCenter.y + fit.b * dx + fit.a * dy,
  };
}

export function unprojectWithFit(mapX: number, mapY: number, fit: SimilarityFit): [number, number] | null {
  const dx = mapX - fit.mapCenter.x;
  const dy = mapY - fit.mapCenter.y;
  const det = fit.a * fit.a + fit.b * fit.b;
  if (det < 1e-14) return null;

  const wx = (fit.a * dx + fit.b * dy) / det;
  const wy = (-fit.b * dx + fit.a * dy) / det;
  return locationFromWorld({ x: fit.worldCenter.x + wx, y: fit.worldCenter.y + wy }, fit.lat0);
}
