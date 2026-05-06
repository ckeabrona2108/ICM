import {
  BalanceAdminAdjustmentType,
  FinanceReportStatus,
  PayoutRequestStatus,
  Prisma,
  TransactionStatus,
  TransactionType,
  type PrismaClient
} from "@prisma/client";

import { createAdminLog } from "@/lib/admin-log-service";

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
  type: TransactionType;
  amount: Prisma.Decimal | number;
};

export function computeSettlementDelta(entries: SettlementTransactionEntry[]): number {
  return entries.reduce((sum, entry) => {
    const amount = Math.abs(toNumber(entry.amount));
    if (entry.type === TransactionType.REFUND) {
      return sum + amount;
    }
    if (entry.type === TransactionType.PAYOUT || entry.type === TransactionType.FEE) {
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
  const [agreedReportsRaw, pendingReportsRaw, pendingPayoutRaw, settlementRows] = await Promise.all([
    prisma.financeReport.aggregate({
      where: { userId, status: FinanceReportStatus.AGREED },
      _sum: { amount: true }
    }),
    prisma.financeReport.aggregate({
      where: { userId, status: FinanceReportStatus.READY_TO_CONFIRM },
      _sum: { amount: true }
    }),
    prisma.payoutRequest.aggregate({
      where: {
        userId,
        status: {
          in: [PayoutRequestStatus.REQUESTED, PayoutRequestStatus.PROCESSING]
        }
      },
      _sum: { amount: true }
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        status: TransactionStatus.COMPLETED,
        type: {
          in: [TransactionType.PAYOUT, TransactionType.REFUND, TransactionType.FEE]
        }
      },
      select: {
        type: true,
        amount: true
      }
    })
  ]);

  const agreedReportsBalance = toNumber(agreedReportsRaw._sum.amount);
  const pendingBalance = toNumber(pendingReportsRaw._sum.amount);
  const pendingPayout = toNumber(pendingPayoutRaw._sum.amount);
  const settlementDelta = computeSettlementDelta(settlementRows);
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
  const [totals, reportsCount, transactions] = await Promise.all([
    getUserBalanceTotals(prisma, userId),
    prisma.financeReport.count({
      where: { userId }
    }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

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
      type: item.type,
      status: item.status,
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
    select: { id: true }
  });
  if (!user) return { ok: false as const, error: "User not found" };

  const amountDecimal = new Prisma.Decimal(params.amount);
  const now = new Date();
  const { start, end } = monthRange(now);

  const oldTotals = await getUserBalanceTotals(params.prisma, params.userId);
  const oldValue = oldTotals.agreedBalance;
  const newValue = oldValue + params.amount;

  await params.prisma.$transaction(async (tx) => {
    const report = await tx.financeReport.create({
      data: {
        userId: params.userId,
        periodStart: start,
        periodEnd: end,
        amount: amountDecimal,
        status: FinanceReportStatus.AGREED,
        agreedAt: now
      }
    });
    await tx.transaction.create({
      data: {
        userId: params.userId,
        amount: amountDecimal,
        currency: "RUB",
        type: TransactionType.ROYALTY,
        status: TransactionStatus.COMPLETED,
        description: params.comment?.trim() || "Пополнение баланса администратором",
        reference: report.id,
        processedAt: now
      }
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
    select: { id: true }
  });
  if (!user) return { ok: false as const, error: "User not found" };

  const normalizedComment = params.comment?.trim() || null;
  if (!normalizedComment) {
    return { ok: false as const, error: "Комментарий администратора обязателен." };
  }

  const oldTotals = await getUserBalanceTotals(params.prisma, params.userId);
  const oldValue = oldTotals.agreedBalance;
  const delta = params.type === "credit" ? params.amount : -params.amount;
  const newValue = oldValue + delta;

  if (params.type === "debit" && newValue < 0) {
    return { ok: false as const, error: "Недостаточно средств для списания" };
  }

  const amountDecimal = new Prisma.Decimal(params.amount);
  const now = new Date();
  const { start, end } = monthRange(now);

  await params.prisma.$transaction(async (tx) => {
    if (params.type === "credit") {
      const report = await tx.financeReport.create({
        data: {
          userId: params.userId,
          periodStart: start,
          periodEnd: end,
          amount: amountDecimal,
          status: FinanceReportStatus.AGREED,
          agreedAt: now
        }
      });
      await tx.transaction.create({
        data: {
          userId: params.userId,
          amount: amountDecimal,
          currency: "RUB",
          type: TransactionType.ROYALTY,
          status: TransactionStatus.COMPLETED,
          description: normalizedComment,
          reference: report.id,
          processedAt: now
        }
      });
    } else {
      await tx.transaction.create({
        data: {
          userId: params.userId,
          amount: amountDecimal,
          currency: "RUB",
          type: TransactionType.FEE,
          status: TransactionStatus.COMPLETED,
          description: normalizedComment,
          reference: `admin-debit:${params.adminId}`,
          processedAt: now
        }
      });
    }

    await tx.balanceAdminLog.create({
      data: {
        userId: params.userId,
        adminId: params.adminId,
        type:
          params.type === "credit"
            ? BalanceAdminAdjustmentType.CREDIT
            : BalanceAdminAdjustmentType.DEBIT,
        amount: amountDecimal,
        oldBalance: new Prisma.Decimal(oldValue),
        newBalance: new Prisma.Decimal(newValue),
        comment: normalizedComment
      }
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
