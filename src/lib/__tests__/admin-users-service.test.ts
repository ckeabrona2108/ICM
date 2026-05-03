/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import {
  FinanceReportStatus,
  Role,
  SubscriptionPlan,
  SubscriptionStatus
} from "@prisma/client";

import {
  adminUserReleasesQuerySchema,
  canManageUsers,
  listAdminUsers,
  listUserReleasesForAdmin
} from "@/lib/admin-user-service";
import { adminTopUpSchema } from "@/lib/admin-users-service";
import { topUpUserBalanceByAdmin } from "@/lib/finance-service";
import { createUserReportByAdmin } from "@/lib/report-service";
import { updateUserSubscriptionByAdmin } from "@/lib/subscription-service";

test("admin can list users / non-admin cannot access users helper", async () => {
  assert.equal(canManageUsers("ADMIN"), true);
  assert.equal(canManageUsers("USER"), false);

  const prisma = {
    user: {
      findMany: async () => [
        {
          id: "u1",
          name: "User 1",
          email: "u1@example.com",
          avatarUrl: null,
          role: Role.USER,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          subscription: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE },
          _count: { releases: 2 },
          financeReports: [{ amount: 100 }],
          transactions: []
        }
      ]
    }
  } as any;

  const data = await listAdminUsers(
    prisma,
    {
      q: undefined,
      subscription: undefined,
      status: undefined,
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      perPage: 20
    }
  );

  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].balance, 100);
});

test("user releases are filtered by userId", async () => {
  let lastWhere: any = null;
  const prisma = {
    release: {
      count: async ({ where }: { where: unknown }) => {
        lastWhere = where;
        return 1;
      },
      findMany: async () => [
        {
          id: "r1",
          title: "Release 1",
          status: "DRAFT",
          createdAt: new Date(),
          updatedAt: new Date(),
          moderationStartedAt: null,
          approvedAt: null,
          rejectedAt: null
        }
      ]
    }
  } as any;

  const result = await listUserReleasesForAdmin(
    prisma,
    "user_123",
    adminUserReleasesQuerySchema.parse({ page: 1, perPage: 20 })
  );

  assert.equal(result.total, 1);
  assert.equal(lastWhere.userId, "user_123");
});

test("admin can top up balance and top-up creates finance operation + admin log", async () => {
  let transactionCreated = false;
  let adminLogCreated = false;
  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1" })
    },
    financeReport: {
      aggregate: async () => ({ _sum: { amount: 0 } }),
      create: async () => ({ id: "fr1" })
    },
    payoutRequest: {
      aggregate: async () => ({ _sum: { amount: 0 } })
    },
    transaction: {
      findMany: async () => [],
      create: async () => {
        transactionCreated = true;
        return {};
      }
    },
    adminLog: {
      create: async () => {
        adminLogCreated = true;
        return {};
      }
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        financeReport: prisma.financeReport,
        transaction: prisma.transaction,
        adminLog: prisma.adminLog
      })
  } as any;

  const result = await topUpUserBalanceByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "u1",
    amount: 500
  });
  assert.equal(result.ok, true);
  assert.equal(transactionCreated, true);
  assert.equal(adminLogCreated, true);
});

test("top-up rejects unknown user", async () => {
  const prisma = {
    user: {
      findUnique: async () => null
    }
  } as any;

  const result = await topUpUserBalanceByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "missing",
    amount: 100
  });
  assert.equal(result.ok, false);
});

test("invalid top-up amount rejected", () => {
  const parsed = adminTopUpSchema.safeParse({ amount: 0 });
  assert.equal(parsed.success, false);
});

test("admin can add report and report payload is persisted", async () => {
  let reportCreated = false;
  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1" })
    },
    financeReport: {
      create: async () => {
        reportCreated = true;
        return { id: "fr1" };
      }
    },
    adminLog: {
      create: async () => ({})
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        financeReport: prisma.financeReport,
        adminLog: prisma.adminLog
      })
  } as any;

  const result = await createUserReportByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "u1",
    periodStart: new Date("2026-05-01T00:00:00.000Z"),
    periodEnd: new Date("2026-05-31T23:59:59.999Z"),
    amount: 1000,
    status: FinanceReportStatus.READY_TO_CONFIRM
  });
  assert.equal(result.ok, true);
  assert.equal(reportCreated, true);
});

test("admin can change subscription and subscription change creates AdminLog", async () => {
  let upsertCalled = false;
  let adminLogCalled = false;
  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1" })
    },
    subscription: {
      findUnique: async () => ({ plan: SubscriptionPlan.FREE, status: SubscriptionStatus.CANCELED, renewalAt: null }),
      upsert: async () => {
        upsertCalled = true;
        return {};
      }
    },
    adminLog: {
      create: async () => {
        adminLogCalled = true;
        return {};
      }
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        subscription: prisma.subscription,
        adminLog: prisma.adminLog
      })
  } as any;

  const result = await updateUserSubscriptionByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "u1",
    plan: SubscriptionPlan.PRO,
    status: SubscriptionStatus.ACTIVE,
    renewalAt: new Date("2026-06-01T00:00:00.000Z")
  });
  assert.equal(result.ok, true);
  assert.equal(upsertCalled, true);
  assert.equal(adminLogCalled, true);
});
