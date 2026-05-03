import {
  FinanceReportStatus,
  TransactionStatus,
  TransactionType
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { FinanceReportClientItem } from "@/lib/finance-client";
import { getUserBalanceTotals } from "@/lib/finance-service";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";

export interface FinanceTransactionView {
  id: string;
  date: string;
  type: "Royalty" | "Payout" | "Fee";
  amount: number;
  status: "Completed" | "Pending" | "Failed";
  description: string;
}

export interface FinanceDashboardViewData {
  reports: FinanceReportClientItem[];
  transactions: FinanceTransactionView[];
  agreedBalance: number;
  pendingPayout: number;
  accruals: number;
  accrualSeries: Array<{ period: string; amount: number }>;
  deductionsAndCommission: number;
  pendingReportsCount: number;
  minimumPayoutAmount: number;
}

function toReportStatus(status: FinanceReportStatus): "agreed" | "ready_to_confirm" {
  return status === FinanceReportStatus.AGREED ? "agreed" : "ready_to_confirm";
}

function formatPeriod(start: Date, end: Date): string {
  const startMonth = start.toLocaleString("ru-RU", { month: "short" });
  const endMonth = end.toLocaleString("ru-RU", { month: "short" });
  const year = end.getUTCFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${year}`;
  }
  return `${startMonth}–${endMonth} ${year}`;
}

function toTransactionType(type: TransactionType): "Royalty" | "Payout" | "Fee" {
  if (type === TransactionType.ROYALTY) return "Royalty";
  if (type === TransactionType.PAYOUT) return "Payout";
  return "Fee";
}

function toTransactionStatus(
  status: TransactionStatus
): "Completed" | "Pending" | "Failed" {
  if (status === TransactionStatus.COMPLETED) return "Completed";
  if (status === TransactionStatus.FAILED) return "Failed";
  return "Pending";
}

function toDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function decimalToNumber(value: unknown): number {
  return Number(value ?? 0);
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildRecentMonthBuckets(months: number): Array<{
  key: string;
  period: string;
  start: Date;
}> {
  const now = new Date();
  const currentMonthUtcStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );

  return Array.from({ length: months }, (_, index) => {
    const shift = months - 1 - index;
    const start = new Date(
      Date.UTC(
        currentMonthUtcStart.getUTCFullYear(),
        currentMonthUtcStart.getUTCMonth() - shift,
        1
      )
    );
    const period = start
      .toLocaleString("ru-RU", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC"
      })
      .replace(".", "");
    return { key: monthKey(start), period, start };
  });
}

export function readMinimumPayoutAmount(): number {
  const fromEnv = Number(process.env.FINANCE_MIN_PAYOUT_AMOUNT ?? "100");
  return Number.isFinite(fromEnv) && fromEnv >= 0 ? fromEnv : 100;
}

export async function getFinanceDashboardViewData(
  userId: string
): Promise<FinanceDashboardViewData> {
  let reportsRaw;
  let transactionsRaw;
  let accrualTransactionsRaw;
  let totals;
  const monthBuckets = buildRecentMonthBuckets(6);
  const accrualWindowStart = monthBuckets[0]?.start ?? new Date();

  try {
    [reportsRaw, transactionsRaw, accrualTransactionsRaw, totals] =
      await Promise.all([
      prisma.financeReport.findMany({
        where: { userId },
        orderBy: { periodStart: "desc" }
      }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          type: TransactionType.ROYALTY,
          status: TransactionStatus.COMPLETED,
          OR: [
            { processedAt: { gte: accrualWindowStart } },
            {
              AND: [
                { processedAt: null },
                { createdAt: { gte: accrualWindowStart } }
              ]
            }
          ]
        },
        select: {
          amount: true,
          createdAt: true,
          processedAt: true
        }
      }),
      getUserBalanceTotals(prisma, userId)
    ]);
  } catch (error) {
    if (
      isPrismaTableMissingError(error, "FinanceReport") ||
      isPrismaTableMissingError(error, "Transaction") ||
      isPrismaTableMissingError(error, "PayoutRequest")
    ) {
      return {
        reports: [],
        transactions: [],
        agreedBalance: 0,
        pendingPayout: 0,
        accruals: 0,
        accrualSeries: monthBuckets.map((bucket) => ({
          period: bucket.period,
          amount: 0
        })),
        deductionsAndCommission: 0,
        pendingReportsCount: 0,
        minimumPayoutAmount: readMinimumPayoutAmount()
      };
    }
    throw error;
  }

  const reports: FinanceReportClientItem[] = reportsRaw.map((report) => ({
    id: report.id,
    period: formatPeriod(report.periodStart, report.periodEnd),
    amount: decimalToNumber(report.amount),
    status: toReportStatus(report.status)
  }));

  const agreedBalance = totals.agreedBalance;

  const pendingReportsCount = reports.filter(
    (report) => report.status === "ready_to_confirm"
  ).length;

  const transactions: FinanceTransactionView[] = transactionsRaw.map(
    (transaction) => ({
      id: transaction.id,
      date: toDate(transaction.processedAt ?? transaction.createdAt),
      type: toTransactionType(transaction.type),
      amount: decimalToNumber(transaction.amount),
      status: toTransactionStatus(transaction.status),
      description: transaction.description ?? ""
    })
  );

  const accruals = transactions
    .filter(
      (transaction) =>
        transaction.type === "Royalty" && transaction.status === "Completed"
    )
    .reduce((sum, transaction) => sum + Math.max(0, transaction.amount), 0);

  const accrualByMonth = new Map<string, number>();
  for (const transaction of accrualTransactionsRaw) {
    const date = transaction.processedAt ?? transaction.createdAt;
    const key = monthKey(date);
    const value = Math.max(0, decimalToNumber(transaction.amount));
    accrualByMonth.set(key, (accrualByMonth.get(key) ?? 0) + value);
  }

  const accrualSeries = monthBuckets.map((bucket) => ({
    period: bucket.period,
    amount: Number((accrualByMonth.get(bucket.key) ?? 0).toFixed(2))
  }));

  const deductionsAndCommission = transactions
    .filter((transaction) => transaction.type === "Fee")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

  return {
    reports,
    transactions,
    agreedBalance,
    pendingPayout: totals.pendingPayout,
    accruals,
    accrualSeries,
    deductionsAndCommission,
    pendingReportsCount,
    minimumPayoutAmount: readMinimumPayoutAmount()
  };
}
