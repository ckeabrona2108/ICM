import assert from "node:assert/strict";
import test from "node:test";

import { parseVkCallback } from "@/lib/vk-callback";
import {
  buildVkNotificationText,
  checkVkMessagesAllowed,
  isVkNotificationKind,
  sendVkCommunityMessage,
  trimVkText,
  vkRandomIdFor,
  type VkMessagesConfig
} from "@/lib/vk-messages";
import { sendVkUserNotification, setVkMessagesAllowed } from "@/lib/vk-notification-channel";

const config: VkMessagesConfig = {
  groupId: "197191118",
  groupToken: "group-token",
  apiBase: "https://api.vk.test",
  relaySecret: null
};

function vkResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function fakeFetch(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; body: URLSearchParams; headers: Record<string, string> }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      body: new URLSearchParams(String(init?.body ?? "")),
      headers: (init?.headers ?? {}) as Record<string, string>
    });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const noSleep = async () => undefined;

test("messages.send goes to the VK user with a stable random_id", async () => {
  const { fetchImpl, calls } = fakeFetch([vkResponse({ response: 123 })]);
  const result = await sendVkCommunityMessage({
    config,
    vkUserId: "42",
    text: "Релиз принят",
    randomId: vkRandomIdFor("release-approved-1"),
    fetchImpl,
    sleep: noSleep
  });

  assert.equal(result, "sent");
  assert.equal(calls[0].url, "https://api.vk.test/method/messages.send");
  assert.equal(calls[0].body.get("peer_id"), "42");
  assert.equal(calls[0].body.get("message"), "Релиз принят");
  assert.equal(calls[0].body.get("access_token"), "group-token");
  assert.equal(calls[0].body.get("random_id"), String(vkRandomIdFor("release-approved-1")));
  assert.equal(vkRandomIdFor("a"), vkRandomIdFor("a"));
  assert.notEqual(vkRandomIdFor("a"), vkRandomIdFor("b"));
});

test("messages.send retries rate limits and network errors, then succeeds", async () => {
  const { fetchImpl, calls } = fakeFetch([
    vkResponse({ error: { error_code: 6, error_msg: "Too many requests per second" } }),
    new Error("socket hang up"),
    vkResponse({ response: 1 })
  ]);
  const result = await sendVkCommunityMessage({ config, vkUserId: "42", text: "x", randomId: 1, fetchImpl, sleep: noSleep });
  assert.equal(result, "sent");
  assert.equal(calls.length, 3);
});

test("messages.send reports a revoked permission instead of throwing", async () => {
  const { fetchImpl, calls } = fakeFetch([
    vkResponse({ error: { error_code: 901, error_msg: "Can't send messages for users without permission" } })
  ]);
  const result = await sendVkCommunityMessage({ config, vkUserId: "42", text: "x", randomId: 1, fetchImpl, sleep: noSleep });
  assert.equal(result, "not_allowed");
  assert.equal(calls.length, 1);
});

test("messages.send does not retry a bad key", async () => {
  const { fetchImpl, calls } = fakeFetch([vkResponse({ error: { error_code: 5, error_msg: "User authorization failed" } })]);
  await assert.rejects(
    sendVkCommunityMessage({ config, vkUserId: "42", text: "x", randomId: 1, fetchImpl, sleep: noSleep }),
    /messages\.send failed: 5/
  );
  assert.equal(calls.length, 1);
});

test("the relay secret is sent when VK goes through the relay", async () => {
  const { fetchImpl, calls } = fakeFetch([vkResponse({ response: 1 })]);
  await sendVkCommunityMessage({
    config: { ...config, apiBase: "https://relay.test", relaySecret: "relay" },
    vkUserId: "42",
    text: "x",
    randomId: 1,
    fetchImpl,
    sleep: noSleep
  });
  assert.equal(calls[0].url, "https://relay.test/method/messages.send");
  assert.equal(calls[0].headers["X-Relay-Secret"], "relay");
});

test("isMessagesFromGroupAllowed reads is_allowed", async () => {
  const { fetchImpl, calls } = fakeFetch([vkResponse({ response: { is_allowed: 1 } }), vkResponse({ response: { is_allowed: 0 } })]);
  assert.equal(await checkVkMessagesAllowed({ config, vkUserId: "42", fetchImpl }), true);
  assert.equal(await checkVkMessagesAllowed({ config, vkUserId: "42", fetchImpl }), false);
  assert.equal(calls[0].body.get("group_id"), "197191118");
  assert.equal(calls[0].body.get("user_id"), "42");
});

test("the VK text has the title, the message and an absolute link", () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://www.example.com/";
  try {
    assert.equal(
      buildVkNotificationText({ title: "Релиз принят", message: "Сделайте сниппет:", href: "/dashboard/video-snippets" }),
      "Релиз принят\n\nСделайте сниппет:\n\nhttps://www.example.com/dashboard/video-snippets"
    );
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  }
  assert.equal(trimVkText("а".repeat(5000)).length, 4000);
});

test("only the artist's own account events go to VK", () => {
  for (const kind of ["release_approved", "release_rejected", "report_ready", "payout_paid", "support_reply", "account_welcome"]) {
    assert.equal(isVkNotificationKind(kind), true, kind);
  }
  for (const kind of ["direct_message", "artist_post_liked", "artist_release_published", "release_delete_request", "admin_report_changes_requested"]) {
    assert.equal(isVkNotificationKind(kind), false, kind);
  }
});

function fakeVkLinks(row: { user_id: string; vk_user_id: string; messages_allowed: boolean; messages_allowed_at: Date | null } | null) {
  const updates: Array<Record<string, unknown>> = [];
  const prisma = {
    vk_links: {
      findUnique: async () => row,
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return row;
      }
    }
  } as never;
  return { prisma, updates };
}

const event = { id: "release-approved-1", userId: "user-1", title: "Релиз принят", message: "m", href: "/dashboard" };

test("VK channel skips artists who have not allowed messages", async () => {
  const { prisma } = fakeVkLinks({ user_id: "user-1", vk_user_id: "42", messages_allowed: false, messages_allowed_at: null });
  const { fetchImpl, calls } = fakeFetch([]);
  assert.equal(await sendVkUserNotification(prisma, event, { config, fetchImpl, sleep: noSleep }), false);
  assert.equal(calls.length, 0);
});

test("VK channel uses the VK text and clears the permission on 901", async () => {
  const { prisma, updates } = fakeVkLinks({ user_id: "user-1", vk_user_id: "42", messages_allowed: true, messages_allowed_at: new Date() });
  const { fetchImpl, calls } = fakeFetch([vkResponse({ error: { error_code: 901, error_msg: "no permission" } })]);
  const sent = await sendVkUserNotification(
    prisma,
    { ...event, vkMessage: "VK text", vkHref: "https://example.com/x" },
    { config, fetchImpl, sleep: noSleep }
  );
  assert.equal(sent, false);
  assert.equal(calls[0].body.get("message"), "Релиз принят\n\nVK text\n\nhttps://example.com/x");
  assert.equal(updates[0].messages_allowed, false);
});

test("VK channel never throws, even when VK is down", async () => {
  const { prisma } = fakeVkLinks({ user_id: "user-1", vk_user_id: "42", messages_allowed: true, messages_allowed_at: new Date() });
  const { fetchImpl } = fakeFetch([new Error("down"), new Error("down"), new Error("down")]);
  const originalError = console.error;
  console.error = () => undefined;
  try {
    assert.equal(await sendVkUserNotification(prisma, event, { config, fetchImpl, sleep: noSleep }), false);
  } finally {
    console.error = originalError;
  }
});

test("the first permission is reported once, a later allow after deny stays quiet", async () => {
  const first = fakeVkLinks({ user_id: "user-1", vk_user_id: "42", messages_allowed: false, messages_allowed_at: null });
  assert.deepEqual(await setVkMessagesAllowed(first.prisma, { vkUserId: "42", allowed: true }), { userId: "user-1", newlyAllowed: true });
  assert.equal(first.updates[0].messages_allowed, true);
  assert.ok(first.updates[0].messages_allowed_at instanceof Date);

  const again = fakeVkLinks({ user_id: "user-1", vk_user_id: "42", messages_allowed: false, messages_allowed_at: new Date() });
  assert.deepEqual(await setVkMessagesAllowed(again.prisma, { vkUserId: "42", allowed: true }), { userId: "user-1", newlyAllowed: false });

  const unknown = fakeVkLinks(null);
  assert.equal(await setVkMessagesAllowed(unknown.prisma, { vkUserId: "42", allowed: true }), null);
});

test("callback events need the group and the secret; confirmation needs only the group", () => {
  const settings = { groupId: "197191118", secret: "s3cret" };
  assert.deepEqual(parseVkCallback({ type: "confirmation", group_id: 197191118 }, settings), { type: "confirmation" });
  assert.deepEqual(parseVkCallback({ type: "confirmation", group_id: 1 }, settings), { type: "forbidden" });
  assert.deepEqual(
    parseVkCallback({ type: "message_allow", group_id: 197191118, secret: "s3cret", object: { user_id: 42, key: "k" } }, settings),
    { type: "message_allow", vkUserId: "42" }
  );
  assert.deepEqual(
    parseVkCallback({ type: "message_deny", group_id: 197191118, secret: "s3cret", object: { user_id: "42" } }, settings),
    { type: "message_deny", vkUserId: "42" }
  );
  assert.deepEqual(parseVkCallback({ type: "message_allow", group_id: 197191118, secret: "nope", object: { user_id: 42 } }, settings), {
    type: "forbidden"
  });
  assert.deepEqual(parseVkCallback({ type: "message_new", group_id: 197191118, secret: "s3cret", object: {} }, settings), {
    type: "ignored"
  });
  assert.deepEqual(parseVkCallback(null, settings), { type: "forbidden" });
});
