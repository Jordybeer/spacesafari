import {
  beginFestivalMapUpload,
  beginFestivalNamePrompt,
  claimCreationSlot,
  clearFestivalMapUpload,
  clearPendingFestival,
  consumeFestivalNamePrompt,
  createPendingFestival,
  FestivalChatAlreadyLinkedError,
  festivalMapStartParam,
  finalizePendingFestival,
  getCreationCooldownSeconds,
  getCurrentFestivalForOwner,
  getFestivalAwaitingMapUpload,
  getFestivalsForOwner,
  getPendingFestival,
  issueFestivalSetupToken,
  replacePersistedFestivalMap,
  releaseCreationSlot,
  selectFestivalForOwner,
  setupUrl,
  updatePersistedFestival,
  type PendingFestivalCreation,
  type PersistedFestival,
} from "./festival-store";
import { privateRoomToken } from "./map-model";
import {
  answerCallbackQuery,
  createChatInviteLink,
  mapMiniAppUrl,
  sendMessage,
  type TelegramChat,
  type TelegramMessage,
  type TelegramUpdate,
} from "./telegram";

const OWNER_SELECT_PREFIX = "fo:";
const OWNER_MAP_PREFIX = "fomap:";

function commandAndArgs(text: string): { command: string; args: string } {
  const [raw = "", ...rest] = text.trim().split(/\s+/);
  return { command: raw.split("@")[0].toLowerCase(), args: rest.join(" ").trim() };
}

function isPrivate(chat: TelegramChat): boolean {
  return chat.type === "private";
}

function parseFestivalNameAndYear(value: string): { name: string; year: number } {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const match = trimmed.match(/(?:^|\s)(20\d{2}|21\d{2})$/);
  const year = match ? Number(match[1]) : new Date().getFullYear();
  const name = match ? trimmed.slice(0, match.index).trim() : trimmed;
  return { name: name.slice(0, 80), year };
}

export function cooldownText(seconds: number): string {
  const hours = Math.max(1, Math.ceil(seconds / 3600));
  if (hours < 24) return `${hours} uur`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  const dayText = `${days} dag${days === 1 ? "" : "en"}`;
  return remainingHours ? `${dayText} en ${remainingHours} uur` : dayText;
}

function statusText(festival: PersistedFestival): string {
  switch (festival.status) {
    case "map": return "Kaart + terrein nog instellen";
    case "anchors": return "Kaart ontvangen · terrein + ankers nog afwerken";
    case "timetable": return "Kaart + ankers klaar · timetable nog instellen";
    case "ready": return "Klaar voor gebruik";
    default: return "Setup nog niet gestart";
  }
}

function adminRights() {
  return {
    is_anonymous: false,
    can_manage_chat: true,
    can_delete_messages: false,
    can_manage_video_chats: false,
    can_restrict_members: false,
    can_promote_members: false,
    can_change_info: false,
    can_invite_users: true,
    can_post_stories: false,
    can_edit_stories: false,
    can_delete_stories: false,
    can_pin_messages: false,
    can_manage_topics: false,
    can_manage_tags: false,
    can_send_welcome_messages: false,
  };
}

async function askForGroup(chatId: number, pending: PendingFestivalCreation): Promise<void> {
  const rights = adminRights();
  await sendMessage(
    chatId,
    [
      `📍 ${pending.name} ${pending.year}`,
      "",
      "Kies nu de Telegram-groep die bij dit festival hoort.",
      "Heb je er nog geen? Maak eerst even een gewone groep in Telegram en kom dan terug naar deze knop.",
    ].join("\n"),
    {
      reply_markup: {
        keyboard: [[{
          text: "👥 Kies festivalgroep",
          request_chat: {
            request_id: pending.requestId,
            chat_is_channel: false,
            chat_is_created: true,
            user_administrator_rights: rights,
            bot_administrator_rights: rights,
            request_title: true,
            request_username: true,
          },
        }]],
        resize_keyboard: true,
        one_time_keyboard: true,
        input_field_placeholder: "Kies je festivalgroep…",
      },
    },
  );
}

async function showOwnerFestival(message: TelegramMessage, current: PersistedFestival): Promise<void> {
  const userId = message.from!.id;
  const { festival, setupToken } = await issueFestivalSetupToken(current.id);
  const configUrl = setupUrl(festival, setupToken);
  const roomToken = festival.chatId === null ? undefined : privateRoomToken(festival.chatId);
  const mapUrl = mapMiniAppUrl(festivalMapStartParam(festival, roomToken));
  const cooldown = await getCreationCooldownSeconds(userId);
  const rows: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [
    [{ text: festival.status === "ready" ? "⚙️ Festival beheren" : "⚙️ Setup verderzetten", url: configUrl }],
  ];
  if (festival.mapImageUrl) rows.push([{ text: "🗺 Open kaart", url: mapUrl }]);
  if (festival.inviteLink) rows.push([{ text: "👥 Open festivalgroep", url: festival.inviteLink }]);
  if (festival.mapImageUrl) rows.push([{
    text: "🖼 Kaart vervangen",
    callback_data: `${OWNER_MAP_PREFIX}${festival.publicKey}`,
  }]);

  const newFestivalLine = cooldown > 0
    ? `Je kunt over ${cooldownText(cooldown)} weer een nieuw festival aanmaken.`
    : "Nog eentje maken? /festival nieuw <naam> <jaar>";

  await sendMessage(message.chat.id, [
    `📍 ${festival.name} ${festival.year}`,
    statusText(festival),
    festival.chatTitle ? `Groep: ${festival.chatTitle}` : null,
    "",
    "Wisselen tussen je festivals: /festival lijst",
    newFestivalLine,
  ].filter((line): line is string => Boolean(line)).join("\n"), {
    reply_markup: { inline_keyboard: rows },
  });
}

async function showCurrentFestival(message: TelegramMessage): Promise<boolean> {
  const userId = message.from?.id;
  if (!userId || !isPrivate(message.chat)) return false;
  const current = await getCurrentFestivalForOwner(userId);
  if (!current) return false;
  await showOwnerFestival(message, current);
  return true;
}

async function showOwnedFestivals(message: TelegramMessage): Promise<void> {
  const userId = message.from?.id;
  if (!userId || !isPrivate(message.chat)) return;
  const festivals = await getFestivalsForOwner(userId);
  if (!festivals.length) {
    await sendMessage(message.chat.id, "Je hebt nog geen festival in Ginder. Gebruik /festival om er eentje te maken.");
    return;
  }
  if (festivals.length === 1) {
    await showOwnerFestival(message, festivals[0]);
    return;
  }
  await sendMessage(message.chat.id, "Welk festival wil je beheren?", {
    reply_markup: {
      inline_keyboard: festivals.map((festival) => [{
        text: `${festival.name} ${festival.year} · ${statusText(festival)}`,
        callback_data: `${OWNER_SELECT_PREFIX}${festival.publicKey}`,
      }]),
    },
  });
}

async function requestFestivalMap(message: TelegramMessage, festival: PersistedFestival): Promise<void> {
  await beginFestivalMapUpload(message.from!.id, festival.id);
  await sendMessage(message.chat.id, [
    `Stuur nu de ${festival.mapImageUrl ? "nieuwe " : ""}festivalkaart voor ${festival.name} als foto of afbeeldingsbestand.`,
    festival.mapImageUrl
      ? "Zodra ik ze ontvang, verwijder ik de oude ankers. Daarna stel je die opnieuw in op de nieuwe kaart."
      : "Liefst het originele bestand of de hoogste resolutie die je hebt.",
    "",
    "Toch niet? /festival cancel",
  ].join("\n"));
}

async function startFestivalCreation(message: TelegramMessage, rawName: string): Promise<void> {
  const userId = message.from?.id;
  if (!userId) return;
  if (!isPrivate(message.chat)) {
    const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
    const url = username ? `https://t.me/${username}?start=festival` : undefined;
    await sendMessage(message.chat.id, "Nieuwe festivals maak je in privé met Ginder.", {
      ...(url ? { reply_markup: { inline_keyboard: [[{ text: "📍 Open Ginder privé", url }]] } } : {}),
    });
    return;
  }

  const cooldown = await getCreationCooldownSeconds(userId);
  if (cooldown > 0) {
    await sendMessage(
      message.chat.id,
      `Je hebt deze week al een festival aangemaakt. Je kunt over ${cooldownText(cooldown)} weer een nieuwe aanmaken.`,
    );
    return;
  }

  if (!rawName.trim()) {
    await beginFestivalNamePrompt(userId);
    await sendMessage(message.chat.id, "Hoe heet het festival? Stuur gewoon de naam, eventueel met het jaar erachter.", {
      reply_markup: { force_reply: true, input_field_placeholder: "bv. Horst 2027" },
    });
    return;
  }

  const { name, year } = parseFestivalNameAndYear(rawName);
  if (!name) {
    await sendMessage(message.chat.id, "Ik mis nog een festivalnaam.");
    return;
  }
  const pending = await createPendingFestival(userId, name, year);
  await askForGroup(message.chat.id, pending);
}

export async function onboardingMessages(festival: PersistedFestival): Promise<void> {
  if (festival.chatId === null) return;
  const roomToken = privateRoomToken(festival.chatId);
  const mapUrl = mapMiniAppUrl(festivalMapStartParam(festival, roomToken));

  await sendMessage(festival.chatId, [
    `👋 Welkom bij Ginder voor ${festival.name} ${festival.year}.`,
    "",
    "Deze groep is nu gekoppeld. De maker beheert de festivalsetup privé; Ginder gebruikt hier alleen de rechten die nodig zijn voor de festivaltools.",
  ].join("\n"));

  await sendMessage(festival.chatId, [
    "🗺 De maker zet eerst de kaart klaar:",
    "1. Festivalkaart privé naar Ginder sturen. Liefst het originele bestand / de hoogste resolutie.",
    "2. Terreincentrum en liefst 4–6 vaste, goed verspreide ankers instellen. Twee werkt technisch, meer is stabieler.",
    "3. Daarna komt de timetable aan de beurt.",
  ].join("\n"), {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🗺 Open kaart", url: mapUrl }],
      ],
    },
  });

  const inviteText = festival.inviteLink
    ? `Nodig de rest maar uit: ${festival.inviteLink}`
    : "Nodig de rest maar uit via de groepsinfo. De invite-link kon ik niet zelf aanmaken, maar de groep is wel gekoppeld.";
  await sendMessage(festival.chatId, `👥 ${inviteText}\n\nVanaf hier mogen jullie elkaar weer gewoon kwijtraken.`);
}

async function finishGroupLink(message: TelegramMessage): Promise<void> {
  const userId = message.from?.id;
  const shared = message.chat_shared;
  if (!userId || !shared || !isPrivate(message.chat)) return;

  const pending = await getPendingFestival(userId);
  if (!pending || pending.requestId !== shared.request_id) {
    await sendMessage(message.chat.id, "Die groepskeuze hoort niet meer bij een actieve festivalsetup. Gebruik /festival opnieuw.", {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  if (!(await claimCreationSlot(userId))) {
    await clearPendingFestival(userId);
    const cooldown = await getCreationCooldownSeconds(userId);
    await sendMessage(message.chat.id, `Je 7-dagenlimiet is intussen actief. Je kunt over ${cooldownText(cooldown)} weer een nieuwe aanmaken.`, {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  let created: Awaited<ReturnType<typeof finalizePendingFestival>> | null = null;
  try {
    created = await finalizePendingFestival(pending, { id: shared.chat_id, title: shared.title });
    let festival = created.festival;
    try {
      const invite = await createChatInviteLink(shared.chat_id, `Ginder · ${festival.name}`);
      festival = await updatePersistedFestival(festival.id, { inviteLink: invite.invite_link });
    } catch (error) {
      console.warn("Ginder could not create Telegram invite link", error);
    }

    await onboardingMessages(festival);
    const configUrl = setupUrl(festival, created.setupToken);
    await sendMessage(message.chat.id, `✅ ${festival.name} is gekoppeld aan ${shared.title ?? "je festivalgroep"}.`, {
      reply_markup: {
        inline_keyboard: [[{ text: "⚙️ Festival instellen", url: configUrl }]],
      },
    });
  } catch (error) {
    if (!created && error instanceof FestivalChatAlreadyLinkedError) {
      await releaseCreationSlot(userId);
      await sendMessage(message.chat.id, [
        "Die groep is al gekoppeld aan een ander festival in Ginder.",
        "Kies een andere groep. Er is niets van je 7-dagenlimiet verbruikt.",
      ].join("\n"));
      await askForGroup(message.chat.id, pending);
      return;
    }

    console.error("Festival group linking failed", error);
    if (!created) {
      await releaseCreationSlot(userId);
      await sendMessage(message.chat.id, "Koppelen lukte niet. Er is niets van je 7-dagenlimiet verbruikt; probeer /festival opnieuw.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const recoveryUrl = setupUrl(created.festival, created.setupToken);
    await sendMessage(message.chat.id, [
      `⚠️ ${created.festival.name} is wel aangemaakt, maar de onboarding in de groep liep vast.`,
      "Je 7-dagenlimiet blijft daarom correct actief.",
      "Je kunt de festivalsetup hier verderzetten:",
      recoveryUrl,
    ].join("\n"), {
      reply_markup: { remove_keyboard: true },
    });
  }
}

async function maybeStoreFestivalMap(message: TelegramMessage): Promise<boolean> {
  if (!isPrivate(message.chat) || !message.from) return false;
  const photos = message.photo ?? [];
  const largestPhoto = photos.length
    ? [...photos].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    : null;
  const imageDocument = message.document?.mime_type?.startsWith("image/") ? message.document : null;
  const fileId = imageDocument?.file_id ?? largestPhoto?.file_id;
  if (!fileId) return false;

  const current = await getCurrentFestivalForOwner(message.from.id);
  const awaitingReplacement = await getFestivalAwaitingMapUpload(message.from.id);
  const festival = awaitingReplacement ?? (current?.status === "map" ? current : null);
  if (!festival) return false;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) throw new Error("APP_URL is not configured");

  const map = {
    telegramMapFileId: fileId,
    mapImageUrl: `${appUrl}/api/festivals/${encodeURIComponent(festival.id)}/map-image`,
    mapImageWidth: largestPhoto?.width ?? festival.mapImageWidth,
    mapImageHeight: largestPhoto?.height ?? festival.mapImageHeight,
  };
  const replaced = Boolean(festival.mapImageUrl);
  const updated = replaced
    ? await replacePersistedFestivalMap(festival.id, map)
    : await updatePersistedFestival(festival.id, { ...map, status: "anchors" });
  await clearFestivalMapUpload(message.from.id);
  const { festival: resumable, setupToken } = await issueFestivalSetupToken(updated.id);
  const configUrl = setupUrl(resumable, setupToken);
  await sendMessage(message.chat.id, [
    `✅ ${replaced ? "Nieuwe kaart" : "Kaart"} ontvangen voor ${resumable.name}.`,
    replaced ? "De oude ankers zijn verwijderd. Stel ze opnieuw in op deze kaart." : "Nu terrein + ankers afwerken.",
  ].join("\n"), {
    reply_markup: { inline_keyboard: [[{ text: "⚙️ Festival instellen", url: configUrl }]] },
  });
  return true;
}

export async function routeFestivalLifecycleUpdate(update: TelegramUpdate): Promise<boolean> {
  const callback = update.callback_query;
  if (callback?.data?.startsWith(OWNER_SELECT_PREFIX) || callback?.data?.startsWith(OWNER_MAP_PREFIX)) {
    const message = callback.message;
    if (!message || !isPrivate(message.chat)) {
      await answerCallbackQuery(callback.id, "Festivalbeheer werkt alleen in privé.");
      return true;
    }
    const replacingMap = callback.data.startsWith(OWNER_MAP_PREFIX);
    const selector = callback.data.slice((replacingMap ? OWNER_MAP_PREFIX : OWNER_SELECT_PREFIX).length);
    try {
      const festival = await selectFestivalForOwner(callback.from.id, selector);
      await answerCallbackQuery(callback.id, replacingMap ? "Stuur de nieuwe kaart hieronder." : "Festival geselecteerd.");
      const ownerMessage = { ...message, from: callback.from };
      if (replacingMap) await requestFestivalMap(ownerMessage, festival);
      else await showOwnerFestival(ownerMessage, festival);
    } catch (error) {
      await answerCallbackQuery(callback.id, error instanceof Error ? error.message : "Festival niet gevonden.");
    }
    return true;
  }

  const message = update.message;
  if (!message) return false;

  if (message.chat_shared) {
    await finishGroupLink(message);
    return true;
  }

  if (await maybeStoreFestivalMap(message)) return true;
  if (!message.text || !message.from) return false;

  const { command, args } = commandAndArgs(message.text);
  if (command === "/festival") {
    const normalizedArgs = args.toLowerCase();
    if (!isPrivate(message.chat)) {
      await startFestivalCreation(message, args);
      return true;
    }

    if (normalizedArgs === "cancel") {
      await Promise.all([
        clearPendingFestival(message.from.id),
        clearFestivalMapUpload(message.from.id),
      ]);
      await sendMessage(message.chat.id, "Festivalsetup geannuleerd.", { reply_markup: { remove_keyboard: true } });
      return true;
    }

    if (["lijst", "list", "festivals"].includes(normalizedArgs)) {
      await showOwnedFestivals(message);
      return true;
    }

    if (["kaart", "map"].includes(normalizedArgs)) {
      const festival = await getCurrentFestivalForOwner(message.from.id);
      if (!festival) {
        await sendMessage(message.chat.id, "Je hebt nog geen festival om een kaart voor in te stellen.");
        return true;
      }
      await requestFestivalMap(message, festival);
      return true;
    }

    if (!args || ["status", "setup", "beheer", "manage"].includes(normalizedArgs)) {
      if (await showCurrentFestival(message)) return true;
      await startFestivalCreation(message, "");
      return true;
    }

    if (normalizedArgs === "nieuw" || normalizedArgs.startsWith("nieuw ")) {
      await startFestivalCreation(message, args.slice("nieuw".length).trim());
      return true;
    }

    // Backwards compatible: /festival Horst 2027 still starts a new festival.
    await startFestivalCreation(message, args);
    return true;
  }

  if (command === "/start" && args.toLowerCase() === "festival") {
    if (await showCurrentFestival(message)) return true;
    await startFestivalCreation(message, "");
    return true;
  }

  if (isPrivate(message.chat) && !command.startsWith("/") && await consumeFestivalNamePrompt(message.from.id)) {
    await startFestivalCreation(message, message.text);
    return true;
  }

  return false;
}
