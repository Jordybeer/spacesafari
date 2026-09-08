import {
  setBotCommands,
  setCommandsMenuButton,
  type TelegramBotCommand,
} from "./telegram";

export const PRIVATE_BOT_COMMANDS: TelegramBotCommand[] = [
  { command: "start", description: "Open Ginder" },
  { command: "festival", description: "Maak of beheer een festival" },
  { command: "menu", description: "Mijn festival en setup" },
  { command: "id", description: "Toon mijn Telegram user ID" },
  { command: "help", description: "Hoe Ginder werkt" },
];

export const GROUP_BOT_COMMANDS: TelegramBotCommand[] = [
  { command: "menu", description: "Toon het festivalmenu" },
  { command: "timetable", description: "Nu + wat start binnen 60 min" },
  { command: "live", description: "Wie draait er nu?" },
  { command: "meet", description: "Maak een groepsafspraak" },
  { command: "tent", description: "Bewaar je huidige tentplek" },
  { command: "group", description: "Toon groepsstatus" },
  { command: "map", description: "Festivalkaart + live kaart" },
  { command: "programma", description: "Zoek een artiest" },
  { command: "ping", description: "Melding 15 min voor een artiest" },
  { command: "pings", description: "Mijn actieve meldingen" },
  { command: "unping", description: "Verwijder een melding" },
  { command: "straks", description: "Sets die binnen 60 min starten" },
  { command: "help", description: "Toon alle groepscommando's" },
];

const COMMAND_SYNC_INTERVAL_MS = 10 * 60 * 1000;
let lastSyncAt = 0;
let inFlight: Promise<void> | null = null;

export async function syncTelegramCommandUi(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastSyncAt < COMMAND_SYNC_INTERVAL_MS) return;
  if (inFlight) return await inFlight;

  inFlight = (async () => {
    await setBotCommands(PRIVATE_BOT_COMMANDS);
    await setBotCommands(PRIVATE_BOT_COMMANDS, { type: "all_private_chats" });
    await setBotCommands(GROUP_BOT_COMMANDS, { type: "all_group_chats" });
    await setCommandsMenuButton();
    lastSyncAt = Date.now();
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}