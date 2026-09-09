import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

import { listDashboardNotifications } from "@/lib/dashboard-notification-service";
import { withReleaseLifecycleState } from "@/lib/release-counts";

test("dashboard notifications merge support, reports, payouts and lifecycle-based releases", async () => {
  let persistedIds: string[] = [];
  let persistedRows: Array<{
    id: string;
    kind: string;
    title: string;
    message: string;
    cta_href: string;
    created_at: Date;
    read_at: Date | null;
  }> = [];
  const prisma = {
    release: {
      findMany: async () => [
        {
          id: "rel_changes",
          title: "Demo Changes",
          status: "moderating",
          date: new Date("2026-07-10T10:00:00.000Z"),
          confirmed: false,
          upc: null,
          roles: withReleaseLifecycleState({}, "changes_required"),
          rejectReason: "Исправьте метаданные",
          moderatorComment: null
        },
        {
          id: "rel_ok",
          title: "Demo Approved",
          status: "approved",
          date: new Date("2026-07-09T10:00:00.000Z"),
          confirmed: true,
          upc: "123456789012",
          roles: withReleaseLifecycleState({}, "approved"),
          rejectReason: null,
          moderatorComment: null
        }
      ]
    },
    financeReport: {
      findMany: async () => [
        {
          id: "report_ready",
          userId: "user_1",
          periodStart: new Date("2026-04-01T00:00:00.000Z"),
          periodEnd: new Date("2026-06-30T00:00:00.000Z"),
          amount: 1200,
          currency: "RUB",
          status: "READY_TO_CONFIRM",
          agreedAt: null,
          createdAt: new Date("2026-07-12T10:00:00.000Z"),
          updatedAt: new Date("2026-07-12T10:00:00.000Z")
        }
      ]
    },
    transaction: {
      findMany: async () => []
    },
    payouts: {
      findMany: async () => [
        {
          id: "payout_1",
          amount: 500,
          confirmed: true,
          createdAt: new Date("2026-07-11T10:00:00.000Z")
        }
      ]
    },
    supportTicket: {
      findMany: async () => []
    },
    message: {
      groupBy: async () => []
    },
    ai_user_notifications: {
      createMany: async ({ data }: { data: Array<{
        id: string;
        kind: string;
        title: string;
        message: string;
        cta_href: string;
        created_at: Date;
        read_at: Date | null;
      }> }) => {
        persistedIds = data.map((item) => item.id);
        persistedRows = data;
        return { count: data.length };
      },
      findMany: async () => [
        {
          id: "stored-artist-event",
          kind: "collaboration_response_received",
          title: "Новый отклик",
          message: "На объявление пришёл новый отклик.",
          cta_href: "/feed/post_post-1",
          created_at: new Date("2026-07-19T08:30:00.000Z"),
          read_at: null
        },
        ...persistedRows.map((item) => ({
          ...item,
          created_at: new Date("2026-07-18T08:30:00.000Z")
        }))
      ],
      count: async ({ where }: { where: { user_id: string; read_at: null } }) => {
        assert.deepEqual(where, { user_id: "user_1", read_at: null });
        return 23;
      }
    }
  } as never;

  const result = await listDashboardNotifications(prisma, "user_1");

  assert.equal(result.unreadCount, 23);
  assert.equal(result.items[0]?.createdAt, "2026-07-19T08:30:00.000Z");
  assert.equal(result.items[0]?.kind, "collaboration_response_received");
  assert.equal(result.items[0]?.href, "/feed/post_post-1");
  assert.ok(result.items.some((item) => item.kind === "report_ready"));
  assert.ok(result.items.some((item) => item.kind === "release_changes_required"));
  assert.ok(result.items.some((item) => item.kind === "release_approved"));
  assert.ok(result.items.some((item) => item.kind === "payout_paid"));
  assert.ok(result.items.some((item) => item.kind === "collaboration_response_received"));
  assert.equal(persistedIds.length, 4);
  assert.ok(
    persistedIds.every((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)
    )
  );
});

test("dashboard notifications derive support items from the actual unread tickets", async () => {
  let persistedRows: Array<{
    id: string;
    kind: string;
    title: string;
    message: string;
    cta_href: string;
    created_at: Date;
    read_at: Date | null;
  }> = [];
  const ticketRecord = (id: string, title: string, updatedAt: string) => ({
    id,
    title,
    status: "OPEN",
    userId: "user_1",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date(updatedAt),
    User: { id: "user_1", name: "User", email: "user@example.com" },
    Message: []
  });
  const prisma = {
    release: { findMany: async () => [] },
    financeReport: { findMany: async () => [] },
    transaction: { findMany: async () => [] },
    payouts: { findMany: async () => [] },
    supportTicket: {
      findMany: async () => [
        ticketRecord("ticket_read", "Already read", "2026-07-20T10:00:00.000Z"),
        ticketRecord("ticket_unread", "Actually unread", "2026-07-19T10:00:00.000Z")
      ]
    },
    message: {
      findMany: async () => [{ ticketId: "ticket_unread" }],
      groupBy: async () => [{ ticketId: "ticket_unread" }]
    },
    ai_user_notifications: {
      createMany: async ({ data }: { data: typeof persistedRows }) => {
        persistedRows = data;
        return { count: data.length };
      },
      findMany: async () => persistedRows,
      count: async () => 1
    }
  } as never;

  const result = await listDashboardNotifications(prisma, "user_1");

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.kind, "support_reply");
  assert.equal(result.items[0]?.message, "Actually unread");
});

test("dashboard notifications expose storage failures instead of returning a false empty state", async () => {
  const storageError = new Error("relation icecream.payouts does not exist");
  const prisma = {
    release: { findMany: async () => [] },
    financeReport: { findMany: async () => [] },
    transaction: { findMany: async () => [] },
    payouts: { findMany: async () => { throw storageError; } },
    supportTicket: { findMany: async () => [] },
    message: { groupBy: async () => [] }
  } as never;

  await assert.rejects(
    () => listDashboardNotifications(prisma, "user_1"),
    (error) => error === storageError
  );
});

test("dashboard notifications tolerate legacy notification rows without source columns", async () => {
  const persistedRows = [{
    id: "stored-legacy",
    kind: "artist_profile_followed",
    title: "Новый подписчик",
    message: "Legacy row",
    cta_href: "/feed/post_post-1",
    created_at: new Date("2026-07-19T08:30:00.000Z"),
    read_at: null
  }];
  const prisma = {
    release: { findMany: async () => [] },
    financeReport: { findMany: async () => [] },
    transaction: { findMany: async () => [] },
    payouts: { findMany: async () => [] },
    supportTicket: { findMany: async () => [] },
    message: { groupBy: async () => [] },
    ai_user_notifications: {
      createMany: async () => ({ count: 0 }),
      findMany: async ({ select }: { select: Record<string, boolean> }) => {
        if (select.source_type || select.source_id) {
          throw new Error("The column `ai_user_notifications.source_type` does not exist in the current database.");
        }
        return persistedRows;
      },
      count: async () => 1
    }
  } as never;

  const result = await listDashboardNotifications(prisma, "user_1");

  assert.equal(result.unreadCount, 1);
  assert.deepEqual(result.items, [{
    id: "stored-legacy",
    kind: "artist_profile_followed",
    title: "Новый подписчик",
    message: "Legacy row",
    href: "/feed/post_post-1",
    createdAt: "2026-07-19T08:30:00.000Z",
    isUnread: true
  }]);
});

test("dashboard notifications degrade gracefully on Prisma pool timeout", async () => {
  const poolTimeout = new Prisma.PrismaClientKnownRequestError(
    "Timed out fetching a new connection from the connection pool.",
    {
      code: "P2024",
      clientVersion: "5.22.0"
    }
  );

  const prisma = {
    release: { findMany: async () => { throw poolTimeout; } },
    financeReport: { findMany: async () => { throw poolTimeout; } },
    payouts: { findMany: async () => { throw poolTimeout; } },
    supportTicket: { findMany: async () => { throw poolTimeout; } },
    message: { findMany: async () => { throw poolTimeout; } },
    ai_user_notifications: {
      createMany: async () => ({ count: 0 }),
      findMany: async () => { throw poolTimeout; },
      count: async () => { throw poolTimeout; }
    }
  } as never;

  const result = await listDashboardNotifications(prisma, "user_1");

  assert.equal(result.unreadCount, 0);
  assert.deepEqual(result.items, []);
});
