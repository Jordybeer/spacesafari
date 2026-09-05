import crypto from "node:crypto";
import { DateTime } from "luxon";
import { findArtistSets, normalizeArtist } from "./artist-search";
import {
  currentSets,
  festivalHasEnded,
  festivalNow,
  formatClock,
  formatSet,
  nextOnStage,
  nextUpcomingSets,
  setsStartingWithin,
} from "./festival-time";
import {
  answerCallbackQuery,
  mapMiniAppUrl,
  sendMessage,
  sendPhoto,
  type TelegramUpdate,
} from "./telegram";
import { createPing, deletePing, listPings, setById } from "./pings";
import { performerSets, type FestivalSet } from "@/src/data/timetable";
import { STAGES } from "@/src/data/stages";
import { privateRoomToken } from "./map-model";
import type { TelegramChat } from "./telegram";

function shortSetKey(id: string): string {
  return crypto.createHash("sha1").update(id).digest("base64url").slice(0, 12);
}

function setFromShortKey(key: string): FestivalSet | undefined {
  return performerSets.find((set) => shortSetKey(set.id) === key);
}

function commandAndArgs(text: string): { command: string; args: string } {
  const trimmed = text.trim();
  const [raw = "", ...rest] = trimmed.split(/\s+/);
  const command = raw.split("@")[0].toLowerCase();
  return { command, args: rest.join(" ").trim() };
}

function helpText() {
  return [
    "🛸 Space Safari Assistant",
    "",
    "/wie — wie draait er nu?",
    "/straks — wat start binnen 60 minuten?",
    "/programma artiest — zoek een artiest",
    "/ping artiest — melding 15 min voor de set",
    "/pings — mijn ingestelde meldingen",
    "/unping artiest — melding verwijderen",
    "/map — festivalkaart + live groepskaart",
    "/id — toon je Telegram user ID",
  ].join("\n");
}

function currentBlock(set: FestivalSet): string {
  const stage = STAGES[set.stage];
  const next = nextOnStage(set);
  const live = set.live ? " · live" : "";
  const nextLabel = next
    ? `Volgende: ${formatClock(next.startsAt)} · ${next.artist}${next.live ? " · live" : ""}`
    : "Volgende: einde";

  return [
    `${stage.emoji} ${set.stage} · ${set.artist}${live}`,
    `Nu: ${formatClock(set.startsAt)}–${formatClock(set.endsAt)}`,
    nextLabel,
  ].join("\n");
}

function compactUpcoming(set: FestivalSet): string {
  const stage = STAGES[set.stage];
  return `${stage.emoji} ${formatClock(set.startsAt)} · ${set.artist}${set.live ? " · live" : ""} · ${set.stage}`;
}

export function formatCurrent(now = festivalNow()): string {
  const current = currentSets(now);
  if (!current.length) {
    if (festivalHasEnded(now)) return "🌙 Space Safari is afgelopen. Laatste tune: zondag om middernacht.";
    const upcoming = nextUpcomingSets(now);
    if (!upcoming.length) return "Er draait momenteel niets en ik vind geen volgende set.";
    return ["🎧 Even stilte · hierna", ...upcoming.map(compactUpcoming)].join("\n");
  }

  return ["🎧 NU", current.map(currentBlock).join("\n\n")].join("\n\n");
}

async function showProgram(chatId: string | number, query: string) {
  if (!query) {
    await sendMessage(chatId, "Gebruik: /programma <artiest>");
    return;
  }
  const match = findArtistSets(query);
  const sets = match.exact.length ? match.exact : match.suggestions;
  if (!sets.length) {
    await sendMessage(chatId, `Geen artiest gevonden voor “${query}”.`);
    return;
  }
  const unique = [...new Map(sets.map((set) => [set.id, set])).values()].slice(0, 8);
  await sendMessage(
    chatId,
    unique
      .map(
        (set) =>
          `${formatSet(set)}\n📅 ${DateTime.fromISO(set.startsAt, { setZone: true }).setZone("Europe/Brussels").toFormat("ccc dd/LL")}`,
      )
      .join("\n\n"),
  );
}

async function pingArtist(chatId: string | number, query: string) {
  if (!query) {
    await sendMessage(chatId, "Gebruik: /ping <artiest>");
    return;
  }
  const match = findArtistSets(query);
  let candidates = match.exact.length ? match.exact : match.suggestions;
  const now = festivalNow();
  candidates = candidates.filter(
    (set) => DateTime.fromISO(set.startsAt, { setZone: true }).toMillis() > now.toMillis(),
  );

  if (!candidates.length) {
    await sendMessage(chatId, `Geen toekomstige set gevonden voor “${query}”.`);
    return;
  }

  const artistNames = new Set(candidates.map((set) => normalizeArtist(set.artist)));
  if (candidates.length > 1 || artistNames.size > 1) {
    const buttons = candidates.slice(0, 8).map((set) => [
      {
        text: `${set.artist} · ${set.stage} ${formatClock(set.startsAt)}`,
        callback_data: `p:${shortSetKey(set.id)}`,
      },
    ]);
    await sendMessage(chatId, "Welke set bedoel je?", {
      reply_markup: { inline_keyboard: buttons },
    });
    return;
  }

  await createAndConfirmPing(String(chatId), candidates[0]);
}

async function createAndConfirmPing(chatId: string, set: FestivalSet) {
  const { ping, duplicate } = await createPing(chatId, set);
  const notify = DateTime.fromISO(ping.notifyAt, { setZone: true }).setZone("Europe/Brussels");
  const text = duplicate
    ? [
        "🔔 Deze ping stond al ingesteld",
        "",
        set.artist,
        `${set.stage} • ${formatClock(set.startsAt)}–${formatClock(set.endsAt)}`,
        `Melding om ${notify.toFormat("HH:mm")}.`,
      ].join("\n")
    : [
        "🔔 Ping ingesteld",
        "",
        set.artist,
        `${set.stage} • ${formatClock(set.startsAt)}–${formatClock(set.endsAt)}`,
        `Ik stuur om ${notify.toFormat("HH:mm")} een bericht.`,
      ].join("\n");
  await sendMessage(chatId, text);
}

async function listActivePings(chatId: string | number) {
  const pings = await listPings(String(chatId));
  if (!pings.length) {
    await sendMessage(chatId, "🔕 Geen actieve artiestpings.");
    return;
  }
  const lines = pings
    .map((ping) => {
      const set = setById(ping.artistSetId);
      if (!set) return null;
      return `🔔 ${set.artist} · ${set.stage} · ${formatClock(set.startsAt)}`;
    })
    .filter(Boolean);
  await sendMessage(chatId, ["Je actieve pings:", "", ...lines].join("\n"));
}

async function unpingArtist(chatId: string | number, query: string) {
  if (!query) {
    await sendMessage(chatId, "Gebruik: /unping <artiest>");
    return;
  }
  const pings = await listPings(String(chatId));
  const q = normalizeArtist(query);
  const matches = pings.filter((ping) => {
    const set = setById(ping.artistSetId);
    return set ? normalizeArtist(set.artist).includes(q) || q.includes(normalizeArtist(set.artist)) : false;
  });
  if (!matches.length) {
    await sendMessage(chatId, `Geen actieve ping gevonden voor “${query}”.`);
    return;
  }
  await Promise.all(matches.map((ping) => deletePing(String(chatId), ping.artistSetId)));
  await sendMessage(chatId, `🔕 ${matches.length} ping${matches.length === 1 ? "" : "s"} verwijderd.`);
}

async function sendMap(chat: TelegramChat, admin = false) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not configured");
  const isGroup = chat.type === "group" || chat.type === "supergroup";
  const startParam = admin ? "map_admin" : isGroup ? `room_${privateRoomToken(chat.id)}` : "map";
  const target = mapMiniAppUrl(startParam);
  await sendPhoto(chat.id, `${appUrl}/festival-map.jpg`, "🗺️ Festivalterrein", {
    reply_markup: {
      inline_keyboard: [[{ text: admin ? "📍 Kalibreer kaart" : "🗺 Open live kaart", url: target }]],
    },
  });
}

export async function routeTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const callback = update.callback_query;
  const callbackData = callback?.data;
  if (callback && callbackData?.startsWith("p:")) {
    const set = setFromShortKey(callbackData.slice(2));
    if (!set || !callback.message) {
      await answerCallbackQuery(callback.id, "Set niet gevonden.");
      return;
    }
    await answerCallbackQuery(callback.id, "Ping ingesteld");
    await createAndConfirmPing(String(callback.message.chat.id), set);
    return;
  }

  const message = update.message;
  if (!message?.text) return;
  const { command, args } = commandAndArgs(message.text);

  switch (command) {
    case "/start":
    case "/help":
      await sendMessage(message.chat.id, helpText());
      break;
    case "/wie":
      await sendMessage(message.chat.id, formatCurrent());
      break;
    case "/straks": {
      const sets = setsStartingWithin(60);
      await sendMessage(
        message.chat.id,
        sets.length
          ? ["⏱ Binnen 60 min", ...sets.map(compactUpcoming)].join("\n")
          : "⏱ De komende 60 minuten start geen nieuwe set.",
      );
      break;
    }
    case "/programma":
      await showProgram(message.chat.id, args);
      break;
    case "/ping":
      await pingArtist(message.chat.id, args);
      break;
    case "/pings":
      await listActivePings(message.chat.id);
      break;
    case "/unping":
      await unpingArtist(message.chat.id, args);
      break;
    case "/map":
      await sendMap(message.chat, false);
      break;
    case "/mapadmin":
      await sendMap(message.chat, true);
      break;
    case "/id": {
      const userId = message.from?.id;
      await sendMessage(
        message.chat.id,
        userId
          ? `🪪 Jouw Telegram user ID is:\n${userId}\n\nGebruik dit nummer in MAP_ADMIN_TELEGRAM_IDS om calibration mode voor jezelf vrij te geven.`
          : "Ik kon je Telegram user ID niet uit dit bericht lezen.",
      );
      break;
    }
    default:
      if (command.startsWith("/")) {
        await sendMessage(message.chat.id, helpText());
      }
  }
}
