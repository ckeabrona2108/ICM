import type { PrismaClient } from "@prisma/client";

import { readOAuthEnv } from "@/lib/oauth-login";
import { isAnyPrismaColumnMissingError, isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { getTelegramLoginConfig } from "@/lib/telegram-login";
import { buildVkNotificationText, isVkNotificationKind } from "@/lib/vk-messages";

// Account events in Telegram from the login bot. Signing in or connecting Telegram asks for
// permission to write (request_access=write), and the bot writes to chat_id = Telegram user id.
// The production server cannot reach api.telegram.org, so like the admin notifications this
// goes through TELEGRAM_API_BASE (the Cloudflare relay) with TELEGRAM_RELAY_SECRET.

const DEFAULT_TELEGRAM_API_BASE = "https://api.telegram.org";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_TEXT_LENGTH = 4_000;
const OAUTH_STORAGE = ["oauth_accounts", "icecream.oauth_accounts"];
const BLOCKED_COLUMNS = ["oauth_accounts.messages_blocked_at", "messages_blocked_at"];

type OAuthAccountsDb = Pick<PrismaClient, "oauth_accounts">;

export interface TelegramSendConfig {
  botToken: string;
  apiBase: string;
  relaySecret: string | null;
}

export type TelegramSendResult = "sent" | "blocked" | "failed";

// Everything about the artist's own cabinet goes to Telegram, the same events as VK messages:
// releases, money, support, reminders. Only the VK-specific "messages from the community are on"
// greeting stays out. Likes, comments and DMs from other artists never reach either messenger.
export function isTelegramNotificationKind(kind: string): boolean {
  return isVkNotificationKind(kind) && !kind.startsWith("vk_messages_");
}

export function getTelegramSendConfig(): TelegramSendConfig | null {
  const login = getTelegramLoginConfig();
  if (!login) return null;
  return {
    botToken: login.botToken,
    apiBase: (readOAuthEnv("TELEGRAM_API_BASE") || DEFAULT_TELEGRAM_API_BASE).replace(/\/+$/u, ""),
    relaySecret: readOAuthEnv("TELEGRAM_RELAY_SECRET") || null
  };
}

function isStorageMissing(error: unknown): boolean {
  return isAnyPrismaTableMissingError(error, OAUTH_STORAGE) || isAnyPrismaColumnMissingError(error, BLOCKED_COLUMNS);
}

export function trimTelegramUserText(text: string): string {
  return text.length <= MAX_TEXT_LENGTH ? text : `${text.slice(0, MAX_TEXT_LENGTH - 1)}…`;
}

// 403 means the artist blocked the bot or never allowed it to write; retrying will not help.
export async function sendTelegramUserMessage(params: {
  config: TelegramSendConfig;
  chatId: string;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<TelegramSendResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (params.config.relaySecret) headers["X-Relay-Secret"] = params.config.relaySecret;
  try {
    const response = await (params.fetchImpl ?? fetch)(`${params.config.apiBase}/bot${params.config.botToken}/sendMessage`, {
      method: "POST",
      headers,
      body: JSON.stringify({ chat_id: params.chatId, text: trimTelegramUserText(params.text), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (response.ok) return "sent";
    const payload = await response.text().catch(() => "");
    // The relay answers 403 "Forbidden" itself when the secret is wrong; that is our fault, not a block.
    if (response.status === 403 && payload.includes("\"ok\"")) return "blocked";
    if (response.status === 400 && /chat not found/iu.test(payload)) return "blocked";
    console.error("[telegram-notification] sendMessage failed", response.status, payload.slice(0, 300));
    return "failed";
  } catch (error) {
    console.error("[telegram-notification] sendMessage failed", error);
    return "failed";
  }
}

async function setBlocked(prisma: OAuthAccountsDb, telegramUserId: string, blockedAt: Date | null) {
  await prisma.oauth_accounts.updateMany({
    where: { provider: "telegram", provider_account_id: telegramUserId },
    data: { messages_blocked_at: blockedAt }
  });
}

export async function markTelegramMessagesReachable(prisma: OAuthAccountsDb, telegramUserId: string): Promise<void> {
  try {
    await setBlocked(prisma, telegramUserId, null);
  } catch (error) {
    if (!isStorageMissing(error)) console.error("[telegram-notification] could not clear the block", error);
  }
}

export interface TelegramChannelEvent {
  id: string;
  userId: string;
  title: string;
  message: string;
  href: string;
  // Messenger copy shared with VK: a shorter text and its own link.
  vkMessage?: string;
  vkHref?: string;
}

// The Telegram copy of a cabinet notification. Never throws. It still tries a "blocked" artist:
// after they press Start in the bot the next event gets through and clears the mark.
export async function sendTelegramUserNotification(
  prisma: OAuthAccountsDb,
  event: TelegramChannelEvent,
  options: { config?: TelegramSendConfig | null; fetchImpl?: typeof fetch; now?: Date } = {}
): Promise<boolean> {
  const config = options.config === undefined ? getTelegramSendConfig() : options.config;
  if (!config) return false;
  try {
    const account = await prisma.oauth_accounts.findUnique({
      where: { user_id_provider: { user_id: event.userId, provider: "telegram" } },
      select: { provider_account_id: true, messages_blocked_at: true }
    });
    if (!account) return false;

    const result = await sendTelegramUserMessage({
      config,
      chatId: account.provider_account_id,
      text: buildVkNotificationText({
        title: event.title,
        message: event.vkMessage ?? event.message,
        href: event.vkHref ?? event.href
      }),
      fetchImpl: options.fetchImpl
    });
    if (result === "blocked" && !account.messages_blocked_at) {
      await setBlocked(prisma, account.provider_account_id, options.now ?? new Date());
    }
    if (result === "sent" && account.messages_blocked_at) {
      await setBlocked(prisma, account.provider_account_id, null);
    }
    return result === "sent";
  } catch (error) {
    if (!isStorageMissing(error)) {
      console.error("[telegram-notification] failed", { eventId: event.id, userId: event.userId, error });
    }
    return false;
  }
}

// A first message right after connecting, so the artist sees where notifications come from and
// the cabinet learns whether the bot may write.
export async function sendTelegramWelcome(
  prisma: OAuthAccountsDb,
  telegramUserId: string,
  options: { config?: TelegramSendConfig | null; fetchImpl?: typeof fetch } = {}
): Promise<TelegramSendResult | null> {
  const config = options.config === undefined ? getTelegramSendConfig() : options.config;
  if (!config) return null;
  const result = await sendTelegramUserMessage({
    config,
    chatId: telegramUserId,
    text: "Telegram подключён к кабинету ICE CREAM MUSIC. Сюда будут приходить новости вашего кабинета: релизы, отчёты, выплаты и ответы поддержки.",
    fetchImpl: options.fetchImpl
  });
  try {
    if (result === "blocked") await setBlocked(prisma, telegramUserId, new Date());
    if (result === "sent") await setBlocked(prisma, telegramUserId, null);
  } catch (error) {
    if (!isStorageMissing(error)) console.error("[telegram-notification] could not store the status", error);
  }
  return result;
}
