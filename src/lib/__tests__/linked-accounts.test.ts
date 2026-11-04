import assert from "node:assert/strict";
import test from "node:test";

import {
  canDisconnectLoginMethod,
  countLoginMethods,
  disconnectLoginMethod,
  resolveEmailChannel,
  resolveMessengerChannel,
  type LoginMethods
} from "@/lib/linked-accounts";
import { buildOAuthPlaceholderEmail } from "@/lib/oauth-login";
import { sendTelegramUserMessage, sendTelegramUserNotification, type TelegramSendConfig } from "@/lib/telegram-notification-channel";

const none: LoginMethods = { password: false, yandex: false, vk: false, telegram: false };

test("the last sign-in method cannot be disconnected", () => {
  const onlyTelegram = { ...none, telegram: true };
  assert.equal(countLoginMethods(onlyTelegram), 1);
  assert.equal(canDisconnectLoginMethod(onlyTelegram, "telegram"), false);

  const twoMethods = { ...none, password: true, vk: true };
  assert.equal(canDisconnectLoginMethod(twoMethods, "password"), true);
  assert.equal(canDisconnectLoginMethod(twoMethods, "vk"), true);
  assert.equal(canDisconnectLoginMethod(twoMethods, "yandex"), false);
});

function fakeTx(user: { password: string | null; vk: boolean; oauth: string[] }) {
  const calls: string[] = [];
  const tx = {
    user: {
      findUnique: async () => ({
        password: user.password,
        vk_link: user.vk ? { id: "vk" } : null,
        oauth_accounts: user.oauth.map((provider) => ({ provider }))
      }),
      update: async () => {
        calls.push("password:null");
        return { id: "u" };
      }
    },
    vk_links: {
      delete: async () => {
        calls.push("vk:delete");
        return { id: "vk" };
      }
    },
    oauth_accounts: {
      deleteMany: async (args: { where: { provider: string } }) => {
        calls.push(`oauth:delete:${args.where.provider}`);
        return { count: 1 };
      }
    }
  };
  const db = { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } as never;
  return { db, calls };
}

test("disconnecting re-checks the methods and removes only the chosen one", async () => {
  const both = fakeTx({ password: "hash", vk: false, oauth: ["telegram"] });
  assert.deepEqual(await disconnectLoginMethod(both.db, "u", "telegram"), { ok: true });
  assert.deepEqual(both.calls, ["oauth:delete:telegram"]);

  const passwordOnly = fakeTx({ password: "hash", vk: false, oauth: [] });
  assert.deepEqual(await disconnectLoginMethod(passwordOnly.db, "u", "password"), { ok: false, error: "last_method" });
  assert.deepEqual(await disconnectLoginMethod(passwordOnly.db, "u", "yandex"), { ok: false, error: "not_connected" });
  assert.deepEqual(passwordOnly.calls, []);

  const vkAndYandex = fakeTx({ password: null, vk: true, oauth: ["yandex"] });
  assert.deepEqual(await disconnectLoginMethod(vkAndYandex.db, "u", "vk"), { ok: true });
  assert.deepEqual(vkAndYandex.calls, ["vk:delete"]);
});

test("email channel ignores placeholder addresses and flags unconfirmed ones", () => {
  assert.deepEqual(resolveEmailChannel(buildOAuthPlaceholderEmail("telegram", "1"), null), { status: "missing", address: null });
  assert.deepEqual(resolveEmailChannel("a@b.ru", null), { status: "unverified", address: "a@b.ru" });
  assert.deepEqual(resolveEmailChannel("a@b.ru", new Date()), { status: "active", address: "a@b.ru" });
});

test("messenger channel status", () => {
  assert.equal(resolveMessengerChannel({ available: false, linked: true, allowed: true }), "unavailable");
  assert.equal(resolveMessengerChannel({ available: true, linked: false, allowed: false }), "not_linked");
  assert.equal(resolveMessengerChannel({ available: true, linked: true, allowed: false }), "not_allowed");
  assert.equal(resolveMessengerChannel({ available: true, linked: true, allowed: true }), "active");
});

const config: TelegramSendConfig = { botToken: "1:token", apiBase: "https://relay.test", relaySecret: "s3cret" };

function telegramFetch(response: Response) {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)), headers: (init?.headers ?? {}) as Record<string, string> });
    return response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test("Telegram messages go through the relay to the artist's chat", async () => {
  const { fetchImpl, calls } = telegramFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  assert.equal(await sendTelegramUserMessage({ config, chatId: "42", text: "Релиз принят", fetchImpl }), "sent");
  assert.equal(calls[0].url, "https://relay.test/bot1:token/sendMessage");
  assert.equal(calls[0].body.chat_id, "42");
  assert.equal(calls[0].headers["X-Relay-Secret"], "s3cret");
});

test("a blocked bot is told apart from a rejected relay secret", async () => {
  const blocked = telegramFetch(
    new Response(JSON.stringify({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }), { status: 403 })
  );
  assert.equal(await sendTelegramUserMessage({ config, chatId: "42", text: "x", fetchImpl: blocked.fetchImpl }), "blocked");

  const relay = telegramFetch(new Response("Forbidden", { status: 403 }));
  assert.equal(await sendTelegramUserMessage({ config, chatId: "42", text: "x", fetchImpl: relay.fetchImpl }), "failed");
});

test("a Telegram notification marks the block and clears it once a message gets through", async () => {
  const updates: Array<Date | null> = [];
  let blockedAt: Date | null = null;
  const db = {
    oauth_accounts: {
      findUnique: async () => ({ provider_account_id: "42", messages_blocked_at: blockedAt }),
      updateMany: async (args: { data: { messages_blocked_at: Date | null } }) => {
        updates.push(args.data.messages_blocked_at);
        blockedAt = args.data.messages_blocked_at;
        return { count: 1 };
      }
    }
  } as never;
  const event = { id: "e1", userId: "u", title: "Релиз принят", message: "Готово", href: "/dashboard" };
  const now = new Date("2026-11-04T12:00:00Z");

  const blocked = telegramFetch(new Response(JSON.stringify({ ok: false, error_code: 403 }), { status: 403 }));
  assert.equal(await sendTelegramUserNotification(db, event, { config, fetchImpl: blocked.fetchImpl, now }), false);
  assert.deepEqual(updates, [now]);

  const sent = telegramFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  assert.equal(await sendTelegramUserNotification(db, event, { config, fetchImpl: sent.fetchImpl, now }), true);
  assert.deepEqual(updates, [now, null]);
  assert.match(String(sent.calls[0].body.text), /^Релиз принят\n\nГотово\n\nhttps?:\/\/.+\/dashboard$/u);
});

test("no Telegram notification without a linked account or a configured bot", async () => {
  const db = { oauth_accounts: { findUnique: async () => null } } as never;
  const event = { id: "e1", userId: "u", title: "t", message: "m", href: "/" };
  assert.equal(await sendTelegramUserNotification(db, event, { config }), false);
  assert.equal(await sendTelegramUserNotification(db, event, { config: null }), false);
});

test("switched-off channels get no copy of the event, the cabinet bell still does", async () => {
  const { deliverUserNotification } = await import("@/lib/notification-delivery-service");
  let stored = 0;
  let userLookups = 0;
  let telegramLookups = 0;
  let vkLookups = 0;
  const prisma = {
    ai_user_notifications: { upsert: async () => { stored += 1; return {}; } },
    user_notification_settings: { findUnique: async () => ({ email: false, vk: false, telegram: false }) },
    user: { findUnique: async () => { userLookups += 1; return { email: "a@b.ru", name: "A" }; } },
    vk_links: { findUnique: async () => { vkLookups += 1; return null; } },
    oauth_accounts: { findUnique: async () => { telegramLookups += 1; return null; } }
  } as never;

  await deliverUserNotification(prisma, {
    id: "release-approved-1",
    userId: "00000000-0000-4000-8000-000000000001",
    kind: "release_approved",
    title: "Релиз принят",
    message: "Готово",
    href: "/dashboard",
    sendPush: false
  });

  assert.equal(stored, 1);
  assert.equal(userLookups, 0);
  assert.equal(vkLookups, 0);
  assert.equal(telegramLookups, 0);
});

test("without saved settings every channel stays on", async () => {
  const { readNotificationSettings } = await import("@/lib/notification-settings");
  const empty = { user_notification_settings: { findUnique: async () => null } } as never;
  assert.deepEqual(await readNotificationSettings(empty, "u"), { email: true, vk: true, telegram: true });
});

test("Telegram gets every event about the artist's own cabinet", async () => {
  const { isTelegramNotificationKind } = await import("@/lib/telegram-notification-channel");
  for (const kind of [
    "release_approved",
    "release_published",
    "release_draft_reminder",
    "report_ready",
    "payout_requested",
    "support_reply",
    "account_welcome"
  ]) {
    assert.equal(isTelegramNotificationKind(kind), true, kind);
  }
  // The VK greeting, admin requests and social activity stay out.
  for (const kind of ["vk_messages_allowed", "release_delete_request", "social_like", "direct_message"]) {
    assert.equal(isTelegramNotificationKind(kind), false, kind);
  }
});
