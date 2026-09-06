import { fitMapTransform, unprojectWithFit } from "./map-similarity";

export interface GeoAnchor {
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
}

export type LngLatTuple = [number, number];

export function mapPointToLngLat(
  mapX: number,
  mapY: number,
  anchors: GeoAnchor[],
): LngLatTuple | null {
  const fit = fitMapTransform(anchors);
  return fit ? unprojectWithFit(mapX, mapY, fit) : null;
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
