import { getRedis } from "./storage";

const BOT_SETUP_TTL_SECONDS = 24 * 60 * 60;

export type FestivalBotSetupStep =
  | "map"
  | "location"
  | "radius"
  | "radius-custom"
  | "anchors"
  | "timetable";

export interface FestivalBotSetupState {
  festivalId: string;
  step: FestivalBotSetupStep;
}

function setupKey(ownerTelegramId: number): string {
  return `ginder:user:${ownerTelegramId}:bot-setup`;
}

export async function setFestivalBotSetupState(
  ownerTelegramId: number,
  festivalId: string,
  step: FestivalBotSetupStep,
): Promise<FestivalBotSetupState> {
  const state = { festivalId, step } satisfies FestivalBotSetupState;
  await getRedis().set(setupKey(ownerTelegramId), state, { ex: BOT_SETUP_TTL_SECONDS });
  return state;
}

export async function getFestivalBotSetupState(
  ownerTelegramId: number,
): Promise<FestivalBotSetupState | null> {
  return await getRedis().get<FestivalBotSetupState>(setupKey(ownerTelegramId));
}

export async function clearFestivalBotSetupState(ownerTelegramId: number): Promise<void> {
  await getRedis().del(setupKey(ownerTelegramId));
}
