/**
 * Подписка ICM открывает плагины GLAZE.
 *
 * Плагин входит в аккаунт (почта + пароль или подтверждение на сайте) и получает:
 *  - token   — долгий ключ устройства (HMAC), им плагин потом обновляет лицензию;
 *  - license — короткая лицензия, подписанная Ed25519. Плагин проверяет подпись встроенным
 *              публичным ключом, поэтому лицензию нельзя подделать правкой файла. Пока она не
 *              истекла (PLUGIN_OFFLINE_DAYS, по умолчанию 7 дней), плагин работает без интернета.
 *
 * Ключи: PLUGIN_LICENSE_PRIVATE_KEY — 32 байта seed Ed25519 в base64
 * (scripts/generate-plugin-license-key.mjs печатает пару). Публичный ключ вшит в плагины.
 */
import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  timingSafeEqual,
  type KeyObject
} from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_PREFIX = "pt1";
const TOKEN_MAX_AGE_MS = 180 * DAY_MS;
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export const PLUGIN_SUBSCRIBE_URL = "https://www.icecreammusic.net/dashboard/subscription";

function b64url(data: Buffer | string): string {
  return Buffer.from(data).toString("base64url");
}

function fromB64url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

// ---- Ключ устройства (token) -----------------------------------------------------

export interface PluginTokenPayload {
  uid: string;
  did: string;
  /** отпечаток пароля: смена пароля отзывает все ключи устройств */
  pv: string;
  iat: number;
}

function tokenSecret(): Buffer {
  const explicit = process.env.PLUGIN_TOKEN_SECRET;
  if (explicit) return Buffer.from(explicit);
  // по умолчанию — из ключа лицензий: на сервере нужно настроить всего один секрет
  const base = process.env.PLUGIN_LICENSE_PRIVATE_KEY?.trim();
  if (!base) throw new PluginLicenseConfigError("PLUGIN_LICENSE_PRIVATE_KEY is not set");
  return createHmac("sha256", base).update("glaze-plugin-token").digest();
}

export function passwordFingerprint(passwordHash: string | null | undefined): string {
  return createHash("sha256").update(passwordHash ?? "").digest("base64url").slice(0, 16);
}

export function createPluginToken(payload: Omit<PluginTokenPayload, "iat">, now = Date.now()): string {
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(now / 1000) }));
  const mac = createHmac("sha256", tokenSecret()).update(`${TOKEN_PREFIX}.${body}`).digest();
  return `${TOKEN_PREFIX}.${body}.${b64url(mac)}`;
}

export function verifyPluginToken(token: unknown, now = Date.now()): PluginTokenPayload | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const [prefix, body, mac] = token.split(".");
  if (prefix !== TOKEN_PREFIX || !body || !mac) return null;

  const expected = createHmac("sha256", tokenSecret()).update(`${prefix}.${body}`).digest();
  const given = fromB64url(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as PluginTokenPayload;
    if (typeof payload.uid !== "string" || typeof payload.did !== "string") return null;
    if (typeof payload.pv !== "string" || typeof payload.iat !== "number") return null;
    if (payload.iat * 1000 + TOKEN_MAX_AGE_MS < now) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---- Лицензия (Ed25519) ---------------------------------------------------------

export class PluginLicenseConfigError extends Error {}

export interface PluginLicensePayload {
  v: 1;
  uid: string;
  email: string;
  name: string;
  did: string;
  active: boolean;
  plan: string | null;
  /** конец оплаченного периода на сайте (ISO), только для показа */
  endsAt: string | null;
  /** выдана, секунды unix */
  iat: number;
  /** действует до, секунды unix: после этого плагину нужен интернет */
  exp: number;
}

let cachedKey: { seed: string; key: KeyObject } | null = null;

function licensePrivateKey(): KeyObject {
  const seed = process.env.PLUGIN_LICENSE_PRIVATE_KEY?.trim();
  if (!seed) throw new PluginLicenseConfigError("PLUGIN_LICENSE_PRIVATE_KEY is not set");
  if (cachedKey?.seed === seed) return cachedKey.key;

  const raw = Buffer.from(seed, "base64");
  if (raw.length !== 32) throw new PluginLicenseConfigError("PLUGIN_LICENSE_PRIVATE_KEY must be 32 bytes (base64)");
  const key = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, raw]),
    format: "der",
    type: "pkcs8"
  });
  cachedKey = { seed, key };
  return key;
}

/** Публичный ключ (32 байта, base64) — тот, что вшит в плагины. */
export function pluginLicensePublicKeyBase64(): string {
  const der = createPublicKey(licensePrivateKey()).export({ format: "der", type: "spki" });
  return Buffer.from(der).subarray(-32).toString("base64");
}

export const PLUGIN_TRIAL_DAYS = 7;

export function pluginOfflineDays(): number {
  const days = Number(process.env.PLUGIN_OFFLINE_DAYS ?? 7);
  return Number.isFinite(days) && days > 0 ? Math.min(days, 60) : 7;
}

export function buildPluginLicense(params: {
  userId: string;
  email: string;
  name: string | null;
  deviceId: string;
  active: boolean;
  plan: string | null;
  endsAt: string | null;
  /** cap for exp, ms: a trial license must not outlive the trial while offline */
  expiresBefore?: number | null;
  now?: number;
}): string {
  const nowSec = Math.floor((params.now ?? Date.now()) / 1000);
  let exp = nowSec + Math.round(pluginOfflineDays() * 86400);
  if (params.expiresBefore != null) exp = Math.max(nowSec, Math.min(exp, Math.floor(params.expiresBefore / 1000)));
  const payload: PluginLicensePayload = {
    v: 1,
    uid: params.userId,
    email: params.email,
    name: params.name ?? "",
    did: params.deviceId,
    active: params.active,
    plan: params.plan,
    endsAt: params.endsAt,
    iat: nowSec,
    exp
  };
  const body = b64url(JSON.stringify(payload));
  // подписываются ровно байты строки body — так их проще проверить в плагине
  const signature = sign(null, Buffer.from(body, "utf8"), licensePrivateKey());
  return `${body}.${b64url(signature)}`;
}

// ---- Проверка входных данных ------------------------------------------------------

/** deviceId присылает плагин: хэш железа, 16–128 символов [A-Za-z0-9_-] */
export function normalizeDeviceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{16,128}$/u.test(trimmed) ? trimmed : null;
}

export function normalizeDeviceName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f]/gu, "").trim().slice(0, 80);
}

// ---- Вход через браузер (для аккаунтов VK / Telegram / Яндекс без пароля) -----------

export interface PluginLinkRequest {
  code: string;
  pollSecret: string;
  deviceId: string;
  deviceName: string;
  product: string;
  createdAt: number;
  expiresAt: number;
  userId: string | null;
}

const LINK_TTL_MS = 10 * 60_000;
const LINK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const linkStore = globalThis as typeof globalThis & {
  __glazePluginLinks?: Map<string, PluginLinkRequest>;
};
const links = linkStore.__glazePluginLinks ?? new Map<string, PluginLinkRequest>();
linkStore.__glazePluginLinks = links;

function pruneLinks(now: number) {
  for (const [code, link] of links) {
    if (link.expiresAt <= now) links.delete(code);
  }
}

function newLinkCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += LINK_ALPHABET[bytes[i] % LINK_ALPHABET.length];
    if (i === 3) code += "-";
  }
  return code;
}

export function normalizeLinkCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
  if (compact.length !== 8) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function startPluginLink(params: { deviceId: string; deviceName: string; product: string }, now = Date.now()) {
  pruneLinks(now);
  if (links.size > 5_000) throw new Error("Too many pending plugin links");

  let code = newLinkCode();
  while (links.has(code)) code = newLinkCode();

  const link: PluginLinkRequest = {
    code,
    pollSecret: randomBytes(24).toString("base64url"),
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    product: params.product,
    createdAt: now,
    expiresAt: now + LINK_TTL_MS,
    userId: null
  };
  links.set(code, link);
  return link;
}

export function getPluginLink(code: string, now = Date.now()): PluginLinkRequest | null {
  const link = links.get(code);
  if (!link || link.expiresAt <= now) return null;
  return link;
}

export function confirmPluginLink(code: string, userId: string, now = Date.now()): PluginLinkRequest | null {
  const link = getPluginLink(code, now);
  if (!link || (link.userId && link.userId !== userId)) return null;
  link.userId = userId;
  return link;
}

/**
 * Плагин опрашивает, подтвердил ли пользователь вход на сайте.
 * Подтверждённая заявка отдаётся один раз и удаляется.
 */
export function pollPluginLink(code: string, pollSecret: unknown, now = Date.now()) {
  const link = getPluginLink(code, now);
  if (!link || typeof pollSecret !== "string") return { status: "expired" as const };

  const a = Buffer.from(pollSecret);
  const b = Buffer.from(link.pollSecret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { status: "expired" as const };

  if (!link.userId) return { status: "pending" as const };
  links.delete(code);
  return { status: "confirmed" as const, link };
}
