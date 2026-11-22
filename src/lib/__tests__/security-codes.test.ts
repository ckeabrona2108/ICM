import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANNEL_HOLD_MS,
  MAX_CODE_ATTEMPTS,
  buildSecurityCodeText,
  consumeSecurityGrant,
  decideSecurityRequirement,
  generateSecurityCode,
  hashSecurityCode,
  issueSecurityCode,
  normalizeSecurityCode,
  resolveCodeChannels,
  restoreSecurityGrant,
  verifySecurityCode,
  type ChannelFacts,
  type CodeSenders
} from "@/lib/security-codes";

const SECRET = "test-secret";
const NOW = new Date("2026-11-22T12:00:00Z");

const allServices = { telegram: true, vk: true, email: true };

function facts(overrides: Partial<ChannelFacts> = {}): ChannelFacts {
  return { telegramLinked: false, vkMessagesAllowed: false, emailConfirmed: false, holds: [], services: allServices, ...overrides };
}

test("codes are six digits and only digits are accepted back", () => {
  for (let index = 0; index < 50; index += 1) assert.match(generateSecurityCode(), /^\d{6}$/u);
  assert.equal(normalizeSecurityCode(" 482 913 "), "482913");
  assert.equal(normalizeSecurityCode("48291"), null);
  assert.equal(normalizeSecurityCode(482913), null);
});

test("the hash depends on the challenge, so a code from one request does not fit another", () => {
  assert.equal(hashSecurityCode("a", "123456", SECRET), hashSecurityCode("a", "123456", SECRET));
  assert.notEqual(hashSecurityCode("a", "123456", SECRET), hashSecurityCode("b", "123456", SECRET));
  assert.notEqual(hashSecurityCode("a", "123456", SECRET), hashSecurityCode("a", "123457", SECRET));
});

test("channels: telegram first, then VK, then a confirmed email; unconfirmed email is not a channel", () => {
  const state = resolveCodeChannels(facts({ telegramLinked: true, vkMessagesAllowed: true, emailConfirmed: true }), NOW);
  assert.deepEqual(state.ready, ["telegram", "vk", "email"]);
  assert.deepEqual(resolveCodeChannels(facts({ emailConfirmed: false }), NOW).ready, []);
  // VK linked without permission to write is not a channel.
  assert.deepEqual(resolveCodeChannels(facts({ vkMessagesAllowed: false }), NOW).ready, []);
  // A service switched off on the server is skipped.
  assert.deepEqual(resolveCodeChannels(facts({ telegramLinked: true, services: { ...allServices, telegram: false } }), NOW).ready, []);
});

test("a channel on hold receives no codes until the hold ends", () => {
  const until = new Date(NOW.getTime() + CHANNEL_HOLD_MS);
  const held = resolveCodeChannels(facts({ telegramLinked: true, emailConfirmed: true, holds: [{ channel: "telegram", trusted_from: until }] }), NOW);
  assert.deepEqual(held.ready, ["email"]);
  assert.deepEqual(held.held, [{ channel: "telegram", until }]);

  const later = resolveCodeChannels(facts({ telegramLinked: true, holds: [{ channel: "telegram", trusted_from: until }] }), new Date(until.getTime() + 1));
  assert.deepEqual(later.ready, ["telegram"]);
});

test("payouts always need a code; other actions only when the cabinet has a channel", () => {
  const none = { ready: [], held: [] };
  const some = { ready: ["email" as const], held: [] };
  assert.equal(decideSecurityRequirement("payout", none), true);
  assert.equal(decideSecurityRequirement("password", none), false);
  assert.equal(decideSecurityRequirement("email", none), false);
  assert.equal(decideSecurityRequirement("unlink", some), true);
});

test("the message names the action and warns not to share the code", () => {
  const text = buildSecurityCodeText({ code: "482913", action: "payout" });
  assert.match(text.plain, /Код для выплаты: 482913/u);
  assert.match(text.plain, /Никому его не сообщайте/u);
  assert.match(text.subject, /482913/u);
});

// ---- A small in-memory database for the code table ------------------------------------------

type Row = {
  id: string;
  user_id: string;
  action: string;
  channel: string;
  code_hash: string;
  attempts: number;
  created_at: Date;
  expires_at: Date;
  verified_at: Date | null;
  used_at: Date | null;
};

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key as keyof Row];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      const ops = condition as { gt?: Date | number; lt?: number; not?: unknown };
      if ("gt" in ops) return value !== null && (value as Date | number) > (ops.gt as Date | number);
      if ("lt" in ops) return (value as number) < (ops.lt as number);
      if ("not" in ops) return value !== ops.not;
    }
    return value === condition;
  });
}

function apply(row: Row, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) {
      (row as Record<string, unknown>)[key] = (row[key as keyof Row] as number) + (value as { increment: number }).increment;
    } else {
      (row as Record<string, unknown>)[key] = value;
    }
  }
}

function fakeDb(channels: Partial<ChannelFacts> = { telegramLinked: true, emailConfirmed: true }) {
  const rows: Row[] = [];
  let seq = 0;
  const db = {
    rows,
    security_codes: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((row) => matches(row, where)).sort((a, b) => b.created_at.getTime() - a.created_at.getTime()),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        // Like Prisma, a read returns a copy: later updates do not change it.
        const row = rows.filter((item) => matches(item, where)).sort((a, b) => (b.verified_at?.getTime() ?? 0) - (a.verified_at?.getTime() ?? 0))[0];
        return row ? { ...row } : null;
      },
      create: async ({ data }: { data: Omit<Row, "id" | "attempts" | "verified_at" | "used_at"> }) => {
        seq += 1;
        const row: Row = { id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`, attempts: 0, verified_at: null, used_at: null, ...data };
        rows.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((item) => item.id === where.id)!;
        apply(row, data);
        return { id: row.id };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = rows.filter((row) => matches(row, where));
        hit.forEach((row) => apply(row, data));
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const keep = rows.filter((row) => !matches(row, where));
        const count = rows.length - keep.length;
        rows.splice(0, rows.length, ...keep);
        return { count };
      }
    },
    user: { findUnique: async () => ({ email: "artist@example.com", emailVerified: channels.emailConfirmed ? NOW : null }) },
    oauth_accounts: { findUnique: async () => (channels.telegramLinked ? { id: "tg" } : null) },
    vk_links: { findUnique: async () => (channels.vkMessagesAllowed ? { messages_allowed: true } : null) },
    security_channel_holds: { findMany: async () => channels.holds ?? [] }
  };
  return db;
}

function recordingSenders(result: "sent" | "blocked" | "failed" = "sent") {
  const sent: Array<{ channel: string; code: string }> = [];
  const senders: CodeSenders = {
    async send(channel, _userId, text) {
      sent.push({ channel, code: /(\d{6})/u.exec(text.plain)![1]! });
      return result;
    }
  };
  return { sent, senders };
}

test("a sent code verifies once and lets the action through once", async () => {
  {
    const db = fakeDb();
    const { sent, senders } = recordingSenders();
    const issued = await issueSecurityCode(db as never, { userId: "u1", action: "payout", senders, services: allServices, now: NOW, secret: SECRET });
    assert.ok(issued.ok);
    if (!issued.ok) return;
    assert.equal(sent.length, 1);

    const wrong = await verifySecurityCode(db as never, { userId: "u1", challengeId: issued.challengeId, code: sent[0]!.code === "000000" ? "111111" : "000000", now: NOW, secret: SECRET });
    assert.deepEqual(wrong, { ok: false, error: "invalid", attemptsLeft: MAX_CODE_ATTEMPTS - 1 });

    const right = await verifySecurityCode(db as never, { userId: "u1", challengeId: issued.challengeId, code: sent[0]!.code, now: NOW, secret: SECRET });
    assert.deepEqual(right, { ok: true, action: "payout" });

    // Another cabinet cannot use this code.
    assert.equal(await consumeSecurityGrant(db as never, { userId: "u2", action: "payout", now: NOW }), null);
    // A code for the payout does not change the password.
    assert.equal(await consumeSecurityGrant(db as never, { userId: "u1", action: "password", now: NOW }), null);

    const grant = await consumeSecurityGrant(db as never, { userId: "u1", action: "payout", now: NOW });
    assert.ok(grant);
    assert.equal(await consumeSecurityGrant(db as never, { userId: "u1", action: "payout", now: NOW }), null);

    // A failed payout gives the code back.
    await restoreSecurityGrant(db as never, grant!);
    assert.equal(await consumeSecurityGrant(db as never, { userId: "u1", action: "payout", now: NOW }), grant);
  }
});

test("five wrong codes end the code, a correct one after that does not work", async () => {
  {
    const db = fakeDb();
    const { sent, senders } = recordingSenders();
    const issued = await issueSecurityCode(db as never, { userId: "u1", action: "unlink", senders, services: allServices, now: NOW, secret: SECRET });
    assert.ok(issued.ok);
    if (!issued.ok) return;
    const wrongCode = sent[0]!.code === "999999" ? "888888" : "999999";
    for (let index = 0; index < MAX_CODE_ATTEMPTS - 1; index += 1) {
      const result = await verifySecurityCode(db as never, { userId: "u1", challengeId: issued.challengeId, code: wrongCode, now: NOW, secret: SECRET });
      assert.equal(result.ok, false);
    }
    const last = await verifySecurityCode(db as never, { userId: "u1", challengeId: issued.challengeId, code: wrongCode, now: NOW, secret: SECRET });
    assert.deepEqual(last, { ok: false, error: "attempts" });
    const late = await verifySecurityCode(db as never, { userId: "u1", challengeId: issued.challengeId, code: sent[0]!.code, now: NOW, secret: SECRET });
    assert.deepEqual(late, { ok: false, error: "attempts" });
  }
});

test("a code expires after 10 minutes and a verified grant after 10 more", async () => {
  {
    const db = fakeDb();
    const { sent, senders } = recordingSenders();
    const issued = await issueSecurityCode(db as never, { userId: "u1", action: "email", senders, services: allServices, now: NOW, secret: SECRET });
    assert.ok(issued.ok);
    if (!issued.ok) return;
    const tooLate = new Date(NOW.getTime() + 10 * 60_000 + 1);
    assert.deepEqual(
      await verifySecurityCode(db as never, { userId: "u1", challengeId: issued.challengeId, code: sent[0]!.code, now: tooLate, secret: SECRET }),
      { ok: false, error: "expired" }
    );

    const again = await issueSecurityCode(db as never, { userId: "u1", action: "email", senders, services: allServices, now: tooLate, secret: SECRET });
    assert.ok(again.ok);
    if (!again.ok) return;
    await verifySecurityCode(db as never, { userId: "u1", challengeId: again.challengeId, code: sent[1]!.code, now: tooLate, secret: SECRET });
    const grantLate = new Date(tooLate.getTime() + 10 * 60_000 + 1);
    assert.equal(await consumeSecurityGrant(db as never, { userId: "u1", action: "email", now: grantLate }), null);
  }
});

test("resending to the same channel waits a minute, another channel goes at once", async () => {
  {
    const db = fakeDb();
    const { sent, senders } = recordingSenders();
    const first = await issueSecurityCode(db as never, { userId: "u1", action: "payout", channel: "telegram", senders, services: allServices, now: NOW, secret: SECRET });
    assert.ok(first.ok);
    if (!first.ok) return;
    const soon = new Date(NOW.getTime() + 20_000);
    const same = await issueSecurityCode(db as never, { userId: "u1", action: "payout", channel: "telegram", senders, services: allServices, now: soon, secret: SECRET });
    assert.equal(same.ok, false);
    if (!same.ok) assert.equal(same.error, "too_soon");

    const other = await issueSecurityCode(db as never, { userId: "u1", action: "payout", channel: "email", senders, services: allServices, now: soon, secret: SECRET });
    assert.ok(other.ok);
    assert.deepEqual(sent.map((item) => item.channel), ["telegram", "email"]);

    // The first code stops working once the second is out.
    const old = await verifySecurityCode(db as never, { userId: "u1", challengeId: first.challengeId, code: sent[0]!.code, now: soon, secret: SECRET });
    assert.deepEqual(old, { ok: false, error: "expired" });
  }
});

test("a code that could not be delivered is not kept", async () => {
  {
    const db = fakeDb();
    const { senders } = recordingSenders("blocked");
    const result = await issueSecurityCode(db as never, { userId: "u1", action: "payout", senders, services: allServices, now: NOW, secret: SECRET });
    assert.deepEqual(result, { ok: false, error: "channel_unavailable" });
    assert.equal(db.rows.length, 0);
  }
});

test("a channel the cabinet does not have is refused", async () => {
  {
    const db = fakeDb({ telegramLinked: true });
    const { senders } = recordingSenders();
    const result = await issueSecurityCode(db as never, { userId: "u1", action: "payout", channel: "vk", senders, services: allServices, now: NOW, secret: SECRET });
    assert.equal(result.ok, false);
  }
});
