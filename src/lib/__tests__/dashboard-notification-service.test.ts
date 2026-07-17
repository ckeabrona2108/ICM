import assert from "node:assert/strict";
import test from "node:test";

import { listDashboardNotifications } from "@/lib/dashboard-notification-service";
import { withReleaseLifecycleState } from "@/lib/release-counts";

test("dashboard notifications merge support, reports, payouts and lifecycle-based releases", async () => {
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
      createMany: async () => ({ count: 4 }),
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, read_at: null }))
    }
  } as any;

  const result = await listDashboardNotifications(prisma, "user_1");

  assert.equal(result.unreadCount, 4);
  assert.equal(result.items[0]?.kind, "report_ready");
  assert.ok(result.items.some((item) => item.kind === "report_ready"));
  assert.ok(result.items.some((item) => item.kind === "release_changes_required"));
  assert.ok(result.items.some((item) => item.kind === "release_approved"));
  assert.ok(result.items.some((item) => item.kind === "payout_paid"));
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
  } as any;

  await assert.rejects(
    () => listDashboardNotifications(prisma, "user_1"),
    (error) => error === storageError
  );
});
