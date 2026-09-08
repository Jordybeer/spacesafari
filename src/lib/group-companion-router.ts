import { formatCurrent } from "./bot-router";
import { festivalMapStartParam, getFestivalForChat, isFestivalChatDisabled } from "./festival-store";
import { DEFAULT_FESTIVAL_ID, type FestivalDefinition } from "./festivals";
import { formatSet, setsStartingWithin } from "./festival-time";
import {
  currentScheduleSets,
  festivalScheduleHasEnded,
  findFestivalSchedule,
  formatScheduleEntry,
  getFestivalSchedule,
  nextScheduleSets,
  performerEntries,
  scheduleTime,
  upcomingScheduleSets,
  type FestivalScheduleEntry,
} from "./festival-schedule";
import {
  getGroupMeetPoint,
  getGroupMeetStatuses,
  listGroupTentPoints,
  saveGroupTentPoint,
  setGroupMeetPoint,
  setGroupMeetStatus,
  type GroupMeetStatus,
} from "./group-tools";
import { listAnchors, listPresence, privateRoomToken } from "./map-model";
import { createPing, deletePing, listPings } from "./pings";
import {
  answerCallbackQuery,
  mapMiniAppUrl,
  sendMessage,
  type TelegramChat,
  type TelegramUpdate,
  type TelegramUser,
} from "./telegram";

const MENU_PREFIX = "gc:";
const MEET_PREFIX = "gm:";
const STATUS_PREFIX = "gs:";
const PING_PREFIX = "gcp:";

function isGroupChat(chat: TelegramChat): boolean {
  return chat.type === "group" || chat.type === "supergroup";
}

function groupRoom(chat: TelegramChat): string {
  return `g_${privateRoomToken(chat.id)}`;
}

function groupMapUrl(chat: TelegramChat, festival: FestivalDefinition): string {
  const roomToken = isGroupChat(chat) ? privateRoomToken(chat.id) : undefined;
  return mapMiniAppUrl(festivalMapStartParam(festival, roomToken));
}

function displayTelegramUser(user: TelegramUser | undefined): string {
  if (!user) return "iemand";
  return user.username ? `@${user.username}` : [user.first_name, user.last_name].filter(Boolean).join(" ") || "iemand";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function commandFromText(text: string): string {
  const [raw = ""] = text.trim().split(/\s+/);
  return raw.split("@")[0].toLowerCase();
}

function commandArgs(text: string): string {
  return text.trim().split(/\s+/).slice(1).join(" ").trim();
}

const GROUP_COMMANDS = new Set([
  "/start", "/help", "/menu", "/timetable", "/live", "/meet", "/tent", "/group", "/map",
  "/mapadmin", "/wie", "/straks", "/programma", "/ping", "/pings", "/unping",
]);

function isGinderCallback(data?: string): boolean {
  return Boolean(data && /^(?:p:|m:|gc:|gm:|gs:|gcp:)/.test(data));
}

function companionInlineKeyboard(chat: TelegramChat, festival: FestivalDefinition) {
  return {
    inline_keyboard: [
      [
        { text: "📅 Timetable", callback_data: `${MENU_PREFIX}timetable` },
        { text: "🎵 Nu live", callback_data: `${MENU_PREFIX}live` },
      ],
      [
        { text: "📍 Meet", callback_data: `${MENU_PREFIX}meet` },
        { text: "⛺ Tent", callback_data: `${MENU_PREFIX}tent` },
      ],
      [
        { text: "🗺 Kaart", url: groupMapUrl(chat, festival) },
        { text: "👥 Groep", callback_data: `${MENU_PREFIX}group` },
      ],
    ],
  };
}

async function showMenu(chat: TelegramChat): Promise<void> {
  const festival = await getFestivalForChat(chat.id);
  const detail = isGroupChat(chat)
    ? `${festival.name} ${festival.year} · acties voor deze groep.`
    : "Open dit menu in jullie festivalgroep voor Meet, Tent en groepsstatus.";
  await sendMessage(chat.id, `📍 Ginder\n${detail}`, {
    reply_markup: companionInlineKeyboard(chat, festival),
  });
}

function compactSchedule(entry: FestivalScheduleEntry, timezone: string): string {
  return formatScheduleEntry(entry, timezone).replace("\n", " · ");
}

function customCurrentText(festival: FestivalDefinition, schedule: FestivalScheduleEntry[]): string {
  const current = currentScheduleSets(schedule, festival.timezone);
  if (current.length) {
    return ["🎧 NU", ...current.map((entry) => formatScheduleEntry(entry, festival.timezone))].join("\n\n");
  }
  if (festivalScheduleHasEnded(schedule, festival.timezone)) return `🌙 ${festival.name} is afgelopen.`;
  const next = nextScheduleSets(schedule, festival.timezone);
  if (!next.length) return "Er draait momenteel niets en ik vind geen volgende set.";
  return ["🎧 Even stilte · hierna", ...next.map((entry) => compactSchedule(entry, festival.timezone))].join("\n");
}

async function showTimetable(chat: TelegramChat): Promise<void> {
  const festival = await getFestivalForChat(chat.id);
  if (festival.id === DEFAULT_FESTIVAL_ID) {
    const soon = setsStartingWithin(60).slice(0, 8);
    const extra = soon.length
      ? ["", "⏱ Binnen 60 min", ...soon.map((set) => formatSet(set))].join("\n")
      : "\n\n⏱ Binnen 60 minuten start geen nieuwe set.";
    await sendMessage(chat.id, `${formatCurrent()}${extra}`);
    return;
  }

  const schedule = await getFestivalSchedule(festival);
  if (!performerEntries(schedule).length) {
    await sendMessage(chat.id, `📅 De timetable voor ${festival.name} is nog niet ingesteld in Ginder.`);
    return;
  }
  const soon = upcomingScheduleSets(schedule, festival.timezone, 60).slice(0, 8);
  const extra = soon.length
    ? ["", "⏱ Binnen 60 min", ...soon.map((entry) => compactSchedule(entry, festival.timezone))].join("\n")
    : "\n\n⏱ Binnen 60 minuten start geen nieuwe set.";
  await sendMessage(chat.id, `${customCurrentText(festival, schedule)}${extra}`);
}

async function showLive(chat: TelegramChat): Promise<void> {
  const festival = await getFestivalForChat(chat.id);
  if (festival.id === DEFAULT_FESTIVAL_ID) {
    await sendMessage(chat.id, formatCurrent());
    return;
  }
  const schedule = await getFestivalSchedule(festival);
  if (!performerEntries(schedule).length) {
    await sendMessage(chat.id, `🎵 De timetable voor ${festival.name} is nog niet ingesteld.`);
    return;
  }
  await sendMessage(chat.id, customCurrentText(festival, schedule));
}

async function showCustomSoon(chat: TelegramChat, festival: FestivalDefinition): Promise<void> {
  const schedule = await getFestivalSchedule(festival);
  const soon = upcomingScheduleSets(schedule, festival.timezone, 60).slice(0, 12);
  await sendMessage(chat.id, soon.length
    ? ["⏱ Binnen 60 min", ...soon.map((entry) => compactSchedule(entry, festival.timezone))].join("\n")
    : "⏱ Binnen 60 minuten start geen nieuwe set.");
}

async function showCustomProgram(chat: TelegramChat, festival: FestivalDefinition, query: string): Promise<void> {
  if (!query) {
    await sendMessage(chat.id, "Gebruik: /programma <artiest>");
    return;
  }
  const schedule = await getFestivalSchedule(festival);
  const matches = findFestivalSchedule(schedule, query).slice(0, 8);
  if (!matches.length) {
    await sendMessage(chat.id, `Geen artiest gevonden voor “${query}”.`);
    return;
  }
  await sendMessage(chat.id, matches.map((entry) => formatScheduleEntry(entry, festival.timezone)).join("\n\n"));
}

function shortKey(id: string): string {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

async function customSetFromShortKey(key: string, festival: FestivalDefinition): Promise<FestivalScheduleEntry | undefined> {
  const schedule = await getFestivalSchedule(festival);
  return performerEntries(schedule).find((entry) => shortKey(entry.id) === key);
}

async function createAndConfirmCustomPing(
  chat: TelegramChat,
  festival: FestivalDefinition,
  entry: FestivalScheduleEntry,
): Promise<void> {
  const { ping, duplicate } = await createPing(String(chat.id), entry, festival.id, festival.timezone);
  const notify = scheduleTime(ping.notifyAt, festival.timezone).toFormat("HH:mm");
  await sendMessage(chat.id, [
    duplicate ? "🔔 Deze ping stond al ingesteld" : "🔔 Ping ingesteld",
    "",
    entry.artist,
    `${entry.stage} • ${scheduleTime(entry.startsAt, festival.timezone).toFormat("HH:mm")}–${scheduleTime(entry.endsAt, festival.timezone).toFormat("HH:mm")}`,
    duplicate ? `Melding om ${notify}.` : `Ik stuur om ${notify} een bericht.`,
  ].join("\n"));
}

async function pingCustomArtist(chat: TelegramChat, festival: FestivalDefinition, query: string): Promise<void> {
  if (!query) {
    await sendMessage(chat.id, "Gebruik: /ping <artiest>");
    return;
  }
  const schedule = await getFestivalSchedule(festival);
  const candidates = findFestivalSchedule(schedule, query)
    .filter((entry) => Date.parse(entry.startsAt) > Date.now())
    .slice(0, 8);
  if (!candidates.length) {
    await sendMessage(chat.id, `Geen toekomstige set gevonden voor “${query}”.`);
    return;
  }
  if (candidates.length > 1) {
    await sendMessage(chat.id, "Welke set bedoel je?", {
      reply_markup: {
        inline_keyboard: candidates.map((entry) => [{
          text: `${entry.artist} · ${entry.stage} ${scheduleTime(entry.startsAt, festival.timezone).toFormat("HH:mm")}`,
          callback_data: `${PING_PREFIX}${shortKey(entry.id)}`,
        }]),
      },
    });
    return;
  }
  await createAndConfirmCustomPing(chat, festival, candidates[0]);
}

async function listCustomPings(chat: TelegramChat, festival: FestivalDefinition): Promise<void> {
  const pings = await listPings(String(chat.id), festival.id);
  if (!pings.length) {
    await sendMessage(chat.id, "🔕 Geen actieve artiestpings.");
    return;
  }
  const schedule = await getFestivalSchedule(festival);
  const byId = new Map(performerEntries(schedule).map((entry) => [entry.id, entry]));
  const lines = pings.map((ping) => {
    const entry = byId.get(ping.artistSetId);
    return entry
      ? `🔔 ${entry.artist} · ${entry.stage} · ${scheduleTime(entry.startsAt, festival.timezone).toFormat("HH:mm")}`
      : null;
  }).filter((line): line is string => Boolean(line));
  await sendMessage(chat.id, lines.length ? ["Je actieve pings:", "", ...lines].join("\n") : "🔕 Geen actieve artiestpings.");
}

async function unpingCustomArtist(chat: TelegramChat, festival: FestivalDefinition, query: string): Promise<void> {
  if (!query) {
    await sendMessage(chat.id, "Gebruik: /unping <artiest>");
    return;
  }
  const [pings, schedule] = await Promise.all([
    listPings(String(chat.id), festival.id),
    getFestivalSchedule(festival),
  ]);
  const q = query.trim().toLocaleLowerCase();
  const byId = new Map(performerEntries(schedule).map((entry) => [entry.id, entry]));
  const matches = pings.filter((ping) => {
    const entry = byId.get(ping.artistSetId);
    return entry ? entry.artist.toLocaleLowerCase().includes(q) || q.includes(entry.artist.toLocaleLowerCase()) : false;
  });
  if (!matches.length) {
    await sendMessage(chat.id, `Geen actieve ping gevonden voor “${query}”.`);
    return;
  }
  await Promise.all(matches.map((ping) => deletePing(String(chat.id), ping.artistSetId, festival.id)));
  await sendMessage(chat.id, `🔕 ${matches.length} ping${matches.length === 1 ? "" : "s"} verwijderd.`);
}

async function handleCustomPingCallback(
  callbackId: string,
  chat: TelegramChat,
  key: string,
): Promise<void> {
  const festival = await getFestivalForChat(chat.id);
  if (festival.id === DEFAULT_FESTIVAL_ID) {
    await answerCallbackQuery(callbackId, "Deze ping hoort niet bij dit festival.");
    return;
  }
  const entry = await customSetFromShortKey(key, festival);
  if (!entry || Date.parse(entry.startsAt) <= Date.now()) {
    await answerCallbackQuery(callbackId, "Deze set is niet meer beschikbaar.");
    return;
  }
  await answerCallbackQuery(callbackId, "Ping instellen…");
  await createAndConfirmCustomPing(chat, festival, entry);
}

async function anchorFromShortKey(key: string, festivalId: string) {
  const anchors = await listAnchors(festivalId);
  return anchors.find((anchor) => shortKey(anchor.id) === key);
}

async function chooseMeetingPoint(chat: TelegramChat): Promise<void> {
  if (!isGroupChat(chat)) {
    await sendMessage(chat.id, "📍 Meeting points horen bij een groep. Open /menu vanuit jullie festivalgroep.");
    return;
  }
  const festival = await getFestivalForChat(chat.id);
  const anchors = await listAnchors(festival.id);
  if (!anchors.length) {
    await sendMessage(chat.id, `Er zijn nog geen kaartankers voor ${festival.name}.`);
    return;
  }
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let index = 0; index < Math.min(anchors.length, 10); index += 2) {
    rows.push(anchors.slice(index, index + 2).map((anchor) => ({
      text: `📍 ${anchor.name}`,
      callback_data: `${MEET_PREFIX}${shortKey(anchor.id)}`,
    })));
  }
  await sendMessage(chat.id, "📍 Waar spreken we af?", { reply_markup: { inline_keyboard: rows } });
}

async function knownMemberMentions(room: string, creatorId: number, festivalId: string): Promise<string> {
  const members = (await listPresence(room, festivalId)).filter((member) => member.userId !== creatorId).slice(0, 8);
  return members.map((member) => member.username
    ? `@${escapeHtml(member.username)}`
    : `<a href="tg://user?id=${member.userId}">${escapeHtml(member.displayName)}</a>`).join(" ");
}

async function saveTentFromCurrentLocation(chat: TelegramChat, user: TelegramUser | undefined): Promise<void> {
  if (!isGroupChat(chat)) {
    await sendMessage(chat.id, "⛺ Tentplekken horen bij een groep. Open /menu vanuit jullie festivalgroep.");
    return;
  }
  if (!user) return;
  const festival = await getFestivalForChat(chat.id);
  const room = groupRoom(chat);
  const current = (await listPresence(room, festival.id)).find((member) => member.userId === user.id);
  if (!current) {
    await sendMessage(chat.id, "⛺ Deel eerst je locatie op de groepskaart en tik daarna opnieuw op Tent.", {
      reply_markup: { inline_keyboard: [[{ text: "🗺 Open groepskaart", url: groupMapUrl(chat, festival) }]] },
    });
    return;
  }
  await saveGroupTentPoint(room, current, festival.id);
  await sendMessage(chat.id, `⛺ Tentplek bijgewerkt voor ${displayTelegramUser(user)}.`, {
    reply_markup: { inline_keyboard: [[{ text: "🗺 Toon tent op kaart", url: groupMapUrl(chat, festival) }]] },
  });
}

async function showGroupSummary(chat: TelegramChat): Promise<void> {
  if (!isGroupChat(chat)) {
    await sendMessage(chat.id, "👥 Open dit vanuit jullie festivalgroep voor groepsstatus.");
    return;
  }
  const festival = await getFestivalForChat(chat.id);
  const room = groupRoom(chat);
  const [members, meet, tents] = await Promise.all([
    listPresence(room, festival.id),
    getGroupMeetPoint(room, festival.id),
    listGroupTentPoints(room, festival.id),
  ]);
  const statuses = meet ? await getGroupMeetStatuses(room, meet.id, festival.id) : [];
  const going = statuses.filter((status) => status.status === "going").length;
  const arrived = statuses.filter((status) => status.status === "arrived").length;
  const lines = [
    `👥 ${festival.name.toUpperCase()}`,
    `${members.length} zichtbare locatie${members.length === 1 ? "" : "s"}`,
    meet ? `📍 Meet: ${meet.name} · door ${meet.createdByName}` : "📍 Geen actief meeting point",
    meet ? `🚶 ${going} onderweg · ✅ ${arrived} aangekomen` : null,
    tents.length ? `⛺ Tent: ${tents.map((tent) => tent.displayName).join(", ")}` : "⛺ Nog geen tentplek opgeslagen",
  ].filter((line): line is string => Boolean(line));
  await sendMessage(chat.id, lines.join("\n"), {
    reply_markup: { inline_keyboard: [[{ text: "🗺 Open groepskaart", url: groupMapUrl(chat, festival) }]] },
  });
}

async function setMeetingStatus(
  callbackId: string,
  chat: TelegramChat,
  user: TelegramUser,
  meetId: string,
  status: GroupMeetStatus,
): Promise<void> {
  if (!isGroupChat(chat)) {
    await answerCallbackQuery(callbackId, "Deze status hoort bij een groepsafspraak.");
    return;
  }
  const festival = await getFestivalForChat(chat.id);
  const saved = await setGroupMeetStatus(groupRoom(chat), meetId, user, status, festival.id);
  if (!saved) {
    await answerCallbackQuery(callbackId, "Deze afspraak is verlopen of vervangen.");
    return;
  }
  await answerCallbackQuery(callbackId, status === "arrived" ? "✅ Aangekomen" : "🚶 Onderweg");
}

async function createMeetingFromAnchor(
  callbackId: string,
  chat: TelegramChat,
  user: TelegramUser,
  anchorKey: string,
): Promise<void> {
  if (!isGroupChat(chat)) {
    await answerCallbackQuery(callbackId, "Meeting points horen bij een groep.");
    return;
  }
  const festival = await getFestivalForChat(chat.id);
  const anchor = await anchorFromShortKey(anchorKey, festival.id);
  if (!anchor) {
    await answerCallbackQuery(callbackId, "Meeting point niet gevonden.");
    return;
  }
  const room = groupRoom(chat);
  const creatorName = displayTelegramUser(user);
  const meet = await setGroupMeetPoint(room, {
    anchorId: anchor.id,
    name: anchor.name,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    createdBy: user.id,
    createdByName: creatorName,
  }, festival.id);
  await answerCallbackQuery(callbackId, `${anchor.name} ingesteld`);
  const mentions = await knownMemberMentions(room, user.id, festival.id);
  await sendMessage(chat.id, [
    `📍 <b>Meeting point: ${escapeHtml(anchor.name)}</b>`,
    `door ${escapeHtml(creatorName)} · blijft 2 uur actief`,
    mentions,
  ].filter(Boolean).join("\n"), {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🚶 Onderweg", callback_data: `${STATUS_PREFIX}${meet.id}:g` },
          { text: "✅ Aangekomen", callback_data: `${STATUS_PREFIX}${meet.id}:a` },
        ],
        [{ text: "🗺 Open op kaart", url: groupMapUrl(chat, festival) }],
      ],
    },
  });
}

async function sendMapLink(chat: TelegramChat): Promise<void> {
  const festival = await getFestivalForChat(chat.id);
  await sendMessage(chat.id, `🗺 ${festival.name} kaart`, {
    reply_markup: { inline_keyboard: [[{ text: "🗺 Open kaart", url: groupMapUrl(chat, festival) }]] },
  });
}

async function handleMenuCallback(action: string, chat: TelegramChat, user: TelegramUser, callbackId: string): Promise<void> {
  await answerCallbackQuery(callbackId);
  switch (action) {
    case "timetable":
      await showTimetable(chat);
      return;
    case "live":
      await showLive(chat);
      return;
    case "meet":
      await chooseMeetingPoint(chat);
      return;
    case "tent":
      await saveTentFromCurrentLocation(chat, user);
      return;
    case "group":
      await showGroupSummary(chat);
      return;
    default:
      await showMenu(chat);
  }
}

export async function routeGroupCompanionUpdate(update: TelegramUpdate): Promise<boolean> {
  const callback = update.callback_query;
  if (
    callback?.message
    && isGroupChat(callback.message.chat)
    && isGinderCallback(callback.data)
    && await isFestivalChatDisabled(callback.message.chat.id)
  ) {
    await answerCallbackQuery(callback.id, "Deze groep is niet meer gekoppeld aan Ginder.");
    return true;
  }
  if (
    callback?.message
    && isGroupChat(callback.message.chat)
    && callback.data
    && /^(?:p|m):/.test(callback.data)
  ) {
    const festival = await getFestivalForChat(callback.message.chat.id);
    if (festival.id !== DEFAULT_FESTIVAL_ID) {
      await answerCallbackQuery(callback.id, "Deze oude knop hoort bij een ander festival.");
      return true;
    }
  }
  if (callback?.message && callback.data?.startsWith(PING_PREFIX)) {
    await handleCustomPingCallback(callback.id, callback.message.chat, callback.data.slice(PING_PREFIX.length));
    return true;
  }
  if (callback?.message && callback.data?.startsWith(MENU_PREFIX)) {
    await handleMenuCallback(callback.data.slice(MENU_PREFIX.length), callback.message.chat, callback.from, callback.id);
    return true;
  }
  if (callback?.message && callback.data?.startsWith(MEET_PREFIX)) {
    await createMeetingFromAnchor(callback.id, callback.message.chat, callback.from, callback.data.slice(MEET_PREFIX.length));
    return true;
  }
  if (callback?.message && callback.data?.startsWith(STATUS_PREFIX)) {
    const [meetId, statusCode] = callback.data.slice(STATUS_PREFIX.length).split(":");
    if (!meetId || (statusCode !== "g" && statusCode !== "a")) {
      await answerCallbackQuery(callback.id, "Ongeldige status.");
      return true;
    }
    await setMeetingStatus(callback.id, callback.message.chat, callback.from, meetId, statusCode === "a" ? "arrived" : "going");
    return true;
  }

  const message = update.message;
  if (!message?.text) return false;
  const raw = message.text.trim();
  const command = commandFromText(raw);

  if (
    isGroupChat(message.chat)
    && (GROUP_COMMANDS.has(command) || ["📅 Timetable", "🎵 Nu live", "📍 Meet", "⛺ Tent", "👥 Groep", "🗺 Kaart"].includes(raw))
    && await isFestivalChatDisabled(message.chat.id)
  ) {
    await sendMessage(message.chat.id, "Deze groep is niet meer gekoppeld aan Ginder. De festivalmaker kan een groep koppelen via /festival in privé.");
    return true;
  }

  if (command === "/start" || command === "/help" || command === "/menu") {
    await showMenu(message.chat);
    return true;
  }
  if (command === "/timetable" || raw === "📅 Timetable") {
    await showTimetable(message.chat);
    return true;
  }
  if (command === "/live" || raw === "🎵 Nu live") {
    await showLive(message.chat);
    return true;
  }
  if (command === "/meet" || raw === "📍 Meet") {
    await chooseMeetingPoint(message.chat);
    return true;
  }
  if (command === "/tent" || raw === "⛺ Tent") {
    await saveTentFromCurrentLocation(message.chat, message.from);
    return true;
  }
  if (command === "/group" || raw === "👥 Groep") {
    await showGroupSummary(message.chat);
    return true;
  }
  if (command === "/map" || raw === "🗺 Kaart") {
    await sendMapLink(message.chat);
    return true;
  }

  if (command === "/mapadmin" && isGroupChat(message.chat)) {
    const festival = await getFestivalForChat(message.chat.id);
    if (festival.id !== DEFAULT_FESTIVAL_ID) {
      await sendMessage(
        message.chat.id,
        `⚙️ Beheer de kaart van ${festival.name} via /festival in een privégesprek met Ginder.`,
      );
      return true;
    }
  }

  if (isGroupChat(message.chat) && ["/wie", "/straks", "/programma", "/ping", "/pings", "/unping"].includes(command)) {
    const festival = await getFestivalForChat(message.chat.id);
    if (festival.id !== DEFAULT_FESTIVAL_ID) {
      if (command === "/wie") {
        await showLive(message.chat);
        return true;
      }
      if (command === "/straks") {
        await showCustomSoon(message.chat, festival);
        return true;
      }
      if (command === "/programma") {
        await showCustomProgram(message.chat, festival, commandArgs(raw));
        return true;
      }
      if (command === "/ping") {
        await pingCustomArtist(message.chat, festival, commandArgs(raw));
        return true;
      }
      if (command === "/pings") {
        await listCustomPings(message.chat, festival);
        return true;
      }
      if (command === "/unping") {
        await unpingCustomArtist(message.chat, festival, commandArgs(raw));
        return true;
      }
    }
  }

  return false;
}
