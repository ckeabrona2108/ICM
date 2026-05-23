// @ts-nocheck
import { FinanceReportStatus, Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { createAdminLog } from "@/lib/admin-log-service";

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

export interface UserReportItem {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: FinanceReportStatus;
  currency: string;
  createdAt: string;
  agreedAt: string | null;
}

export async function listUserReports(prisma: PrismaClient, userId: string): Promise<UserReportItem[]> {
  const reports = await prisma.financeReport.findMany({
    where: { userId },
    orderBy: { periodStart: "desc" },
    take: 200
  });

  return reports.map((report) => ({
    id: report.id,
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    amount: toNumber(report.amount),
    status: report.status,
    currency: report.currency,
    createdAt: report.createdAt.toISOString(),
    agreedAt: report.agreedAt?.toISOString() ?? null
  }));
}

export async function createUserReportByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  status: FinanceReportStatus;
  comment?: string;
}) {
  const user = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true }
  });
  if (!user) return { ok: false as const, error: "User not found" };
  if (params.periodEnd < params.periodStart) {
    return { ok: false as const, error: "Дата окончания не может быть раньше даты начала." };
  }

  const report = await params.prisma.$transaction(async (tx) => {
    const created = await tx.financeReport.create({
      data: {
        id: randomUUID(),
        userId: params.userId,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        amount: new Prisma.Decimal(params.amount),
        status: params.status,
        agreedAt: params.status === FinanceReportStatus.AGREED ? new Date() : null,
        updatedAt: new Date()
      }
    });
    await createAdminLog(tx, {
      adminId: params.adminId,
      action: "USER_FINANCE_REPORT_CREATED",
      targetType: "FinanceReport",
      targetId: created.id,
      newValue: {
        userId: params.userId,
        periodStart: params.periodStart.toISOString(),
        periodEnd: params.periodEnd.toISOString(),
        amount: params.amount,
        status: params.status
      },
      comment: params.comment
    });
    return created;
  });

  return { ok: true as const, reportId: report.id };
}
