// @ts-nocheck
import {
  Prisma,
  type PrismaClient
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { createAdminLog } from "@/lib/admin-log-service";
import { isAnyPrismaTableMissingError, isPrismaTableMissingError } from "@/lib/prisma-errors";

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function monthRange(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
  return { start, end };
}

export interface UserFinanceView {
  agreedBalance: number;
  pendingBalance: number;
  pendingPayout: number;
  agreedReportsBalance: number;
  settlementDelta: number;
  availableToWithdraw: number;
  reportsCount: number;
  transactions: Array<{
    id: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: number;
    currency: string;
    description: string | null;
    createdAt: string;
    processedAt: string | null;
  }>;
}

type SettlementTransactionEntry = {
  type: string;
  amount: Prisma.Decimal | number;
};

const REPORT_STATUS_AGREED = "AGREED";
const REPORT_STATUS_READY_TO_CONFIRM = "READY_TO_CONFIRM";
const PAYOUT_STATUS_REQUESTED = "REQUESTED";
const PAYOUT_STATUS_PROCESSING = "PROCESSING";
const TX_STATUS_COMPLETED = "COMPLETED";
const TX_TYPE_ROYALTY = "ROYALTY";
const TX_TYPE_PAYOUT = "PAYOUT";
const TX_TYPE_REFUND = "REFUND";
const TX_TYPE_FEE = "FEE";
const FINANCE_TABLE_FALLBACKS = ["FinanceReport", "financeReport", "Transaction", "transaction", "PayoutRequest", "payoutRequest", "payouts"];

function getRepo<T = unknown>(prisma: PrismaClient, key: string): T | null {
  const repo = (prisma as unknown as Record<string, unknown>)[key];
  return repo ? (repo as T) : null;
}

async function writeBalanceAdminLogIfAvailable(
  prisma: PrismaClient | Prisma.TransactionClient,
  params: {
    userId: string;
    adminId: string;
    type: "CREDIT" | "DEBIT";
    amount: number;
    oldBalance: number;
    newBalance: number;
    comment: string | null;
  }
) {
  const repo = (prisma as unknown as {
    balance_admin_logs?: {
      create?: (args: {
        data: {
          id: string;
          user_id: string;
          admin_id: string;
          type: "CREDIT" | "DEBIT";
          amount: Prisma.Decimal;
          old_balance: Prisma.Decimal;
          new_balance: Prisma.Decimal;
          comment: string | null;
        };
      }) => Promise<unknown>;
    };
  }).balance_admin_logs;

  if (typeof repo?.create !== "function") {
    return;
  }

  try {
    await repo.create({
      data: {
        id: randomUUID(),
        user_id: params.userId,
        admin_id: params.adminId,
        type: params.type,
        amount: new Prisma.Decimal(params.amount),
        old_balance: new Prisma.Decimal(params.oldBalance),
        new_balance: new Prisma.Decimal(params.newBalance),
        comment: params.comment
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (
      message.includes("balance_admin_logs") ||
      message.includes("does not exist") ||
      message.includes("unknown")
    ) {
      return;
    }
    throw error;
  }
}

export function computeSettlementDelta(entries: SettlementTransactionEntry[]): number {
  return entries.reduce((sum, entry) => {
    const amount = Math.abs(toNumber(entry.amount));
    if (entry.type === TX_TYPE_REFUND) {
      return sum + amount;
    }
    if (entry.type === TX_TYPE_PAYOUT || entry.type === TX_TYPE_FEE) {
      return sum - amount;
    }
    return sum;
  }, 0);
}

export interface UserBalanceTotals {
  agreedReportsBalance: number;
  settlementDelta: number;
  agreedBalance: number;
  pendingBalance: number;
  pendingPayout: number;
  availableToWithdraw: number;
}

export async function getUserBalanceTotals(
  prisma: PrismaClient,
  userId: string
): Promise<UserBalanceTotals> {
  const financeReportRepo = getRepo<
    { aggregate: (args: unknown) => Promise<{ _sum: { amount: Prisma.Decimal | number | null } }> }
  >(prisma, "financeReport");
  const payoutRequestRepo = getRepo<
    { aggregate: (args: unknown) => Promise<{ _sum: { amount: Prisma.Decimal | number | null } }> }
  >(prisma, "payoutRequest");
  const payoutsRepo = getRepo<
    { aggregate: (args: unknown) => Promise<{ _sum: { amount: Prisma.Decimal | number | null } }> }
  >(prisma, "payouts");
  const transactionRepo = getRepo<
    { findMany: (args: unknown) => Promise<Array<{ type: string; amount: Prisma.Decimal | number }>> }
  >(prisma, "transaction");

  let agreedReportsRaw;
  let pendingReportsRaw;
  let pendingPayoutRaw;
  let settlementRows;

  try {
    [agreedReportsRaw, pendingReportsRaw, pendingPayoutRaw, settlementRows] = await Promise.all([
      financeReportRepo
        ? financeReportRepo.aggregate({
            where: { userId, status: REPORT_STATUS_AGREED },
            _sum: { amount: true }
          })
        : Promise.resolve({ _sum: { amount: 0 } }),
      financeReportRepo
        ? financeReportRepo.aggregate({
            where: { userId, status: REPORT_STATUS_READY_TO_CONFIRM },
            _sum: { amount: true }
          })
        : Promise.resolve({ _sum: { amount: 0 } }),
      payoutRequestRepo
        ? payoutRequestRepo.aggregate({
            where: {
              userId,
              status: {
                in: [PAYOUT_STATUS_REQUESTED, PAYOUT_STATUS_PROCESSING]
              }
            },
            _sum: { amount: true }
          })
        : payoutsRepo
          ? payoutsRepo.aggregate({
              where: {
                userId,
                confirmed: false
              },
              _sum: { amount: true }
            })
          : Promise.resolve({ _sum: { amount: 0 } }),
      transactionRepo
        ? transactionRepo.findMany({
            where: {
              userId,
              status: TX_STATUS_COMPLETED,
              type: {
                in: [TX_TYPE_PAYOUT, TX_TYPE_REFUND, TX_TYPE_FEE]
              }
            },
            select: {
              type: true,
              amount: true
            }
          })
        : Promise.resolve([])
    ]);
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, FINANCE_TABLE_FALLBACKS)) {
      return {
        agreedReportsBalance: 0,
        settlementDelta: 0,
        agreedBalance: 0,
        pendingBalance: 0,
        pendingPayout: 0,
        availableToWithdraw: 0
      };
    }
    throw error;
  }

  const agreedReportsBalance = toNumber(agreedReportsRaw._sum.amount);
  const pendingBalance = toNumber(pendingReportsRaw._sum.amount);
  const pendingPayout = toNumber(pendingPayoutRaw._sum.amount);
  const settlementDelta = computeSettlementDelta(settlementRows as SettlementTransactionEntry[]);
  const agreedBalance = agreedReportsBalance + settlementDelta;
  const availableToWithdraw = Math.max(0, agreedBalance - pendingPayout);

  return {
    agreedReportsBalance,
    settlementDelta,
    agreedBalance,
    pendingBalance,
    pendingPayout,
    availableToWithdraw
  };
}

export async function getUserFinanceView(
  prisma: PrismaClient,
  userId: string
): Promise<UserFinanceView> {
  const financeReportRepo = getRepo<{ count: (args: unknown) => Promise<number> }>(prisma, "financeReport");
  const transactionRepo = getRepo<
    {
      findMany: (
        args: unknown
      ) => Promise<Array<{
        id: string;
        type: string;
        status: string;
        amount: Prisma.Decimal | number;
        currency: string;
        description: string | null;
        createdAt: Date;
        processedAt: Date | null;
      }>>;
    }
  >(prisma, "transaction");

  let totals;
  let reportsCount;
  let transactions;

  try {
    [totals, reportsCount, transactions] = await Promise.all([
      getUserBalanceTotals(prisma, userId),
      financeReportRepo ? financeReportRepo.count({ where: { userId } }) : Promise.resolve(0),
      transactionRepo
        ? transactionRepo.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 100
          })
        : Promise.resolve([])
    ]);
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, FINANCE_TABLE_FALLBACKS)) {
      totals = {
        agreedReportsBalance: 0,
        settlementDelta: 0,
        agreedBalance: 0,
        pendingBalance: 0,
        pendingPayout: 0,
        availableToWithdraw: 0
      };
      reportsCount = 0;
      transactions = [];
    } else {
      throw error;
    }
  }

  return {
    agreedBalance: totals.agreedBalance,
    pendingBalance: totals.pendingBalance,
    pendingPayout: totals.pendingPayout,
    agreedReportsBalance: totals.agreedReportsBalance,
    settlementDelta: totals.settlementDelta,
    availableToWithdraw: totals.availableToWithdraw,
    reportsCount,
    transactions: transactions.map((item) => ({
      id: item.id,
      type: item.type as any,
      status: item.status as any,
      amount: toNumber(item.amount),
      currency: item.currency,
      description: item.description,
      createdAt: item.createdAt.toISOString(),
      processedAt: item.processedAt?.toISOString() ?? null
    }))
  };
}

export async function topUpUserBalanceByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  userId: string;
  amount: number;
  comment?: string;
}) {
  const user = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, balance: true }
  });
  if (!user) return { ok: false as const, error: "User not found" };

  const financeReportRepo = getRepo(params.prisma, "financeReport");
  const transactionRepo = getRepo(params.prisma, "transaction");
  const oldValue = Number(user.balance ?? 0);
  const newValue = oldValue + params.amount;

  if (!financeReportRepo || !transactionRepo) {
    await params.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id: params.userId },
        data: {
          balance: newValue
        }
      });

      await writeBalanceAdminLogIfAvailable(tx, {
        userId: params.userId,
        adminId: params.adminId,
        type: "CREDIT",
        amount: params.amount,
        oldBalance: oldValue,
        newBalance: newValue,
        comment: params.comment?.trim() || "Пополнение баланса администратором"
      });

      await createAdminLog(tx, {
        adminId: params.adminId,
        action: "USER_BALANCE_TOPUP",
        targetType: "User",
        targetId: params.userId,
        oldValue: { agreedBalance: oldValue },
        newValue: { agreedBalance: newValue, amountDelta: params.amount },
        comment: params.comment
      });
    });

    return { ok: true as const };
  }

  const amountDecimal = new Prisma.Decimal(params.amount);
  const now = new Date();
  const { start, end } = monthRange(now);

  const oldTotals = await getUserBalanceTotals(params.prisma, params.userId);
  const financeOldValue = oldTotals.agreedBalance;
  const financeNewValue = financeOldValue + params.amount;

  await params.prisma.$transaction(async (tx) => {
    const report = await tx.financeReport.create({
      data: {
        id: randomUUID(),
        userId: params.userId,
        periodStart: start,
        periodEnd: end,
        amount: amountDecimal,
        status: REPORT_STATUS_AGREED,
        agreedAt: now,
        updatedAt: now
      }
    });
    try {
      await tx.transaction.create({
        data: {
          id: randomUUID(),
          userId: params.userId,
          amount: amountDecimal,
          currency: "RUB",
          type: TX_TYPE_ROYALTY,
          status: TX_STATUS_COMPLETED,
          description: params.comment?.trim() || "Пополнение баланса администратором",
          reference: report.id,
          processedAt: now
        }
      });
    } catch (error) {
      if (!isPrismaTableMissingError(error, "transaction")) {
        throw error;
      }
    }
    await createAdminLog(tx, {
      adminId: params.adminId,
      action: "USER_BALANCE_TOPUP",
      targetType: "User",
      targetId: params.userId,
      oldValue: { agreedBalance: financeOldValue },
      newValue: { agreedBalance: financeNewValue, amountDelta: params.amount },
      comment: params.comment
    });
  });

  return { ok: true as const };
}

export async function adjustUserBalanceByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  userId: string;
  type: "credit" | "debit";
  amount: number;
  comment?: string;
}) {
  const user = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, balance: true }
  });
  if (!user) return { ok: false as const, error: "User not found" };

  const normalizedComment = params.comment?.trim() || null;
  if (!normalizedComment) {
    return { ok: false as const, error: "Комментарий администратора обязателен." };
  }

  const transactionRepo = getRepo(params.prisma, "transaction");
  const financeReportRepo = getRepo(params.prisma, "financeReport");
  const oldValue = Number(user.balance ?? 0);
  const delta = params.type === "credit" ? params.amount : -params.amount;
  const newValue = oldValue + delta;

  if (params.type === "debit" && newValue < 0) {
    return { ok: false as const, error: "Недостаточно средств для списания" };
  }

  if (!transactionRepo || (params.type === "credit" && !financeReportRepo)) {
    await params.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id: params.userId },
        data: {
          balance: newValue
        }
      });

      await writeBalanceAdminLogIfAvailable(tx, {
        userId: params.userId,
        adminId: params.adminId,
        type: params.type === "credit" ? "CREDIT" : "DEBIT",
        amount: params.amount,
        oldBalance: oldValue,
        newBalance: newValue,
        comment: normalizedComment
      });

      await createAdminLog(tx, {
        adminId: params.adminId,
        action: params.type === "credit" ? "USER_BALANCE_CREDIT" : "USER_BALANCE_DEBIT",
        targetType: "User",
        targetId: params.userId,
        oldValue: { agreedBalance: oldValue },
        newValue: { agreedBalance: newValue, amountDelta: delta },
        comment: normalizedComment
      });
    });

    return { ok: true as const };
  }

  const amountDecimal = new Prisma.Decimal(params.amount);
  const now = new Date();
  const { start, end } = monthRange(now);

  await params.prisma.$transaction(async (tx) => {
    if (params.type === "credit") {
      const report = await tx.financeReport.create({
        data: {
          id: randomUUID(),
          userId: params.userId,
          periodStart: start,
          periodEnd: end,
          amount: amountDecimal,
          status: REPORT_STATUS_AGREED,
          agreedAt: now,
          updatedAt: now
        }
      });
      try {
        await tx.transaction.create({
          data: {
            id: randomUUID(),
            userId: params.userId,
            amount: amountDecimal,
            currency: "RUB",
            type: TX_TYPE_ROYALTY,
            status: TX_STATUS_COMPLETED,
            description: normalizedComment,
            reference: report.id,
            processedAt: now
          }
        });
      } catch (error) {
        if (!isPrismaTableMissingError(error, "transaction")) {
          throw error;
        }
      }
    } else {
      try {
        await tx.transaction.create({
          data: {
            id: randomUUID(),
            userId: params.userId,
            amount: amountDecimal,
            currency: "RUB",
            type: TX_TYPE_FEE,
            status: TX_STATUS_COMPLETED,
            description: normalizedComment,
            reference: `admin-debit:${params.adminId}`,
            processedAt: now
          }
        });
      } catch (error) {
        if (!isPrismaTableMissingError(error, "transaction")) {
          throw error;
        }
      }
    }

    await writeBalanceAdminLogIfAvailable(tx, {
      userId: params.userId,
      adminId: params.adminId,
      type: params.type === "credit" ? "CREDIT" : "DEBIT",
      amount: params.amount,
      oldBalance: oldValue,
      newBalance: newValue,
      comment: normalizedComment
    });

    await createAdminLog(tx, {
      adminId: params.adminId,
      action:
        params.type === "credit"
          ? "USER_BALANCE_CREDIT"
          : "USER_BALANCE_DEBIT",
      targetType: "User",
      targetId: params.userId,
      oldValue: { agreedBalance: oldValue },
      newValue: { agreedBalance: newValue, amountDelta: delta },
      comment: normalizedComment
    });
  });

  return { ok: true as const };
}
