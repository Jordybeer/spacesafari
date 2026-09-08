import { NextResponse } from "next/server";
import { routeTelegramUpdate } from "@/src/lib/bot-router";
import { routeFestivalBotSetupUpdate } from "@/src/lib/festival-bot-setup-router";
import { routeFestivalLifecycleUpdate } from "@/src/lib/festival-bot-router";
import { recoverFestivalForChat } from "@/src/lib/festival-chat-recovery";
import { getCurrentFestivalForOwner } from "@/src/lib/festival-store";
import { DEFAULT_FESTIVAL_ID } from "@/src/lib/festivals";
import { routeGroupCompanionUpdate } from "@/src/lib/group-companion-router";
import { syncTelegramCommandUi } from "@/src/lib/telegram-command-ui";
import { sendMessage, setCommandsMenuButton, type TelegramChat, type TelegramUpdate } from "@/src/lib/telegram";
import { timingSafeSecretEqual } from "@/src/lib/webhook-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function updateChat(update: TelegramUpdate): TelegramChat | undefined {
  return update.message?.chat ?? update.callback_query?.message?.chat;
}

function isGroupChat(chat: TelegramChat | undefined): boolean {
  return chat?.type === "group" || chat?.type === "supergroup";
}

function commandFromUpdate(update: TelegramUpdate): string {
  const text = update.message?.text?.trim() ?? "";
  const [raw = ""] = text.split(/\s+/);
  return raw.split("@")[0].toLowerCase();
}

function isStaleFestivalLinkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === "Festivalkoppeling is ongeldig."
    || error.message === "Deze Telegram-groep is niet meer gekoppeld aan een festival.";
}

async function normalizeTelegramUi(update: TelegramUpdate): Promise<void> {
  const chat = updateChat(update);
  try {
    await syncTelegramCommandUi();
  } catch (error) {
    console.warn("Ginder could not sync Telegram command scopes", error);
  }

  if (chat?.type !== "private") return;
  try {
    await setCommandsMenuButton(chat.id);
  } catch (error) {
    console.warn("Ginder could not restore the private Telegram menu button", error);
  }
}

async function continueFreshFestivalSetup(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  const userId = message?.from?.id;
  const sharedChatId = message?.chat_shared?.chat_id;
  if (!message || !userId || !sharedChatId || message.chat.type !== "private") return;

  const festival = await getCurrentFestivalForOwner(userId);
  if (!festival || festival.chatId !== sharedChatId || festival.status === "ready") return;

  await routeFestivalBotSetupUpdate({
    ...update,
    message: {
      ...message,
      text: "/festival setup",
      chat_shared: undefined,
    },
  });
}

async function sendStaleGroupLinkMessage(chatId: number): Promise<void> {
  await sendMessage(chatId, [
    "Deze groep heeft geen geldige Ginder-koppeling meer.",
    "De festivalmaker kan in privé /festival openen en de groep opnieuw koppelen.",
  ].join("\n"));
}

async function routeGroupUpdate(update: TelegramUpdate, chat: TelegramChat): Promise<void> {
  if (commandFromUpdate(update) === "/id") {
    await routeTelegramUpdate(update);
    return;
  }

  const festival = await recoverFestivalForChat(chat.id);
  if (!festival) {
    await sendStaleGroupLinkMessage(chat.id);
    return;
  }

  try {
    if (await routeGroupCompanionUpdate(update)) return;
  } catch (error) {
    if (!isStaleFestivalLinkError(error)) throw error;
    console.warn("Ginder blocked a stale festival group link", { chatId: chat.id, festivalId: festival.id });
    await sendStaleGroupLinkMessage(chat.id);
    return;
  }

  if (festival.id === DEFAULT_FESTIVAL_ID) {
    await routeTelegramUpdate(update);
  }
}

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    console.error("TELEGRAM_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const received = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!timingSafeSecretEqual(received, expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await normalizeTelegramUi(update);

    const setupHandled = await routeFestivalBotSetupUpdate(update);
    if (!setupHandled) {
      const lifecycleHandled = await routeFestivalLifecycleUpdate(update);
      if (lifecycleHandled) {
        await continueFreshFestivalSetup(update);
      } else {
        const chat = updateChat(update);
        if (isGroupChat(chat) && chat) {
          await routeGroupUpdate(update, chat);
        } else if (chat?.type !== "private") {
          await routeTelegramUpdate(update);
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram update failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
