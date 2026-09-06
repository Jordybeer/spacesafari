export interface GeoAnchor {
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
}

export type LngLatTuple = [number, number];

const EARTH_RADIUS_M = 6_371_000;

interface XY {
  x: number;
  y: number;
}

function referenceLatitude(anchors: GeoAnchor[]): number {
  return anchors.reduce((sum, anchor) => sum + anchor.latitude, 0) / anchors.length;
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

function locationFromWorld(point: XY, lat0: number): LngLatTuple {
  const ref = (lat0 * Math.PI) / 180;
  return [
    (point.x / (EARTH_RADIUS_M * Math.cos(ref))) * (180 / Math.PI),
    (point.y / EARTH_RADIUS_M) * (180 / Math.PI),
  ];
}

function barycentric(
  p: XY,
  a: XY,
  b: XY,
  c: XY,
): [number, number, number] | null {
  const denom = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denom) < 1e-9) return null;
  const w1 = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / denom;
  const w2 = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / denom;
  return [w1, w2, 1 - w1 - w2];
}

function bestTriangle(anchors: GeoAnchor[]): [GeoAnchor, GeoAnchor, GeoAnchor] | null {
  let best: [GeoAnchor, GeoAnchor, GeoAnchor] | null = null;
  let bestArea = 0;
  for (let i = 0; i < anchors.length - 2; i += 1) {
    for (let j = i + 1; j < anchors.length - 1; j += 1) {
      for (let k = j + 1; k < anchors.length; k += 1) {
        const a = anchors[i];
        const b = anchors[j];
        const c = anchors[k];
        const area = Math.abs(
          (b.mapX - a.mapX) * (c.mapY - a.mapY) -
          (b.mapY - a.mapY) * (c.mapX - a.mapX),
        );
        if (area > bestArea) {
          bestArea = area;
          best = [a, b, c];
        }
      }
    }
  }
  return bestArea > 1e-6 ? best : null;
}

function invertTwoAnchorSimilarity(mapX: number, mapY: number, anchors: GeoAnchor[]): LngLatTuple | null {
  const [first, second] = anchors;
  const lat0 = referenceLatitude(anchors);
  const a = worldPoint(first.latitude, first.longitude, lat0);
  const b = worldPoint(second.latitude, second.longitude, lat0);
  const wx = b.x - a.x;
  const wy = b.y - a.y;
  const mx = second.mapX - first.mapX;
  const my = second.mapY - first.mapY;
  const worldLength = Math.hypot(wx, wy);
  const mapLength = Math.hypot(mx, my);
  if (worldLength < 0.5 || mapLength < 1e-6) return null;

  const scale = mapLength / worldLength;
  const angle = Math.atan2(my, mx) - Math.atan2(wy, wx);
  const dx = (mapX - first.mapX) / scale;
  const dy = (mapY - first.mapY) / scale;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return locationFromWorld({
    x: a.x + dx * cos - dy * sin,
    y: a.y + dx * sin + dy * cos,
  }, lat0);
}

export function mapPointToLngLat(
  mapX: number,
  mapY: number,
  anchors: GeoAnchor[],
): LngLatTuple | null {
  if (anchors.length < 2) return null;
  if (anchors.length === 2) return invertTwoAnchorSimilarity(mapX, mapY, anchors);

  const triangle = bestTriangle(anchors);
  if (!triangle) return invertTwoAnchorSimilarity(mapX, mapY, anchors);
  const weights = barycentric(
    { x: mapX, y: mapY },
    { x: triangle[0].mapX, y: triangle[0].mapY },
    { x: triangle[1].mapX, y: triangle[1].mapY },
    { x: triangle[2].mapX, y: triangle[2].mapY },
  );
  if (!weights) return null;

  const lat0 = referenceLatitude(triangle);
  const world = triangle.map((anchor) => worldPoint(anchor.latitude, anchor.longitude, lat0));
  return locationFromWorld({
    x: weights[0] * world[0].x + weights[1] * world[1].x + weights[2] * world[2].x,
    y: weights[0] * world[0].y + weights[1] * world[1].y + weights[2] * world[2].y,
  }, lat0);
}

export function festivalImageCorners(anchors: GeoAnchor[]): [LngLatTuple, LngLatTuple, LngLatTuple, LngLatTuple] | null {
  if (anchors.length < 2) return null;
  const corners = [
    mapPointToLngLat(0, 0, anchors),
    mapPointToLngLat(1, 0, anchors),
    mapPointToLngLat(1, 1, anchors),
    mapPointToLngLat(0, 1, anchors),
  ];
  if (corners.some((corner) => !corner)) return null;
  return corners as [LngLatTuple, LngLatTuple, LngLatTuple, LngLatTuple];
}
