import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { readOAuthEnv } from "@/lib/oauth-login";

// Sign-in with Telegram through the Telegram Login Widget. The widget hands the browser the
// account fields signed with the bot token (HMAC-SHA-256 keyed by SHA-256 of the token), so the
// server checks them locally and never has to reach Telegram — which matters because the
// production server cannot reach api.telegram.org or oauth.telegram.org (admin messages go
// through the Cloudflare relay). The bot's domain must be set with /setdomain in @BotFather.

// The widget re-signs the fields on every login, so an old payload is a replayed one.
export const TELEGRAM_LOGIN_MAX_AGE_SECONDS = 60 * 60;

export interface TelegramLoginConfig {
  botToken: string;
  botUsername: string;
  botId: string;
}

export interface TelegramLoginData {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
}

export type TelegramLoginCheck =
  | { ok: true; telegramUserId: string; name: string; username: string | null }
  | { ok: false; reason: "malformed" | "bad_hash" | "expired" };

const SIGNED_FIELDS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date"] as const;

// The admin notification bot doubles as the login bot unless a separate one is configured.
// Users authorise this bot to write to them, so it also sends their Telegram notifications.
export function getTelegramLoginConfig(): TelegramLoginConfig | null {
  const botToken = readOAuthEnv("TELEGRAM_LOGIN_BOT_TOKEN") || readOAuthEnv("TELEGRAM_BOT_TOKEN");
  const botUsername = (readOAuthEnv("TELEGRAM_LOGIN_BOT_USERNAME") || readOAuthEnv("TELEGRAM_BOT_USERNAME")).replace(
    /^@/u,
    ""
  );
  const botId = botToken.split(":")[0] ?? "";
  if (!/^\d+:[A-Za-z0-9_-]+$/u.test(botToken) || !/^[A-Za-z0-9_]{5,64}$/u.test(botUsername)) return null;
  return { botToken, botUsername, botId };
}

// Accepts the object the widget passes to its callback, or its JSON. Numbers arrive as numbers
// from the JS API; the signature is computed over their decimal strings.
export function parseTelegramLoginData(input: unknown): TelegramLoginData | null {
  let value = input;
  if (typeof value === "string") {
    if (value.length > 4_096) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const read = (key: string): string | undefined => {
    const raw = record[key];
    if (typeof raw === "number" && Number.isSafeInteger(raw)) return String(raw);
    if (typeof raw === "string" && raw.length <= 1_024) return raw;
    return undefined;
  };
  const id = read("id");
  const authDate = read("auth_date");
  const hash = read("hash");
  if (!id || !/^\d{1,20}$/u.test(id) || !authDate || !/^\d{1,12}$/u.test(authDate) || !hash || !/^[0-9a-f]{64}$/u.test(hash)) {
    return null;
  }
  return {
    id,
    auth_date: authDate,
    hash,
    first_name: read("first_name"),
    last_name: read("last_name"),
    username: read("username"),
    photo_url: read("photo_url")
  };
}

export function buildTelegramDataCheckString(data: TelegramLoginData): string {
  return SIGNED_FIELDS.filter((key) => data[key] !== undefined)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join("\n");
}

export function signTelegramLoginData(data: Omit<TelegramLoginData, "hash">, botToken: string): string {
  const secret = createHash("sha256").update(botToken).digest();
  return createHmac("sha256", secret)
    .update(buildTelegramDataCheckString({ ...data, hash: "" }))
    .digest("hex");
}

export function verifyTelegramLogin(
  input: unknown,
  botToken: string,
  now: Date = new Date()
): TelegramLoginCheck {
  const data = parseTelegramLoginData(input);
  if (!data) return { ok: false, reason: "malformed" };

  const expected = Buffer.from(signTelegramLoginData(data, botToken), "hex");
  const actual = Buffer.from(data.hash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: "bad_hash" };

  const ageSeconds = Math.floor(now.getTime() / 1000) - Number(data.auth_date);
  // A little clock skew into the future is fine; anything older than the window is a replay.
  if (ageSeconds > TELEGRAM_LOGIN_MAX_AGE_SECONDS || ageSeconds < -300) return { ok: false, reason: "expired" };

  const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.username || "";
  return { ok: true, telegramUserId: data.id, name, username: data.username ?? null };
}
