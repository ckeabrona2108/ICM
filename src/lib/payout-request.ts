import type { PrismaClient } from "@prisma/client";

import { isPrismaColumnMissingError } from "@/lib/prisma-errors";
import type { PayoutPeriodShare } from "@/lib/payout-quarter";

export type PayoutRequestStatusValue = "REQUESTED" | "PROCESSING" | "PAID" | "REJECTED";

export type PayoutRequestSummary = {
  id: string;
  amount: number;
  status: PayoutRequestStatusValue;
  createdAt: string;
  quarter: number | null;
  year: number | null;
  /** Quarters of a request that covers several of them, with the part taken from each. */
  periods: PayoutPeriodShare[];
  rejectionReason: string | null;
  recipientName: string | null;
  bankName: string | null;
  accountDetails: string | null;
  bankBik: string | null;
  taxId: string | null;
  contractNumber: number | null;
  supportingDocument: { key: string; name: string } | null;
};

type PayoutSummaryRow = {
  id: unknown;
  amount?: unknown;
  status?: unknown;
  confirmed?: unknown;
  createdAt?: unknown;
  requisites?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function getPayoutPeriod(requisites: unknown): { quarter: number | null; year: number | null } {
  const value = asRecord(requisites);
  const quarter = Number(value.quarter);
  const year = Number(value.year);
  return {
    quarter: Number.isInteger(quarter) && quarter >= 1 && quarter <= 4 ? quarter : null,
    year: Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : null
  };
}

/**
 * Quarters the payout takes its money from. A multi-quarter request stores them in `periods`;
 * an older one names a single quarter, which then carries the whole amount.
 */
export function getPayoutPeriods(requisites: unknown, amount: unknown): PayoutPeriodShare[] {
  const value = asRecord(requisites);
  if (Array.isArray(value.periods)) {
    const shares = value.periods.flatMap((item) => {
      const share = asRecord(item);
      const period = getPayoutPeriod(share);
      const shareAmount = Number(share.amount);
      if (!period.quarter || !period.year || !Number.isFinite(shareAmount)) return [];
      const reportId = String(share.reportId ?? "").trim() || null;
      return [{ quarter: period.quarter, year: period.year, amount: shareAmount, reportId }];
    });
    if (shares.length) return shares;
  }
  const period = getPayoutPeriod(value);
  if (!period.quarter || !period.year) return [];
  const reportId = String(value.reportId ?? "").trim() || null;
  return [{ quarter: period.quarter, year: period.year, amount: Math.abs(Number(amount ?? 0)) || 0, reportId }];
}

export function getPayoutRejectionReason(requisites: unknown): string | null {
  const value = String(asRecord(requisites).rejectionReason ?? "").trim();
  return value || null;
}

function getPayoutDetails(requisites: unknown) {
  const value = asRecord(requisites);
  const document = asRecord(value.supportingDocument);
  const documentKey = String(document?.key ?? "").trim();
  const documentName = String(document?.name ?? "").trim();
  const getText = (key: string) => String(value[key] ?? "").trim() || null;
  const contractNumber = Number(value.contractNumber);
  return {
    recipientName: getText("recipientName") ?? getText("recieverName"),
    bankName: getText("bankName"),
    accountDetails: getText("accountDetails") ?? getText("accountNumber"),
    bankBik: getText("bankBik"),
    taxId: getText("taxId"),
    contractNumber: Number.isInteger(contractNumber) && contractNumber > 0 ? contractNumber : null,
    supportingDocument: documentKey && documentName ? { key: documentKey, name: documentName } : null
  };
}

export function isActivePayoutStatus(status: unknown): boolean {
  return status === "REQUESTED" || status === "PROCESSING";
}

export function mapPayoutSummary(row: PayoutSummaryRow): PayoutRequestSummary {
  const period = getPayoutPeriod(row.requisites);
  const status = typeof row.status === "string" ? row.status : "";
  const createdAt = row.createdAt instanceof Date
    ? row.createdAt
    : typeof row.createdAt === "string" || typeof row.createdAt === "number"
      ? new Date(row.createdAt)
      : new Date();
  return {
    id: String(row.id),
    amount: Number(row.amount ?? 0),
    status: ["REQUESTED", "PROCESSING", "PAID", "REJECTED"].includes(status)
      ? status as PayoutRequestStatusValue
      : row.confirmed === true ? "PAID" : "REQUESTED",
    createdAt: createdAt.toISOString(),
    ...period,
    periods: getPayoutPeriods(row.requisites, row.amount),
    rejectionReason: getPayoutRejectionReason(row.requisites),
    ...getPayoutDetails(row.requisites)
  };
}

export async function listUserPayoutRequests(prisma: PrismaClient, userId: string): Promise<PayoutRequestSummary[]> {
  try {
    const rows = await prisma.payouts.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, amount: true, status: true, confirmed: true, createdAt: true, requisites: true }
    });
    return rows.map(mapPayoutSummary);
  } catch (error) {
    // Keep the finance screen readable while a legacy database awaits the payout-ledger migration.
    if (!isPrismaColumnMissingError(error, "payouts.status") && !isPrismaColumnMissingError(error, "payouts.requisites")) {
      throw error;
    }
    const legacyRows = await prisma.payouts.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, amount: true, confirmed: true, createdAt: true }
    });
    return legacyRows.map(mapPayoutSummary);
  }
}

const PAYOUT_STATUSES_HOLDING_REPORT_MONEY = new Set(["REQUESTED", "PROCESSING", "PAID"]);

export type ReportPayoutConflict = { id: string; userId: string; status: string; amount: number };

/**
 * Payout requests (open or paid) that rely on the money of the given reports: they name one of
 * the reports or ask for the same quarter. Such reports must not be rolled back, deleted or
 * reduced, or the artist ends up paid more than their balance with nothing showing it.
 */
export async function findReportPayoutConflicts(
  db: { payouts: Pick<PrismaClient["payouts"], "findMany"> },
  params: { userIds: string[]; reportIds: string[]; quarter: number | null; year: number | null }
): Promise<ReportPayoutConflict[]> {
  const userIds = Array.from(new Set(params.userIds.filter(Boolean)));
  if (!userIds.length) return [];
  const reportIds = new Set(params.reportIds.filter(Boolean));
  const rows = await db.payouts.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, userId: true, status: true, confirmed: true, amount: true, requisites: true }
  });
  return rows
    .filter((row) => {
      if (!PAYOUT_STATUSES_HOLDING_REPORT_MONEY.has(String(row.status)) && row.confirmed !== true) return false;
      const shares = getPayoutPeriods(row.requisites, row.amount);
      const reportId = String(asRecord(row.requisites).reportId ?? "").trim();
      if (reportId && reportIds.has(reportId)) return true;
      if (shares.some((share) => share.reportId && reportIds.has(share.reportId))) return true;
      return params.quarter !== null && params.year !== null &&
        shares.some((share) => share.quarter === params.quarter && share.year === params.year);
    })
    .map((row) => ({ id: row.id, userId: row.userId, status: String(row.status), amount: Number(row.amount ?? 0) }));
}

export function describeReportPayoutConflicts(conflicts: ReportPayoutConflict[]): string {
  const paid = conflicts.filter((item) => item.status === "PAID").length;
  const open = conflicts.length - paid;
  const parts = [paid ? `проведённых выплат: ${paid}` : "", open ? `открытых заявок на выплату: ${open}` : ""].filter(Boolean);
  return `По этим отчётам есть ${parts.join(", ")}. Сначала отклоните открытые заявки; если выплата уже проведена, исправьте сумму корректировкой баланса, а не откатом.`;
}
