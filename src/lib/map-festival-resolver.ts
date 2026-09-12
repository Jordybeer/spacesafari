import { DEFAULT_FESTIVAL_ID, type FestivalDefinition } from "./festivals";
import { resolveFestivalDefinition, type PersistedFestival } from "./festival-store";
import { getRedis } from "./storage";

const FESTIVALS_KEY = "ginder:festivals";

function publicFestivalKey(publicKey: string): string {
  return `ginder:festival:public:${publicKey}`;
}

function isPersistedFestival(value: unknown): value is PersistedFestival {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PersistedFestival>;
  return typeof candidate.id === "string"
    && typeof candidate.publicKey === "string"
    && typeof candidate.name === "string"
    && typeof candidate.year === "number";
}

/**
 * Resolve a festival for map/Mini App traffic and repair older missing public-key
 * indexes on demand. The public selector itself stays exact/case-sensitive because
 * it contains an opaque random suffix.
 */
export async function resolveMapFestivalDefinition(
  selector?: string | null,
): Promise<FestivalDefinition | null> {
  const resolved = await resolveFestivalDefinition(selector);
  if (resolved) return resolved;

  const exactSelector = selector?.trim();
  if (!exactSelector || exactSelector === DEFAULT_FESTIVAL_ID) return null;

  const redis = getRedis();
  const festivals = await redis.hvals(FESTIVALS_KEY) as unknown[];
  const recovered = festivals.find((value): value is PersistedFestival => (
    isPersistedFestival(value)
    && value.publicKey === exactSelector
    && !value.archivedAt
  ));
  if (!recovered) return null;

  // Self-heal the lookup so this scan is only needed once for legacy data.
  await redis.set(publicFestivalKey(recovered.publicKey), recovered.id);
  return recovered;
}

export async function requireMapFestivalDefinition(
  selector?: string | null,
): Promise<FestivalDefinition> {
  const festival = await resolveMapFestivalDefinition(selector);
  if (!festival) throw new Error("Onbekend festival.");
  return festival;
}
