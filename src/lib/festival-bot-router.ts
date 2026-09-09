import {
  archiveFestivalForOwner,
  beginFestivalGroupLink,
  beginFestivalMapUpload,
  beginFestivalNamePrompt,
  claimCreationSlot,
  clearFestivalGroupLink,
  clearFestivalMapUpload,
  clearFestivalNamePrompt,
  clearPendingFestival,
  consumeFestivalNamePrompt,
  createPendingFestival,
  FestivalChatAlreadyLinkedError,
  festivalMapStartParam,
  finalizePendingFestival,
  finishFestivalGroupLink,
  getCreationCooldownSeconds,
  getCurrentFestivalForOwner,
  getFestivalAwaitingMapUpload,
  getFestivalsForOwner,
  getPendingFestival,
  replacePersistedFestivalMap,
  releaseCreationSlot,
  restoreFestivalForOwner,
  selectFestivalForOwner,
  unlinkFestivalGroup,
  updatePersistedFestival,
  type PendingFestivalCreation,
  type PersistedFestival,
} from "./festival-store";
import { privateRoomToken } from "./map-model";
import { clearFestivalPings } from "./pings";
import {
  answerCallbackQuery,
  createChatInviteLink,
  leaveChat,
  mapMiniAppUrl,
  sendMessage,
  type TelegramChat,
  type TelegramMessage,
  type TelegramUpdate,
} from "./telegram";

const OWNER_SELECT_PREFIX = "fo:";
const OWNER_MAP_PREFIX = "fomap:";
const OWNER_GROUP_PREFIX = "fogroup:";
const OWNER_UNLINK_PREFIX = "founlink:";
const OWNER_UNLINK_CONFIRM_PREFIX = "founlinkyes:";
const OWNER_ARCHIVE_PREFIX = "foarchive:";
const OWNER_ARCHIVE_CONFIRM_PREFIX = "foarchiveyes:";
const OWNER_RESTORE_PREFIX = "forestore:";
const BOT_SETUP_PREFIX = "fs:";

function commandAndArgs(text: string): { command: string; args: string } {
  const [raw = "", ...rest] = text.trim().split(/\s+/);
  return { command: raw.split("@")[0].toLowerCase(), args: rest.join(" ").trim() };
}

function isPrivate(chat: TelegramChat): boolean {
  return chat.type === "private";
}

function botSetupCallback(festival: PersistedFestival): string {
  return `${BOT_SETUP_PREFIX}${festival.publicKey}`;
}

async function safeAnswerOwnerCallback(callbackId: string, text: string): Promise<void> {
  try {
    await answerCallbackQuery(callbackId, text);
  } catch (error) {
    console.warn("Ginder could not answer owner callback", error);
  }
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

function groupRequestKeyboard(requestId: number) {
  const rights = adminRights();
  return {
    keyboard: [[{
      text: "👥 Kies festivalgroep",
      request_chat: {
        request_id: requestId,
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
  };
}

async function askForGroup(chatId: number, pending: PendingFestivalCreation): Promise<void> {
  await sendMessage(
    chatId,
    [
      `📍 ${pending.name} ${pending.year}`,
      "",
      "Kies nu de Telegram-groep die bij dit festival hoort.",
      "Heb je er nog geen? Maak eerst even een gewone groep in Telegram en kom dan terug naar deze knop.",
    ].join("\n"),
    {
      reply_markup: groupRequestKeyboard(pending.requestId),
    },
  );
}

async function showOwnerFestival(message: TelegramMessage, festival: PersistedFestival): Promise<void> {
  const userId = message.from!.id;
  const roomToken = festival.chatId === null ? undefined : privateRoomToken(festival.chatId);
  const mapUrl = mapMiniAppUrl(festivalMapStartParam(festival, roomToken));
  const cooldown = await getCreationCooldownSeconds(userId);
  const rows: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [
    [{
      text: festival.status === "ready" ? "⚙️ Festival beheren" : "▶️ Setup verder",
      callback_data: botSetupCallback(festival),
    }],
  ];
  if (festival.mapImageUrl) rows.push([{ text: "🗺 Open kaart", url: mapUrl }]);
  if (festival.inviteLink) rows.push([{ text: "👥 Open festivalgroep", url: festival.inviteLink }]);
  if (festival.mapImageUrl) rows.push([{
    text: "🖼 Kaart vervangen",
    callback_data: `${OWNER_MAP_PREFIX}${festival.publicKey}`,
  }]);
  if (festival.chatId === null) rows.push([{
    text: "👥 Groep koppelen",
    callback_data: `${OWNER_GROUP_PREFIX}${festival.publicKey}`,
  }]);
  else rows.push([{
    text: "🔌 Groep ontkoppelen",
    callback_data: `${OWNER_UNLINK_PREFIX}${festival.publicKey}`,
  }]);
  rows.push([{
    text: "📦 Festival archiveren",
    callback_data: `${OWNER_ARCHIVE_PREFIX}${festival.publicKey}`,
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
    "Archief bekijken: /festival archief",
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

async function showArchivedFestivals(message: TelegramMessage): Promise<void> {
  const userId = message.from?.id;
  if (!userId || !isPrivate(message.chat)) return;
  const festivals = (await getFestivalsForOwner(userId, { includeArchived: true }))
    .filter((festival) => Boolean(festival.archivedAt));
  if (!festivals.length) {
    await sendMessage(message.chat.id, "Je archief is leeg.");
    return;
  }
  await sendMessage(message.chat.id, "Gearchiveerde festivals:", {
    reply_markup: {
      inline_keyboard: festivals.map((festival) => [{
        text: `↩️ ${festival.name} ${festival.year} terugzetten`,
        callback_data: `${OWNER_RESTORE_PREFIX}${festival.publicKey}`,
      }]),
    },
  });
}

async function requestFestivalMap(message: TelegramMessage, festival: PersistedFestival): Promise<void> {
  await Promise.all([
    clearPendingFestival(message.from!.id),
    clearFestivalNamePrompt(message.from!.id),
    clearFestivalGroupLink(message.from!.id),
  ]);
  await beginFestivalMapUpload(message.from!.id, festival.id);
  await sendMessage(message.chat.id, [
    "1/4 · Festivalkaart",
    "",
    `Stuur de ${festival.mapImageUrl ? "nieuwe " : "officiële "}festivalkaart voor ${festival.name} hier in deze privéchat.`,
    "Tik op + (of de paperclip) → Foto of Bestand → kies de kaart → verstuur.",
    "Je hoeft geen link te plakken en er opent geen aparte uploadpagina.",
    festival.mapImageUrl
      ? "De oude ankers worden pas verwijderd zodra de nieuwe afbeelding echt ontvangen is."
      : "Liefst het originele bestand of de hoogste resolutie die je hebt.",
    "",
    "Toch niet? /festival cancel",
  ].join("\n"), {
    reply_markup: { remove_keyboard: true },
  });
}

async function requestFestivalGroup(message: TelegramMessage, festival: PersistedFestival): Promise<void> {
  await Promise.all([
    clearPendingFestival(message.from!.id),
    clearFestivalNamePrompt(message.from!.id),
    clearFestivalMapUpload(message.from!.id),
  ]);
  const pending = await beginFestivalGroupLink(message.from!.id, festival.id);
  await sendMessage(message.chat.id, [
    `Kies de Telegram-groep voor ${festival.name} ${festival.year}.`,
    "Ginder vraagt alleen de adminrechten die nodig zijn voor de festivaltools.",
    "",
    "Toch niet? /festival cancel",
  ].join("\n"), {
    reply_markup: groupRequestKeyboard(pending.requestId),
  });
}

async function leaveFestivalChat(chatId: number): Promise<void> {
  try {
    await leaveChat(chatId);
  } catch (error) {
    console.warn("Ginder could not leave unlinked Telegram group", error);
  }
}

async function deactivateFestivalChat(chatId: number, festivalId: string): Promise<void> {
  try {
    await clearFestivalPings(String(chatId), festivalId);
  } catch (error) {
    console.warn("Ginder could not clear pings for unlinked Telegram group", error);
  }
  await leaveFestivalChat(chatId);
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

  await Promise.all([
    clearFestivalMapUpload(userId),
    clearFestivalGroupLink(userId),
  ]);

  if (!rawName.trim()) {
    await clearPendingFestival(userId);
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
  await Promise.all([
    clearPendingFestival(userId),
    clearFestivalNamePrompt(userId),
  ]);
  const pending = await createPendingFestival(userId, name, year);
  await askForGroup(message.chat.id, pending);
}

export async function onboardingMessages(festival: PersistedFestival): Promise<void> {
  if (festival.chatId === null) return;
  const roomToken = privateRoomToken(festival.chatId);
  const mapUrl = mapMiniAppUrl(festivalMapStartParam(festival, roomToken));

  await sendMessage(festival.chatId, [
    `✅ ${festival.name} ${festival.year} is gekoppeld aan Ginder.`,
    "",
    "De festivalsetup gebeurt privé bij de maker. Deze groep is voor de festivaltools zodra de setup klaar is.",
  ].join("\n"));

  const setupText = festival.status === "ready"
    ? [
      `🗺 ${festival.name} staat klaar.`,
      "/menu voor alle festivaltools · /map voor de kaart.",
    ]
    : [
      "🛠 Setup nog afwerken",
      "",
      "De maker krijgt nu in privé automatisch de volgende stap:",
      "1. Festivalkaart sturen",
      "2. Terreinlocatie + grootte",
      "3. 2–6 ankers plaatsen",
      "4. Timetable sturen",
      "",
      "Ginder gaat na elke stap automatisch verder.",
      "Daarna werken /map en /menu hier in de groep.",
    ];
  await sendMessage(
    festival.chatId,
    setupText.join("\n"),
    festival.mapImageUrl
      ? { reply_markup: { inline_keyboard: [[{ text: "🗺 Open kaart", url: mapUrl }]] } }
      : undefined,
  );

  const inviteText = festival.inviteLink
    ? `Nodig de rest maar uit: ${festival.inviteLink}`
    : "Nodig de rest maar uit via de groepsinfo. De invite-link kon ik niet zelf aanmaken, maar de groep is wel gekoppeld.";
  await sendMessage(festival.chatId, `👥 ${inviteText}\n\nVanaf hier mogen jullie elkaar weer gewoon kwijtraken.`);
}

async function continueIncompleteFestivalSetup(message: TelegramMessage, festival: PersistedFestival): Promise<void> {
  if (!festival.mapImageUrl) {
    await requestFestivalMap(message, festival);
    return;
  }
  if (festival.status === "ready") return;
  const nextStep = festival.status === "timetable"
    ? "4/4 · Timetable"
    : festival.status === "anchors"
      ? "3/4 · Ankers"
      : "2/4 · Terrein";
  await sendMessage(message.chat.id, [
    `We gaan verder met ${festival.name}.`,
    `Volgende stap: ${nextStep}`,
  ].join("\n"), {
    reply_markup: {
      inline_keyboard: [[{
        text: "▶️ Open volgende stap",
        callback_data: botSetupCallback(festival),
        style: "primary",
      }]],
    },
  });
}

async function finishGroupLink(message: TelegramMessage): Promise<void> {
  const userId = message.from?.id;
  const shared = message.chat_shared;
  if (!userId || !shared || !isPrivate(message.chat)) return;

  const pending = await getPendingFestival(userId);
  if (!pending || pending.requestId !== shared.request_id) {
    let linkedFestival: PersistedFestival | null = null;
    try {
      linkedFestival = await finishFestivalGroupLink(userId, shared.request_id, {
        id: shared.chat_id,
        title: shared.title,
      });
      try {
        const invite = await createChatInviteLink(shared.chat_id, `Ginder · ${linkedFestival.name}`);
        linkedFestival = await updatePersistedFestival(linkedFestival.id, { inviteLink: invite.invite_link });
      } catch (error) {
        console.warn("Ginder could not create Telegram invite link", error);
      }
      await onboardingMessages(linkedFestival);
      await sendMessage(message.chat.id, [
        `✅ ${linkedFestival.name} is gekoppeld aan ${shared.title ?? "je festivalgroep"}.`,
        "Ik neem je nu verder door de resterende setup.",
      ].join("\n"), {
        reply_markup: { remove_keyboard: true },
      });
      await continueIncompleteFestivalSetup(message, linkedFestival);
    } catch (error) {
      if (linkedFestival) {
        console.error("Existing festival group onboarding failed", error);
        await sendMessage(message.chat.id, [
          `⚠️ ${linkedFestival.name} is wel gekoppeld, maar de onboarding in de groep liep vast.`,
          "Je festivaldata is veilig. De setup kan hier in privé gewoon verder.",
        ].join("\n"), { reply_markup: { remove_keyboard: true } });
        await continueIncompleteFestivalSetup(message, linkedFestival);
        return;
      }
      if (error instanceof FestivalChatAlreadyLinkedError) {
        await sendMessage(message.chat.id, "Die groep is al gekoppeld aan een ander festival. Kies een andere groep.", {
          reply_markup: groupRequestKeyboard(shared.request_id),
        });
      } else {
        await sendMessage(message.chat.id, error instanceof Error ? error.message : "Koppelen lukte niet.", {
          reply_markup: { remove_keyboard: true },
        });
      }
    }
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
    await sendMessage(message.chat.id, [
      `✅ ${festival.name} is gekoppeld aan ${shared.title ?? "je festivalgroep"}.`,
      "Ik neem je nu stap voor stap door de setup.",
    ].join("\n"), {
      reply_markup: { remove_keyboard: true },
    });
    await requestFestivalMap(message, festival);
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

    await sendMessage(message.chat.id, [
      `⚠️ ${created.festival.name} is wel aangemaakt, maar de onboarding in de groep liep vast.`,
      "Je 7-dagenlimiet blijft daarom correct actief.",
      "De festivalsetup kan hier in privé gewoon verder.",
    ].join("\n"), {
      reply_markup: { remove_keyboard: true },
    });
    try {
      await continueIncompleteFestivalSetup(message, created.festival);
    } catch (setupError) {
      console.error("Festival setup recovery failed", setupError);
      await sendMessage(message.chat.id, "Gebruik /festival setup om de setup opnieuw te openen.");
    }
  }
}

async function maybeStoreFestivalMap(message: TelegramMessage): Promise<boolean> {
  if (!isPrivate(message.chat) || !message.from) return false;
  const photos = message.photo ?? [];
  const largestPhoto = photos.length
    ? [...photos].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    : null;
  const document = message.document;
  const fileName = document?.file_name?.toLowerCase() ?? "";
  const imageDocument = document && (
    document.mime_type?.startsWith("image/")
    || /\.(?:png|jpe?g|webp|heic|heif)$/i.test(fileName)
  ) ? document : null;
  const fileId = imageDocument?.file_id ?? largestPhoto?.file_id;
  if (!fileId) return false;

  const current = await getCurrentFestivalForOwner(message.from.id);
  const awaitingReplacement = await getFestivalAwaitingMapUpload(message.from.id);
  const festival = awaitingReplacement ?? (current && !current.mapImageUrl ? current : null);
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
  await sendMessage(message.chat.id, [
    `✅ ${replaced ? "Nieuwe kaart" : "Kaart"} ontvangen voor ${updated.name}.`,
    replaced ? "De oude ankers zijn verwijderd. Stel ze opnieuw in op deze kaart." : "Kaart staat. Ga nu verder met het terrein.",
  ].join("\n"), {
    reply_markup: {
      inline_keyboard: [[{
        text: "▶️ Setup verder",
        callback_data: botSetupCallback(updated),
        style: "primary",
      }]],
    },
  });
  return true;
}

export async function routeFestivalLifecycleUpdate(update: TelegramUpdate): Promise<boolean> {
  const callback = update.callback_query;
  const ownerPrefix = callback?.data
    ? [
      OWNER_UNLINK_CONFIRM_PREFIX,
      OWNER_ARCHIVE_CONFIRM_PREFIX,
      OWNER_SELECT_PREFIX,
      OWNER_MAP_PREFIX,
      OWNER_GROUP_PREFIX,
      OWNER_UNLINK_PREFIX,
      OWNER_ARCHIVE_PREFIX,
      OWNER_RESTORE_PREFIX,
    ].find((prefix) => callback.data!.startsWith(prefix))
    : undefined;
  if (callback?.data && ownerPrefix) {
    let callbackAnswered = false;
    const answer = async (text: string) => {
      if (callbackAnswered) return;
      callbackAnswered = true;
      await safeAnswerOwnerCallback(callback.id, text);
    };
    const message = callback.message;
    if (!message || !isPrivate(message.chat)) {
      await answer("Festivalbeheer werkt alleen in privé.");
      return true;
    }
    const selector = callback.data.slice(ownerPrefix.length);
    const ownerMessage = { ...message, from: callback.from };
    try {
      if (ownerPrefix === OWNER_RESTORE_PREFIX) {
        const festival = await restoreFestivalForOwner(callback.from.id, selector);
        await answer("Festival teruggezet.");
        await sendMessage(message.chat.id, `↩️ ${festival.name} staat terug tussen je festivals.`);
        await showOwnerFestival(ownerMessage, festival);
        return true;
      }
      if (ownerPrefix === OWNER_UNLINK_CONFIRM_PREFIX) {
        const result = await unlinkFestivalGroup(callback.from.id, selector);
        await answer("Groep ontkoppeld.");
        await deactivateFestivalChat(result.previousChatId, result.festival.id);
        await sendMessage(message.chat.id, [
          `✅ De groep is ontkoppeld van ${result.festival.name}.`,
          "De festivaldata is bewaard. Je kunt wanneer je wilt een andere groep koppelen.",
        ].join("\n"));
        await showOwnerFestival(ownerMessage, result.festival);
        return true;
      }
      if (ownerPrefix === OWNER_ARCHIVE_CONFIRM_PREFIX) {
        const result = await archiveFestivalForOwner(callback.from.id, selector);
        await answer("Festival gearchiveerd.");
        if (result.previousChatId !== null) {
          await deactivateFestivalChat(result.previousChatId, result.festival.id);
        }
        await sendMessage(message.chat.id, [
          `📦 ${result.festival.name} ${result.festival.year} is gearchiveerd.`,
          "Kaart, ankers, timetable en festivaldata blijven bewaard.",
          "Terugzetten kan via /festival archief.",
        ].join("\n"));
        return true;
      }

      const festival = await selectFestivalForOwner(callback.from.id, selector);
      if (ownerPrefix === OWNER_MAP_PREFIX) {
        await answer("Stuur de nieuwe kaart hieronder.");
        await requestFestivalMap(ownerMessage, festival);
      } else if (ownerPrefix === OWNER_GROUP_PREFIX) {
        await answer("Kies de groep hieronder.");
        await requestFestivalGroup(ownerMessage, festival);
      } else if (ownerPrefix === OWNER_UNLINK_PREFIX) {
        if (festival.chatId === null) throw new Error("Dit festival heeft geen gekoppelde groep.");
        await answer("Bevestig de ontkoppeling hieronder.");
        await sendMessage(message.chat.id, [
          `Groep “${festival.chatTitle ?? "festivalgroep"}” ontkoppelen van ${festival.name}?`,
          "Ginder verlaat de groep. Je festivaldata blijft gewoon bewaard.",
        ].join("\n"), {
          reply_markup: { inline_keyboard: [[
            { text: "Ja, ontkoppelen", callback_data: `${OWNER_UNLINK_CONFIRM_PREFIX}${festival.publicKey}` },
            { text: "Nee", callback_data: `${OWNER_SELECT_PREFIX}${festival.publicKey}` },
          ]] },
        });
      } else if (ownerPrefix === OWNER_ARCHIVE_PREFIX) {
        await answer("Bevestig het archiveren hieronder.");
        await sendMessage(message.chat.id, [
          `${festival.name} ${festival.year} archiveren?`,
          "Ginder ontkoppelt en verlaat de groep. De festivaldata blijft bewaard en kan later worden teruggezet.",
        ].join("\n"), {
          reply_markup: { inline_keyboard: [[
            { text: "Ja, archiveren", callback_data: `${OWNER_ARCHIVE_CONFIRM_PREFIX}${festival.publicKey}` },
            { text: "Nee", callback_data: `${OWNER_SELECT_PREFIX}${festival.publicKey}` },
          ]] },
        });
      } else {
        await answer("Festival geselecteerd.");
        await showOwnerFestival(ownerMessage, festival);
      }
    } catch (error) {
      console.error("Festival owner action failed", error);
      await answer(error instanceof Error ? error.message : "Festival niet gevonden.");
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
        clearFestivalNamePrompt(message.from.id),
        clearFestivalMapUpload(message.from.id),
        clearFestivalGroupLink(message.from.id),
      ]);
      await sendMessage(message.chat.id, "Festivalsetup geannuleerd.", { reply_markup: { remove_keyboard: true } });
      return true;
    }

    if (["lijst", "list", "festivals"].includes(normalizedArgs)) {
      await showOwnedFestivals(message);
      return true;
    }

    if (["archief", "archive", "archived"].includes(normalizedArgs)) {
      await showArchivedFestivals(message);
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

  if (isPrivate(message.chat) && ["/start", "/menu", "/help"].includes(command)) {
    if (await showCurrentFestival(message)) return true;
    await sendMessage(message.chat.id, [
      "📍 Ginder",
      "",
      "In privé maak en beheer je een festival.",
      "Gebruik /festival om te starten. Kaart, timetable, live en groepsacties horen daarna in de gekoppelde festivalgroep.",
    ].join("\n"), { reply_markup: { remove_keyboard: true } });
    return true;
  }

  if (isPrivate(message.chat) && command === "/id") {
    await sendMessage(message.chat.id, `🪪 Jouw Telegram user ID is:\n${message.from.id}`, {
      reply_markup: { remove_keyboard: true },
    });
    return true;
  }

  if (isPrivate(message.chat) && command.startsWith("/")) {
    await sendMessage(message.chat.id, [
      "Die actie hoort in je festivalgroep.",
      "In deze privéchat gebruik je /festival of /menu voor setup en beheer.",
    ].join("\n"), { reply_markup: { remove_keyboard: true } });
    return true;
  }

  if (isPrivate(message.chat) && !command.startsWith("/") && await consumeFestivalNamePrompt(message.from.id)) {
    await startFestivalCreation(message, message.text);
    return true;
  }

  return false;
}
