import assert from "node:assert/strict";
import test from "node:test";

import { decodeOAuthLinkIntent, encodeOAuthLinkIntent, OAUTH_LINK_MAX_AGE_SECONDS } from "@/lib/oauth-link-intent";
import { buildOAuthPlaceholderEmail, isOAuthProvider } from "@/lib/oauth-login";
import {
  buildTelegramDataCheckString,
  getTelegramLoginConfig,
  parseTelegramLoginData,
  signTelegramLoginData,
  TELEGRAM_LOGIN_MAX_AGE_SECONDS,
  verifyTelegramLogin
} from "@/lib/telegram-login";

const BOT_TOKEN = "123456789:test-bot-token";
const NOW = new Date("2026-11-04T12:00:00Z");
const authDate = String(Math.floor(NOW.getTime() / 1000) - 60);

function signed(fields: Record<string, string>, token = BOT_TOKEN) {
  const data = { id: "424242", auth_date: authDate, ...fields };
  return { ...data, hash: signTelegramLoginData(data, token) };
}

test("the data-check string sorts the signed fields and skips missing ones", () => {
  const data = parseTelegramLoginData({ id: 1, first_name: "Иван", auth_date: 1700000000, hash: "a".repeat(64), extra: "x" });
  assert.ok(data);
  assert.equal(buildTelegramDataCheckString(data), "auth_date=1700000000\nfirst_name=Иван\nid=1");
});

test("widget data signed with the bot token is accepted", () => {
  const payload = signed({ first_name: "Иван", last_name: "Петров", username: "ivan" });
  const check = verifyTelegramLogin(payload, BOT_TOKEN, NOW);
  assert.deepEqual(check, { ok: true, telegramUserId: "424242", name: "Иван Петров", username: "ivan" });
  // The browser sends it as JSON through the credentials form.
  assert.equal(verifyTelegramLogin(JSON.stringify(payload), BOT_TOKEN, NOW).ok, true);
});

test("numbers from the JS API are signed as their decimal strings", () => {
  const payload = signed({ first_name: "Ann" });
  const asNumbers = { ...payload, id: Number(payload.id), auth_date: Number(payload.auth_date) };
  assert.equal(verifyTelegramLogin(asNumbers, BOT_TOKEN, NOW).ok, true);
});

test("tampered fields, another bot's signature and malformed data are rejected", () => {
  const payload = signed({ first_name: "Иван" });
  assert.deepEqual(verifyTelegramLogin({ ...payload, id: "1" }, BOT_TOKEN, NOW), { ok: false, reason: "bad_hash" });
  assert.deepEqual(verifyTelegramLogin({ ...payload, username: "admin" }, BOT_TOKEN, NOW), { ok: false, reason: "bad_hash" });
  assert.deepEqual(verifyTelegramLogin(signed({}, "999:other-token"), BOT_TOKEN, NOW), { ok: false, reason: "bad_hash" });
  assert.deepEqual(verifyTelegramLogin({ id: "1", auth_date: authDate }, BOT_TOKEN, NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(verifyTelegramLogin("not json", BOT_TOKEN, NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(verifyTelegramLogin(null, BOT_TOKEN, NOW), { ok: false, reason: "malformed" });
});

test("old payloads are treated as replays", () => {
  const old = String(Math.floor(NOW.getTime() / 1000) - TELEGRAM_LOGIN_MAX_AGE_SECONDS - 1);
  const data = { id: "424242", auth_date: old };
  const payload = { ...data, hash: signTelegramLoginData(data, BOT_TOKEN) };
  assert.deepEqual(verifyTelegramLogin(payload, BOT_TOKEN, NOW), { ok: false, reason: "expired" });
});

test("the login bot comes from its own variables or falls back to the admin bot", () => {
  const saved = { ...process.env };
  try {
    delete process.env.TELEGRAM_LOGIN_BOT_TOKEN;
    delete process.env.TELEGRAM_LOGIN_BOT_USERNAME;
    process.env.TELEGRAM_BOT_TOKEN = `"${BOT_TOKEN}"`;
    delete process.env.TELEGRAM_BOT_USERNAME;
    assert.equal(getTelegramLoginConfig(), null);

    process.env.TELEGRAM_BOT_USERNAME = "@icecream_bot";
    assert.deepEqual(getTelegramLoginConfig(), { botToken: BOT_TOKEN, botUsername: "icecream_bot", botId: "123456789" });

    process.env.TELEGRAM_LOGIN_BOT_TOKEN = "555:login-token";
    process.env.TELEGRAM_LOGIN_BOT_USERNAME = "icecream_login_bot";
    assert.equal(getTelegramLoginConfig()?.botId, "555");
  } finally {
    process.env = saved;
  }
});

test("Telegram is an OAuth provider with its own placeholder email", () => {
  assert.equal(isOAuthProvider("telegram"), true);
  assert.equal(buildOAuthPlaceholderEmail("telegram", "424242"), "telegram-424242@oauth.icecreammusic.invalid");
});

test("link intents are signed, bound to a provider and expire", () => {
  const secret = "test-secret";
  const now = Date.UTC(2026, 10, 4);
  const value = encodeOAuthLinkIntent({ userId: "user-1", provider: "yandex", now }, secret);
  assert.deepEqual(decodeOAuthLinkIntent(value, secret, now + 1000), {
    userId: "user-1",
    provider: "yandex",
    expiresAt: now + OAUTH_LINK_MAX_AGE_SECONDS * 1000
  });
  assert.equal(decodeOAuthLinkIntent(value, "other-secret", now), null);
  assert.equal(decodeOAuthLinkIntent(value, secret, now + OAUTH_LINK_MAX_AGE_SECONDS * 1000 + 1), null);

  const [body, signature] = value.split(".");
  const forged = Buffer.from(JSON.stringify({ userId: "user-2", provider: "yandex", expiresAt: now + 60_000 })).toString("base64url");
  assert.equal(decodeOAuthLinkIntent(`${forged}.${signature}`, secret, now), null);
  assert.equal(decodeOAuthLinkIntent(body, secret, now), null);
  assert.equal(decodeOAuthLinkIntent(undefined, secret, now), null);
});
