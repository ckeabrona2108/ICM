import type { PrismaClient } from "@prisma/client";

import { isPrismaColumnMissingError } from "@/lib/prisma-errors";

export type PayoutRequestStatusValue = "REQUESTED" | "PROCESSING" | "PAID" | "REJECTED";

export type PayoutRequestSummary = {
  id: string;
  amount: number;
  status: PayoutRequestStatusValue;
  createdAt: string;
  quarter: number | null;
  year: number | null;
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
    ...period
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
