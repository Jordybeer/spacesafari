import { fitMapTransform, unprojectWithFit } from "./map-similarity";

export interface GeoAnchor {
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
}

export type LngLatTuple = [number, number];

const FESTIVAL_IMAGE_WIDTH = 640;
const FESTIVAL_IMAGE_HEIGHT = 800;
const METERS_PER_DEGREE_LAT = 111_320;

export function mapPointToLngLat(
  mapX: number,
  mapY: number,
  anchors: GeoAnchor[],
): LngLatTuple | null {
  const fit = fitMapTransform(anchors);
  return fit ? unprojectWithFit(mapX, mapY, fit) : null;
}

/**
 * Fit the illustrated festival image to GPS with a reflected similarity transform.
 *
 * Calibration coordinates use screen/image space (Y grows downward), while latitude
 * grows northward. A normal rotation-only similarity therefore flips the image north/
 * south. An unconstrained affine fit fixes that when anchors are well spread, but the
 * real festival anchors are mostly along the long east-west stage/camping strip and an
 * affine extrapolation can become numerically huge. This fit deliberately keeps one
 * global scale + rotation + the required reflection, and uses every anchor.
 */
function festivalPointToLngLat(mapX: number, mapY: number, anchors: GeoAnchor[]): LngLatTuple | null {
  if (anchors.length < 2) return null;

  const lat0 = anchors.reduce((sum, anchor) => sum + anchor.latitude, 0) / anchors.length;
  const lon0 = anchors.reduce((sum, anchor) => sum + anchor.longitude, 0) / anchors.length;
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos((lat0 * Math.PI) / 180);
  if (!Number.isFinite(metersPerDegreeLon) || Math.abs(metersPerDegreeLon) < 1) return null;

  const points = anchors.map((anchor) => ({
    u: anchor.mapX * FESTIVAL_IMAGE_WIDTH,
    v: anchor.mapY * FESTIVAL_IMAGE_HEIGHT,
    x: (anchor.longitude - lon0) * metersPerDegreeLon,
    y: (anchor.latitude - lat0) * METERS_PER_DEGREE_LAT,
  }));

  const center = points.reduce(
    (sum, point) => ({
      u: sum.u + point.u / points.length,
      v: sum.v + point.v / points.length,
      x: sum.x + point.x / points.length,
      y: sum.y + point.y / points.length,
    }),
    { u: 0, v: 0, x: 0, y: 0 },
  );

  let denom = 0;
  let aNumerator = 0;
  let bNumerator = 0;
  for (const point of points) {
    const u = point.u - center.u;
    const v = point.v - center.v;
    const x = point.x - center.x;
    const y = point.y - center.y;
    denom += u * u + v * v;
    aNumerator += u * x - v * y;
    bNumerator += v * x + u * y;
  }
  if (denom < 1e-6) return null;

  const a = aNumerator / denom;
  const b = bNumerator / denom;
  const scaleSquared = a * a + b * b;
  if (!Number.isFinite(scaleSquared) || scaleSquared < 1e-8) return null;

  const u = mapX * FESTIVAL_IMAGE_WIDTH - center.u;
  const v = mapY * FESTIVAL_IMAGE_HEIGHT - center.v;
  const x = center.x + a * u + b * v;
  const y = center.y + b * u - a * v;

  const longitude = lon0 + x / metersPerDegreeLon;
  const latitude = lat0 + y / METERS_PER_DEGREE_LAT;
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
}

export function festivalImageCorners(anchors: GeoAnchor[]): [LngLatTuple, LngLatTuple, LngLatTuple, LngLatTuple] | null {
  if (anchors.length < 2) return null;
  const corners = [
    festivalPointToLngLat(0, 0, anchors),
    festivalPointToLngLat(1, 0, anchors),
    festivalPointToLngLat(1, 1, anchors),
    festivalPointToLngLat(0, 1, anchors),
  ];
  if (corners.some((corner) => !corner)) return null;
  return corners as [LngLatTuple, LngLatTuple, LngLatTuple, LngLatTuple];
}
