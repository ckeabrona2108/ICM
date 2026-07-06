// @ts-nocheck
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
  releaseTitle: string | null;
  trackTitle: string | null;
  platformName: string | null;
  sourceReference: string | null;
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

function getRepo<T = Record<string, unknown>>(client: unknown, name: string): T | null {
  const repo = (client as Record<string, unknown>)[name];
  if (!repo || typeof repo !== "object") return null;
  return repo as T;
}

function toReportStatus(status: string): "agreed" | "ready_to_confirm" {
  return String(status).toLowerCase() === "agreed" ? "agreed" : "ready_to_confirm";
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

function toTransactionType(type: string): "Royalty" | "Payout" | "Fee" {
  const normalized = String(type).toLowerCase();
  if (normalized === "royalty") return "Royalty";
  if (normalized === "payout") return "Payout";
  return "Fee";
}

function toTransactionStatus(
  status: string
): "Completed" | "Pending" | "Failed" {
  const normalized = String(status).toLowerCase();
  if (normalized === "completed") return "Completed";
  if (normalized === "failed") return "Failed";
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
  let balanceTransactionsRaw;
  let accrualTransactionsRaw;
  let accrualTotalRaw;
  let commissionTotalRaw;
  let totals;
  const financeReportRepo = getRepo<{
    findMany: (args: unknown) => Promise<unknown[]>;
  }>(prisma, "financeReport");
  const balanceTransactionsRepo = getRepo<{
    findMany: (args: unknown) => Promise<unknown[]>;
    aggregate?: (args: unknown) => Promise<{
      _sum: { amount?: number | null };
    }>;
  }>(prisma, "balance_transactions");
  const royaltyTransactionsRepo = getRepo<{
    aggregate?: (args: unknown) => Promise<{
      _sum: { platform_commission_amount?: number | null };
    }>;
  }>(prisma, "royalty_transactions");
  const monthBuckets = buildRecentMonthBuckets(6);
  const accrualWindowStart = monthBuckets[0]?.start ?? new Date();

  try {
    [reportsRaw, balanceTransactionsRaw, accrualTransactionsRaw, accrualTotalRaw, commissionTotalRaw, totals] =
      await Promise.all([
        financeReportRepo
          ? financeReportRepo.findMany({
              where: { userId },
              orderBy: { periodStart: "desc" }
            })
          : Promise.resolve([]),
        balanceTransactionsRepo
          ? balanceTransactionsRepo.findMany({
              where: { user_id: userId },
              orderBy: { created_at: "desc" },
              take: 20
              ,
              include: {
                royalty_transaction: {
                  select: {
                    id: true,
                    gross_amount: true,
                    platform_commission_amount: true,
                    net_amount: true,
                    currency: true,
                    platform_name: true,
                    source_reference: true,
                    release: {
                      select: {
                        title: true,
                        upc: true
                      }
                    },
                    track: {
                      select: {
                        title: true
                      }
                    }
                  }
                }
              }
            })
          : Promise.resolve([]),
        balanceTransactionsRepo
          ? balanceTransactionsRepo.findMany({
              where: {
                user_id: userId,
                direction: "CREDIT",
                royalty_transaction_id: { not: null },
                created_at: { gte: accrualWindowStart }
              },
              select: {
                amount: true,
                created_at: true
              }
            })
          : Promise.resolve([]),
        balanceTransactionsRepo && typeof balanceTransactionsRepo.aggregate === "function"
          ? balanceTransactionsRepo.aggregate({
              where: {
                user_id: userId,
                direction: "CREDIT",
                royalty_transaction_id: { not: null }
              },
              _sum: { amount: true }
            })
          : Promise.resolve({ _sum: { amount: 0 } }),
        royaltyTransactionsRepo && typeof royaltyTransactionsRepo.aggregate === "function"
          ? royaltyTransactionsRepo.aggregate({
              where: {
                user_id: userId,
                reversed_at: null
              },
              _sum: { platform_commission_amount: true }
            })
          : Promise.resolve({ _sum: { platform_commission_amount: 0 } }),
        getUserBalanceTotals(prisma, userId)
      ]);
  } catch (error) {
    if (
      isPrismaTableMissingError(error, "FinanceReport") ||
      isPrismaTableMissingError(error, "balance_transactions") ||
      isPrismaTableMissingError(error, "royalty_transactions") ||
      isPrismaTableMissingError(error, "PayoutRequest") ||
      isPrismaTableMissingError(error, "payouts")
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

  const transactions: FinanceTransactionView[] = balanceTransactionsRaw.map((transaction) => {
    const amount = decimalToNumber(transaction.amount);
    const royalty = transaction.royalty_transaction;
    const loweredDescription = String(transaction.description ?? "").toLowerCase();
    const type =
      royalty
        ? "Royalty"
        : transaction.direction === "DEBIT" &&
            (loweredDescription.includes("payout") ||
              loweredDescription.includes("withdraw") ||
              loweredDescription.includes("выплат"))
          ? "Payout"
          : transaction.direction === "DEBIT"
            ? "Fee"
            : "Royalty";

    const status =
      transaction.direction === "DEBIT" &&
      (loweredDescription.includes("pending") ||
        loweredDescription.includes("processing") ||
        loweredDescription.includes("ожидан"))
        ? "Pending"
        : "Completed";

    const releaseTitle = royalty?.release?.title?.trim();
    const trackTitle = royalty?.track?.title?.trim();
    const platformName = royalty?.platform_name?.trim();
    const sourceReference = royalty?.source_reference?.trim();
    const trackLabel = trackTitle
      ? releaseTitle && releaseTitle !== trackTitle
        ? `${releaseTitle} / ${trackTitle}`
        : trackTitle
      : releaseTitle;
    const descriptionParts = [
      trackLabel,
      platformName,
      sourceReference && !String(sourceReference).startsWith("Royalty import") ? sourceReference : null
    ].filter(Boolean);

    return {
      id: transaction.id,
      date: toDate(transaction.created_at),
      type,
      amount,
      status,
      releaseTitle,
      trackTitle,
      platformName,
      sourceReference: sourceReference ?? null,
      description:
        descriptionParts.length > 0
          ? descriptionParts.join(" • ")
          : transaction.description ?? ""
    };
  });

  const accruals = Number(decimalToNumber(accrualTotalRaw?._sum?.amount).toFixed(2));

  const accrualByMonth = new Map<string, number>();
  for (const transaction of accrualTransactionsRaw) {
    const date = transaction.created_at;
    const key = monthKey(date);
    const value = Math.max(0, decimalToNumber(transaction.amount));
    accrualByMonth.set(key, (accrualByMonth.get(key) ?? 0) + value);
  }

  const accrualSeries = monthBuckets.map((bucket) => ({
    period: bucket.period,
    amount: Number((accrualByMonth.get(bucket.key) ?? 0).toFixed(2))
  }));

  const deductionsAndCommission = Number(
    decimalToNumber(commissionTotalRaw?._sum?.platform_commission_amount).toFixed(2)
  );

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
