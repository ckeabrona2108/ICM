import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { isWithinReminderHours, runAccountReminders, WELCOME_KIND } from "@/lib/account-lifecycle-notifications";

const HOUR_MS = 60 * 60 * 1000;
// 12:00 in Moscow.
const now = new Date("2026-11-02T09:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

function fakePrisma(data: {
  welcomes?: Array<{ user_id: string; created_at: Date }>;
  tracksByUser?: Record<string, number>;
  releases?: Array<Record<string, unknown>>;
  claims?: Array<{ user_id: string; release_id: string | null; consumed_at: Date }>;
  releaseCountByUser?: Record<string, number>;
  claimedKeys?: string[];
}) {
  const claimed = new Set(data.claimedKeys ?? []);
  const notifications: Array<Record<string, unknown>> = [];
  const inRange = (date: Date, range: { gte: Date; lte: Date }) => date >= range.gte && date <= range.lte;
  const prisma = {
    ai_user_notifications: {
      findMany: async (args: { where: { kind: string; created_at: { gte: Date; lte: Date } } }) =>
        (data.welcomes ?? []).filter((row) => args.where.kind === WELCOME_KIND && inRange(row.created_at, args.where.created_at)),
      upsert: async (args: { create: Record<string, unknown> }) => {
        notifications.push(args.create);
        return args.create;
      }
    },
    track: {
      count: async (args: { where: { release: { userId: string } } }) => data.tracksByUser?.[args.where.release.userId] ?? 0
    },
    release: {
      findMany: async (args: { where: { startDate?: { gte: Date; lte: Date } } }) => {
        const range = args.where.startDate;
        if (range) return (data.releases ?? []).filter((row) => row.startDate instanceof Date && inRange(row.startDate, range));
        return (data.releases ?? []).filter((row) => row.confirmed === false && !row.upc);
      },
      count: async (args: { where: { userId: string } }) => data.releaseCountByUser?.[args.where.userId] ?? 0
    },
    free_release_claims: {
      findMany: async (args: { where: { consumed_at: { gte: Date; lte: Date } } }) =>
        (data.claims ?? []).filter((row) => inRange(row.consumed_at, args.where.consumed_at))
    },
    user_notification_reminders: {
      create: async (args: { data: { user_id: string; key: string } }) => {
        const id = `${args.data.user_id}:${args.data.key}`;
        if (claimed.has(id)) {
          throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
        }
        claimed.add(id);
        return args.data;
      }
    },
    user: { findUnique: async () => null },
    push_subscriptions: { findMany: async () => [] },
    vk_links: { findUnique: async () => null }
  } as never;
  return { prisma, notifications };
}

test("reminders wait for the daytime in Moscow", async () => {
  assert.equal(isWithinReminderHours(new Date("2026-11-02T05:59:00.000Z")), false);
  assert.equal(isWithinReminderHours(new Date("2026-11-02T06:00:00.000Z")), true);
  assert.equal(isWithinReminderHours(new Date("2026-11-02T18:59:00.000Z")), true);
  assert.equal(isWithinReminderHours(new Date("2026-11-02T19:00:00.000Z")), false);

  const { prisma, notifications } = fakePrisma({ welcomes: [{ user_id: "u1", created_at: ago(30 * HOUR_MS) }] });
  const result = await runAccountReminders({ prisma, now: new Date("2026-11-02T20:00:00.000Z") });
  assert.equal(result.skipped, "outside_reminder_hours");
  assert.equal(notifications.length, 0);
});

test("a day after signing up without a track the artist gets the 3-steps reminder once", async () => {
  const { prisma, notifications } = fakePrisma({
    welcomes: [
      { user_id: "u-no-track", created_at: ago(30 * HOUR_MS) },
      { user_id: "u-with-track", created_at: ago(30 * HOUR_MS) },
      { user_id: "u-too-fresh", created_at: ago(2 * HOUR_MS) },
      { user_id: "u-done", created_at: ago(30 * HOUR_MS) }
    ],
    tracksByUser: { "u-with-track": 1 },
    claimedKeys: ["u-done:signup_no_track"]
  });

  const result = await runAccountReminders({ prisma, now });
  assert.deepEqual(result.sent, [{ userId: "u-no-track", key: "signup_no_track" }]);
  assert.equal(notifications[0].title, "Осталось 3 шага до релиза");
  assert.equal(notifications[0].cta_href, "/dashboard/releases/new");
  assert.deepEqual(result.errors, []);
});

test("an abandoned draft is reminded two hours after the last change, with a link to it", async () => {
  const draft = (id: string, changedAgoMs: number, extra: Record<string, unknown> = {}) => ({
    id,
    title: `Draft ${id}`,
    userId: "u1",
    status: "moderating",
    confirmed: false,
    upc: null,
    roles: { lifecycleState: "draft", draftUpdatedAt: ago(changedAgoMs).toISOString(), ...extra }
  });
  const { prisma, notifications } = fakePrisma({
    releases: [
      draft("11111111-1111-4111-8111-111111111111", 3 * HOUR_MS),
      draft("22222222-2222-4222-8222-222222222222", 30 * 60 * 1000),
      draft("33333333-3333-4333-8333-333333333333", 5 * 24 * HOUR_MS),
      { ...draft("44444444-4444-4444-8444-444444444444", 3 * HOUR_MS), roles: { lifecycleState: "moderation", draftUpdatedAt: ago(3 * HOUR_MS).toISOString() } }
    ]
  });

  const result = await runAccountReminders({ prisma, now });
  assert.deepEqual(result.sent, [{ userId: "u1", key: "draft:11111111-1111-4111-8111-111111111111" }]);
  assert.equal(notifications[0].cta_href, "/dashboard/releases/11111111-1111-4111-8111-111111111111/edit");
  assert.match(String(notifications[0].message), /Draft 11111111/);
});

test("a release whose date has come gets the smart link offer; old ones do not", async () => {
  const release = (id: string, startAgoMs: number, status = "approved") => ({
    id,
    title: "Хит",
    userId: "u1",
    status,
    confirmed: true,
    upc: null,
    roles: {},
    startDate: ago(startAgoMs)
  });
  const { prisma, notifications } = fakePrisma({
    releases: [
      release("55555555-5555-4555-8555-555555555555", HOUR_MS),
      release("66666666-6666-4666-8666-666666666666", 10 * 24 * HOUR_MS),
      release("77777777-7777-4777-8777-777777777777", HOUR_MS, "rejected")
    ]
  });

  const result = await runAccountReminders({ prisma, now });
  assert.deepEqual(result.sent, [{ userId: "u1", key: "release_out:55555555-5555-4555-8555-555555555555" }]);
  assert.equal(notifications[0].kind, "release_published");
  assert.equal(notifications[0].cta_href, "/dashboard/releases/55555555-5555-4555-8555-555555555555/smart-link");
});

test("after the free single the artist is offered a second release unless one already exists", async () => {
  const { prisma, notifications } = fakePrisma({
    claims: [
      { user_id: "u-free", release_id: "r1", consumed_at: ago(4 * 24 * HOUR_MS) },
      { user_id: "u-has-next", release_id: "r2", consumed_at: ago(4 * 24 * HOUR_MS) },
      { user_id: "u-recent", release_id: "r3", consumed_at: ago(24 * HOUR_MS) }
    ],
    releaseCountByUser: { "u-has-next": 1 }
  });

  const result = await runAccountReminders({ prisma, now });
  assert.deepEqual(result.sent, [{ userId: "u-free", key: "free_release_next" }]);
  assert.equal(notifications[0].title, "Готовы ко второму релизу?");
});
