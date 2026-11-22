import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@prisma/client";

import {
  isWithinReminderHours,
  MODERATION_DELAYED_KIND,
  planSubscriptionReminder,
  runAccountReminders,
  WELCOME_KIND
} from "@/lib/account-lifecycle-notifications";

const HOUR_MS = 60 * 60 * 1000;
// 12:00 in Moscow.
const now = new Date("2026-11-02T09:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const EPOCH = new Date(0);

function fakePrisma(data: {
  welcomes?: Array<{ user_id: string; created_at: Date }>;
  tracksByUser?: Record<string, number>;
  releases?: Array<Record<string, unknown>>;
  claims?: Array<{ user_id: string; release_id: string | null; consumed_at: Date }>;
  releaseCountByUser?: Record<string, number>;
  claimedKeys?: string[];
  promos?: Array<{ releaseId: string; shortName: string }>;
  subscribers?: Array<{ id: string; expiresAt: Date }>;
  recentNudges?: Array<{ user_id: string; kind: string }>;
  financeReports?: Array<{ id: string; userId: string; status: string; amount: number; createdAt: Date; quarter: number; year: number }>;
  earlierReportReminders?: number;
}) {
  const claimed = new Set(data.claimedKeys ?? []);
  const notifications: Array<Record<string, unknown>> = [];
  const inRange = (date: Date, range: { gte: Date; lte: Date }) => date >= range.gte && date <= range.lte;
  const prisma = {
    ai_user_notifications: {
      findMany: async (args: { where: { kind: string | { in: string[] }; user_id?: { in: string[] }; created_at: { gte: Date; lte?: Date } } }) => {
        const kind = args.where.kind;
        if (typeof kind !== "string") {
          // Reminders already sent in the last day (the daily cap).
          return [...(data.recentNudges ?? []), ...notifications.map((row) => ({ user_id: String(row.user_id), kind: String(row.kind) }))]
            .filter((row) => kind.in.includes(row.kind) && (args.where.user_id?.in ?? []).includes(row.user_id));
        }
        return (data.welcomes ?? []).filter(
          (row) => kind === WELCOME_KIND && inRange(row.created_at, args.where.created_at as { gte: Date; lte: Date })
        );
      },
      upsert: async (args: { create: Record<string, unknown> }) => {
        notifications.push(args.create);
        return args.create;
      }
    },
    track: {
      count: async (args: { where: { release: { userId: string } } }) => data.tracksByUser?.[args.where.release.userId] ?? 0
    },
    release: {
      findMany: async (args: { where: { startDate?: { gte: Date; lte: Date }; status?: string; confirmed?: boolean } }) => {
        if (args.where.status === "moderating" && args.where.confirmed === true) {
          return (data.releases ?? []).filter((row) => row.status === "moderating" && row.confirmed === true);
        }
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
    financeReport: {
      findMany: async (args: { where: { userId?: string; status?: { not: string }; createdAt?: { lte: Date } } }) => {
        const rows = data.financeReports ?? [];
        if (args.where.userId) {
          return rows
            .filter((row) => row.userId === args.where.userId)
            .map((row) => ({
              ...row,
              periodStart: new Date(Date.UTC(row.year, (row.quarter - 1) * 3, 1)),
              periodEnd: new Date(Date.UTC(row.year, row.quarter * 3, 0)),
              currency: "RUB",
              agreedAt: null
            }));
        }
        const pending = rows.filter((row) => row.status !== "AGREED" && row.createdAt <= (args.where.createdAt?.lte ?? now));
        return Array.from(new Set(pending.map((row) => row.userId))).map((userId) => ({ userId }));
      }
    },
    user_notification_reminders: {
      count: async () => data.earlierReportReminders ?? 0,
      create: async (args: { data: { user_id: string; key: string } }) => {
        const id = `${args.data.user_id}:${args.data.key}`;
        if (claimed.has(id)) {
          throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
        }
        claimed.add(id);
        return args.data;
      }
    },
    promo_links: {
      findMany: async (args: { where: { releaseId: { in: string[] } } }) =>
        (data.promos ?? []).filter((row) => args.where.releaseId.in.includes(row.releaseId))
    },
    user: {
      findUnique: async () => null,
      findMany: async (args: { where: { expiresAt: { gt: Date; lte: Date } } }) =>
        (data.subscribers ?? []).filter(
          (row) => row.expiresAt > args.where.expiresAt.gt && row.expiresAt <= args.where.expiresAt.lte
        )
    },
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

  const result = await runAccountReminders({ prisma, now, startedAt: EPOCH });
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

  const result = await runAccountReminders({ prisma, now, startedAt: EPOCH });
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
    ],
    promos: [{ releaseId: "55555555-5555-4555-8555-555555555555", shortName: "hit" }]
  });

  const result = await runAccountReminders({ prisma, now, startedAt: EPOCH });
  assert.deepEqual(result.sent, [{ userId: "u1", key: "release_out:55555555-5555-4555-8555-555555555555" }]);
  assert.equal(notifications[0].kind, "release_published");
  assert.equal(notifications[0].cta_href, "/dashboard/releases/55555555-5555-4555-8555-555555555555/smart-link");
  assert.match(String(notifications[0].message), /\/l\/hit$/u);
});

test("a subscription gets a reminder 3 days and 1 day before its end and on the day it ends", () => {
  const at = (ms: number) => new Date(now.getTime() + ms);
  assert.equal(planSubscriptionReminder(at(2.5 * 24 * HOUR_MS), now)?.title, "Подписка заканчивается через 3 дня");
  assert.equal(planSubscriptionReminder(at(1.5 * 24 * HOUR_MS), now), null);
  assert.equal(planSubscriptionReminder(at(5 * HOUR_MS), now)?.title, "Подписка заканчивается завтра");
  assert.equal(planSubscriptionReminder(at(-5 * HOUR_MS), now)?.kind, "account_subscription_ended");
  assert.equal(planSubscriptionReminder(at(-3 * 24 * HOUR_MS), now), null);
  assert.equal(planSubscriptionReminder(at(10 * 24 * HOUR_MS), now), null);
});

test("subscription reminders go once per end date, a renewal gets new ones", async () => {
  const end = new Date(now.getTime() + 5 * HOUR_MS);
  const { prisma, notifications } = fakePrisma({ subscribers: [{ id: "u9", expiresAt: end }] });
  const first = await runAccountReminders({ prisma, now, startedAt: EPOCH });
  const second = await runAccountReminders({ prisma, now, startedAt: EPOCH });
  assert.deepEqual(first.sent, [{ userId: "u9", key: `subscription_1d:${end.toISOString().slice(0, 10)}` }]);
  assert.deepEqual(second.sent, []);
  assert.equal(notifications[0].cta_href, "/dashboard/subscription");
  assert.equal(planSubscriptionReminder(new Date(end.getTime() + 30 * 24 * HOUR_MS), new Date(end.getTime() + 29.5 * 24 * HOUR_MS))?.key,
    `subscription_1d:${new Date(end.getTime() + 30 * 24 * HOUR_MS).toISOString().slice(0, 10)}`);
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

  const result = await runAccountReminders({ prisma, now, startedAt: EPOCH });
  assert.deepEqual(result.sent, [{ userId: "u-free", key: "free_release_next" }]);
  assert.equal(notifications[0].title, "Готовы ко второму релизу?");
});

test("an artist gets one reminder a day: the most important first, several drafts as one message", async () => {
  const draft = (id: string, title: string, changedAgoMs: number) => ({
    id,
    title,
    userId: "u1",
    status: "moderating",
    confirmed: false,
    upc: null,
    roles: { lifecycleState: "draft", draftUpdatedAt: ago(changedAgoMs).toISOString() }
  });
  const { prisma, notifications } = fakePrisma({
    releases: [
      draft("11111111-1111-4111-8111-111111111111", "Старый", 20 * HOUR_MS),
      draft("22222222-2222-4222-8222-222222222222", "Ночью", 3 * HOUR_MS),
      draft("33333333-3333-4333-8333-333333333333", "Утро", 10 * HOUR_MS)
    ],
    welcomes: [{ user_id: "u1", created_at: ago(30 * HOUR_MS) }],
    subscribers: [{ id: "u2", expiresAt: new Date(now.getTime() + 5 * HOUR_MS) }],
    recentNudges: [{ user_id: "u2", kind: "release_tip_snippet" }]
  });

  const result = await runAccountReminders({ prisma, now, startedAt: EPOCH });
  // u1: three drafts in one message, the signup reminder waits; u2 already got a tip today.
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, "Черновики ждут отправки");
  assert.equal(notifications[0].cta_href, "/dashboard/drafts");
  assert.match(String(notifications[0].message), /3 черновика, последний — «Ночью»/u);
  assert.equal(result.sent.length, 3);

  const again = await runAccountReminders({ prisma, now: new Date(now.getTime() + HOUR_MS), startedAt: EPOCH });
  assert.deepEqual(again.sent, []);
});

test("events from before the reminders started are not reminded, subscription ends still are", async () => {
  const { prisma, notifications } = fakePrisma({
    welcomes: [{ user_id: "u1", created_at: ago(30 * HOUR_MS) }],
    subscribers: [{ id: "u2", expiresAt: new Date(now.getTime() + 5 * HOUR_MS) }]
  });
  const result = await runAccountReminders({ prisma, now, startedAt: ago(HOUR_MS) });
  assert.deepEqual(result.sent.map((item) => item.userId), ["u2"]);
  assert.equal(notifications[0].kind, "account_subscription_ending");
});

test("an artist with reports to confirm gets one weekly reminder with the total", async () => {
  const financeReports = [
    { id: "r1", userId: "u-reports", status: "READY_TO_CONFIRM", amount: 1900, createdAt: ago(40 * 24 * HOUR_MS), quarter: 2, year: 2026 },
    { id: "r2", userId: "u-reports", status: "READY_TO_CONFIRM", amount: 1000, createdAt: ago(5 * 24 * HOUR_MS), quarter: 3, year: 2026 },
    { id: "r3", userId: "u-fresh", status: "READY_TO_CONFIRM", amount: 500, createdAt: ago(HOUR_MS), quarter: 3, year: 2026 }
  ];
  const { prisma, notifications } = fakePrisma({ financeReports });
  const result = await runAccountReminders({ prisma, now });
  assert.deepEqual(result.errors, []);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.user_id, "u-reports");
  assert.equal(notifications[0]?.kind, "report_confirm_reminder");
  assert.match(String(notifications[0]?.message), /^2 отчёта на 2\s900,00\s₽ ждут подтверждения/u);

  // Four reminders after the newest report are enough.
  const capped = fakePrisma({ financeReports, earlierReportReminders: 4 });
  await runAccountReminders({ prisma: capped.prisma, now });
  assert.equal(capped.notifications.length, 0);
});

test("a release still in moderation a working day after the expected answer gets the late notice once", async () => {
  // Thursday 26.11.2026, 13:00 in Moscow.
  const at = new Date("2026-11-26T10:00:00.000Z");
  const sentAt = (value: string) => new Date(`${value}:00+03:00`).toISOString();
  const moderated = (id: string, userId: string, sent: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: `Релиз ${id.slice(0, 2)}`,
    userId,
    status: "moderating",
    confirmed: true,
    upc: null,
    moderationStartedAt: null,
    roles: { lifecycleState: "moderation", timeline: { submittedAt: sentAt(sent) } },
    ...extra
  });
  const { prisma, notifications } = fakePrisma({
    releases: [
      // Mon 23.11: answer Mon or Tue, late from Wed noon.
      moderated("11111111-1111-4111-8111-111111111111", "u1", "2026-11-23T12:00"),
      // Wed 25.11: answer Wed or Thu, not late yet.
      moderated("22222222-2222-4222-8222-222222222222", "u3", "2026-11-25T10:00"),
      // Sent before late notices started: not reported.
      moderated("33333333-3333-4333-8333-333333333333", "u4", "2026-11-18T12:00"),
      // Not paid: waits for payment, not for moderators.
      moderated("44444444-4444-4444-8444-444444444444", "u5", "2026-11-23T12:00", { confirmed: false }),
      // Another artist already got a reminder today: the late notice still goes.
      moderated("55555555-5555-4555-8555-555555555555", "u2", "2026-11-23T12:00")
    ],
    recentNudges: [{ user_id: "u2", kind: "release_draft_reminder" }],
    claimedKeys: []
  });

  const result = await runAccountReminders({ prisma, now: at, startedAt: EPOCH });
  assert.deepEqual(
    result.sent.map((item) => item.userId).sort(),
    ["u1", "u2"]
  );
  assert.equal(notifications[0].kind, MODERATION_DELAYED_KIND);
  assert.equal(notifications[0].title, "Модерация релиза задерживается");
  assert.match(String(notifications[0].message), /проверяется дольше обычного/u);
  assert.equal(notifications[0].cta_href, "/dashboard/releases/11111111-1111-4111-8111-111111111111");

  const again = await runAccountReminders({ prisma, now: at, startedAt: EPOCH });
  assert.deepEqual(again.sent, []);
});

test("a release paid days after sending is not reported late until the days counted from the payment pass", async () => {
  const sentAt = (value: string) => new Date(`${value}:00+03:00`).toISOString();
  const paidLater = (id: string, userId: string, roles: Record<string, unknown>) => ({
    id,
    title: `Релиз ${id.slice(0, 2)}`,
    userId,
    status: "moderating",
    confirmed: true,
    upc: null,
    moderationStartedAt: null,
    roles: { lifecycleState: "moderation", ...roles }
  });
  const { prisma } = fakePrisma({
    releases: [
      // Sent Mon 23.11, paid Thu 26.11 (queue mark): not late on Thursday afternoon.
      paidLater("11111111-1111-4111-8111-111111111111", "u1", {
        timeline: { submittedAt: sentAt("2026-11-23T12:00"), queuedAt: sentAt("2026-11-26T12:00") }
      }),
      // Paid on Thursday before the queue mark existed: the payment record tells.
      paidLater("22222222-2222-4222-8222-222222222222", "u2", {
        timeline: { submittedAt: sentAt("2026-11-23T12:00") },
        paymentUsage: { type: "standalone_payment", usedAt: sentAt("2026-11-26T12:00") }
      })
    ],
    claimedKeys: []
  });

  const thursday = await runAccountReminders({ prisma, now: new Date("2026-11-26T10:30:00.000Z"), startedAt: EPOCH });
  assert.deepEqual(thursday.sent, []);
  // Monday 30.11, 13:00 in Moscow: the answer was due Thu or Fri.
  const monday = await runAccountReminders({ prisma, now: new Date("2026-11-30T10:00:00.000Z"), startedAt: EPOCH });
  assert.deepEqual(monday.sent.map((item) => item.userId).sort(), ["u1", "u2"]);
});
