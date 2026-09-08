import crypto from "node:crypto";
import { parseFestivalStartParam } from "./festival-links";
import {
  DEFAULT_FESTIVAL_ID,
  SPACE_SAFARI_2026,
  festivalStoragePrefix,
  getFestivalDefinition,
  normalizeFestivalId,
  type FestivalDefinition,
  type FestivalSetupStatus,
} from "./festivals";
import { getRedis } from "./storage";

const FESTIVALS_KEY = "ginder:festivals";
const PENDING_TTL_SECONDS = 24 * 60 * 60;
const MAP_UPLOAD_TTL_SECONDS = 15 * 60;
const MAX_ADDITIONAL_SETUP_TOKENS = 5;
export const FESTIVAL_CREATION_COOLDOWN_SECONDS = 7 * 24 * 60 * 60;

export interface PersistedFestival extends FestivalDefinition {
  ownerTelegramId: number;
  publicKey: string;
  createdAt: string;
  updatedAt: string;
  chatId: number | null;
  chatTitle: string | null;
  inviteLink: string | null;
  setupTokenHash: string;
  setupTokenHashes?: string[];
  telegramMapFileId: string | null;
}

export interface PendingFestivalCreation {
  ownerTelegramId: number;
  requestId: number;
  name: string;
  year: number;
  proposedId: string;
  publicKey: string;
  createdAt: string;
}

export class FestivalChatAlreadyLinkedError extends Error {
  constructor() {
    super("Deze Telegram-groep is al gekoppeld aan een ander festival.");
    this.name = "FestivalChatAlreadyLinkedError";
  }
}

function pendingKey(userId: number): string {
  return `ginder:festival:pending:${userId}`;
}

function namePromptKey(userId: number): string {
  return `ginder:festival:name-prompt:${userId}`;
}

function cooldownKey(userId: number): string {
  return `ginder:festival:create-cooldown:${userId}`;
}

function chatFestivalKey(chatId: string | number): string {
  return `ginder:chat:${chatId}:festival`;
}

function publicFestivalKey(publicKey: string): string {
  return `ginder:festival:public:${publicKey}`;
}

function ownerCurrentFestivalKey(userId: number): string {
  return `ginder:user:${userId}:current-festival`;
}

function ownerFestivalsKey(userId: number): string {
  return `ginder:user:${userId}:festivals`;
}

function mapUploadKey(userId: number): string {
  return `ginder:user:${userId}:map-upload`;
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomToken(bytes = 18): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function randomPublicKey(): string {
  return crypto.randomBytes(6).toString("base64url").slice(0, 8);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "festival";
}

export function buildFestivalId(name: string, year: number, suffix = randomPublicKey().slice(0, 4)): string {
  return `${slugify(name)}-${year}-${suffix}`.slice(0, 56);
}

export function isFestivalOwner(festival: FestivalDefinition, telegramUserId: number): boolean {
  return "ownerTelegramId" in festival
    && typeof festival.ownerTelegramId === "number"
    && festival.ownerTelegramId === telegramUserId;
}

export async function getPersistedFestival(id: string): Promise<PersistedFestival | null> {
  return await getRedis().hget<PersistedFestival>(FESTIVALS_KEY, normalizeFestivalId(id));
}

export async function resolveFestivalDefinition(selector?: string | null): Promise<FestivalDefinition | null> {
  const builtIn = getFestivalDefinition(selector);
  if (builtIn) return builtIn;

  const normalized = normalizeFestivalId(selector);
  const direct = await getPersistedFestival(normalized);
  if (direct) return direct;

  const idFromPublicKey = await getRedis().get<string>(publicFestivalKey(normalized));
  return idFromPublicKey ? await getPersistedFestival(idFromPublicKey) : null;
}

export async function requireResolvedFestivalDefinition(selector?: string | null): Promise<FestivalDefinition> {
  const festival = await resolveFestivalDefinition(selector);
  if (!festival) throw new Error("Onbekend festival.");
  return festival;
}

export async function beginFestivalNamePrompt(ownerTelegramId: number): Promise<void> {
  await getRedis().set(namePromptKey(ownerTelegramId), "1", { ex: 15 * 60 });
}

export async function consumeFestivalNamePrompt(ownerTelegramId: number): Promise<boolean> {
  const redis = getRedis();
  const exists = await redis.get<string>(namePromptKey(ownerTelegramId));
  if (!exists) return false;
  await redis.del(namePromptKey(ownerTelegramId));
  return true;
}

export async function createPendingFestival(
  ownerTelegramId: number,
  name: string,
  year: number,
): Promise<PendingFestivalCreation> {
  const pending: PendingFestivalCreation = {
    ownerTelegramId,
    requestId: crypto.randomInt(1, 2_000_000_000),
    name: name.trim().slice(0, 80) || "Festival",
    year,
    proposedId: buildFestivalId(name, year),
    publicKey: randomPublicKey(),
    createdAt: new Date().toISOString(),
  };
  await getRedis().set(pendingKey(ownerTelegramId), pending, { ex: PENDING_TTL_SECONDS });
  return pending;
}

export async function getPendingFestival(ownerTelegramId: number): Promise<PendingFestivalCreation | null> {
  return await getRedis().get<PendingFestivalCreation>(pendingKey(ownerTelegramId));
}

export async function clearPendingFestival(ownerTelegramId: number): Promise<void> {
  await getRedis().del(pendingKey(ownerTelegramId));
}

export async function getCreationCooldownSeconds(ownerTelegramId: number): Promise<number> {
  const ttl = await getRedis().ttl(cooldownKey(ownerTelegramId));
  return ttl > 0 ? ttl : 0;
}

export async function claimCreationSlot(ownerTelegramId: number): Promise<boolean> {
  const result = await getRedis().set(cooldownKey(ownerTelegramId), "1", {
    ex: FESTIVAL_CREATION_COOLDOWN_SECONDS,
    nx: true,
  });
  return result !== null;
}

export async function releaseCreationSlot(ownerTelegramId: number): Promise<void> {
  await getRedis().del(cooldownKey(ownerTelegramId));
}

export async function finalizePendingFestival(
  pending: PendingFestivalCreation,
  chat: { id: number; title?: string },
): Promise<{ festival: PersistedFestival; setupToken: string }> {
  const redis = getRedis();
  const setupToken = randomToken();
  const now = new Date().toISOString();
  const festival: PersistedFestival = {
    id: pending.proposedId,
    name: pending.name,
    year: pending.year,
    timezone: "Europe/Brussels",
    status: "map",
    mapImageUrl: "",
    mapImageWidth: 640,
    mapImageHeight: 800,
    venueCenter: { latitude: 0, longitude: 0 },
    venueMaxDistanceMeters: 3_000,
    ownerTelegramId: pending.ownerTelegramId,
    publicKey: pending.publicKey,
    createdAt: now,
    updatedAt: now,
    chatId: chat.id,
    chatTitle: chat.title ?? null,
    inviteLink: null,
    setupTokenHash: tokenHash(setupToken),
    telegramMapFileId: null,
  };

  const chatKey = chatFestivalKey(chat.id);
  const claimedChat = await redis.set(chatKey, festival.id, { nx: true });
  if (claimedChat === null) throw new FestivalChatAlreadyLinkedError();

  try {
    await redis.multi()
      .hset(FESTIVALS_KEY, { [festival.id]: festival })
      .set(publicFestivalKey(festival.publicKey), festival.id)
      .set(ownerCurrentFestivalKey(festival.ownerTelegramId), festival.id)
      .sadd(ownerFestivalsKey(festival.ownerTelegramId), festival.id)
      .del(pendingKey(festival.ownerTelegramId))
      .exec();
  } catch (error) {
    await redis.del(chatKey);
    throw error;
  }
  return { festival, setupToken };
}

export async function getFestivalForChat(chatId: string | number): Promise<FestivalDefinition> {
  const festivalId = await getRedis().get<string>(chatFestivalKey(chatId));
  if (!festivalId) return SPACE_SAFARI_2026;
  const festival = await resolveFestivalDefinition(festivalId);
  if (!festival) throw new Error("Festivalkoppeling is ongeldig.");
  return festival;
}

export async function getCurrentFestivalForOwner(ownerTelegramId: number): Promise<PersistedFestival | null> {
  const id = await getRedis().get<string>(ownerCurrentFestivalKey(ownerTelegramId));
  return id ? await getPersistedFestival(id) : null;
}

export async function getFestivalsForOwner(ownerTelegramId: number): Promise<PersistedFestival[]> {
  const redis = getRedis();
  const [indexedIds, currentId] = await Promise.all([
    redis.smembers<string[]>(ownerFestivalsKey(ownerTelegramId)),
    redis.get<string>(ownerCurrentFestivalKey(ownerTelegramId)),
  ]);
  const legacyValues = indexedIds.length
    ? []
    : await redis.hvals(FESTIVALS_KEY) as unknown[];
  const migratedIds = legacyValues
    .filter((festival): festival is PersistedFestival => Boolean(
      festival
      && typeof festival === "object"
      && "ownerTelegramId" in festival
      && festival.ownerTelegramId === ownerTelegramId
      && "id" in festival
      && typeof festival.id === "string",
    ))
    .map((festival) => festival.id);
  if (migratedIds.length) {
    await Promise.all(migratedIds.map((id) => redis.sadd(ownerFestivalsKey(ownerTelegramId), id)));
  }
  const ids = [...new Set([...indexedIds, ...migratedIds, ...(currentId ? [currentId] : [])])];
  const festivals = (await Promise.all(ids.map((id) => getPersistedFestival(id))))
    .filter((festival): festival is PersistedFestival => Boolean(
      festival && festival.ownerTelegramId === ownerTelegramId,
    ));
  return festivals.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function selectFestivalForOwner(
  ownerTelegramId: number,
  selector: string,
): Promise<PersistedFestival> {
  const festival = await resolveFestivalDefinition(selector);
  if (!festival || !("ownerTelegramId" in festival) || festival.ownerTelegramId !== ownerTelegramId) {
    throw new Error("Festival niet gevonden voor deze eigenaar.");
  }
  await Promise.all([
    getRedis().set(ownerCurrentFestivalKey(ownerTelegramId), festival.id),
    getRedis().sadd(ownerFestivalsKey(ownerTelegramId), festival.id),
  ]);
  return festival as PersistedFestival;
}

export async function beginFestivalMapUpload(
  ownerTelegramId: number,
  festivalId: string,
): Promise<PersistedFestival> {
  const festival = await selectFestivalForOwner(ownerTelegramId, festivalId);
  await getRedis().set(mapUploadKey(ownerTelegramId), festival.id, { ex: MAP_UPLOAD_TTL_SECONDS });
  return festival;
}

export async function getFestivalAwaitingMapUpload(ownerTelegramId: number): Promise<PersistedFestival | null> {
  const id = await getRedis().get<string>(mapUploadKey(ownerTelegramId));
  if (!id) return null;
  const festival = await getPersistedFestival(id);
  if (!festival || festival.ownerTelegramId !== ownerTelegramId) {
    await getRedis().del(mapUploadKey(ownerTelegramId));
    return null;
  }
  return festival;
}

export async function clearFestivalMapUpload(ownerTelegramId: number): Promise<void> {
  await getRedis().del(mapUploadKey(ownerTelegramId));
}

export async function issueFestivalSetupToken(
  festivalId: string,
): Promise<{ festival: PersistedFestival; setupToken: string }> {
  const current = await getPersistedFestival(festivalId);
  if (!current) throw new Error("Festival niet gevonden.");

  const setupToken = randomToken();
  const nextHash = tokenHash(setupToken);
  const setupTokenHashes = [...new Set([...(current.setupTokenHashes ?? []), nextHash])]
    .slice(-MAX_ADDITIONAL_SETUP_TOKENS);
  const festival: PersistedFestival = {
    ...current,
    setupTokenHashes,
    updatedAt: new Date().toISOString(),
  };
  await getRedis().hset(FESTIVALS_KEY, { [festival.id]: festival });
  return { festival, setupToken };
}

export async function verifyFestivalSetupToken(festivalId: string, token: string): Promise<PersistedFestival> {
  const festival = await getPersistedFestival(festivalId);
  const hash = token ? tokenHash(token) : "";
  const valid = Boolean(festival && hash && (
    festival.setupTokenHash === hash || festival.setupTokenHashes?.includes(hash)
  ));
  if (!festival || !valid) {
    throw new Error("Ongeldige festival setup-link.");
  }
  return festival;
}

export async function updatePersistedFestival(
  festivalId: string,
  patch: Partial<Pick<PersistedFestival,
    | "status"
    | "mapImageUrl"
    | "mapImageWidth"
    | "mapImageHeight"
    | "venueCenter"
    | "venueMaxDistanceMeters"
    | "inviteLink"
    | "chatTitle"
    | "telegramMapFileId"
  >>,
): Promise<PersistedFestival> {
  const current = await getPersistedFestival(festivalId);
  if (!current) throw new Error("Festival niet gevonden.");
  const next: PersistedFestival = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await getRedis().hset(FESTIVALS_KEY, { [next.id]: next });
  return next;
}

export async function replacePersistedFestivalMap(
  festivalId: string,
  map: Pick<PersistedFestival,
    | "mapImageUrl"
    | "mapImageWidth"
    | "mapImageHeight"
    | "telegramMapFileId"
  >,
): Promise<PersistedFestival> {
  const current = await getPersistedFestival(festivalId);
  if (!current) throw new Error("Festival niet gevonden.");
  const next: PersistedFestival = {
    ...current,
    ...map,
    status: "anchors",
    updatedAt: new Date().toISOString(),
  };
  await getRedis().multi()
    .hset(FESTIVALS_KEY, { [next.id]: next })
    .del(`${festivalStoragePrefix(next.id)}:map:anchors`)
    .exec();
  return next;
}

export function setupStatusFor(input: {
  mapImageUrl: string;
  venueCenter: { latitude: number; longitude: number };
  anchors: number;
  timetableReady?: boolean;
}): FestivalSetupStatus {
  const hasCenter = Number.isFinite(input.venueCenter.latitude)
    && Number.isFinite(input.venueCenter.longitude)
    && !(input.venueCenter.latitude === 0 && input.venueCenter.longitude === 0);
  if (!input.mapImageUrl || !hasCenter) return "map";
  if (input.anchors < 2) return "anchors";
  return input.timetableReady ? "ready" : "timetable";
}

export function setupUrl(festival: PersistedFestival, setupToken: string): string {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) throw new Error("APP_URL is not configured");
  return `${appUrl}/festival-setup?festivalId=${encodeURIComponent(festival.id)}#token=${encodeURIComponent(setupToken)}`;
}

export function festivalMapStartParam(festival: FestivalDefinition, roomToken?: string): string {
  if (festival.id === DEFAULT_FESTIVAL_ID) return roomToken ? `room_${roomToken}` : "map";
  const publicKey = "publicKey" in festival && typeof festival.publicKey === "string"
    ? festival.publicKey
    : null;
  if (!publicKey) throw new Error("Festival heeft geen publieke selector.");
  return roomToken ? `fr_${publicKey}_${roomToken}` : `f_${publicKey}`;
}

export { parseFestivalStartParam };
