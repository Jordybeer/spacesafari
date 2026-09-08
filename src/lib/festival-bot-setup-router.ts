import {
  beginFestivalMapUpload,
  clearFestivalMapUpload,
  festivalMapStartParam,
  getCurrentFestivalForOwner,
  getFestivalAwaitingMapUpload,
  issueFestivalSetupToken,
  replacePersistedFestivalMap,
  selectFestivalForOwner,
  setupStatusFor,
  setupUrl,
  updatePersistedFestival,
  type PersistedFestival,
} from "./festival-store";
import {
  getFestivalSchedule,
  performerEntries,
  saveFestivalSchedule,
  type FestivalScheduleEntry,
} from "./festival-schedule";
import { parseFestivalTimetableText, summarizeFestivalTimetable } from "./festival-timetable-import";
import { listAnchors, privateRoomToken } from "./map-model";
import { getRedis } from "./storage";
import {
  answerCallbackQuery,
  getTelegramFilePath,
  mapMiniAppUrl,
  sendMessage,
  telegramFileUrl,
  type TelegramMessage,
  type TelegramUpdate,
} from "./telegram";

const SETUP_CALLBACK_PREFIX = "fs:";
const MAP_CALLBACK_PREFIX = "fsm:";
const VENUE_CALLBACK_PREFIX = "fsv:";
const RADIUS_CALLBACK_PREFIX = "fsr:";
const CUSTOM_RADIUS_CALLBACK_PREFIX = "fso:";
export const TIMETABLE_CALLBACK_PREFIX = "fst:";
const CONFIRM_TIMETABLE_CALLBACK_PREFIX = "fsc:";
const CANCEL_CALLBACK_PREFIX = "fsx:";
const SETUP_TTL_SECONDS = 2 * 60 * 60;
const MAX_TIMETABLE_FILE_BYTES = 2 * 1024 * 1024;

const setupPrefixes = [
  CONFIRM_TIMETABLE_CALLBACK_PREFIX,
  CUSTOM_RADIUS_CALLBACK_PREFIX,
  TIMETABLE_CALLBACK_PREFIX,
  RADIUS_CALLBACK_PREFIX,
  VENUE_CALLBACK_PREFIX,
  MAP_CALLBACK_PREFIX,
  CANCEL_CALLBACK_PREFIX,
  SETUP_CALLBACK_PREFIX,
];

type SetupStep = "venue" | "radius" | "radius_custom" | "timetable";

type SetupPrompt = {
  festivalId: string;
  step: SetupStep;
  draft?: FestivalScheduleEntry[];
};

type TelegramLocation = {
  latitude: number;
  longitude: number;
  horizontal_accuracy?: number;
};

type TelegramLocationMessage = TelegramMessage & { location?: TelegramLocation };

function promptKey(userId: number): string {
  return `ginder:user:${userId}:bot-setup`;
}

async function setPrompt(userId: number, prompt: SetupPrompt): Promise<void> {
  await getRedis().set(promptKey(userId), prompt, { ex: SETUP_TTL_SECONDS });
}

async function getPrompt(userId: number): Promise<SetupPrompt | null> {
  return await getRedis().get<SetupPrompt>(promptKey(userId));
}

async function clearPrompt(userId: number): Promise<void> {
  await getRedis().del(promptKey(userId));
}

function isPrivate(message: TelegramMessage): boolean {
  return message.chat.type === "private";
}

function hasVenueCenter(festival: PersistedFestival): boolean {
  return Number.isFinite(festival.venueCenter.latitude)
    && Number.isFinite(festival.venueCenter.longitude)
    && !(festival.venueCenter.latitude === 0 && festival.venueCenter.longitude === 0);
}

function commandAndArgs(text: string): { command: string; args: string } {
  const [raw = "", ...rest] = text.trim().split(/\s+/);
  return { command: raw.split("@")[0].toLocaleLowerCase(), args: rest.join(" ").trim() };
}

async function safeAnswerCallback(callbackId: string, text?: string): Promise<void> {
  try {
    await answerCallbackQuery(callbackId, text);
  } catch (error) {
    console.warn("Ginder could not answer setup callback", error);
  }
}

async function refreshSetupStatus(festival: PersistedFestival): Promise<{
  festival: PersistedFestival;
  anchorCount: number;
  timetableCount: number;
}> {
  const [anchors, schedule] = await Promise.all([
    listAnchors(festival.id),
    getFestivalSchedule(festival),
  ]);
  const timetableCount = performerEntries(schedule).length;
  const status = setupStatusFor({
    mapImageUrl: festival.mapImageUrl,
    venueCenter: festival.venueCenter,
    anchors: anchors.length,
    timetableReady: timetableCount > 0,
  });
  const updated = status === festival.status
    ? festival
    : await updatePersistedFestival(festival.id, { status });
  return { festival: updated, anchorCount: anchors.length, timetableCount };
}

function anchorOnlyUrl(url: string): string {
  return url.replace("#token=", "&mode=anchors#token=");
}

async function sendAnchorStep(chatId: number, festival: PersistedFestival): Promise<void> {
  const { festival: resumable, setupToken } = await issueFestivalSetupToken(festival.id);
  await sendMessage(chatId, [
    "3/4 · Ankers",
    "",
    "Plaats minstens 2 vaste punten op de festivalkaart. Vier tot zes goed verspreide punten geeft een stabielere kaart.",
    "Dit is het enige stuk dat visueel moet gebeuren.",
  ].join("\n"), {
    reply_markup: {
      inline_keyboard: [[{
        text: "📌 Ankers plaatsen",
        url: anchorOnlyUrl(setupUrl(resumable, setupToken)),
        style: "primary",
      }]],
    },
  });
}

async function sendVenueButton(chatId: number, festival: PersistedFestival): Promise<void> {
  await sendMessage(chatId, [
    "2/4 · Terrein",
    "",
    "Deel één keer je locatie terwijl je ongeveer op het festivalterrein staat. Daarna kies je hoe groot het terrein ongeveer is.",
  ].join("\n"), {
    reply_markup: {
      inline_keyboard: [[{
        text: "📍 Terreinlocatie delen",
        callback_data: `${VENUE_CALLBACK_PREFIX}${festival.publicKey}`,
        style: "primary",
      }]],
    },
  });
}

async function showSetupStep(message: TelegramMessage, festival: PersistedFestival): Promise<void> {
  const refreshed = await refreshSetupStatus(festival);
  const current = refreshed.festival;

  if (!current.mapImageUrl) {
    await sendMessage(message.chat.id, [
      `📍 ${current.name} ${current.year}`,
      "1/4 · Festivalkaart",
      "",
      "Stuur de officiële festivalkaart naar Ginder. Liefst de hoogste resolutie die je hebt.",
    ].join("\n"), {
      reply_markup: {
        inline_keyboard: [[{
          text: "🗺 Kaart sturen",
          callback_data: `${MAP_CALLBACK_PREFIX}${current.publicKey}`,
          style: "primary",
        }]],
      },
    });
    return;
  }

  if (!hasVenueCenter(current)) {
    await sendVenueButton(message.chat.id, current);
    return;
  }

  if (refreshed.anchorCount < 2) {
    await sendAnchorStep(message.chat.id, current);
    return;
  }

  if (refreshed.timetableCount === 0) {
    await sendMessage(message.chat.id, [
      "4/4 · Timetable",
      "",
      "Stuur de timetable als CSV/tekst of plak de rijen hier. Ginder toont eerst een samenvatting en schrijft pas na je bevestiging.",
    ].join("\n"), {
      reply_markup: {
        inline_keyboard: [[{
          text: "📅 Timetable sturen",
          callback_data: `${TIMETABLE_CALLBACK_PREFIX}${current.publicKey}`,
          style: "primary",
        }]],
      },
    });
    return;
  }

  const roomToken = current.chatId === null ? undefined : privateRoomToken(current.chatId);
  await sendMessage(message.chat.id, [
    `✅ ${current.name} ${current.year} staat klaar.`,
    `${refreshed.anchorCount} ankers · ${refreshed.timetableCount} sets`,
  ].join("\n"), {
    reply_markup: {
      inline_keyboard: [
        [{
          text: "🗺 Open kaart",
          url: mapMiniAppUrl(festivalMapStartParam(current, roomToken)),
          style: "success",
        }],
        [{
          text: "📅 Timetable vervangen",
          callback_data: `${TIMETABLE_CALLBACK_PREFIX}${current.publicKey}`,
        }],
      ],
    },
  });
}

async function requestMap(message: TelegramMessage, festival: PersistedFestival): Promise<void> {
  await clearPrompt(message.from!.id);
  await beginFestivalMapUpload(message.from!.id, festival.id);
  await sendMessage(message.chat.id, [
    "1/4 · Festivalkaart",
    "",
    `Stuur nu de ${festival.mapImageUrl ? "nieuwe " : "officiële "}festivalkaart voor ${festival.name} hier in deze privéchat.`,
    "Tik op + (of de paperclip) → Foto of Bestand → kies de afbeelding → verstuur.",
    festival.mapImageUrl
      ? "De oude ankers worden pas verwijderd zodra de nieuwe afbeelding echt ontvangen is."
      : "Liefst het originele bestand of de hoogste resolutie die je hebt.",
    "",
    "Annuleren: /festival cancel",
  ].join("\n"), {
    reply_markup: { remove_keyboard: true },
  });
}

async function maybeStoreFestivalMap(message: TelegramMessage): Promise<boolean> {
  if (!isPrivate(message) || !message.from) return false;
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
  const awaiting = await getFestivalAwaitingMapUpload(message.from.id);
  const festival = awaiting ?? (current && !current.mapImageUrl ? current : null);
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
    : await updatePersistedFestival(festival.id, {
      ...map,
      status: hasVenueCenter(festival) ? "anchors" : "map",
    });
  await clearFestivalMapUpload(message.from.id);
  await sendMessage(message.chat.id, `✅ ${replaced ? "Nieuwe kaart" : "Kaart"} ontvangen voor ${updated.name}.`);

  if (hasVenueCenter(updated)) await sendAnchorStep(message.chat.id, updated);
  else await sendVenueButton(message.chat.id, updated);
  return true;
}

async function requestVenueLocation(message: TelegramMessage, festival: PersistedFestival): Promise<void> {
  await setPrompt(message.from!.id, { festivalId: festival.id, step: "venue" });
  await sendMessage(message.chat.id, [
    "Deel je huidige locatie wanneer je ongeveer midden op het festivalterrein staat.",
    "Dit wordt het referentiepunt van de kaart, niet je persoonlijke live locatie.",
  ].join("\n"), {
    reply_markup: {
      keyboard: [[{ text: "📍 Deel terreinlocatie", request_location: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
      input_field_placeholder: "Deel locatie op het terrein…",
    },
  });
}

async function showRadiusPicker(chatId: number, festival: PersistedFestival): Promise<void> {
  await sendMessage(chatId, "Hoe groot is het festivalterrein ongeveer?", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "500 m", callback_data: `${RADIUS_CALLBACK_PREFIX}${festival.publicKey}:500` },
          { text: "1 km", callback_data: `${RADIUS_CALLBACK_PREFIX}${festival.publicKey}:1000`, style: "primary" },
          { text: "2 km", callback_data: `${RADIUS_CALLBACK_PREFIX}${festival.publicKey}:2000` },
        ],
        [{ text: "Anders", callback_data: `${CUSTOM_RADIUS_CALLBACK_PREFIX}${festival.publicKey}` }],
      ],
    },
  });
}

async function storeVenueLocation(message: TelegramLocationMessage, location: TelegramLocation): Promise<boolean> {
  if (!message.from || !isPrivate(message)) return false;
  const prompt = await getPrompt(message.from.id);
  if (!prompt || prompt.step !== "venue") return false;
  const festival = await selectFestivalForOwner(message.from.id, prompt.festivalId);
  if (!festival.mapImageUrl) {
    await clearPrompt(message.from.id);
    await sendMessage(message.chat.id, "Stuur eerst de festivalkaart via /festival setup.", {
      reply_markup: { remove_keyboard: true },
    });
    return true;
  }

  const [anchors, schedule] = await Promise.all([
    listAnchors(festival.id),
    getFestivalSchedule(festival),
  ]);
  const venueCenter = { latitude: location.latitude, longitude: location.longitude };
  const status = setupStatusFor({
    mapImageUrl: festival.mapImageUrl,
    venueCenter,
    anchors: anchors.length,
    timetableReady: performerEntries(schedule).length > 0,
  });
  const updated = await updatePersistedFestival(festival.id, { venueCenter, status });
  await setPrompt(message.from.id, { festivalId: updated.id, step: "radius" });
  await sendMessage(message.chat.id, "✅ Terreinlocatie opgeslagen.", {
    reply_markup: { remove_keyboard: true },
  });
  await showRadiusPicker(message.chat.id, updated);
  return true;
}

async function finishRadius(message: TelegramMessage, festival: PersistedFestival, meters: number): Promise<void> {
  if (meters < 100 || meters > 50_000) {
    await sendMessage(message.chat.id, "Kies een straal tussen 100 meter en 50 km.");
    return;
  }
  const updated = await updatePersistedFestival(festival.id, { venueMaxDistanceMeters: Math.round(meters) });
  await clearPrompt(message.from!.id);
  await sendMessage(message.chat.id, `✅ Terrein ingesteld op ongeveer ${meters >= 1000 ? `${meters / 1000} km` : `${meters} m`}.`);
  await sendAnchorStep(message.chat.id, updated);
}

function parseRadius(value: string): number | null {
  const normalized = value.trim().toLocaleLowerCase().replace(",", ".");
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(m|meter|meters|km|kilometer|kilometers)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * (match[2]?.startsWith("k") ? 1000 : 1));
}

async function beginTimetablePrompt(message: TelegramMessage, festival: PersistedFestival): Promise<void> {
  const anchors = await listAnchors(festival.id);
  if (!festival.mapImageUrl || !hasVenueCenter(festival) || anchors.length < 2) {
    await sendMessage(message.chat.id, "Werk eerst kaart, terrein en minstens 2 ankers af.", {
      reply_markup: {
        inline_keyboard: [[{
          text: "Verder met setup",
          callback_data: `${SETUP_CALLBACK_PREFIX}${festival.publicKey}`,
          style: "primary",
        }]],
      },
    });
    return;
  }

  const existing = performerEntries(await getFestivalSchedule(festival));
  await setPrompt(message.from!.id, { festivalId: festival.id, step: "timetable" });
  await sendMessage(message.chat.id, [
    existing.length ? `Er staan nu ${existing.length} sets. Een bevestigde import vervangt die timetable.` : "Stuur de timetable als CSV/tekst of plak hem hieronder.",
    "",
    "Kolommen: datum, start, einde, podium, artiest",
    "Voorbeeld: 2026-09-11;20:00;21:30;Main;Artist",
    "Ook gewone komma-CSV met een header werkt.",
  ].join("\n"), {
    reply_markup: {
      inline_keyboard: [[{
        text: "Annuleren",
        callback_data: `${CANCEL_CALLBACK_PREFIX}${festival.publicKey}`,
        style: "danger",
      }]],
      force_reply: true,
    },
  });
}

async function timetableTextFromMessage(message: TelegramMessage): Promise<string | null> {
  if (message.text && !message.text.trim().startsWith("/")) return message.text;
  const document = message.document;
  if (!document) return null;
  const fileName = document.file_name?.toLocaleLowerCase() ?? "";
  const mime = document.mime_type?.toLocaleLowerCase() ?? "";
  const supported = fileName.endsWith(".csv")
    || fileName.endsWith(".txt")
    || mime === "text/csv"
    || mime === "text/plain"
    || mime === "application/csv";
  if (!supported) return null;
  if ((document.file_size ?? 0) > MAX_TIMETABLE_FILE_BYTES) {
    throw new Error("Timetablebestand is te groot. Maximaal 2 MB.");
  }
  const filePath = await getTelegramFilePath(document.file_id);
  const response = await fetch(telegramFileUrl(filePath), { cache: "no-store" });
  if (!response.ok) throw new Error("Timetablebestand kon niet worden gelezen.");
  const text = await response.text();
  if (text.length > MAX_TIMETABLE_FILE_BYTES) throw new Error("Timetablebestand is te groot. Maximaal 2 MB.");
  return text;
}

async function maybeParseTimetable(message: TelegramMessage): Promise<boolean> {
  if (!message.from || !isPrivate(message)) return false;
  const prompt = await getPrompt(message.from.id);
  if (!prompt || prompt.step !== "timetable") return false;

  let text: string | null;
  try {
    text = await timetableTextFromMessage(message);
  } catch (error) {
    await sendMessage(message.chat.id, error instanceof Error ? error.message : "Timetablebestand kon niet worden gelezen.");
    return true;
  }
  if (text === null) return false;

  const festival = await selectFestivalForOwner(message.from.id, prompt.festivalId);
  try {
    const entries = parseFestivalTimetableText(text, { timezone: festival.timezone, year: festival.year });
    await setPrompt(message.from.id, { festivalId: festival.id, step: "timetable", draft: entries });
    await sendMessage(message.chat.id, [
      `Ik vond ${entries.length} set${entries.length === 1 ? "" : "s"}:`,
      "",
      summarizeFestivalTimetable(entries, festival.timezone),
      "",
      "Klopt dit? Pas na bevestigen vervang ik de timetable.",
    ].join("\n"), {
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Opslaan",
            callback_data: `${CONFIRM_TIMETABLE_CALLBACK_PREFIX}${festival.publicKey}`,
            style: "success",
          },
          {
            text: "Annuleren",
            callback_data: `${CANCEL_CALLBACK_PREFIX}${festival.publicKey}`,
            style: "danger",
          },
        ]],
      },
    });
  } catch (error) {
    await sendMessage(message.chat.id, [
      error instanceof Error ? error.message : "Ik kon deze timetable niet lezen.",
      "Voorbeeld: 2026-09-11;20:00;21:30;Main;Artist",
    ].join("\n"));
  }
  return true;
}

async function saveTimetableDraft(message: TelegramMessage, festival: PersistedFestival): Promise<void> {
  const prompt = await getPrompt(message.from!.id);
  if (!prompt || prompt.festivalId !== festival.id || prompt.step !== "timetable" || !prompt.draft?.length) {
    await sendMessage(message.chat.id, "Die timetable-preview is verlopen. Stuur hem opnieuw.");
    return;
  }
  const saved = await saveFestivalSchedule(festival, prompt.draft);
  const anchors = await listAnchors(festival.id);
  const status = setupStatusFor({
    mapImageUrl: festival.mapImageUrl,
    venueCenter: festival.venueCenter,
    anchors: anchors.length,
    timetableReady: performerEntries(saved).length > 0,
  });
  const updated = await updatePersistedFestival(festival.id, { status });
  await clearPrompt(message.from!.id);
  const roomToken = updated.chatId === null ? undefined : privateRoomToken(updated.chatId);
  await sendMessage(message.chat.id, `✅ ${saved.length} sets opgeslagen. ${updated.name} staat klaar.`, {
    reply_markup: {
      inline_keyboard: [[{
        text: "🗺 Open kaart",
        url: mapMiniAppUrl(festivalMapStartParam(updated, roomToken)),
        style: "success",
      }]],
    },
  });
}

async function handleCustomRadiusText(message: TelegramMessage): Promise<boolean> {
  if (!message.from || !message.text || !isPrivate(message)) return false;
  const prompt = await getPrompt(message.from.id);
  if (!prompt || prompt.step !== "radius_custom") return false;
  const meters = parseRadius(message.text);
  if (meters === null || meters < 100 || meters > 50_000) {
    await sendMessage(message.chat.id, "Stuur bv. 750 m of 1.5 km. Minimum 100 m, maximum 50 km.");
    return true;
  }
  const festival = await selectFestivalForOwner(message.from.id, prompt.festivalId);
  await finishRadius(message, festival, meters);
  return true;
}

export async function routeFestivalBotSetupUpdate(update: TelegramUpdate): Promise<boolean> {
  const callback = update.callback_query;
  const prefix = callback?.data
    ? setupPrefixes.find((candidate) => callback.data!.startsWith(candidate))
    : undefined;
  if (callback?.data && prefix) {
    const message = callback.message;
    if (!message || !isPrivate(message)) {
      await safeAnswerCallback(callback.id, "Festivalsetup werkt alleen in privé.");
      return true;
    }
    const ownerMessage: TelegramMessage = { ...message, from: callback.from };
    try {
      if (prefix === CANCEL_CALLBACK_PREFIX) {
        await Promise.all([clearPrompt(callback.from.id), clearFestivalMapUpload(callback.from.id)]);
        await safeAnswerCallback(callback.id, "Geannuleerd.");
        await sendMessage(message.chat.id, "Setupstap geannuleerd.", { reply_markup: { remove_keyboard: true } });
        return true;
      }

      if (prefix === RADIUS_CALLBACK_PREFIX) {
        const payload = callback.data.slice(prefix.length);
        const separator = payload.lastIndexOf(":");
        if (separator < 1) throw new Error("Ongeldige terreinmaat.");
        const selector = payload.slice(0, separator);
        const meters = Number(payload.slice(separator + 1));
        const festival = await selectFestivalForOwner(callback.from.id, selector);
        await safeAnswerCallback(callback.id, "Terreinmaat opgeslagen.");
        await finishRadius(ownerMessage, festival, meters);
        return true;
      }

      const selector = callback.data.slice(prefix.length);
      const festival = await selectFestivalForOwner(callback.from.id, selector);
      if (prefix === MAP_CALLBACK_PREFIX) {
        await safeAnswerCallback(callback.id, "Stuur de kaart hieronder.");
        await requestMap(ownerMessage, festival);
      } else if (prefix === VENUE_CALLBACK_PREFIX) {
        await safeAnswerCallback(callback.id, "Deel je terreinlocatie hieronder.");
        await requestVenueLocation(ownerMessage, festival);
      } else if (prefix === CUSTOM_RADIUS_CALLBACK_PREFIX) {
        await setPrompt(callback.from.id, { festivalId: festival.id, step: "radius_custom" });
        await safeAnswerCallback(callback.id, "Stuur de terreinmaat hieronder.");
        await sendMessage(message.chat.id, "Hoeveel meter ongeveer? Stuur bv. 750 m of 1.5 km.", {
          reply_markup: { force_reply: true, input_field_placeholder: "bv. 750 m" },
        });
      } else if (prefix === TIMETABLE_CALLBACK_PREFIX) {
        await safeAnswerCallback(callback.id, "Stuur de timetable hieronder.");
        await beginTimetablePrompt(ownerMessage, festival);
      } else if (prefix === CONFIRM_TIMETABLE_CALLBACK_PREFIX) {
        await safeAnswerCallback(callback.id, "Timetable opslaan…");
        await saveTimetableDraft(ownerMessage, festival);
      } else {
        await safeAnswerCallback(callback.id, "Setup geopend.");
        await showSetupStep(ownerMessage, festival);
      }
    } catch (error) {
      console.error("Festival bot setup callback failed", error);
      await safeAnswerCallback(callback.id, error instanceof Error ? error.message : "Setupstap mislukt.");
    }
    return true;
  }

  const message = update.message;
  if (!message || !message.from || !isPrivate(message)) return false;

  const location = (message as TelegramLocationMessage).location;
  if (location && await storeVenueLocation(message as TelegramLocationMessage, location)) return true;
  if (await maybeStoreFestivalMap(message)) return true;
  if (await handleCustomRadiusText(message)) return true;
  if (await maybeParseTimetable(message)) return true;

  if (!message.text) return false;
  const { command, args } = commandAndArgs(message.text);
  if (command === "/festival" && ["setup", "instellen", "configure"].includes(args.toLocaleLowerCase())) {
    const festival = await getCurrentFestivalForOwner(message.from.id);
    if (!festival) {
      await sendMessage(message.chat.id, "Je hebt nog geen festival. Gebruik /festival om er eentje te maken.");
      return true;
    }
    await showSetupStep(message, festival);
    return true;
  }
  if (command === "/festival" && ["timetable", "programma"].includes(args.toLocaleLowerCase())) {
    const festival = await getCurrentFestivalForOwner(message.from.id);
    if (!festival) {
      await sendMessage(message.chat.id, "Je hebt nog geen festival.");
      return true;
    }
    await beginTimetablePrompt(message, festival);
    return true;
  }

  return false;
}