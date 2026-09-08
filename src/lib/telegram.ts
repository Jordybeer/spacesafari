import { requireEnv } from "./env";

const API = "https://api.telegram.org";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  thumbnail?: TelegramPhotoSize;
}

export interface TelegramChatShared {
  request_id: number;
  chat_id: number;
  title?: string;
  username?: string;
  photo?: TelegramPhotoSize[];
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  chat_shared?: TelegramChatShared;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: TelegramMessage;
  };
}

async function callTelegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!payload.ok) throw new Error(`Telegram ${method} failed: ${payload.description ?? "unknown error"}`);
  return payload.result as T;
}

export function sendMessage(
  chatId: string | number,
  text: string,
  options: Record<string, unknown> = {},
) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...options,
  });
}

export function sendPhoto(
  chatId: string | number,
  photo: string,
  caption: string,
  options: Record<string, unknown> = {},
) {
  return callTelegram("sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    ...options,
  });
}

export function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export async function createChatInviteLink(chatId: string | number, name = "Ginder") {
  return await callTelegram<{ invite_link: string }>("createChatInviteLink", {
    chat_id: chatId,
    name: name.slice(0, 32),
  });
}

export async function leaveChat(chatId: string | number): Promise<void> {
  await callTelegram<boolean>("leaveChat", { chat_id: chatId });
}

export async function setCommandsMenuButton(chatId?: number): Promise<void> {
  await callTelegram<boolean>("setChatMenuButton", {
    ...(chatId !== undefined ? { chat_id: chatId } : {}),
    menu_button: { type: "commands" },
  });
}

export async function getTelegramFilePath(fileId: string): Promise<string> {
  const file = await callTelegram<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram gaf geen bestandspad terug.");
  return file.file_path;
}

export function telegramFileUrl(filePath: string): string {
  return `${API}/file/bot${requireEnv("TELEGRAM_BOT_TOKEN")}/${filePath.replace(/^\/+/, "")}`;
}

export function mapMiniAppUrl(startParam = "map"): string {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  const shortName = process.env.TELEGRAM_MINI_APP_SHORT_NAME;
  const encodedStartParam = encodeURIComponent(startParam);

  if (username && shortName) {
    return `https://t.me/${username}/${shortName}?startapp=${encodedStartParam}`;
  }

  // A configured Main Mini App does not need a short name. This deep link keeps
  // Telegram launch context/initData intact, unlike opening APP_URL as a normal URL.
  if (username) {
    return `https://t.me/${username}?startapp=${encodedStartParam}`;
  }

  // Browser-only fallback for development. Live Telegram map launches should use
  // one of the t.me links above so the server can validate Telegram initData.
  return `${requireEnv("APP_URL")}/map?startapp=${encodedStartParam}`;
}