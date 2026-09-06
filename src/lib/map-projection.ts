import type { MapAnchor, MapPresence, ProjectedPresence } from "./map-model";
import { fitSimilarity, projectWithFit } from "./map-similarity";

export function projectLocation(
  latitude: number,
  longitude: number,
  anchors: MapAnchor[],
): { mapX: number; mapY: number } | null {
  const fit = fitSimilarity(anchors);
  return fit ? projectWithFit(latitude, longitude, fit) : null;
}

export function projectPresence(
  presence: MapPresence[],
  anchors: MapAnchor[],
): ProjectedPresence[] {
  const fit = fitSimilarity(anchors);
  return presence.map((member) => {
    const projected = fit ? projectWithFit(member.latitude, member.longitude, fit) : null;
    return {
      ...member,
      mapX: projected?.mapX ?? null,
      mapY: projected?.mapY ?? null,
    };
  });
}
