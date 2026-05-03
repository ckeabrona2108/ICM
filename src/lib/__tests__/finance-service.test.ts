/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import { TransactionStatus, TransactionType } from "@prisma/client";

import { getUserBalanceTotals, topUpUserBalanceByAdmin } from "@/lib/finance-service";

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
