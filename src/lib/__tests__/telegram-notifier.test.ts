import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminSupportTicketReplyTelegramText,
  buildContractSignedTelegramText,
  buildReleaseModerationTelegramText,
  sendTelegramMessage,
  trimTelegramText
} from "@/lib/telegram-notifier";

test("buildContractSignedTelegramText prefers user name and includes email", () => {
  const text = buildContractSignedTelegramText({
    userId: "user_1",
    userName: "Артист",
    userEmail: "artist@example.com"
  });

  assert.equal(
    text,
    "Пользователь Артист - artist@example.com подписал договор. Необходимо его проверить."
  );
});

test("buildContractSignedTelegramText falls back to user id", () => {
  const text = buildContractSignedTelegramText({
    userId: "user_1",
    userName: null,
    userEmail: "artist@example.com"
  });

  assert.equal(
    text,
    "Пользователь user_1 - artist@example.com подписал договор. Необходимо его проверить."
  );
});

test("buildAdminSupportTicketReplyTelegramText includes ticket, author, snippet and admin link", () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://www.example.com/";
  try {
    const text = buildAdminSupportTicketReplyTelegramText({
      ticketId: "ticket_1",
      subject: "Проверка UPC",
      userName: "Вячеслав",
      userEmail: "mail@example.com",
      message: "а".repeat(600)
    });

    assert.match(text, /^Новый ответ в тикете/);
    assert.match(text, /Тикет: #ticket_1/);
    assert.match(text, /Тема: Проверка UPC/);
    assert.match(text, /Пользователь: Вячеслав/);
    assert.match(text, /Email: mail@example\.com/);
    assert.match(text, new RegExp(`\\n${"а".repeat(499)}…\\n`));
    assert.ok(text.endsWith("https://www.example.com/admin/support/tickets/ticket_1"));
  } finally {
    if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
  }
});

test("buildReleaseModerationTelegramText formats release and artist", () => {
  const text = buildReleaseModerationTelegramText({
    releaseTitle: "Новый релиз",
    artistName: "ICECREAMMUSIC"
  });

  assert.equal(text, "Релиз на модерацию: Новый релиз — ICECREAMMUSIC");
});

function withTelegramEnv(
  env: Record<string, string | undefined>,
  responses: Array<() => Response>,
  run: (calls: Array<{ url: string; init: RequestInit }>) => Promise<void>
) {
  return async () => {
    const keys = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID", "TELEGRAM_API_BASE", "TELEGRAM_RELAY_SECRET"];
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    for (const key of keys) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("unexpected fetch");
      return next();
    }) as typeof fetch;
    try {
      await run(calls);
    } finally {
      globalThis.fetch = originalFetch;
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  };
}

test(
  "sendTelegramMessage sends through the relay with its secret, ignoring env-file quotes",
  withTelegramEnv(
    {
      TELEGRAM_BOT_TOKEN: '"123:abc"',
      TELEGRAM_ADMIN_CHAT_ID: "-100",
      TELEGRAM_API_BASE: "https://relay.example.com/",
      TELEGRAM_RELAY_SECRET: "'s3cret'"
    },
    [() => new Response("{\"ok\":true}", { status: 200 })],
    async (calls) => {
      assert.equal(await sendTelegramMessage("hi"), true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://relay.example.com/bot123:abc/sendMessage");
      assert.equal((calls[0].init.headers as Record<string, string>)["X-Relay-Secret"], "s3cret");
    }
  )
);

test(
  "sendTelegramMessage retries network failures",
  withTelegramEnv(
    { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_ADMIN_CHAT_ID: "-100" },
    [
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response("{\"ok\":true}", { status: 200 })
    ],
    async (calls) => {
      assert.equal(await sendTelegramMessage("hi"), true);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url, "https://api.telegram.org/bot123:abc/sendMessage");
      assert.equal((calls[0].init.headers as Record<string, string>)["X-Relay-Secret"], undefined);
    }
  )
);

test(
  "sendTelegramMessage does not retry client errors",
  withTelegramEnv(
    { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_ADMIN_CHAT_ID: "-100" },
    [() => new Response("{\"ok\":false}", { status: 400, statusText: "Bad Request" })],
    async (calls) => {
      await assert.rejects(sendTelegramMessage("hi"), /400 Bad Request/);
      assert.equal(calls.length, 1);
    }
  )
);

test("trimTelegramText keeps messages under the Telegram limit", () => {
  assert.equal(trimTelegramText("short"), "short");
  const trimmed = trimTelegramText("x".repeat(6000));
  assert.equal(trimmed.length, 4000);
  assert.ok(trimmed.endsWith("…"));
});
