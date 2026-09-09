// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { FinanceReportStatus } from "@prisma/client";

import {
  createUserReportByAdmin,
  deleteUserReportByAdmin,
  listUserReports,
  markUserReportAsAgreed,
  markUserReportAsRejected,
  resendUserReportToUser,
  updateUserReportByAdmin
} from "@/lib/report-service";

function createReportPrismaStub() {
  const state = {
    userBalance: 0,
    report: null as any,
    payloadTx: null as any,
    adminLogs: [] as any[]
  };

  const financeReport = {
    create: async ({ data }: any) => {
      state.report = {
        id: data.id,
        userId: data.userId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        amount: Number(data.amount),
        currency: data.currency ?? "RUB",
        status: data.status,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: data.updatedAt,
        agreedAt: data.agreedAt ?? null
      };
      return state.report;
    },
    update: async ({ data }: any) => {
      state.report = {
        ...state.report,
        ...data,
        amount: data.amount !== undefined ? Number(data.amount) : state.report.amount
      };
      return state.report;
    },
    delete: async ({ where }: any) => {
      if (state.report?.id !== where.id) {
        throw new Error("Report not found");
      }
      const deleted = state.report;
      state.report = null;
      return deleted;
    },
    findUnique: async ({ where }: any) => {
      if (state.report?.id === where.id) return state.report;
      return null;
    },
    findMany: async ({ where }: any) => {
      if (!state.report || state.report.userId !== where.userId) return [];
      return [state.report];
    }
  };

  const transaction = {
    create: async ({ data, select }: any) => {
      if (!select?.id) {
        throw new Error("The column `transaction.payoutId` does not exist in the current database.");
      }
      state.payloadTx = {
        id: data.id,
        userId: data.userId,
        description: data.description,
        metadata: data.metadata,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        processedAt: data.processedAt ?? null,
        status: data.status
      };
      return state.payloadTx;
    },
    update: async ({ data, select }: any) => {
      if (!select?.id) {
        throw new Error("The column `transaction.payoutId` does not exist in the current database.");
      }
      state.payloadTx = {
        ...state.payloadTx,
        ...data,
        metadata: data.metadata ?? state.payloadTx.metadata
      };
      return state.payloadTx;
    },
    findMany: async ({ where }: any) => {
      if (
        !state.payloadTx ||
        state.payloadTx.userId !== where.userId ||
        state.payloadTx.description !== where.description
      ) {
        return [];
      }
      return [state.payloadTx];
    }
  };

  const prisma = {
    user: {
      findUnique: async ({ where }: any) =>
        where.id === "user_1" ? { id: "user_1", balance: state.userBalance } : null,
      update: async ({ data }: any) => {
        state.userBalance += Number(data.balance.increment);
        return { id: "user_1", balance: state.userBalance };
      }
    },
    financeReport,
    transaction,
    adminLog: {
      create: async ({ data }: any) => {
        state.adminLogs.push(data);
        return data;
      }
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        user: prisma.user,
        financeReport,
        transaction,
        adminLog: prisma.adminLog
      })
  } as any;

  return { prisma, state };
}

test("pending report stores quarter details and line items in payload", async () => {
  const { prisma, state } = createReportPrismaStub();

  const result = await createUserReportByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "user_1",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-30T23:59:59.999Z"),
    amount: 0,
    status: FinanceReportStatus.READY_TO_CONFIRM,
    quarter: 3,
    year: 2026,
    items: [
      {
        id: "row-1",
        platformName: "Яндекс.Музыка",
        upc: "1234567890123",
        releaseTitle: "Последний танец",
        amount: 856
      }
    ],
    comment: "Q3 report"
  });

  assert.equal(result.ok, true);
  assert.equal(state.report.amount, 856);
  assert.equal(state.payloadTx.metadata.quarterLabel, "3 квартал 2026");
  assert.equal(state.payloadTx.metadata.items.length, 1);

  const reports = await listUserReports(prisma, "user_1");
  assert.equal(reports[0].lifecycleState, "ready_to_confirm");
  assert.equal(reports[0].quarterLabel, "3 квартал 2026");
  assert.equal(reports[0].platformTotals[0].platformName, "Яндекс.Музыка");
  assert.equal(reports[0].platformTotals[0].amount, 856);
});

test("report platform totals use exact line item amounts per platform", async () => {
  const { prisma } = createReportPrismaStub();

  await createUserReportByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "user_1",
    periodStart: new Date("2026-04-01T00:00:00.000Z"),
    periodEnd: new Date("2026-06-30T23:59:59.999Z"),
    amount: 0,
    status: FinanceReportStatus.READY_TO_CONFIRM,
    quarter: 2,
    year: 2026,
    items: [
      {
        id: "row-1",
        platformName: "Netease Cloud Music",
        upc: "5063635044004",
        releaseTitle: "NOT AFRAID",
        amount: 12678.02
      },
      {
        id: "row-2",
        platformName: "Apple",
        upc: "5063635044004",
        releaseTitle: "NOT AFRAID",
        amount: 678.02
      },
      {
        id: "row-3",
        platformName: "Яндекс",
        upc: "5063635044004",
        releaseTitle: "NOT AFRAID",
        amount: 198678.01
      }
    ],
    comment: "Q2 report"
  });

  const reports = await listUserReports(prisma, "user_1");
  assert.deepEqual(reports[0].platformTotals, [
    { platformName: "Яндекс", amount: 198678.01 },
    { platformName: "Netease Cloud Music", amount: 12678.02 },
    { platformName: "Apple", amount: 678.02 }
  ]);
  assert.equal(
    reports[0].platformTotals.reduce((sum, item) => Number((sum + item.amount).toFixed(2)), 0),
    212034.05
  );
});

test("rejected report can be updated and agreed once with balance credit", async () => {
  const { prisma, state } = createReportPrismaStub();

  await createUserReportByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "user_1",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-30T23:59:59.999Z"),
    amount: 1250,
    status: FinanceReportStatus.READY_TO_CONFIRM,
    quarter: 3,
    year: 2026,
    items: [],
    comment: "Initial"
  });

  const rejectResult = await markUserReportAsRejected({
    prisma,
    reportId: state.report.id,
    userId: "user_1",
    userComment: "Нужна правка по UPC"
  });
  assert.equal(rejectResult.ok, true);
  assert.equal(state.payloadTx.metadata.workflowState, "changes_requested");

  const updateResult = await updateUserReportByAdmin({
    prisma,
    adminId: "admin_1",
    reportId: state.report.id,
    userId: "user_1",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-30T23:59:59.999Z"),
    amount: 1400,
    status: FinanceReportStatus.READY_TO_CONFIRM,
    quarter: 3,
    year: 2026,
    items: [
      {
        id: "row-2",
        platformName: "YouTube Music",
        upc: "1234567890123",
        releaseTitle: "Последний танец",
        amount: 1400
      }
    ],
    comment: "Исправлено"
  });
  assert.equal(updateResult.ok, true);
  assert.equal(state.payloadTx.metadata.workflowState, "ready_to_confirm");
  assert.equal(state.payloadTx.metadata.userComment, null);

  const agreeResult = await markUserReportAsAgreed({
    prisma,
    reportId: state.report.id,
    userId: "user_1"
  });
  assert.equal(agreeResult.ok, true);
  assert.equal(state.report.status, FinanceReportStatus.AGREED);
  assert.equal(state.userBalance, 1400);
  assert.equal(state.payloadTx.metadata.workflowState, "agreed");
});

test("changes requested report can be resent to user without re-crediting balance", async () => {
  const { prisma, state } = createReportPrismaStub();

  await createUserReportByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "user_1",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-30T23:59:59.999Z"),
    amount: 1250,
    status: FinanceReportStatus.READY_TO_CONFIRM,
    quarter: 3,
    year: 2026,
    items: [],
    comment: "Initial"
  });

  await markUserReportAsRejected({
    prisma,
    reportId: state.report.id,
    userId: "user_1",
    userComment: "Нужна правка по строкам"
  });

  const resendResult = await resendUserReportToUser({
    prisma,
    reportId: state.report.id,
    userId: "user_1"
  });

  assert.equal(resendResult.ok, true);
  assert.equal(state.report.status, FinanceReportStatus.READY_TO_CONFIRM);
  assert.equal(state.payloadTx.metadata.workflowState, "ready_to_confirm");
  assert.equal(state.payloadTx.metadata.userComment, null);
  assert.equal(state.userBalance, 0);
});

test("creating agreed report credits user balance immediately", async () => {
  const { prisma, state } = createReportPrismaStub();

  const result = await createUserReportByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "user_1",
    periodStart: new Date("2026-10-01T00:00:00.000Z"),
    periodEnd: new Date("2026-12-31T23:59:59.999Z"),
    amount: 2200,
    status: FinanceReportStatus.AGREED,
    quarter: 4,
    year: 2026,
    comment: "Approved directly"
  });

  assert.equal(result.ok, true);
  assert.equal(state.userBalance, 2200);
  assert.equal(state.payloadTx.metadata.workflowState, "agreed");
});

test("payload-only fallback still lists and agrees reports when financeReport table is missing", async () => {
  const state = {
    userBalance: 0,
    payloadTx: null as any
  };

  const prisma = {
    user: {
      findUnique: async ({ where }: any) =>
        where.id === "user_1" ? { id: "user_1", balance: state.userBalance } : null,
      update: async ({ data }: any) => {
        state.userBalance += Number(data.balance.increment);
        return { id: "user_1", balance: state.userBalance };
      }
    },
    financeReport: {
      findMany: async () => {
        throw new Error('The table `icecream.financeReport` does not exist in the current database.');
      },
      findUnique: async () => {
        throw new Error('The table `icecream.financeReport` does not exist in the current database.');
      },
      create: async () => {
        throw new Error('The table `icecream.financeReport` does not exist in the current database.');
      },
      update: async () => {
        throw new Error('The table `icecream.financeReport` does not exist in the current database.');
      }
    },
    transaction: {
      create: async ({ data }: any) => {
        state.payloadTx = {
          id: data.id,
          userId: data.userId,
          description: data.description,
          metadata: data.metadata,
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
          processedAt: data.processedAt ?? null,
          status: data.status
        };
        return state.payloadTx;
      },
      update: async ({ data }: any) => {
        state.payloadTx = {
          ...state.payloadTx,
          ...data,
          metadata: data.metadata ?? state.payloadTx.metadata
        };
        return state.payloadTx;
      },
      findMany: async ({ where }: any) => {
        if (
          !state.payloadTx ||
          state.payloadTx.userId !== where.userId ||
          state.payloadTx.description !== where.description
        ) {
          return [];
        }
        return [state.payloadTx];
      }
    },
    adminLog: {
      create: async ({ data }: any) => data
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        user: prisma.user,
        financeReport: prisma.financeReport,
        transaction: prisma.transaction,
        adminLog: prisma.adminLog
      })
  } as any;

  const created = await createUserReportByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "user_1",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-30T23:59:59.999Z"),
    amount: 0,
    status: FinanceReportStatus.READY_TO_CONFIRM,
    quarter: 3,
    year: 2026,
    items: [
      {
        id: "row-1",
        platformName: "YouTube Music",
        upc: "1234567890123",
        releaseTitle: "Последний танец",
        amount: 856
      }
    ]
  });

  assert.equal(created.ok, true);

  const reports = await listUserReports(prisma, "user_1");
  assert.equal(reports.length, 1);
  assert.equal(reports[0].status, FinanceReportStatus.READY_TO_CONFIRM);
  assert.equal(reports[0].quarterLabel, "3 квартал 2026");

  const agreed = await markUserReportAsAgreed({
    prisma,
    reportId: reports[0].id,
    userId: "user_1"
  });

  assert.equal(agreed.ok, true);
  assert.equal(state.userBalance, 856);
  assert.equal(state.payloadTx.metadata.workflowState, "agreed");
});

test("admin delete hides agreed report from user and reverses credited balance", async () => {
  const { prisma, state } = createReportPrismaStub();

  const created = await createUserReportByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "user_1",
    periodStart: new Date("2026-04-01T00:00:00.000Z"),
    periodEnd: new Date("2026-06-30T23:59:59.999Z"),
    amount: 0,
    status: FinanceReportStatus.READY_TO_CONFIRM,
    quarter: 2,
    year: 2026,
    items: [
      {
        id: "row-1",
        platformName: "Apple",
        upc: "5063635044004",
        releaseTitle: "NOT AFRAID",
        amount: 678.02
      }
    ]
  });
  assert.equal(created.ok, true);

  const agreed = await markUserReportAsAgreed({
    prisma,
    reportId: state.report.id,
    userId: "user_1"
  });
  assert.equal(agreed.ok, true);
  assert.equal(state.userBalance, 678.02);

  const deleted = await deleteUserReportByAdmin({
    prisma,
    adminId: "admin_1",
    reportId: state.payloadTx.metadata.reportId,
    userId: "user_1"
  });
  assert.equal(deleted.ok, true);
  assert.equal(state.userBalance, 0);

  const reports = await listUserReports(prisma, "user_1");
  assert.equal(reports.length, 0);
  assert.equal(state.payloadTx.description, "Finance report payload deleted");
  assert.equal(state.payloadTx.metadata.kind, "finance_report_payload_deleted");
});
