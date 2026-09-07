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
import { isMapAdmin, listAnchors, listPresence, privateRoomToken } from "./map-model";
import {
  getGroupMeetPoint,
  listGroupTentPoints,
  saveGroupTentPoint,
  setGroupMeetPoint,
} from "./group-tools";
import type { TelegramChat, TelegramMessage, TelegramUser } from "./telegram";

function shortSetKey(id: string): string {
  return crypto.createHash("sha1").update(id).digest("base64url").slice(0, 12);
}

function setFromShortKey(key: string): FestivalSet | undefined {
  return performerSets.find((set) => shortSetKey(set.id) === key);
}

function shortAnchorKey(id: string): string {
  return crypto.createHash("sha1").update(id).digest("base64url").slice(0, 12);
}

async function anchorFromShortKey(key: string) {
  const anchors = await listAnchors();
  return anchors.find((anchor) => shortAnchorKey(anchor.id) === key);
}

function commandAndArgs(text: string): { command: string; args: string } {
  const trimmed = text.trim();
  const [raw = "", ...rest] = trimmed.split(/\s+/);
  const command = raw.split("@")[0].toLowerCase();
  return { command, args: rest.join(" ").trim() };
}

function isGroupChat(chat: TelegramChat): boolean {
  return chat.type === "group" || chat.type === "supergroup";
}

function groupRoom(chat: TelegramChat): string {
  return `g_${privateRoomToken(chat.id)}`;
}

function displayTelegramUser(user: TelegramUser | undefined): string {
  if (!user) return "iemand";
  return user.username ? `@${user.username}` : [user.first_name, user.last_name].filter(Boolean).join(" ");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function companionKeyboard() {
  return {
    keyboard: [
      [{ text: "📅 Timetable" }, { text: "🎵 Nu live" }],
      [{ text: "📍 Meet" }, { text: "⛺ Tent" }],
      [{ text: "🗺 Kaart" }, { text: "👥 Groep" }],
    ],
    is_persistent: true,
    resize_keyboard: true,
    input_field_placeholder: "Space Safari…",
  };
}

function helpText() {
  return [
    "🛸 Space Safari Assistant",
    "",
    "/menu — toon het festivalmenu",
    "/wie — wie draait er nu?",
    "/straks — wat start binnen 60 minuten?",
    "/programma artiest — zoek een artiest",
    "/ping artiest — melding 15 min voor de set",
    "/pings — mijn ingestelde meldingen",
    "/unping artiest — melding verwijderen",
    "/meet — groepsafspraak op de kaart",
    "/tent — bewaar je huidige groepslocatie als tentplek",
    "/map — festivalkaart + live groepskaart",
    "/id — toon je Telegram user ID",
  ].join("\n");
}

async function sendCompanionMenu(chatId: string | number, intro = "🪐 Space Companion staat klaar.") {
  await sendMessage(chatId, intro, { reply_markup: companionKeyboard() });
}

function currentBlock(set: FestivalSet): string {
  const stage = STAGES[set.stage];
  const next = nextOnStage(set);
  const currentLive = set.live ? " · live" : "";
  const nextLine = next
    ? `└ ${formatClock(next.startsAt)} → ${next.artist}${next.live ? " · live" : ""}`
    : "└ einde";

  return [
    `${stage.emoji} ${set.stage}`,
    `├ ${formatClock(set.startsAt)}–${formatClock(set.endsAt)}  ${set.artist}${currentLive}`,
    nextLine,
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

async function showTimetable(chatId: string | number) {
  const sets = setsStartingWithin(60);
  const soon = sets.length
    ? ["", "⏱ BINNEN 60 MIN", ...sets.map(compactUpcoming)].join("\n")
    : "\n\n⏱ Binnen 60 minuten start geen nieuwe set.";
  await sendMessage(chatId, `${formatCurrent()}\n${soon}`);
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
  const isGroup = isGroupChat(chat);
  const startParam = admin ? "map_admin" : isGroup ? `room_${privateRoomToken(chat.id)}` : "map";
  const target = mapMiniAppUrl(startParam);
  await sendPhoto(chat.id, `${appUrl}/festival-map.jpg`, "🗺️ Festivalterrein", {
    reply_markup: {
      inline_keyboard: [[{ text: admin ? "📍 Kalibreer kaart" : "🗺 Open live kaart", url: target }]],
    },
  });
}

async function chooseMeetingPoint(message: TelegramMessage) {
  if (!isGroupChat(message.chat)) {
    await sendMessage(message.chat.id, "📍 Meeting points horen bij een groep. Gebruik dit vanuit jullie festivalgroep.");
    return;
  }
  const anchors = await listAnchors();
  if (!anchors.length) {
    await sendMessage(message.chat.id, "Er zijn nog geen kaartankers om als meeting point te gebruiken.");
    return;
  }
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let index = 0; index < Math.min(anchors.length, 10); index += 2) {
    rows.push(anchors.slice(index, index + 2).map((anchor) => ({
      text: `📍 ${anchor.name}`,
      callback_data: `m:${shortAnchorKey(anchor.id)}`,
    })));
  }
  await sendMessage(message.chat.id, "📍 Waar spreken we af?", {
    reply_markup: { inline_keyboard: rows },
  });
}

async function knownMemberMentions(room: string, creatorId: number): Promise<string> {
  const members = (await listPresence(room)).filter((member) => member.userId !== creatorId).slice(0, 8);
  if (!members.length) return "";
  return members
    .map((member) => member.username
      ? `@${escapeHtml(member.username)}`
      : `<a href=\"tg://user?id=${member.userId}\">${escapeHtml(member.displayName)}</a>`)
    .join(" ");
}

async function saveTentFromCurrentLocation(message: TelegramMessage) {
  if (!isGroupChat(message.chat)) {
    await sendMessage(message.chat.id, "⛺ Tentplekken horen bij een groep. Gebruik dit vanuit jullie festivalgroep.");
    return;
  }
  const userId = message.from?.id;
  if (!userId) return;
  const room = groupRoom(message.chat);
  const current = (await listPresence(room)).find((member) => member.userId === userId);
  if (!current) {
    const target = mapMiniAppUrl(`room_${privateRoomToken(message.chat.id)}`);
    await sendMessage(message.chat.id, "⛺ Deel eerst even je locatie op de groepskaart en tik daarna opnieuw op Tent.", {
      reply_markup: { inline_keyboard: [[{ text: "🗺 Open groepskaart", url: target }]] },
    });
    return;
  }
  await saveGroupTentPoint(room, current);
  const target = mapMiniAppUrl(`room_${privateRoomToken(message.chat.id)}`);
  await sendMessage(message.chat.id, `⛺ Tentplek opgeslagen voor ${displayTelegramUser(message.from)}.`, {
    reply_markup: { inline_keyboard: [[{ text: "🗺 Open groepskaart", url: target }]] },
  });
}

async function showGroupSummary(message: TelegramMessage) {
  if (!isGroupChat(message.chat)) {
    await sendMessage(message.chat.id, "👥 Open dit menu vanuit jullie festivalgroep voor de groepsstatus.");
    return;
  }
  const room = groupRoom(message.chat);
  const [members, meet, tents] = await Promise.all([
    listPresence(room),
    getGroupMeetPoint(room),
    listGroupTentPoints(room),
  ]);
  const lines = [
    "👥 GROEP",
    `${members.length} actieve locatie${members.length === 1 ? "" : "s"}`,
    meet ? `📍 Meet: ${meet.name} · door ${meet.createdByName}` : "📍 Geen actief meeting point",
    tents.length ? `⛺ Tent: ${tents.map((tent) => tent.displayName).join(", ")}` : "⛺ Nog geen tentplek opgeslagen",
  ];
  const target = mapMiniAppUrl(`room_${privateRoomToken(message.chat.id)}`);
  await sendMessage(message.chat.id, lines.join("\n"), {
    reply_markup: { inline_keyboard: [[{ text: "🗺 Open groepskaart", url: target }]] },
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

  if (callback && callbackData?.startsWith("m:")) {
    const anchor = await anchorFromShortKey(callbackData.slice(2));
    if (!anchor || !callback.message || !isGroupChat(callback.message.chat)) {
      await answerCallbackQuery(callback.id, "Meeting point niet gevonden.");
      return;
    }
    const room = groupRoom(callback.message.chat);
    const creatorName = displayTelegramUser(callback.from);
    await setGroupMeetPoint(room, {
      anchorId: anchor.id,
      name: anchor.name,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      createdBy: callback.from.id,
      createdByName: creatorName,
    });
    await answerCallbackQuery(callback.id, `${anchor.name} ingesteld`);
    const mentions = await knownMemberMentions(room, callback.from.id);
    const target = mapMiniAppUrl(`room_${privateRoomToken(callback.message.chat.id)}`);
    await sendMessage(
      callback.message.chat.id,
      [`📍 <b>Meeting point: ${escapeHtml(anchor.name)}</b>`, `door ${escapeHtml(creatorName)}`, mentions].filter(Boolean).join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🗺 Open op kaart", url: target }]] },
      },
    );
    return;
  }

  const message = update.message;
  if (!message?.text) return;
  const rawText = message.text.trim();

  if (rawText === "📅 Timetable") {
    await showTimetable(message.chat.id);
    return;
  }
  if (rawText === "🎵 Nu live") {
    await sendMessage(message.chat.id, formatCurrent());
    return;
  }
  if (rawText === "📍 Meet") {
    await chooseMeetingPoint(message);
    return;
  }
  if (rawText === "⛺ Tent") {
    await saveTentFromCurrentLocation(message);
    return;
  }
  if (rawText === "🗺 Kaart") {
    await sendMap(message.chat, false);
    return;
  }
  if (rawText === "👥 Groep") {
    await showGroupSummary(message);
    return;
  }

  const { command, args } = commandAndArgs(message.text);

  switch (command) {
    case "/start":
    case "/help":
      await sendMessage(message.chat.id, helpText(), { reply_markup: companionKeyboard() });
      break;
    case "/menu":
      await sendCompanionMenu(message.chat.id);
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
    case "/meet":
      await chooseMeetingPoint(message);
      break;
    case "/tent":
      await saveTentFromCurrentLocation(message);
      break;
    case "/map":
      await sendMap(message.chat, false);
      break;
    case "/mapadmin": {
      const userId = message.from?.id;
      if (!userId || !isMapAdmin(userId)) {
        await sendMessage(message.chat.id, "🔒 Kaartkalibratie is alleen beschikbaar voor de kaartbeheerder.");
        break;
      }
      await sendMap(message.chat, true);
      break;
    }
    case "/id": {
      const userId = message.from?.id;
      if (!userId) {
        await sendMessage(message.chat.id, "Ik kon je Telegram user ID niet uit dit bericht lezen.");
        break;
      }
      const adminHint = isMapAdmin(userId)
        ? "✅ Kaartbeheer is al actief voor dit account. Gebruik /mapadmin om ankers te plaatsen."
        : "Gebruik dit nummer in MAP_ADMIN_TELEGRAM_IDS om kalibratiemodus voor jezelf vrij te geven.";
      await sendMessage(message.chat.id, `🪪 Jouw Telegram user ID is:\n${userId}\n\n${adminHint}`);
      break;
    }
    default:
      if (command.startsWith("/")) {
        await sendMessage(message.chat.id, helpText(), { reply_markup: companionKeyboard() });
      }
  }
}
