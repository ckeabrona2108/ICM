// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import {
  BalanceAdminAdjustmentType,
  FinanceReportStatus,
  ReleaseStatus,
  Role,
  SubscriptionPlan,
  SubscriptionSource,
  SubscriptionStatus
} from "@prisma/client";

import {
  adminBalanceAdjustSchema,
  adminUpdateSubscriptionSchema
} from "@/lib/admin-users-service";
import {
  adminUserReleasesQuerySchema,
  canManageUsers,
  listAdminUsers,
  listUserReleasesForAdmin
} from "@/lib/admin-user-service";
import { adjustUserBalanceByAdmin } from "@/lib/finance-service";
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
          subscription: {
            plan: SubscriptionPlan.PRO,
            status: SubscriptionStatus.ACTIVE,
            endsAt: new Date("2026-06-01T00:00:00.000Z"),
            renewalAt: null
          },
          _count: { releases: 2 },
          financeReports: [{ amount: 100 }],
          transactions: []
        }
      ]
    }
  } as any;

  const data = await listAdminUsers(prisma, {
    q: undefined,
    subscription: undefined,
    status: undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
    page: 1,
    perPage: 20
  });

  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].balance, 100);
  assert.equal(data.items[0].accountStatus, "ACTIVE");
});

test("expired subscription end date makes account inactive in admin list", async () => {
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
          subscription: {
            plan: SubscriptionPlan.PRO,
            status: SubscriptionStatus.ACTIVE,
            endsAt: new Date("2026-01-01T00:00:00.000Z"),
            renewalAt: null
          },
          _count: { releases: 0 },
          financeReports: [],
          transactions: []
        }
      ]
    }
  } as any;

  const data = await listAdminUsers(prisma, {
    q: undefined,
    subscription: undefined,
    status: undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
    page: 1,
    perPage: 20
  });

  assert.equal(data.items[0].accountStatus, "INACTIVE");
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
          moderationStartedAt: null
        }
      ]
    }
  } as any;

  const result = await listUserReleasesForAdmin(prisma, "user_123", adminUserReleasesQuerySchema.parse({ page: 1, perPage: 20 }));

  assert.equal(result.total, 1);
  assert.equal(lastWhere.userId, "user_123");
});

test("admin grants subscription with custom end date and logs the change", async () => {
  let upsertPayload: any = null;
  let subscriptionLogPayload: any = null;
  let adminLogCalled = false;
  const customEndsAt = new Date("2026-06-06T00:00:00.000Z");

  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1" })
    },
    subscription: {
      findUnique: async () => ({
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.CANCELED,
        source: SubscriptionSource.PAYMENT,
        adminComment: null,
        grantedByAdminId: null,
        endsAt: null,
        renewalAt: null
      }),
      upsert: async (payload: any) => {
        upsertPayload = payload;
        return {};
      }
    },
    subscription_admin_logs: {
      create: async ({ data }: any) => {
        subscriptionLogPayload = data;
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
        subscription_admin_logs: prisma.subscription_admin_logs,
        adminLog: prisma.adminLog
      })
  } as any;

  const result = await updateUserSubscriptionByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "u1",
    plan: SubscriptionPlan.ENTERPRISE,
    status: SubscriptionStatus.ACTIVE,
    endsAt: customEndsAt,
    comment: "Выдано вручную админом"
  });

  assert.equal(result.ok, true);
  assert.equal(upsertPayload.create.source, SubscriptionSource.ADMIN_GRANT);
  assert.equal(upsertPayload.create.grantedByAdminId, "admin_1");
  assert.equal(upsertPayload.create.endsAt.toISOString(), customEndsAt.toISOString());
  assert.equal(upsertPayload.create.renewalAt.toISOString(), customEndsAt.toISOString());
  assert.equal(subscriptionLogPayload.newPlan, SubscriptionPlan.ENTERPRISE);
  assert.equal(subscriptionLogPayload.newStatus, SubscriptionStatus.ACTIVE);
  assert.equal(subscriptionLogPayload.newEndsAt.toISOString(), customEndsAt.toISOString());
  assert.equal(adminLogCalled, true);
});

test("admin can change subscription plan and creates subscription admin log", async () => {
  let subscriptionLogPayload: any = null;
  const updatedReleasePayloads: any[] = [];
  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1" })
    },
    subscription: {
      findUnique: async () => ({
        plan: SubscriptionPlan.ENTERPRISE,
        status: SubscriptionStatus.ACTIVE,
        source: SubscriptionSource.ADMIN_GRANT,
        adminComment: "old",
        grantedByAdminId: "admin_0",
        startedAt: new Date("2026-06-01T00:00:00.000Z"),
        endsAt: new Date("2026-08-01T00:00:00.000Z"),
        renewalAt: new Date("2026-08-01T00:00:00.000Z")
      }),
      upsert: async () => ({})
    },
    release: {
      findMany: async () => [],
      update: async ({ data }: any) => {
        updatedReleasePayloads.push(data);
        return { id: "r1" };
      }
    },
    subscriptionPayment: {
      findMany: async () => []
    },
    subscription_admin_logs: {
      create: async ({ data }: any) => {
        subscriptionLogPayload = data;
        return {};
      }
    },
    adminLog: {
      create: async () => ({})
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        subscription: prisma.subscription,
        release: prisma.release,
        subscriptionPayment: prisma.subscriptionPayment,
        subscription_admin_logs: prisma.subscription_admin_logs,
        adminLog: prisma.adminLog
      })
  } as any;

  const result = await updateUserSubscriptionByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "u1",
    plan: SubscriptionPlan.PRO,
    status: SubscriptionStatus.ACTIVE,
    endsAt: new Date("2026-07-01T00:00:00.000Z"),
    comment: "Смена тарифа"
  });

  assert.equal(result.ok, true);
  assert.equal(subscriptionLogPayload.oldPlan, SubscriptionPlan.ENTERPRISE);
  assert.equal(subscriptionLogPayload.newPlan, SubscriptionPlan.PRO);
  assert.equal(updatedReleasePayloads.length, 0);
});

test("admin cancels subscription and uses explicit canceled status", async () => {
  let upsertPayload: any = null;
  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1" })
    },
    subscription: {
      findUnique: async () => ({
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        source: SubscriptionSource.ADMIN_GRANT,
        adminComment: null,
        grantedByAdminId: "admin_0",
        endsAt: new Date("2026-08-01T00:00:00.000Z"),
        renewalAt: new Date("2026-08-01T00:00:00.000Z")
      }),
      upsert: async (payload: any) => {
        upsertPayload = payload;
        return {};
      }
    },
    subscription_admin_logs: {
      create: async () => ({})
    },
    adminLog: {
      create: async () => ({})
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        subscription: prisma.subscription,
        subscription_admin_logs: prisma.subscription_admin_logs,
        adminLog: prisma.adminLog
      })
  } as any;

  const result = await updateUserSubscriptionByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "u1",
    plan: SubscriptionPlan.PRO,
    status: SubscriptionStatus.CANCELED,
    endsAt: new Date("2026-05-01T00:00:00.000Z"),
    comment: "Отменено админом"
  });

  assert.equal(result.ok, true);
  assert.equal(upsertPayload.update.status, SubscriptionStatus.CANCELED);
});

test("downgrade from PRO to FREE snapshots historical submitted release", async () => {
  let releaseUpdateData: any = null;

  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1" })
    },
    subscription: {
      findUnique: async () => ({
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        source: SubscriptionSource.ADMIN_GRANT,
        adminComment: null,
        grantedByAdminId: "admin_0",
        startedAt: new Date("2026-05-01T00:00:00.000Z"),
        endsAt: new Date("2026-06-01T00:00:00.000Z"),
        renewalAt: new Date("2026-06-01T00:00:00.000Z")
      }),
      upsert: async () => ({})
    },
    release: {
      findMany: async () => [
        {
          id: "r1",
          status: ReleaseStatus.APPROVED,
          createdAt: new Date("2026-05-07T10:00:00.000Z"),
          updatedAt: new Date("2026-05-07T10:00:00.000Z"),
          moderationStartedAt: new Date("2026-05-07T10:00:00.000Z"),
          submissionData: {}
        }
      ],
      update: async ({ data }: any) => {
        releaseUpdateData = data;
        return { id: "r1" };
      }
    },
    subscriptionPayment: {
      findMany: async () => []
    },
    subscription_admin_logs: {
      create: async () => ({})
    },
    adminLog: {
      create: async () => ({})
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        subscription: prisma.subscription,
        release: prisma.release,
        subscriptionPayment: prisma.subscriptionPayment,
        subscription_admin_logs: prisma.subscription_admin_logs,
        adminLog: prisma.adminLog
      })
  } as any;

  const result = await updateUserSubscriptionByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "u1",
    plan: SubscriptionPlan.FREE,
    status: SubscriptionStatus.CANCELED,
    endsAt: null,
    comment: "Снижен до FREE"
  });

  assert.equal(result.ok, true);
  assert.equal(releaseUpdateData?.submissionData?.paymentSnapshot?.plan, "PRO");
  assert.equal(releaseUpdateData?.submissionData?.paymentSnapshot?.releasesUsedAfterSubmit, 1);
});

test("admin can credit balance and writes balance admin log", async () => {
  let balanceLogPayload: any = null;
  let adminLogCalled = false;
  let transactionCreated = false;
  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1" })
    },
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => {
        if (where.status === "AGREED") return { _sum: { amount: 0 } };
        return { _sum: { amount: 0 } };
      },
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
    balance_admin_logs: {
      create: async ({ data }: any) => {
        balanceLogPayload = data;
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
        financeReport: prisma.financeReport,
        transaction: prisma.transaction,
        balance_admin_logs: prisma.balance_admin_logs,
        adminLog: prisma.adminLog
      })
  } as any;

  const result = await adjustUserBalanceByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "u1",
    type: "credit",
    amount: 1000,
    comment: "Корректировка баланса"
  });

  assert.equal(result.ok, true);
  assert.equal(transactionCreated, true);
  assert.equal(balanceLogPayload.type, BalanceAdminAdjustmentType.CREDIT);
  assert.equal(Number(balanceLogPayload.newBalance), 1000);
  assert.equal(adminLogCalled, true);
});

test("admin can debit balance and writes balance admin log", async () => {
  let balanceLogPayload: any = null;
  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1" })
    },
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => {
        if (where.status === "AGREED") return { _sum: { amount: 1500 } };
        return { _sum: { amount: 0 } };
      }
    },
    payoutRequest: {
      aggregate: async () => ({ _sum: { amount: 0 } })
    },
    transaction: {
      findMany: async () => [],
      create: async () => ({})
    },
    balance_admin_logs: {
      create: async ({ data }: any) => {
        balanceLogPayload = data;
        return {};
      }
    },
    adminLog: {
      create: async () => ({})
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        transaction: prisma.transaction,
        balance_admin_logs: prisma.balance_admin_logs,
        adminLog: prisma.adminLog
      })
  } as any;

  const result = await adjustUserBalanceByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "u1",
    type: "debit",
    amount: 500,
    comment: "Списание вручную"
  });

  assert.equal(result.ok, true);
  assert.equal(balanceLogPayload.type, BalanceAdminAdjustmentType.DEBIT);
  assert.equal(Number(balanceLogPayload.oldBalance), 1500);
  assert.equal(Number(balanceLogPayload.newBalance), 1000);
});

test("debit more than balance is rejected", async () => {
  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1" })
    },
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => {
        if (where.status === "AGREED") return { _sum: { amount: 300 } };
        return { _sum: { amount: 0 } };
      }
    },
    payoutRequest: {
      aggregate: async () => ({ _sum: { amount: 0 } })
    },
    transaction: {
      findMany: async () => []
    }
  } as any;

  const result = await adjustUserBalanceByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "u1",
    type: "debit",
    amount: 500,
    comment: "Лишнее списание"
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Недостаточно средств для списания");
});

test("invalid admin balance adjustment rejected", () => {
  const parsed = adminBalanceAdjustSchema.safeParse({ type: "debit", amount: 0, comment: "" });
  assert.equal(parsed.success, false);
});

test("subscription schema accepts lowercase API payload values", () => {
  const parsed = adminUpdateSubscriptionSchema.parse({
    plan: "enterprise",
    status: "active",
    endsAt: "2026-06-06T00:00:00.000Z",
    comment: "Выдано вручную админом"
  });

  assert.equal(parsed.plan, SubscriptionPlan.ENTERPRISE);
  assert.equal(parsed.status, SubscriptionStatus.ACTIVE);
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
