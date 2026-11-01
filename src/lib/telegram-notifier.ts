const DEFAULT_TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000;
const TELEGRAM_MAX_ATTEMPTS = 3;
const TELEGRAM_MAX_RETRY_AFTER_SECONDS = 30;
// Telegram rejects messages over 4096 characters; support tickets allow up to 6000.
const TELEGRAM_MAX_TEXT_LENGTH = 4000;
const TELEGRAM_REPLY_SNIPPET_LENGTH = 500;

export interface TelegramNewTicketNotificationPayload {
  ticketId: string;
  subject: string;
  userName: string;
  userEmail: string;
  createdAt: Date;
  firstMessage: string;
}

export interface TelegramTicketReplyNotificationPayload {
  ticketId: string;
  subject: string;
  userName: string;
  userEmail: string;
  message: string;
}

export interface TelegramContractSignedNotificationPayload {
  userId: string;
  userName: string | null;
  userEmail: string;
}

export interface TelegramReleaseModerationNotificationPayload {
  releaseTitle: string;
  artistName: string;
}

function resolveAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  );
}

// `docker run --env-file` keeps quotes literally, so `TELEGRAM_BOT_TOKEN="123:…"` arrives with them.
function readEnv(name: string): string {
  return (process.env[name]?.trim() ?? "").replace(/^(["'])(.*)\1$/u, "$2").trim();
}

function getTelegramConfig():
  | { token: string; chatId: string; apiBase: string; relaySecret: string | null }
  | null {
  const token = readEnv("TELEGRAM_BOT_TOKEN");
  const chatId = readEnv("TELEGRAM_ADMIN_CHAT_ID");

  if (!token || !chatId) {
    return null;
  }

  // The production server cannot reach api.telegram.org directly, so it can send
  // through a relay (Cloudflare Worker) that checks TELEGRAM_RELAY_SECRET.
  const apiBase = (readEnv("TELEGRAM_API_BASE") || DEFAULT_TELEGRAM_API_BASE).replace(/\/+$/, "");
  const relaySecret = readEnv("TELEGRAM_RELAY_SECRET") || null;

  return { token, chatId, apiBase, relaySecret };
}

export function trimTelegramText(text: string): string {
  if (text.length <= TELEGRAM_MAX_TEXT_LENGTH) return text;
  return `${text.slice(0, TELEGRAM_MAX_TEXT_LENGTH - 1)}…`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRetryAfterSeconds(payload: string): number | null {
  try {
    const parsed = JSON.parse(payload) as { parameters?: { retry_after?: unknown } };
    const value = parsed.parameters?.retry_after;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn("[telegram] notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is not configured.");
    return false;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.relaySecret) {
    headers["X-Relay-Secret"] = config.relaySecret;
  }
  const body = JSON.stringify({
    chat_id: config.chatId,
    text: trimTelegramText(text),
    disable_web_page_preview: true
  });

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= TELEGRAM_MAX_ATTEMPTS; attempt += 1) {
    let retryDelayMs = 1000 * 2 ** (attempt - 1);
    try {
      const response = await fetch(`${config.apiBase}/bot${config.token}/sendMessage`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MS)
      });

      if (response.ok) {
        return true;
      }

      const payload = await response.text().catch(() => "");
      lastError = new Error(
        `[telegram] sendMessage failed: ${response.status} ${response.statusText} ${payload}`.trim()
      );
      if (response.status === 429) {
        const retryAfter = readRetryAfterSeconds(payload);
        if (retryAfter !== null) {
          if (retryAfter > TELEGRAM_MAX_RETRY_AFTER_SECONDS) break;
          retryDelayMs = retryAfter * 1000;
        }
      } else if (response.status < 500) {
        // Bad token, wrong chat or rejected relay secret: retrying will not help.
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = new Error(`[telegram] sendMessage failed: ${message}`);
    }

    if (attempt < TELEGRAM_MAX_ATTEMPTS) {
      await sleep(retryDelayMs);
    }
  }

  throw lastError ?? new Error("[telegram] sendMessage failed");
}

export async function notifyAdminNewSupportTicket(
  payload: TelegramNewTicketNotificationPayload
): Promise<boolean> {
  return sendTelegramMessage(buildAdminNewSupportTicketTelegramText(payload));
}

export function buildAdminSupportTicketReplyTelegramText(
  payload: TelegramTicketReplyNotificationPayload
): string {
  const adminUrl = `${resolveAppUrl().replace(/\/$/, "")}/admin/support/tickets/${payload.ticketId}`;
  const message = payload.message.trim();
  const snippet =
    message.length > TELEGRAM_REPLY_SNIPPET_LENGTH
      ? `${message.slice(0, TELEGRAM_REPLY_SNIPPET_LENGTH - 1)}…`
      : message;

  return [
    "Новый ответ в тикете",
    "",
    `Тикет: #${payload.ticketId}`,
    `Тема: ${payload.subject}`,
    `Пользователь: ${payload.userName}`,
    `Email: ${payload.userEmail}`,
    "",
    "Сообщение:",
    snippet,
    "",
    "Ответить в админ-панели:",
    adminUrl
  ].join("\n");
}

export async function notifyAdminSupportTicketReply(
  payload: TelegramTicketReplyNotificationPayload
): Promise<boolean> {
  return sendTelegramMessage(buildAdminSupportTicketReplyTelegramText(payload));
}

export function buildAdminNewSupportTicketTelegramText(
  payload: TelegramNewTicketNotificationPayload
): string {
  const adminUrl = `${resolveAppUrl().replace(/\/$/, "")}/admin/support/tickets/${payload.ticketId}`;
  const createdAt = payload.createdAt.toISOString().slice(0, 16).replace("T", " ");

  return [
    "Новый тикет в поддержке",
    "",
    `Тикет: #${payload.ticketId}`,
    `Тема: ${payload.subject}`,
    `Пользователь: ${payload.userName}`,
    `Email: ${payload.userEmail}`,
    `Дата: ${createdAt}`,
    "",
    "Сообщение:",
    payload.firstMessage,
    "",
    "Ответить в админ-панели:",
    adminUrl
  ].join("\n");
}

export function buildContractSignedTelegramText(
  payload: TelegramContractSignedNotificationPayload
): string {
  return `Пользователь ${payload.userName?.trim() || payload.userId} - ${payload.userEmail} подписал договор. Необходимо его проверить.`;
}

export async function notifyAdminContractSigned(
  payload: TelegramContractSignedNotificationPayload
): Promise<boolean> {
  return sendTelegramMessage(buildContractSignedTelegramText(payload));
}

export function buildReleaseModerationTelegramText(
  payload: TelegramReleaseModerationNotificationPayload
): string {
  return `Релиз на модерацию: ${payload.releaseTitle} — ${payload.artistName}`;
}

export async function notifyAdminReleaseSubmitted(
  payload: TelegramReleaseModerationNotificationPayload
): Promise<boolean> {
  return sendTelegramMessage(buildReleaseModerationTelegramText(payload));
}
