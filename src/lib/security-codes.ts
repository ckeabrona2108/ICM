import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { canReceiveAccountEmail, escapeEmailHtml, sendAccountEmail } from "@/lib/account-security";
import { resolveNextAuthSecret } from "@/lib/auth-secret";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { getSmtpBzTransporter, getSmtpFromAddress } from "@/lib/smtp-bz";
import {
  getTelegramSendConfig,
  markTelegramMessagesReachable,
  sendTelegramUserMessage,
  type TelegramSendConfig
} from "@/lib/telegram-notification-channel";
import { getVkMessagesConfig, sendVkCommunityMessage, vkRandomIdFor, type VkMessagesConfig } from "@/lib/vk-messages";

// Codes for actions that move money or change who controls the cabinet. A 6-digit code goes to
// Telegram, VK messages or a confirmed email; the artist types it in, and the verified code lets
// the action through once within 10 minutes. Signing in and everyday work never ask for a code.
//
// A channel added without a code from another channel (no channel existed yet, or a Telegram/VK
// linked by whoever holds the session) gets codes only after a 48-hour hold, and the other
// channels hear about it, so a stolen session cannot send the codes to the thief.

export type SecurityAction = "payout" | "password" | "email" | "unlink";
export const SECURITY_ACTIONS: readonly SecurityAction[] = ["payout", "password", "email", "unlink"];
export type CodeChannel = "telegram" | "vk" | "email";
export const CODE_CHANNELS: readonly CodeChannel[] = ["telegram", "vk", "email"];

export const CODE_TTL_MS = 10 * 60_000;
export const GRANT_TTL_MS = 10 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_INTERVAL_MS = 60_000;
export const MAX_SENDS_PER_HOUR = 6;
export const CHANNEL_HOLD_MS = 48 * 60 * 60_000;

const STORAGE = ["security_codes", "icecream.security_codes", "security_channel_holds", "icecream.security_channel_holds"];

export const CHANNEL_LABELS: Record<CodeChannel, string> = {
  telegram: "Telegram",
  vk: "сообщения VK",
  email: "почту"
};

const ACTION_TITLES: Record<SecurityAction, string> = {
  payout: "выплаты",
  password: "смены пароля",
  email: "смены почты",
  unlink: "отключения способа входа"
};

export function isSecurityAction(value: unknown): value is SecurityAction {
  return typeof value === "string" && (SECURITY_ACTIONS as readonly string[]).includes(value);
}

export function isCodeChannel(value: unknown): value is CodeChannel {
  return typeof value === "string" && (CODE_CHANNELS as readonly string[]).includes(value);
}

export function isSecurityStorageMissing(error: unknown): boolean {
  return isAnyPrismaTableMissingError(error, STORAGE);
}

export function generateSecurityCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function codeSecret(): string {
  const secret = resolveNextAuthSecret();
  if (!secret) throw new Error("NEXTAUTH_SECRET is not configured");
  return secret;
}

export function hashSecurityCode(challengeId: string, code: string, secret: string = codeSecret()): string {
  return createHmac("sha256", secret).update(`security-code:${challengeId}:${code}`).digest("hex");
}

export function normalizeSecurityCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/gu, "");
  return digits.length === 6 ? digits : null;
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- Channels -------------------------------------------------------------------------------

type ChannelDb = Pick<PrismaClient, "user" | "oauth_accounts" | "vk_links" | "security_channel_holds">;

export interface CodeChannelState {
  /** Channels that can receive a code now, in the order they are offered. */
  ready: CodeChannel[];
  /** Channels still on the 48-hour hold, with the moment they start receiving codes. */
  held: Array<{ channel: CodeChannel; until: Date }>;
}

export interface ChannelFacts {
  telegramLinked: boolean;
  vkMessagesAllowed: boolean;
  emailConfirmed: boolean;
  holds: Array<{ channel: string; trusted_from: Date }>;
  services: { telegram: boolean; vk: boolean; email: boolean };
}

export function resolveCodeChannels(facts: ChannelFacts, now: Date = new Date()): CodeChannelState {
  const present: Record<CodeChannel, boolean> = {
    telegram: facts.services.telegram && facts.telegramLinked,
    vk: facts.services.vk && facts.vkMessagesAllowed,
    email: facts.services.email && facts.emailConfirmed
  };
  const state: CodeChannelState = { ready: [], held: [] };
  for (const channel of CODE_CHANNELS) {
    if (!present[channel]) continue;
    const hold = facts.holds.find((row) => row.channel === channel);
    if (hold && hold.trusted_from.getTime() > now.getTime()) state.held.push({ channel, until: hold.trusted_from });
    else state.ready.push(channel);
  }
  return state;
}

// Local development only: codes and notices go to the server log instead of Telegram, VK and mail.
function isLogOnlyDelivery(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.SECURITY_CODES_LOG_ONLY === "1";
}

function readServices() {
  if (isLogOnlyDelivery()) return { telegram: true, vk: true, email: true };
  return {
    telegram: Boolean(getTelegramSendConfig()),
    vk: Boolean(getVkMessagesConfig()),
    email: Boolean(getSmtpBzTransporter() && getSmtpFromAddress())
  };
}

export async function readCodeChannels(
  db: ChannelDb,
  userId: string,
  now: Date = new Date(),
  services: ChannelFacts["services"] = readServices()
): Promise<CodeChannelState> {
  const [user, telegram, vk, holds] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } }),
    db.oauth_accounts.findUnique({ where: { user_id_provider: { user_id: userId, provider: "telegram" } }, select: { id: true } }).catch(() => null),
    db.vk_links.findUnique({ where: { user_id: userId }, select: { messages_allowed: true } }).catch(() => null),
    db.security_channel_holds.findMany({ where: { user_id: userId }, select: { channel: true, trusted_from: true } }).catch((error) => {
      if (isSecurityStorageMissing(error)) return [];
      throw error;
    })
  ]);
  return resolveCodeChannels(
    {
      telegramLinked: Boolean(telegram),
      vkMessagesAllowed: Boolean(vk?.messages_allowed),
      emailConfirmed: Boolean(user && canReceiveAccountEmail(user.email) && user.emailVerified),
      holds,
      services
    },
    now
  );
}

/**
 * Puts a freshly added channel on hold. Called after a Telegram or VK link and after an email
 * change; existing channels of a cabinet never get a hold, so nothing changes for them.
 */
export async function holdNewCodeChannel(
  db: Pick<PrismaClient, "security_channel_holds">,
  userId: string,
  channel: CodeChannel,
  now: Date = new Date()
): Promise<Date | null> {
  const trustedFrom = new Date(now.getTime() + CHANNEL_HOLD_MS);
  try {
    await db.security_channel_holds.upsert({
      where: { user_id_channel: { user_id: userId, channel } },
      create: { user_id: userId, channel, trusted_from: trustedFrom },
      update: { trusted_from: trustedFrom, created_at: now }
    });
    return trustedFrom;
  } catch (error) {
    if (!isSecurityStorageMissing(error)) console.error("[security-codes] could not hold the channel", { userId, channel, error });
    return null;
  }
}

/** A channel linked right after a code from this same cabinet needs no hold. */
export async function releaseCodeChannelHold(
  db: Pick<PrismaClient, "security_channel_holds">,
  userId: string,
  channel: CodeChannel
): Promise<void> {
  await db.security_channel_holds.deleteMany({ where: { user_id: userId, channel } }).catch(() => undefined);
}

// ---- Sending --------------------------------------------------------------------------------

type CodeDb = Pick<PrismaClient, "security_codes">;

export type SendCodeResult =
  | { ok: true; challengeId: string; channel: CodeChannel; expiresAt: Date; resendAt: Date }
  | { ok: false; error: "no_channel" | "channel_unavailable" | "too_soon" | "too_many" | "delivery_failed"; retryAt?: Date };

export interface CodeSenders {
  send(channel: CodeChannel, userId: string, text: { plain: string; subject: string; html: string }, eventId: string): Promise<"sent" | "blocked" | "failed">;
}

export function buildSecurityCodeText(params: { code: string; action: SecurityAction }) {
  const subject = `Код для ${ACTION_TITLES[params.action]}: ${params.code}`;
  const what = `Код для ${ACTION_TITLES[params.action]}`;
  const plain = [
    `${what}: ${params.code}`,
    "",
    "Действует 10 минут. Никому его не сообщайте, даже поддержке ICECREAMMUSIC.",
    "Если это не вы, смените пароль и напишите в поддержку: кто-то вошёл в ваш кабинет."
  ].join("\n");
  const html = `<p>${escapeEmailHtml(what)}:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${params.code}</p><p>Действует 10 минут. Никому его не сообщайте, даже поддержке ICECREAMMUSIC.</p><p>Если это не вы, смените пароль и напишите в поддержку: кто-то вошёл в ваш кабинет.</p>`;
  return { plain, subject, html };
}

export async function issueSecurityCode(
  db: CodeDb & ChannelDb,
  params: {
    userId: string;
    action: SecurityAction;
    channel?: CodeChannel | null;
    senders?: CodeSenders;
    /** Tests pass the configured services instead of reading the server environment. */
    services?: ChannelFacts["services"];
    now?: Date;
    secret?: string;
  }
): Promise<SendCodeResult> {
  const now = params.now ?? new Date();
  const channels = await readCodeChannels(db, params.userId, now, params.services);
  if (channels.ready.length === 0) return { ok: false, error: "no_channel" };
  const channel = params.channel ?? channels.ready[0]!;
  if (!channels.ready.includes(channel)) return { ok: false, error: "channel_unavailable" };

  const recent = await db.security_codes.findMany({
    where: { user_id: params.userId, created_at: { gt: new Date(now.getTime() - 60 * 60_000) } },
    orderBy: { created_at: "desc" },
    select: { created_at: true, action: true, channel: true }
  });
  if (recent.length >= MAX_SENDS_PER_HOUR) {
    return { ok: false, error: "too_many", retryAt: new Date(recent[recent.length - 1]!.created_at.getTime() + 60 * 60_000) };
  }
  // Switching to another channel is the way out of a code that does not arrive, so only the
  // same channel waits a minute.
  const last = recent.find((row) => row.action === params.action && row.channel === channel);
  if (last && now.getTime() - last.created_at.getTime() < RESEND_INTERVAL_MS) {
    return { ok: false, error: "too_soon", retryAt: new Date(last.created_at.getTime() + RESEND_INTERVAL_MS) };
  }

  const code = generateSecurityCode();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  const row = await db.security_codes.create({
    data: { user_id: params.userId, action: params.action, channel, code_hash: "pending", expires_at: expiresAt, created_at: now },
    select: { id: true }
  });
  await db.security_codes.update({
    where: { id: row.id },
    data: { code_hash: hashSecurityCode(row.id, code, params.secret) },
    select: { id: true }
  });

  const result = await (params.senders ?? defaultSenders(db)).send(
    channel,
    params.userId,
    buildSecurityCodeText({ code, action: params.action }),
    `security-code-${row.id}`
  );
  if (result !== "sent") {
    await db.security_codes.deleteMany({ where: { id: row.id } });
    return { ok: false, error: result === "blocked" ? "channel_unavailable" : "delivery_failed" };
  }
  // Earlier codes for this action stop working once a new one is out.
  await db.security_codes.updateMany({
    where: { user_id: params.userId, action: params.action, id: { not: row.id }, verified_at: null, used_at: null },
    data: { expires_at: now }
  });
  return { ok: true, challengeId: row.id, channel, expiresAt, resendAt: new Date(now.getTime() + RESEND_INTERVAL_MS) };
}

// ---- Verifying and using --------------------------------------------------------------------

export type VerifyCodeResult =
  | { ok: true; action: SecurityAction }
  | { ok: false; error: "invalid" | "expired" | "attempts"; attemptsLeft?: number };

export async function verifySecurityCode(
  db: CodeDb,
  params: { userId: string; challengeId: string; code: string; now?: Date; secret?: string }
): Promise<VerifyCodeResult> {
  const now = params.now ?? new Date();
  const row = await db.security_codes.findFirst({
    where: { id: params.challengeId, user_id: params.userId },
    select: { id: true, action: true, code_hash: true, attempts: true, expires_at: true, verified_at: true, used_at: true }
  });
  if (!row || !isSecurityAction(row.action) || row.used_at) return { ok: false, error: "expired" };
  if (row.verified_at) return { ok: true, action: row.action };
  if (row.expires_at.getTime() <= now.getTime()) return { ok: false, error: "expired" };
  if (row.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, error: "attempts" };

  // The attempt is counted before the comparison, and only while attempts are left, so parallel
  // guesses cannot get past the limit.
  const counted = await db.security_codes.updateMany({
    where: { id: row.id, attempts: { lt: MAX_CODE_ATTEMPTS }, verified_at: null },
    data: { attempts: { increment: 1 } }
  });
  if (counted.count !== 1) return { ok: false, error: "attempts" };

  if (!sameHash(row.code_hash, hashSecurityCode(row.id, params.code, params.secret))) {
    const attemptsLeft = MAX_CODE_ATTEMPTS - row.attempts - 1;
    return attemptsLeft > 0 ? { ok: false, error: "invalid", attemptsLeft } : { ok: false, error: "attempts" };
  }
  await db.security_codes.update({ where: { id: row.id }, data: { verified_at: now }, select: { id: true } });
  return { ok: true, action: row.action };
}

/**
 * Uses up a verified code for this action: the id of the used code once per code, within 10
 * minutes of typing it, otherwise null.
 */
export async function consumeSecurityGrant(
  db: CodeDb,
  params: { userId: string; action: SecurityAction; now?: Date }
): Promise<string | null> {
  const now = params.now ?? new Date();
  const grant = await db.security_codes.findFirst({
    where: {
      user_id: params.userId,
      action: params.action,
      used_at: null,
      verified_at: { gt: new Date(now.getTime() - GRANT_TTL_MS) }
    },
    orderBy: { verified_at: "desc" },
    select: { id: true }
  });
  if (!grant) return null;
  const used = await db.security_codes.updateMany({ where: { id: grant.id, used_at: null }, data: { used_at: now } });
  return used.count === 1 ? grant.id : null;
}

/** Gives the code back when the action itself failed (a typo in the amount, a wrong password). */
export async function restoreSecurityGrant(db: CodeDb, grantId: string): Promise<void> {
  await db.security_codes.updateMany({ where: { id: grantId }, data: { used_at: null } }).catch(() => undefined);
}

/**
 * Payouts always need a code. Account-access changes need one when the cabinet has a channel to
 * receive it; without any, the artist must be able to add the first one (an email, a Telegram).
 */
export function decideSecurityRequirement(action: SecurityAction, channels: CodeChannelState): boolean {
  if (action === "payout") return true;
  return channels.ready.length > 0;
}

export interface SecurityCodeChallenge {
  action: SecurityAction;
  channels: CodeChannel[];
  held: Array<{ channel: CodeChannel; until: string }>;
}

export type SecurityGate =
  // viaCode: false means the cabinet had no channel and the action went through without a code.
  | { ok: true; viaCode: boolean; grantId: string | null }
  | { ok: false; challenge: SecurityCodeChallenge };

export async function checkSecurityGate(
  db: CodeDb & ChannelDb,
  params: { userId: string; action: SecurityAction; now?: Date }
): Promise<SecurityGate> {
  try {
    const channels = await readCodeChannels(db, params.userId, params.now);
    if (!decideSecurityRequirement(params.action, channels)) return { ok: true, viaCode: false, grantId: null };
    const grantId = await consumeSecurityGrant(db, params);
    if (grantId) return { ok: true, viaCode: true, grantId };
    return {
      ok: false,
      challenge: {
        action: params.action,
        channels: channels.ready,
        held: channels.held.map((hold) => ({ channel: hold.channel, until: hold.until.toISOString() }))
      }
    };
  } catch (error) {
    // Until the migration is applied the cabinet works as before.
    if (isSecurityStorageMissing(error)) return { ok: true, viaCode: true, grantId: null };
    throw error;
  }
}

// ---- Delivery -------------------------------------------------------------------------------

async function sendToTelegram(
  db: Pick<PrismaClient, "oauth_accounts">,
  config: TelegramSendConfig,
  userId: string,
  text: string
): Promise<"sent" | "blocked" | "failed"> {
  const account = await db.oauth_accounts.findUnique({
    where: { user_id_provider: { user_id: userId, provider: "telegram" } },
    select: { provider_account_id: true, messages_blocked_at: true }
  });
  if (!account) return "blocked";
  const result = await sendTelegramUserMessage({ config, chatId: account.provider_account_id, text });
  if (result === "sent" && account.messages_blocked_at) await markTelegramMessagesReachable(db, account.provider_account_id);
  if (result === "blocked" && !account.messages_blocked_at) {
    await db.oauth_accounts.updateMany({
      where: { provider: "telegram", provider_account_id: account.provider_account_id },
      data: { messages_blocked_at: new Date() }
    }).catch(() => undefined);
  }
  return result;
}

async function sendToVk(
  db: Pick<PrismaClient, "vk_links">,
  config: VkMessagesConfig,
  userId: string,
  text: string,
  eventId: string
): Promise<"sent" | "blocked" | "failed"> {
  const link = await db.vk_links.findUnique({ where: { user_id: userId }, select: { vk_user_id: true, messages_allowed: true } });
  if (!link?.messages_allowed) return "blocked";
  try {
    const result = await sendVkCommunityMessage({ config, vkUserId: link.vk_user_id, text, randomId: vkRandomIdFor(eventId) });
    if (result === "not_allowed") {
      await db.vk_links.update({ where: { user_id: userId }, data: { messages_allowed: false, messages_checked_at: new Date() } }).catch(() => undefined);
      return "blocked";
    }
    return "sent";
  } catch (error) {
    console.error("[security-codes] VK send failed", error);
    return "failed";
  }
}

async function sendToEmail(db: Pick<PrismaClient, "user">, userId: string, text: { plain: string; subject: string; html: string }) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
  if (!user || !canReceiveAccountEmail(user.email) || !user.emailVerified) return "blocked" as const;
  try {
    await sendAccountEmail({ to: user.email, subject: text.subject, text: text.plain, html: text.html });
    return "sent" as const;
  } catch (error) {
    console.error("[security-codes] email send failed", error);
    return "failed" as const;
  }
}

function defaultSenders(db: Pick<PrismaClient, "oauth_accounts" | "vk_links" | "user">): CodeSenders {
  return {
    async send(channel, userId, text, eventId) {
      if (isLogOnlyDelivery()) {
        console.info(`[security-codes] ${channel} → ${userId}: ${text.plain.split("\n")[0]}`);
        return "sent";
      }
      if (channel === "telegram") {
        const config = getTelegramSendConfig();
        return config ? sendToTelegram(db, config, userId, text.plain) : "failed";
      }
      if (channel === "vk") {
        const config = getVkMessagesConfig();
        return config ? sendToVk(db, config, userId, text.plain, eventId) : "failed";
      }
      return sendToEmail(db, userId, text);
    }
  };
}

/**
 * A security notice on every channel the cabinet has, whatever the notification switches say:
 * "a payout was requested", "a new Telegram was connected". Never throws.
 */
export async function notifySecurityEvent(
  db: Pick<PrismaClient, "oauth_accounts" | "vk_links" | "user">,
  params: { userId: string; eventId: string; title: string; message: string; skip?: CodeChannel[] }
): Promise<void> {
  const plain = `${params.title}\n\n${params.message}\n\nЕсли это не вы, смените пароль и напишите в поддержку ICECREAMMUSIC.`;
  const text = {
    plain,
    subject: params.title,
    html: `<p><b>${escapeEmailHtml(params.title)}</b></p><p>${escapeEmailHtml(params.message)}</p><p>Если это не вы, смените пароль и напишите в поддержку ICECREAMMUSIC.</p>`
  };
  const senders = defaultSenders(db);
  await Promise.all(
    CODE_CHANNELS.filter((channel) => !params.skip?.includes(channel)).map((channel) =>
      senders.send(channel, params.userId, text, `${params.eventId}-${channel}`).catch((error) => {
        console.error("[security-codes] notice failed", { channel, error });
        return "failed" as const;
      })
    )
  );
}

export function formatHoldUntil(until: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow"
  }).format(until);
}
