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

export interface MapTransformFit {
  lat0: number;
  worldCenter: XY;
  mapCenter: XY;
  m11: number;
  m12: number;
  m21: number;
  m22: number;
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

function similarityFallback(worlds: XY[], anchors: CalibrationAnchor[], worldCenter: XY, mapCenter: XY): Omit<MapTransformFit, "lat0" | "worldCenter" | "mapCenter"> | null {
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
  return { m11: a, m12: -b, m21: b, m22: a };
}

export function fitMapTransform(anchors: CalibrationAnchor[]): MapTransformFit | null {
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

  if (anchors.length === 2) {
    const matrix = similarityFallback(worlds, anchors, worldCenter, mapCenter);
    return matrix ? { lat0, worldCenter, mapCenter, ...matrix } : null;
  }

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxMapX = 0;
  let syMapX = 0;
  let sxMapY = 0;
  let syMapY = 0;

  for (let index = 0; index < anchors.length; index += 1) {
    const x = worlds[index].x - worldCenter.x;
    const y = worlds[index].y - worldCenter.y;
    const mapX = anchors[index].mapX - mapCenter.x;
    const mapY = anchors[index].mapY - mapCenter.y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sxMapX += x * mapX;
    syMapX += y * mapX;
    sxMapY += x * mapY;
    syMapY += y * mapY;
  }

  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1) {
    const matrix = similarityFallback(worlds, anchors, worldCenter, mapCenter);
    return matrix ? { lat0, worldCenter, mapCenter, ...matrix } : null;
  }

  const m11 = (syy * sxMapX - sxy * syMapX) / det;
  const m12 = (-sxy * sxMapX + sxx * syMapX) / det;
  const m21 = (syy * sxMapY - sxy * syMapY) / det;
  const m22 = (-sxy * sxMapY + sxx * syMapY) / det;
  const matrixDet = m11 * m22 - m12 * m21;
  if (![m11, m12, m21, m22].every(Number.isFinite) || Math.abs(matrixDet) < 1e-14) return null;

  return { lat0, worldCenter, mapCenter, m11, m12, m21, m22 };
}

export function projectWithFit(latitude: number, longitude: number, fit: MapTransformFit): { mapX: number; mapY: number } {
  const point = worldPoint(latitude, longitude, fit.lat0);
  const dx = point.x - fit.worldCenter.x;
  const dy = point.y - fit.worldCenter.y;
  return {
    mapX: fit.mapCenter.x + fit.m11 * dx + fit.m12 * dy,
    mapY: fit.mapCenter.y + fit.m21 * dx + fit.m22 * dy,
  };
}

export function unprojectWithFit(mapX: number, mapY: number, fit: MapTransformFit): [number, number] | null {
  const dx = mapX - fit.mapCenter.x;
  const dy = mapY - fit.mapCenter.y;
  const det = fit.m11 * fit.m22 - fit.m12 * fit.m21;
  if (Math.abs(det) < 1e-14) return null;

  const wx = (fit.m22 * dx - fit.m12 * dy) / det;
  const wy = (-fit.m21 * dx + fit.m11 * dy) / det;
  return locationFromWorld({ x: fit.worldCenter.x + wx, y: fit.worldCenter.y + wy }, fit.lat0);
}
