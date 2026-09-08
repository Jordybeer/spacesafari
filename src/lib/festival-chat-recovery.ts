import type { FestivalDefinition } from "./festivals";
import { getFestivalForChat, isFestivalChatDisabled } from "./festival-store";
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

export async function recoverFestivalForChat(chatId: string | number): Promise<FestivalDefinition | null> {
  if (await isFestivalChatDisabled(chatId)) return null;

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
