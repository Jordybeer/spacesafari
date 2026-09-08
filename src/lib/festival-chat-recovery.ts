import type { FestivalDefinition } from "./festivals";
import { getFestivalForChat, getPersistedFestival, isFestivalChatDisabled } from "./festival-store";
import { getRedis } from "./storage";

const FESTIVALS_KEY = "ginder:festivals";

function chatFestivalKey(chatId: string | number): string {
  return `ginder:chat:${chatId}:festival`;
}

function disabledChatKey(chatId: string | number): string {
  return `ginder:chat:${chatId}:disabled`;
}

type RecoverableFestival = FestivalDefinition & {
  chatId?: number | null;
  archivedAt?: string | null;
};

function recoverableFestival(value: unknown, chatId: string | number): RecoverableFestival | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RecoverableFestival>;
  if (typeof candidate.id !== "string" || candidate.chatId !== Number(chatId) || candidate.archivedAt) return null;
  if (typeof candidate.name !== "string" || typeof candidate.year !== "number" || typeof candidate.timezone !== "string") return null;
  return candidate as RecoverableFestival;
}

async function recoverDisabledLink(chatId: string | number): Promise<FestivalDefinition | null> {
  const redis = getRedis();
  const disabledFestivalId = await redis.get<string>(disabledChatKey(chatId));
  if (!disabledFestivalId) return null;

  const festival = await getPersistedFestival(disabledFestivalId);
  if (!festival || festival.archivedAt || festival.chatId !== Number(chatId)) return null;

  await redis.multi()
    .set(chatFestivalKey(chatId), festival.id)
    .del(disabledChatKey(chatId))
    .exec();
  return festival;
}

export async function recoverFestivalForChat(chatId: string | number): Promise<FestivalDefinition | null> {
  if (await isFestivalChatDisabled(chatId)) {
    // Intentional unlink/archive clears chatId first, so only revive a disabled key
    // when the persisted festival still explicitly owns this exact Telegram chat.
    return await recoverDisabledLink(chatId);
  }

  try {
    return await getFestivalForChat(chatId);
  } catch {
    const redis = getRedis();
    const festivals = await redis.hvals(FESTIVALS_KEY) as unknown[];
    const recovered = festivals
      .map((value) => recoverableFestival(value, chatId))
      .find((festival): festival is RecoverableFestival => Boolean(festival));

    if (recovered) {
      await redis.multi()
        .set(chatFestivalKey(chatId), recovered.id)
        .del(disabledChatKey(chatId))
        .exec();
      return recovered;
    }

    const staleFestivalId = await redis.get<string>(chatFestivalKey(chatId));
    if (staleFestivalId) {
      await redis.multi()
        .del(chatFestivalKey(chatId))
        .set(disabledChatKey(chatId), staleFestivalId)
        .exec();
    }
    return null;
  }
}
