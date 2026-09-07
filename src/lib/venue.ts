import { SPACE_SAFARI_2026, type FestivalDefinition } from "./festivals";

// Compatibility exports for the existing Space Safari map. New festival-aware code
// should use the FestivalDefinition passed into isNearFestival instead.
export const VENUE_CENTER = SPACE_SAFARI_2026.venueCenter;
export const VENUE_MAX_DISTANCE_METERS = SPACE_SAFARI_2026.venueMaxDistanceMeters;

// Local offline basemap extent for the current Space Safari asset. This remains
// festival-specific and should move into per-festival map assets when those are added.
export const OFFLINE_MAP_BOUNDS = {
  west: 4.82,
  south: 50.135,
  east: 4.90,
  north: 50.18,
} as const;

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radius = 6_371_000;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function isNearFestival(
  festival: Pick<FestivalDefinition, "venueCenter" | "venueMaxDistanceMeters">,
  location: { latitude: number; longitude: number },
): boolean {
  return distanceMeters(location, festival.venueCenter) <= festival.venueMaxDistanceMeters;
}

export function isNearVenue(location: { latitude: number; longitude: number }): boolean {
  return isNearFestival(SPACE_SAFARI_2026, location);
}
