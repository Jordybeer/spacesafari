export type FestivalSetupStatus = "draft" | "map" | "anchors" | "timetable" | "ready";

export interface FestivalCoordinate {
  latitude: number;
  longitude: number;
}

export interface FestivalDefinition {
  id: string;
  name: string;
  year: number;
  timezone: string;
  status: FestivalSetupStatus;
  mapImageUrl: string;
  mapImageWidth: number;
  mapImageHeight: number;
  venueCenter: FestivalCoordinate;
  venueMaxDistanceMeters: number;
}

export const DEFAULT_FESTIVAL_ID = "space-safari-2026";

export const SPACE_SAFARI_2026: FestivalDefinition = {
  id: DEFAULT_FESTIVAL_ID,
  name: "Space Safari",
  year: 2026,
  timezone: "Europe/Brussels",
  status: "ready",
  mapImageUrl: "/festival-map-original.png?v=4",
  mapImageWidth: 640,
  mapImageHeight: 800,
  venueCenter: { latitude: 50.15654, longitude: 4.85366 },
  venueMaxDistanceMeters: 3_000,
};

const BUILT_IN_FESTIVALS = new Map<string, FestivalDefinition>([
  [SPACE_SAFARI_2026.id, SPACE_SAFARI_2026],
]);

export function normalizeFestivalId(value?: string | null): string {
  const normalized = value?.trim().toLowerCase();
  return normalized || DEFAULT_FESTIVAL_ID;
}

export function getFestivalDefinition(value?: string | null): FestivalDefinition | null {
  return BUILT_IN_FESTIVALS.get(normalizeFestivalId(value)) ?? null;
}

export function requireFestivalDefinition(value?: string | null): FestivalDefinition {
  const festival = getFestivalDefinition(value);
  if (!festival) throw new Error("Onbekend festival.");
  return festival;
}

/**
 * Storage is festival-scoped. Space Safari keeps its historical `ss:*` prefix so
 * existing production Redis data remains valid while it becomes the first Ginder
 * festival instance. New festivals use the explicit Ginder namespace.
 */
export function festivalStoragePrefix(value?: string | null): string {
  const id = normalizeFestivalId(value);
  return id === DEFAULT_FESTIVAL_ID ? "ss" : `ginder:festival:${id}`;
}
