import { createHash } from "node:crypto";

// Account events in VK direct messages from the community (messages.send with the community
// key). VK lets a community write only to people who allowed it: the permission arrives through
// the Callback API (message_allow / message_deny) or is checked with isMessagesFromGroupAllowed.

const DEFAULT_VK_API_BASE = "https://api.vk.ru";
const VK_API_VERSION = "5.199";
const VK_REQUEST_TIMEOUT_MS = 10_000;
const VK_MAX_ATTEMPTS = 3;
// VK rejects messages over 4096 characters.
const VK_MAX_TEXT_LENGTH = 4000;

// 6: too many requests per second, 10: internal server error. Both pass on retry.
const VK_RETRYABLE_ERRORS = new Set([6, 10]);
// 901: the user has not allowed (or revoked) messages from the community, 902: privacy settings.
const VK_NOT_ALLOWED_ERRORS = new Set([901, 902]);

export interface VkMessagesConfig {
  groupId: string;
  groupToken: string;
  apiBase: string;
  relaySecret: string | null;
}

export type VkSendResult = "sent" | "not_allowed";

type FetchLike = typeof fetch;

// `docker run --env-file` keeps quotes literally, so values may arrive wrapped in them.
function readEnv(name: string): string {
  return (process.env[name]?.trim() ?? "").replace(/^(["'])(.*)\1$/u, "$2").trim();
}

export function getVkMessagesConfig(): VkMessagesConfig | null {
  const groupId = readEnv("VK_GROUP_ID");
  const groupToken = readEnv("VK_GROUP_TOKEN");
  if (!groupId || !groupToken) return null;
  // If the production server cannot reach api.vk.ru, it sends through the Cloudflare relay
  // (scripts/telegram-relay) that checks VK_RELAY_SECRET, as with Telegram.
  const apiBase = (readEnv("VK_API_BASE") || DEFAULT_VK_API_BASE).replace(/\/+$/u, "");
  return { groupId, groupToken, apiBase, relaySecret: readEnv("VK_RELAY_SECRET") || null };
}

export function trimVkText(text: string): string {
  if (text.length <= VK_MAX_TEXT_LENGTH) return text;
  return `${text.slice(0, VK_MAX_TEXT_LENGTH - 1)}…`;
}

// messages.send drops a repeated random_id, so a retried event is never sent twice.
export function vkRandomIdFor(eventId: string): number {
  return createHash("sha256").update(eventId).digest().readInt32BE(0);
}

export class VkApiError extends Error {
  constructor(
    readonly method: string,
    readonly code: number | null,
    detail: string
  ) {
    super(`[vk] ${method} failed: ${code ?? "network"} ${detail}`.trim());
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callVkMethod(params: {
  config: VkMessagesConfig;
  method: string;
  args: Record<string, string>;
  fetchImpl?: FetchLike;
}): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (params.config.relaySecret) headers["X-Relay-Secret"] = params.config.relaySecret;
  const body = new URLSearchParams({ ...params.args, access_token: params.config.groupToken, v: VK_API_VERSION });

  let response: Response;
  try {
    response = await (params.fetchImpl ?? fetch)(`${params.config.apiBase}/method/${params.method}`, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(VK_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new VkApiError(params.method, null, error instanceof Error ? error.message : String(error));
  }

  const payload = (await response.json().catch(() => null)) as
    | { response?: unknown; error?: { error_code?: number; error_msg?: string } }
    | null;
  if (payload?.error) {
    throw new VkApiError(params.method, payload.error.error_code ?? null, payload.error.error_msg ?? "");
  }
  if (!response.ok || !payload) {
    // A 5xx from VK or the relay is retried like a network error; a 4xx is the relay refusing us.
    throw new VkApiError(params.method, response.status >= 500 ? null : response.status, `HTTP ${response.status}`);
  }
  return payload.response;
}

export async function sendVkCommunityMessage(params: {
  config: VkMessagesConfig;
  vkUserId: string;
  text: string;
  randomId: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}): Promise<VkSendResult> {
  const sleep = params.sleep ?? defaultSleep;
  let lastError: VkApiError | null = null;
  for (let attempt = 1; attempt <= VK_MAX_ATTEMPTS; attempt += 1) {
    try {
      await callVkMethod({
        config: params.config,
        method: "messages.send",
        args: {
          peer_id: params.vkUserId,
          random_id: String(params.randomId),
          message: trimVkText(params.text)
        },
        fetchImpl: params.fetchImpl
      });
      return "sent";
    } catch (error) {
      if (!(error instanceof VkApiError)) throw error;
      if (error.code !== null && VK_NOT_ALLOWED_ERRORS.has(error.code)) return "not_allowed";
      lastError = error;
      // Wrong key, missing rights, flood control (9): retrying will not help.
      if (error.code !== null && !VK_RETRYABLE_ERRORS.has(error.code)) break;
    }
    if (attempt < VK_MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
  }
  throw lastError ?? new VkApiError("messages.send", null, "");
}

export async function checkVkMessagesAllowed(params: {
  config: VkMessagesConfig;
  vkUserId: string;
  fetchImpl?: FetchLike;
}): Promise<boolean> {
  const response = (await callVkMethod({
    config: params.config,
    method: "messages.isMessagesFromGroupAllowed",
    args: { group_id: params.config.groupId, user_id: params.vkUserId },
    fetchImpl: params.fetchImpl
  })) as { is_allowed?: unknown } | null;
  return response?.is_allowed === 1 || response?.is_allowed === true;
}

function resolveAppUrl(): string {
  return (
    readEnv("NEXT_PUBLIC_APP_URL") ||
    readEnv("NEXTAUTH_URL") ||
    "https://www.icecreammusic.net"
  ).replace(/\/+$/u, "");
}

export function toAbsoluteAppUrl(href: string): string {
  if (/^https?:\/\//u.test(href)) return href;
  return `${resolveAppUrl()}${href.startsWith("/") ? href : `/${href}`}`;
}

export function buildVkNotificationText(event: { title: string; message: string; href: string }): string {
  return [event.title, event.message, toAbsoluteAppUrl(event.href)].filter((part) => part.trim()).join("\n\n");
}

// Only the artist's own account events go to VK: releases, money, support, reminders. Likes,
// comments and direct messages stay in the cabinet.
const VK_NOTIFICATION_KIND_PREFIXES = ["account_", "release_", "report_", "payout_", "vk_messages_"];
const VK_NOTIFICATION_KINDS = new Set(["support_reply"]);
// Admin-facing events that share a prefix with artist events.
const VK_EXCLUDED_KINDS = new Set(["release_delete_request"]);

export function isVkNotificationKind(kind: string): boolean {
  if (VK_EXCLUDED_KINDS.has(kind)) return false;
  return VK_NOTIFICATION_KINDS.has(kind) || VK_NOTIFICATION_KIND_PREFIXES.some((prefix) => kind.startsWith(prefix));
}

// Approval means the release goes out to the platforms: in VK the artist is offered a story snippet.
export const RELEASE_APPROVED_VK_HREF = "/dashboard/video-snippets";

export function buildReleaseApprovedVkMessage(releaseTitle: string | null | undefined): string {
  return `Релиз «${releaseTitle?.trim() || "Без названия"}» принят и отправлен на площадки. Сделайте вертикальный сниппет для сторис в Snippet Studio:`;
}
