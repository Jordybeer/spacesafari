// Domaine de Massembre public POI coordinate. The live map is intentionally
// venue-scoped so arbitrary remote GPS points cannot pollute a public room.
// Source: Explore Meuse / Cirkwi, Massembre 84, 5543 Heer, updated 2026-08-30.
export const VENUE_CENTER = { latitude: 50.15654, longitude: 4.85366 } as const;
export const VENUE_MAX_DISTANCE_METERS = 3_000;

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

export function isNearVenue(location: { latitude: number; longitude: number }): boolean {
  return distanceMeters(location, VENUE_CENTER) <= VENUE_MAX_DISTANCE_METERS;
}
