import { formatCurrent } from "./bot-router";
import { formatSet, setsStartingWithin } from "./festival-time";
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

function isGroupChat(chat: TelegramChat): boolean {
  return chat.type === "group" || chat.type === "supergroup";
}

function groupRoom(chat: TelegramChat): string {
  return `g_${privateRoomToken(chat.id)}`;
}

function groupMapUrl(chat: TelegramChat): string {
  return mapMiniAppUrl(isGroupChat(chat) ? `room_${privateRoomToken(chat.id)}` : "map");
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

function companionInlineKeyboard(chat: TelegramChat) {
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
        { text: "🗺 Kaart", url: groupMapUrl(chat) },
        { text: "👥 Groep", callback_data: `${MENU_PREFIX}group` },
      ],
    ],
  };
}

async function showMenu(chat: TelegramChat): Promise<void> {
  const detail = isGroupChat(chat)
    ? "Groepsacties blijven in deze chat en gebruiken dezelfde Space Safari-room."
    : "Open dit menu in jullie festivalgroep voor Meet, Tent en groepsstatus.";
  await sendMessage(chat.id, `🪐 Space Companion\n${detail}`, {
    reply_markup: companionInlineKeyboard(chat),
  });
}

async function showTimetable(chat: TelegramChat): Promise<void> {
  const soon = setsStartingWithin(60).slice(0, 8);
  const extra = soon.length
    ? ["", "⏱ Binnen 60 min", ...soon.map((set) => formatSet(set))].join("\n")
    : "\n\n⏱ Binnen 60 minuten start geen nieuwe set.";
  await sendMessage(chat.id, `${formatCurrent()}${extra}`);
}

function shortAnchorKey(id: string): string {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

async function anchorFromShortKey(key: string) {
  const anchors = await listAnchors();
  return anchors.find((anchor) => shortAnchorKey(anchor.id) === key);
}

async function chooseMeetingPoint(chat: TelegramChat): Promise<void> {
  if (!isGroupChat(chat)) {
    await sendMessage(chat.id, "📍 Meeting points horen bij een groep. Open /menu vanuit jullie festivalgroep.");
    return;
  }
  const anchors = await listAnchors();
  if (!anchors.length) {
    await sendMessage(chat.id, "Er zijn nog geen kaartankers om als meeting point te gebruiken.");
    return;
  }
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let index = 0; index < Math.min(anchors.length, 10); index += 2) {
    rows.push(anchors.slice(index, index + 2).map((anchor) => ({
      text: `📍 ${anchor.name}`,
      callback_data: `${MEET_PREFIX}${shortAnchorKey(anchor.id)}`,
    })));
  }
  await sendMessage(chat.id, "📍 Waar spreken we af?", { reply_markup: { inline_keyboard: rows } });
}

async function knownMemberMentions(room: string, creatorId: number): Promise<string> {
  const members = (await listPresence(room)).filter((member) => member.userId !== creatorId).slice(0, 8);
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
  const room = groupRoom(chat);
  const current = (await listPresence(room)).find((member) => member.userId === user.id);
  if (!current) {
    await sendMessage(chat.id, "⛺ Deel eerst je locatie op de groepskaart en tik daarna opnieuw op Tent.", {
      reply_markup: { inline_keyboard: [[{ text: "🗺 Open groepskaart", url: groupMapUrl(chat) }]] },
    });
    return;
  }
  await saveGroupTentPoint(room, current);
  await sendMessage(chat.id, `⛺ Tentplek bijgewerkt voor ${displayTelegramUser(user)}.`, {
    reply_markup: { inline_keyboard: [[{ text: "🗺 Toon tent op kaart", url: groupMapUrl(chat) }]] },
  });
}

async function showGroupSummary(chat: TelegramChat): Promise<void> {
  if (!isGroupChat(chat)) {
    await sendMessage(chat.id, "👥 Open dit vanuit jullie festivalgroep voor groepsstatus.");
    return;
  }
  const room = groupRoom(chat);
  const [members, meet, tents] = await Promise.all([
    listPresence(room),
    getGroupMeetPoint(room),
    listGroupTentPoints(room),
  ]);
  const statuses = meet ? await getGroupMeetStatuses(room, meet.id) : [];
  const going = statuses.filter((status) => status.status === "going").length;
  const arrived = statuses.filter((status) => status.status === "arrived").length;
  const lines = [
    "👥 GROEP",
    `${members.length} zichtbare locatie${members.length === 1 ? "" : "s"}`,
    meet ? `📍 Meet: ${meet.name} · door ${meet.createdByName}` : "📍 Geen actief meeting point",
    meet ? `🚶 ${going} onderweg · ✅ ${arrived} aangekomen` : null,
    tents.length ? `⛺ Tent: ${tents.map((tent) => tent.displayName).join(", ")}` : "⛺ Nog geen tentplek opgeslagen",
  ].filter((line): line is string => Boolean(line));
  await sendMessage(chat.id, lines.join("\n"), {
    reply_markup: { inline_keyboard: [[{ text: "🗺 Open groepskaart", url: groupMapUrl(chat) }]] },
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
  const saved = await setGroupMeetStatus(groupRoom(chat), meetId, user, status);
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
  const anchor = await anchorFromShortKey(anchorKey);
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
  });
  await answerCallbackQuery(callbackId, `${anchor.name} ingesteld`);
  const mentions = await knownMemberMentions(room, user.id);
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
        [{ text: "🗺 Open op kaart", url: groupMapUrl(chat) }],
      ],
    },
  });
}

async function handleMenuCallback(action: string, chat: TelegramChat, user: TelegramUser, callbackId: string): Promise<void> {
  await answerCallbackQuery(callbackId);
  switch (action) {
    case "timetable":
      await showTimetable(chat);
      return;
    case "live":
      await sendMessage(chat.id, formatCurrent());
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

  if (command === "/start" || command === "/help" || command === "/menu") {
    await showMenu(message.chat);
    return true;
  }
  if (command === "/timetable" || raw === "📅 Timetable") {
    await showTimetable(message.chat);
    return true;
  }
  if (command === "/live" || raw === "🎵 Nu live") {
    await sendMessage(message.chat.id, formatCurrent());
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

  return false;
}
