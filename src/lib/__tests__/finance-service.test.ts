/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { TransactionStatus, TransactionType } from "@prisma/client";

import { getUserBalanceTotals, getUserFinanceView, topUpUserBalanceByAdmin } from "@/lib/finance-service";

test("technical royalty import rows are excluded from the financial operation history", async () => {
  const now = new Date("2026-09-11T19:03:59.000Z");
  const prisma = {
    financeReport: {
      findMany: async () => [],
      count: async () => 0
    },
    payouts: {
      aggregate: async () => ({ _sum: { amount: 0 } })
    },
    transaction: {
      findMany: async ({ where }: any) => {
        if (where.description) return [];
        return [
          {
            id: "technical-import",
            type: "ROYALTY",
            status: "COMPLETED",
            amount: 5015.38,
            description: "Royalty added from Q2.xlsx",
            metadata: { importId: "import-1" },
            createdAt: now,
            processedAt: now
          },
          {
            id: "payout",
            type: "PAYOUT",
            status: "COMPLETED",
            amount: 2000,
            description: "Payout completed",
            metadata: null,
            createdAt: now,
            processedAt: now
          }
        ];
      }
    }
  } as any;

  const finance = await getUserFinanceView(prisma, "u1");

  assert.deepEqual(finance.transactions.map((item) => item.id), ["payout"]);
});

test("financial operation history shows the report amount and its lifecycle state", async () => {
  const now = new Date("2026-09-24T20:00:00.000Z");
  const prisma = {
    financeReport: {
      findMany: async () => [
        {
          id: "report-rework",
          periodStart: new Date("2026-04-01T00:00:00.000Z"),
          periodEnd: new Date("2026-06-30T23:59:59.999Z"),
          amount: 5508.26,
          status: "READY_TO_CONFIRM",
          currency: "RUB",
          createdAt: now,
          agreedAt: null
        }
      ]
    },
    payouts: { aggregate: async () => ({ _sum: { amount: 0 } }) },
    transaction: { findMany: async () => [] }
  } as any;

  const finance = await getUserFinanceView(prisma, "u1");

  assert.deepEqual(finance.transactions, [
    {
      id: "report:report-rework",
      type: "REPORT",
      status: "PENDING",
      amount: 5508.26,
      description: "2 квартал 2026",
      createdAt: now.toISOString(),
      processedAt: null,
      reportLifecycleState: "ready_to_confirm"
    }
  ]);
});

test("top up increases balance", async () => {
  const prisma = {
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => {
        if (where.status === "AGREED") return { _sum: { amount: 2000 } };
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

  const totals = await getUserBalanceTotals(prisma, "u1");
  assert.equal(totals.agreedBalance, 2000);
  assert.equal(totals.availableToWithdraw, 2000);
});

test("withdrawal decreases balance", async () => {
  const prisma = {
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => {
        if (where.status === "AGREED") return { _sum: { amount: 2000 } };
        return { _sum: { amount: 0 } };
      }
    },
    payoutRequest: {
      aggregate: async () => ({ _sum: { amount: 0 } })
    },
    transaction: {
      findMany: async () => [
        { type: TransactionType.PAYOUT, amount: -300, status: TransactionStatus.COMPLETED }
      ]
    }
  } as any;

  const totals = await getUserBalanceTotals(prisma, "u1");
  assert.equal(totals.agreedBalance, 1700);
});

test("multiple operations produce correct final balance", async () => {
  const prisma = {
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => {
        if (where.status === "AGREED") return { _sum: { amount: 2000 } };
        return { _sum: { amount: 0 } };
      }
    },
    payoutRequest: {
      aggregate: async () => ({ _sum: { amount: 0 } })
    },
    transaction: {
      findMany: async () => [
        { type: TransactionType.PAYOUT, amount: -300, status: TransactionStatus.COMPLETED },
        { type: TransactionType.FEE, amount: 50, status: TransactionStatus.COMPLETED },
        { type: TransactionType.REFUND, amount: 20, status: TransactionStatus.COMPLETED }
      ]
    }
  } as any;

  const totals = await getUserBalanceTotals(prisma, "u1");
  assert.equal(totals.agreedBalance, 1670);
});

test("balance stays consistent regardless of payout transaction sign", async () => {
  const basePrisma = {
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => {
        if (where.status === "AGREED") return { _sum: { amount: 2000 } };
        return { _sum: { amount: 0 } };
      }
    },
    payoutRequest: {
      aggregate: async () => ({ _sum: { amount: 0 } })
    }
  };

  const totalsWithNegative = await getUserBalanceTotals(
    {
      ...basePrisma,
      transaction: {
        findMany: async () => [{ type: TransactionType.PAYOUT, amount: -300 }]
      }
    } as any,
    "u1"
  );
  const totalsWithPositive = await getUserBalanceTotals(
    {
      ...basePrisma,
      transaction: {
        findMany: async () => [{ type: TransactionType.PAYOUT, amount: 300 }]
      }
    } as any,
    "u1"
  );

  assert.equal(totalsWithNegative.agreedBalance, 1700);
  assert.equal(totalsWithPositive.agreedBalance, 1700);
});

test("effective report lifecycle moves money between accruals and available balance", async () => {
  const now = new Date("2026-07-01T00:00:00.000Z");
  const reports = [
    {
      id: "agreed-report",
      userId: "u1",
      periodStart: now,
      periodEnd: now,
      amount: 100,
      currency: "RUB",
      status: "AGREED",
      createdAt: now,
      agreedAt: now
    },
    {
      id: "pending-report",
      userId: "u1",
      periodStart: now,
      periodEnd: now,
      amount: 200,
      currency: "RUB",
      status: "READY_TO_CONFIRM",
      createdAt: now,
      agreedAt: null
    },
    {
      id: "changes-report",
      userId: "u1",
      periodStart: now,
      periodEnd: now,
      amount: 300,
      currency: "RUB",
      status: "READY_TO_CONFIRM",
      createdAt: now,
      agreedAt: null
    }
  ];
  const prisma = {
    financeReport: {
      aggregate: async () => ({ _sum: { amount: 0 } }),
      findMany: async () => reports
    },
    payoutRequest: {
      aggregate: async () => ({ _sum: { amount: 0 } })
    },
    transaction: {
      findMany: async ({ where }: { where: { description?: string } }) =>
        where.description
          ? [
              {
                id: "payload-changes",
                description: "Finance report payload",
                metadata: {
                  kind: "finance_report_payload",
                  reportId: "changes-report",
                  workflowState: "changes_requested",
                  amount: 300,
                  currency: "RUB",
                  updatedAt: now.toISOString(),
                  items: []
                }
              }
            ]
          : []
    }
  } as any;

  const totals = await getUserBalanceTotals(prisma, "u1");

  assert.equal(totals.agreedBalance, 100);
  assert.equal(totals.pendingBalance, 500);
  assert.equal(totals.availableToWithdraw, 100);
});

test("missing canonical payout table is an explicit loading error", async () => {
  const prisma = {
    $queryRaw: async () => [{ exists: false }],
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => ({
        _sum: { amount: where.status === "AGREED" ? 700 : 250 }
      })
    },
    payoutRequest: {
      aggregate: async () => {
        throw new Error("The table `icecream.PayoutRequest` does not exist in the current database.");
      }
    },
    transaction: {
      findMany: async () => []
    }
  } as any;

  await assert.rejects(
    getUserBalanceTotals(prisma, "u1"),
    /Финансовые данные временно недоступны/u
  );
});

test("missing payoutRequest table is skipped before Prisma aggregate", async () => {
  let payoutRequestAggregateCalled = false;
  const prisma = {
    $queryRaw: async (query: { values?: unknown[] }) => {
      const tableName = String(query.values?.[0] ?? "");
      return [{ exists: tableName === "payouts" }];
    },
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => ({
        _sum: { amount: where.status === "AGREED" ? 700 : 250 }
      })
    },
    payoutRequest: {
      aggregate: async () => {
        payoutRequestAggregateCalled = true;
        throw new Error("payoutRequest aggregate must not be called");
      }
    },
    payouts: {
      aggregate: async () => ({ _sum: { amount: 125 } })
    },
    transaction: {
      findMany: async () => []
    }
  } as any;

  const totals = await getUserBalanceTotals(prisma, "u1");

  assert.equal(payoutRequestAggregateCalled, false);
  assert.equal(totals.pendingPayout, 125);
  assert.equal(totals.availableToWithdraw, 575);
});

test("canonical payout requests reserve the balance by lifecycle status", async () => {
  let payoutFilter: unknown;
  const prisma = {
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => ({
        _sum: { amount: where.status === "AGREED" ? 1000 : 0 }
      })
    },
    payouts: {
      aggregate: async ({ where }: { where: unknown }) => {
        payoutFilter = where;
        return { _sum: { amount: 250 } };
      }
    },
    transaction: { findMany: async () => [] }
  } as any;

  const totals = await getUserBalanceTotals(prisma, "u1");

  assert.deepEqual(payoutFilter, {
    userId: "u1",
    status: { in: ["REQUESTED", "PROCESSING"] }
  });
  assert.equal(totals.pendingPayout, 250);
  assert.equal(totals.availableToWithdraw, 750);
});

test("legacy payouts without status column reserve balance by confirmed flag", async () => {
  let payoutFilter: unknown;
  const prisma = {
    $queryRaw: async (query: { strings?: string[]; values?: unknown[] }) => {
      const sql = String(query.strings?.join(" ") ?? "");
      if (sql.includes("information_schema.columns")) {
        return [{ exists: false }];
      }
      const tableName = String(query.values?.[0] ?? "");
      return [{ exists: tableName === "payouts" }];
    },
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => ({
        _sum: { amount: where.status === "AGREED" ? 1000 : 0 }
      })
    },
    payouts: {
      aggregate: async ({ where }: { where: unknown }) => {
        payoutFilter = where;
        return { _sum: { amount: 300 } };
      }
    },
    transaction: { findMany: async () => [] }
  } as any;

  const totals = await getUserBalanceTotals(prisma, "u1");

  assert.deepEqual(payoutFilter, {
    userId: "u1",
    confirmed: false
  });
  assert.equal(totals.pendingPayout, 300);
  assert.equal(totals.availableToWithdraw, 700);
});

test("top-up transaction rollback propagates error", async () => {
  let adminLogCalled = false;
  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1" })
    },
    financeReport: {
      aggregate: async ({ where }: { where: { status: string } }) => {
        if (where.status === "AGREED") return { _sum: { amount: 1000 } };
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
        throw new Error("TX_CREATE_FAIL");
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
        adminLog: prisma.adminLog
      })
  } as any;

  await assert.rejects(
    async () =>
      topUpUserBalanceByAdmin({
        prisma,
        adminId: "admin_1",
        userId: "u1",
        amount: 500
      }),
    /TX_CREATE_FAIL/
  );
  assert.equal(adminLogCalled, false);
});

test("finance view selects only legacy transaction columns", async () => {
  const now = new Date("2026-09-09T10:00:00.000Z");
  let transactionListArgs: any;
  const prisma = {
    financeReport: {
      count: async () => 1,
      findMany: async () => [
        {
          id: "report_1",
          userId: "u1",
          periodStart: now,
          periodEnd: now,
          amount: 100,
          currency: "RUB",
          status: "AGREED",
          createdAt: now,
          agreedAt: now
        }
      ]
    },
    payouts: {
      aggregate: async () => ({ _sum: { amount: 0 } })
    },
    transaction: {
      findMany: async (args: any) => {
        if (!args.select && args.where?.userId === "u1") {
          throw new Error("The column `transaction.payoutId` does not exist in the current database.");
        }
        if (args.select?.id) {
          transactionListArgs = args;
          return [
            {
              id: "tx_1",
              type: TransactionType.ROYALTY,
              status: TransactionStatus.COMPLETED,
              amount: 100,
              description: "Начисление",
              createdAt: now,
              processedAt: now
            }
          ];
        }
        return [];
      }
    }
  } as any;

  const view = await getUserFinanceView(prisma, "u1");

  assert.deepEqual(Object.keys(transactionListArgs.select), [
    "id",
    "type",
    "status",
    "amount",
    "description",
    "createdAt",
    "processedAt",
    "metadata"
  ]);
  assert.deepEqual(view.transactions.map((item) => item.id).sort(), ["report:report_1", "tx_1"]);
});
