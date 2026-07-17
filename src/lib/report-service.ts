// @ts-nocheck
import { FinanceReportStatus, Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { createAdminLog } from "@/lib/admin-log-service";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";
import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import { formatRubCurrency } from "@/lib/currency-format";

export const REPORT_PAYLOAD_DESCRIPTION = "Finance report payload";
export const REPORT_PAYLOAD_KIND = "finance_report_payload";

function reportPeriodLabel(quarter?: number | null, year?: number | null): string {
  if (quarter && year) return `${quarter} квартал ${year}`;
  if (year) return `${year} год`;
  return "Новый период";
}

async function notifyUserReportReady(params: {
  prisma: PrismaClient;
  userId: string;
  reportId: string;
  amount: number;
  quarter?: number | null;
  year?: number | null;
  resetReadState?: boolean;
}) {
  await deliverUserNotificationSafely(params.prisma, {
    id: `report-ready-${params.reportId}`,
    userId: params.userId,
    kind: "report_ready",
    title: "Новый финансовый отчёт",
    message: `${reportPeriodLabel(params.quarter, params.year)} · ${formatRubCurrency(params.amount)}`,
    href: "/dashboard/finance",
    resetReadState: params.resetReadState
  });
}

export type UserReportLifecycleState =
  | "ready_to_confirm"
  | "changes_requested"
  | "agreed";

export interface UserReportLineItem {
  id?: string;
  platformName: string;
  upc: string;
  releaseTitle: string;
  amount: number;
}

export interface UserReportPlatformTotal {
  platformName: string;
  amount: number;
}

export interface UserReportItem {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: FinanceReportStatus;
  lifecycleState: UserReportLifecycleState;
  currency: string;
  createdAt: string;
  agreedAt: string | null;
  quarter: number | null;
  year: number | null;
  quarterLabel: string;
  adminComment: string | null;
  userComment: string | null;
  items: UserReportLineItem[];
  platformTotals: UserReportPlatformTotal[];
}

type StoredReportPayload = {
  kind: typeof REPORT_PAYLOAD_KIND;
  reportId: string;
  workflowState: UserReportLifecycleState;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number;
  currency: string;
  quarter: number | null;
  year: number | null;
  quarterLabel: string | null;
  adminComment: string | null;
  userComment: string | null;
  items: UserReportLineItem[];
  updatedAt: string;
};

type ReportPayloadRecord = {
  id: string;
  reportId: string;
  payload: StoredReportPayload;
};

function getRepo<T = Record<string, unknown>>(client: unknown, name: string): T | null {
  const repo = (client as Record<string, unknown>)[name];
  if (!repo || typeof repo !== "object") return null;
  return repo as T;
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function roundAmount(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function coerceQuarter(value: unknown): number | null {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 4) {
    return null;
  }
  return normalized;
}

function coerceYear(value: unknown): number | null {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 2000 || normalized > 3000) {
    return null;
  }
  return normalized;
}

function quarterFromDate(date: Date): number {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

function buildQuarterLabel(quarter: number | null, year: number | null, fallbackDate: Date): string {
  const effectiveQuarter = quarter ?? quarterFromDate(fallbackDate);
  const effectiveYear = year ?? fallbackDate.getUTCFullYear();
  return `${effectiveQuarter} квартал ${effectiveYear}`;
}

function normalizeLineItems(items: unknown): UserReportLineItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => {
      const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const amount = roundAmount(toNumber(source.amount));
      return {
        id: normalizeText(source.id, `line-${index + 1}`),
        platformName: normalizeText(source.platformName, "Без площадки"),
        upc: normalizeText(source.upc),
        releaseTitle: normalizeText(source.releaseTitle, "Без названия"),
        amount
      };
    })
    .filter((item) => item.amount > 0);
}

function sumLineItems(items: UserReportLineItem[]): number {
  return roundAmount(items.reduce((sum, item) => sum + toNumber(item.amount), 0));
}

function buildPlatformTotals(items: UserReportLineItem[]): UserReportPlatformTotal[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const key = item.platformName || "Без площадки";
    totals.set(key, roundAmount((totals.get(key) ?? 0) + item.amount));
  }

  return Array.from(totals.entries())
    .map(([platformName, amount]) => ({ platformName, amount }))
    .sort((left, right) => right.amount - left.amount || left.platformName.localeCompare(right.platformName, "ru"));
}

function parseStoredPayload(
  metadata: unknown,
  reportId: string,
  fallbackDate: Date
): StoredReportPayload | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const payload = metadata as Record<string, unknown>;
  if (payload.kind !== REPORT_PAYLOAD_KIND || normalizeText(payload.reportId) !== reportId) {
    return null;
  }

  const workflowState =
    payload.workflowState === "agreed" ||
    payload.workflowState === "changes_requested" ||
    payload.workflowState === "ready_to_confirm"
      ? payload.workflowState
      : "ready_to_confirm";
  const quarter = coerceQuarter(payload.quarter);
  const year = coerceYear(payload.year);
  const items = normalizeLineItems(payload.items);
  const periodStartValue = normalizeText(payload.periodStart);
  const periodEndValue = normalizeText(payload.periodEnd);
  const amount =
    typeof payload.amount === "number" && Number.isFinite(payload.amount)
      ? roundAmount(payload.amount)
      : sumLineItems(items);
  const currency = normalizeText(payload.currency, "RUB") || "RUB";

  return {
    kind: REPORT_PAYLOAD_KIND,
    reportId,
    workflowState,
    periodStart: periodStartValue || null,
    periodEnd: periodEndValue || null,
    amount,
    currency,
    quarter,
    year,
    quarterLabel: normalizeText(payload.quarterLabel) || buildQuarterLabel(quarter, year, fallbackDate),
    adminComment: normalizeText(payload.adminComment) || null,
    userComment: normalizeText(payload.userComment) || null,
    items,
    updatedAt: normalizeText(payload.updatedAt) || new Date().toISOString()
  };
}

export function buildStoredUserReportPayload(input: {
  reportId: string;
  workflowState: UserReportLifecycleState;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  amount?: number | null;
  currency?: string | null;
  quarter?: number | null;
  year?: number | null;
  fallbackDate: Date;
  adminComment?: string | null;
  userComment?: string | null;
  items?: UserReportLineItem[];
}): StoredReportPayload {
  const quarter = coerceQuarter(input.quarter);
  const year = coerceYear(input.year);
  const items = normalizeLineItems(input.items ?? []);

  return {
    kind: REPORT_PAYLOAD_KIND,
    reportId: input.reportId,
    workflowState: input.workflowState,
    periodStart:
      input.periodStart instanceof Date
        ? input.periodStart.toISOString()
        : normalizeText(input.periodStart) || null,
    periodEnd:
      input.periodEnd instanceof Date
        ? input.periodEnd.toISOString()
        : normalizeText(input.periodEnd) || null,
    amount:
      typeof input.amount === "number" && Number.isFinite(input.amount)
        ? roundAmount(input.amount)
        : sumLineItems(items),
    currency: normalizeText(input.currency, "RUB") || "RUB",
    quarter,
    year,
    quarterLabel: buildQuarterLabel(quarter, year, input.fallbackDate),
    adminComment: normalizeText(input.adminComment) || null,
    userComment: normalizeText(input.userComment) || null,
    items,
    updatedAt: new Date().toISOString()
  };
}

async function listReportPayloadRecords(
  prisma: PrismaClient,
  userId: string
): Promise<Map<string, ReportPayloadRecord>> {
  const transactionRepo = getRepo<{
    findMany: (args: unknown) => Promise<Array<{ id: string; description: string | null; metadata: unknown }>>;
  }>(prisma, "transaction");
  if (!transactionRepo?.findMany) {
    return new Map();
  }

  let rows;
  try {
    rows = await transactionRepo.findMany({
      where: {
        userId,
        description: REPORT_PAYLOAD_DESCRIPTION
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        description: true,
        metadata: true
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("transaction") || message.includes("does not exist") || message.includes("unknown")) {
      return new Map();
    }
    throw error;
  }

  const map = new Map<string, ReportPayloadRecord>();
  for (const row of rows) {
    const metadata = row?.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      continue;
    }
    const rawReportId = normalizeText((metadata as Record<string, unknown>).reportId);
    if (!rawReportId || map.has(rawReportId)) {
      continue;
    }
    const parsed = parseStoredPayload(metadata, rawReportId, new Date());
    if (!parsed) {
      continue;
    }
    map.set(rawReportId, {
      id: row.id,
      reportId: rawReportId,
      payload: parsed
    });
  }

  return map;
}

async function upsertReportPayloadRecord(
  prisma: PrismaClient | Prisma.TransactionClient,
  params: {
    payloadRecordId?: string | null;
    userId: string;
    reportId: string;
    payload: StoredReportPayload;
  }
) {
  const transactionRepo = getRepo<{
    create?: (args: unknown) => Promise<unknown>;
    update?: (args: unknown) => Promise<unknown>;
  }>(prisma, "transaction");
  if (!transactionRepo) {
    return;
  }

  const transactionData = {
    amount: new Prisma.Decimal(0),
    type: "ROYALTY",
    status: params.payload.workflowState === "agreed" ? "COMPLETED" : "PENDING",
    description: REPORT_PAYLOAD_DESCRIPTION,
    processedAt: params.payload.workflowState === "agreed" ? new Date() : null,
    metadata: params.payload
  };

  if (params.payloadRecordId && typeof transactionRepo.update === "function") {
    try {
      await transactionRepo.update({
        where: { id: params.payloadRecordId },
        data: transactionData
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("transaction") || message.includes("does not exist") || message.includes("unknown")) {
        return;
      }
      throw error;
    }
    return;
  }

  if (typeof transactionRepo.create === "function") {
    try {
      await transactionRepo.create({
        data: {
          id: randomUUID(),
          userId: params.userId,
          ...transactionData
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("transaction") || message.includes("does not exist") || message.includes("unknown")) {
        return;
      }
      throw error;
    }
  }
}

async function applyUserBalanceDelta(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
  amountDelta: number
) {
  if (Math.abs(amountDelta) < 0.005) {
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      balance: {
        increment: roundAmount(amountDelta)
      }
    }
  });
}

function resolveLifecycleState(
  reportStatus: FinanceReportStatus,
  payload: StoredReportPayload | null
): UserReportLifecycleState {
  if (reportStatus === FinanceReportStatus.AGREED) {
    return "agreed";
  }
  if (payload?.workflowState === "changes_requested") {
    return "changes_requested";
  }
  return "ready_to_confirm";
}

function mapReportItem(report: {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  amount: Prisma.Decimal | number;
  status: FinanceReportStatus;
  currency: string;
  createdAt: Date;
  agreedAt: Date | null;
}, payload: StoredReportPayload | null): UserReportItem {
  const lifecycleState = resolveLifecycleState(report.status, payload);
  const fallbackQuarter = quarterFromDate(report.periodEnd);
  const fallbackYear = report.periodEnd.getUTCFullYear();
  const quarter = payload?.quarter ?? fallbackQuarter;
  const year = payload?.year ?? fallbackYear;
  const items = payload?.items ?? [];

  return {
    id: report.id,
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    amount: toNumber(report.amount),
    status: report.status,
    lifecycleState,
    currency: report.currency,
    createdAt: report.createdAt.toISOString(),
    agreedAt: report.agreedAt?.toISOString() ?? null,
    quarter,
    year,
    quarterLabel: payload?.quarterLabel ?? buildQuarterLabel(quarter, year, report.periodEnd),
    adminComment: payload?.adminComment ?? null,
    userComment: payload?.userComment ?? null,
    items,
    platformTotals: buildPlatformTotals(items)
  };
}

function mapPayloadRecordToUserReportItem(record: ReportPayloadRecord): UserReportItem {
  const payload = record.payload;
  const fallbackDate = new Date(payload.updatedAt || new Date().toISOString());
  const periodStart = payload.periodStart ?? fallbackDate.toISOString();
  const periodEnd = payload.periodEnd ?? periodStart;
  const items = payload.items ?? [];
  const quarter = payload.quarter ?? quarterFromDate(new Date(periodEnd));
  const year = payload.year ?? new Date(periodEnd).getUTCFullYear();

  return {
    id: payload.reportId,
    periodStart,
    periodEnd,
    amount: roundAmount(payload.amount ?? sumLineItems(items)),
    status: payload.workflowState === "agreed" ? FinanceReportStatus.AGREED : FinanceReportStatus.READY_TO_CONFIRM,
    lifecycleState: payload.workflowState,
    currency: payload.currency || "RUB",
    createdAt: payload.updatedAt,
    agreedAt: payload.workflowState === "agreed" ? payload.updatedAt : null,
    quarter,
    year,
    quarterLabel: payload.quarterLabel ?? buildQuarterLabel(quarter, year, new Date(periodEnd)),
    adminComment: payload.adminComment ?? null,
    userComment: payload.userComment ?? null,
    items,
    platformTotals: buildPlatformTotals(items)
  };
}

async function getExistingReportWithPayload(
  prisma: PrismaClient,
  params: { reportId: string; userId?: string }
) {
  try {
    const report = await prisma.financeReport.findUnique({
      where: { id: params.reportId }
    });

    if (!report) {
      return null;
    }
    if (params.userId && report.userId !== params.userId) {
      return null;
    }

    const payloads = await listReportPayloadRecords(prisma, report.userId);
    return {
      report,
      payloadRecord: payloads.get(report.id) ?? null
    };
  } catch (error) {
    if (!isPrismaTableMissingError(error, "financeReport") || !params.userId) {
      throw error;
    }

    const payloads = await listReportPayloadRecords(prisma, params.userId);
    const payloadRecord = payloads.get(params.reportId) ?? null;
    if (!payloadRecord) {
      return null;
    }

    return {
      report: null,
      payloadRecord
    };
  }
}

export async function listUserReports(prisma: PrismaClient, userId: string): Promise<UserReportItem[]> {
  const payloads = await listReportPayloadRecords(prisma, userId);

  try {
    const reports = await prisma.financeReport.findMany({
      where: { userId },
      orderBy: { periodStart: "desc" },
      take: 200
    });

    return reports.map((report) => mapReportItem(report, payloads.get(report.id)?.payload ?? null));
  } catch (error) {
    if (!isPrismaTableMissingError(error, "financeReport")) {
      throw error;
    }

    return Array.from(payloads.values())
      .map((record) => mapPayloadRecordToUserReportItem(record))
      .sort((left, right) => right.periodStart.localeCompare(left.periodStart));
  }
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
  quarter?: number | null;
  year?: number | null;
  items?: UserReportLineItem[];
}) {
  const user = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true }
  });
  if (!user) return { ok: false as const, error: "User not found" };
  if (params.periodEnd < params.periodStart) {
    return { ok: false as const, error: "Дата окончания не может быть раньше даты начала." };
  }

  const normalizedItems = normalizeLineItems(params.items ?? []);
  const effectiveAmount = normalizedItems.length > 0 ? sumLineItems(normalizedItems) : roundAmount(params.amount);
  if (effectiveAmount <= 0) {
    return { ok: false as const, error: "Сумма отчета должна быть больше 0." };
  }
  const now = new Date();
  const workflowState: UserReportLifecycleState =
    params.status === FinanceReportStatus.AGREED ? "agreed" : "ready_to_confirm";
  const reportId = randomUUID();

  try {
    const report = await params.prisma.$transaction(async (tx) => {
      const created = await tx.financeReport.create({
        data: {
          id: reportId,
          userId: params.userId,
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          amount: new Prisma.Decimal(effectiveAmount),
          status: params.status,
          agreedAt: params.status === FinanceReportStatus.AGREED ? now : null,
          updatedAt: now
        }
      });

      const payload = buildStoredUserReportPayload({
        reportId: created.id,
        workflowState,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        amount: effectiveAmount,
        currency: "RUB",
        quarter: params.quarter,
        year: params.year,
        fallbackDate: params.periodEnd,
        adminComment: params.comment,
        items: normalizedItems
      });

      await upsertReportPayloadRecord(tx, {
        userId: params.userId,
        reportId: created.id,
        payload
      });

      if (params.status === FinanceReportStatus.AGREED) {
        await applyUserBalanceDelta(tx, params.userId, effectiveAmount);
      }

      await createAdminLog(tx, {
        adminId: params.adminId,
        action: "USER_FINANCE_REPORT_CREATED",
        targetType: "FinanceReport",
        targetId: created.id,
        newValue: {
          userId: params.userId,
          periodStart: params.periodStart.toISOString(),
          periodEnd: params.periodEnd.toISOString(),
          amount: effectiveAmount,
          status: params.status,
          quarter: payload.quarter,
          year: payload.year,
          workflowState,
          items: normalizedItems
        },
        comment: params.comment
      });
      return created;
    });

    await notifyUserReportReady({
      prisma: params.prisma,
      userId: params.userId,
      reportId: report.id,
      amount: effectiveAmount,
      quarter: params.quarter,
      year: params.year
    });
    return { ok: true as const, reportId: report.id };
  } catch (error) {
    if (!isPrismaTableMissingError(error, "financeReport")) {
      throw error;
    }

    await params.prisma.$transaction(async (tx) => {
      const payload = buildStoredUserReportPayload({
        reportId,
        workflowState,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        amount: effectiveAmount,
        currency: "RUB",
        quarter: params.quarter,
        year: params.year,
        fallbackDate: params.periodEnd,
        adminComment: params.comment,
        items: normalizedItems
      });

      await upsertReportPayloadRecord(tx, {
        userId: params.userId,
        reportId,
        payload
      });

      if (params.status === FinanceReportStatus.AGREED) {
        await applyUserBalanceDelta(tx, params.userId, effectiveAmount);
      }

      await createAdminLog(tx, {
        adminId: params.adminId,
        action: "USER_FINANCE_REPORT_CREATED",
        targetType: "FinanceReport",
        targetId: reportId,
        newValue: {
          userId: params.userId,
          periodStart: params.periodStart.toISOString(),
          periodEnd: params.periodEnd.toISOString(),
          amount: effectiveAmount,
          status: params.status,
          quarter: payload.quarter,
          year: payload.year,
          workflowState,
          items: normalizedItems,
          storage: "payload_only"
        },
        comment: params.comment
      });
    });

    await notifyUserReportReady({
      prisma: params.prisma,
      userId: params.userId,
      reportId,
      amount: effectiveAmount,
      quarter: params.quarter,
      year: params.year
    });
    return { ok: true as const, reportId };
  }
}

export async function updateUserReportByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  reportId: string;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  status: FinanceReportStatus;
  comment?: string;
  quarter?: number | null;
  year?: number | null;
  items?: UserReportLineItem[];
}) {
  const existing = await getExistingReportWithPayload(params.prisma, {
    reportId: params.reportId,
    userId: params.userId
  });
  if (!existing) {
    return { ok: false as const, error: "Report not found" };
  }
  if (params.periodEnd < params.periodStart) {
    return { ok: false as const, error: "Дата окончания не может быть раньше даты начала." };
  }

  const normalizedItems = normalizeLineItems(params.items ?? []);
  const nextAmount = normalizedItems.length > 0 ? sumLineItems(normalizedItems) : roundAmount(params.amount);
  if (nextAmount <= 0) {
    return { ok: false as const, error: "Сумма отчета должна быть больше 0." };
  }
  const previousAmount =
    existing.report ? toNumber(existing.report.amount) : roundAmount(existing.payloadRecord?.payload.amount ?? 0);
  const previousLifecycleState = existing.report
    ? resolveLifecycleState(existing.report.status, existing.payloadRecord?.payload ?? null)
    : existing.payloadRecord?.payload.workflowState ?? "ready_to_confirm";
  const previousCreditedAmount =
    previousLifecycleState === "agreed" ? previousAmount : 0;
  const nextCreditedAmount =
    params.status === FinanceReportStatus.AGREED ? nextAmount : 0;
  const balanceDelta = roundAmount(nextCreditedAmount - previousCreditedAmount);
  const workflowState: UserReportLifecycleState =
    params.status === FinanceReportStatus.AGREED ? "agreed" : "ready_to_confirm";

  try {
    await params.prisma.$transaction(async (tx) => {
      const agreedAt =
        params.status === FinanceReportStatus.AGREED
          ? existing.report?.agreedAt ?? new Date()
          : null;

      await tx.financeReport.update({
        where: { id: params.reportId },
        data: {
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          amount: new Prisma.Decimal(nextAmount),
          status: params.status,
          agreedAt,
          updatedAt: new Date()
        }
      });

      const payload = buildStoredUserReportPayload({
        reportId: params.reportId,
        workflowState,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        amount: nextAmount,
        currency: "RUB",
        quarter: params.quarter,
        year: params.year,
        fallbackDate: params.periodEnd,
        adminComment: params.comment,
        userComment: workflowState === "ready_to_confirm" ? null : existing.payloadRecord?.payload.userComment ?? null,
        items: normalizedItems
      });

      await upsertReportPayloadRecord(tx, {
        payloadRecordId: existing.payloadRecord?.id ?? null,
        userId: params.userId,
        reportId: params.reportId,
        payload
      });

      await applyUserBalanceDelta(tx, params.userId, balanceDelta);

      await createAdminLog(tx, {
        adminId: params.adminId,
        action: "USER_FINANCE_REPORT_UPDATED",
        targetType: "FinanceReport",
        targetId: params.reportId,
        oldValue: {
          amount: previousAmount,
          status: existing.report?.status ?? null,
          lifecycleState: previousLifecycleState
        },
        newValue: {
          amount: nextAmount,
          status: params.status,
          workflowState,
          quarter: payload.quarter,
          year: payload.year,
          items: normalizedItems
        },
        comment: params.comment
      });
    });
  } catch (error) {
    if (!isPrismaTableMissingError(error, "financeReport")) {
      throw error;
    }

    await params.prisma.$transaction(async (tx) => {
      const payload = buildStoredUserReportPayload({
        reportId: params.reportId,
        workflowState,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        amount: nextAmount,
        currency: "RUB",
        quarter: params.quarter,
        year: params.year,
        fallbackDate: params.periodEnd,
        adminComment: params.comment,
        userComment: workflowState === "ready_to_confirm" ? null : existing.payloadRecord?.payload.userComment ?? null,
        items: normalizedItems
      });

      await upsertReportPayloadRecord(tx, {
        payloadRecordId: existing.payloadRecord?.id ?? null,
        userId: params.userId,
        reportId: params.reportId,
        payload
      });

      await applyUserBalanceDelta(tx, params.userId, balanceDelta);

      await createAdminLog(tx, {
        adminId: params.adminId,
        action: "USER_FINANCE_REPORT_UPDATED",
        targetType: "FinanceReport",
        targetId: params.reportId,
        oldValue: {
          amount: previousAmount,
          status: existing.report?.status ?? null,
          lifecycleState: previousLifecycleState
        },
        newValue: {
          amount: nextAmount,
          status: params.status,
          workflowState,
          quarter: payload.quarter,
          year: payload.year,
          items: normalizedItems,
          storage: "payload_only"
        },
        comment: params.comment
      });
    });
  }

  return { ok: true as const };
}

export async function markUserReportAsRejected(params: {
  prisma: PrismaClient;
  reportId: string;
  userId: string;
  userComment?: string;
}) {
  const existing = await getExistingReportWithPayload(params.prisma, {
    reportId: params.reportId,
    userId: params.userId
  });
  if (!existing) {
    return { ok: false as const, error: "Report not found" };
  }
  const existingLifecycleState = existing.report
    ? resolveLifecycleState(existing.report.status, existing.payloadRecord?.payload ?? null)
    : existing.payloadRecord?.payload.workflowState ?? "ready_to_confirm";
  if (existingLifecycleState === "agreed") {
    return { ok: false as const, error: "Согласованный отчет нельзя вернуть на доработку." };
  }

  try {
    await params.prisma.$transaction(async (tx) => {
      const payload = buildStoredUserReportPayload({
        reportId: params.reportId,
        workflowState: "changes_requested",
        periodStart: existing.report?.periodStart ?? existing.payloadRecord?.payload.periodStart ?? null,
        periodEnd: existing.report?.periodEnd ?? existing.payloadRecord?.payload.periodEnd ?? null,
        amount: existing.report ? toNumber(existing.report.amount) : existing.payloadRecord?.payload.amount ?? 0,
        currency: existing.report?.currency ?? existing.payloadRecord?.payload.currency ?? "RUB",
        quarter: existing.payloadRecord?.payload.quarter,
        year: existing.payloadRecord?.payload.year,
        fallbackDate: existing.report?.periodEnd ?? new Date(existing.payloadRecord?.payload.periodEnd ?? existing.payloadRecord?.payload.updatedAt ?? new Date()),
        adminComment: existing.payloadRecord?.payload.adminComment ?? null,
        userComment: params.userComment ?? null,
        items: existing.payloadRecord?.payload.items ?? []
      });

      await tx.financeReport.update({
        where: { id: params.reportId },
        data: {
          updatedAt: new Date()
        }
      });

      await upsertReportPayloadRecord(tx, {
        payloadRecordId: existing.payloadRecord?.id ?? null,
        userId: params.userId,
        reportId: params.reportId,
        payload
      });
    });
  } catch (error) {
    if (!isPrismaTableMissingError(error, "financeReport")) {
      throw error;
    }

    await params.prisma.$transaction(async (tx) => {
      const payload = buildStoredUserReportPayload({
        reportId: params.reportId,
        workflowState: "changes_requested",
        periodStart: existing.payloadRecord?.payload.periodStart ?? null,
        periodEnd: existing.payloadRecord?.payload.periodEnd ?? null,
        amount: existing.payloadRecord?.payload.amount ?? 0,
        currency: existing.payloadRecord?.payload.currency ?? "RUB",
        quarter: existing.payloadRecord?.payload.quarter,
        year: existing.payloadRecord?.payload.year,
        fallbackDate: new Date(existing.payloadRecord?.payload.periodEnd ?? existing.payloadRecord?.payload.updatedAt ?? new Date()),
        adminComment: existing.payloadRecord?.payload.adminComment ?? null,
        userComment: params.userComment ?? null,
        items: existing.payloadRecord?.payload.items ?? []
      });

      await upsertReportPayloadRecord(tx, {
        payloadRecordId: existing.payloadRecord?.id ?? null,
        userId: params.userId,
        reportId: params.reportId,
        payload
      });
    });
  }

  return { ok: true as const };
}

export async function markUserReportAsAgreed(params: {
  prisma: PrismaClient;
  reportId: string;
  userId: string;
}) {
  const existing = await getExistingReportWithPayload(params.prisma, {
    reportId: params.reportId,
    userId: params.userId
  });
  if (!existing) {
    return { ok: false as const, error: "Report not found" };
  }
  const existingLifecycleState = existing.report
    ? resolveLifecycleState(existing.report.status, existing.payloadRecord?.payload ?? null)
    : existing.payloadRecord?.payload.workflowState ?? "ready_to_confirm";
  if (existingLifecycleState === "agreed") {
    return { ok: false as const, error: "Отчет уже согласован." };
  }

  const amount = existing.report ? toNumber(existing.report.amount) : roundAmount(existing.payloadRecord?.payload.amount ?? 0);
  const now = new Date();

  try {
    await params.prisma.$transaction(async (tx) => {
      await tx.financeReport.update({
        where: { id: params.reportId },
        data: {
          status: FinanceReportStatus.AGREED,
          agreedAt: now,
          updatedAt: now
        }
      });

      const payload = buildStoredUserReportPayload({
        reportId: params.reportId,
        workflowState: "agreed",
        periodStart: existing.report?.periodStart ?? existing.payloadRecord?.payload.periodStart ?? null,
        periodEnd: existing.report?.periodEnd ?? existing.payloadRecord?.payload.periodEnd ?? null,
        amount,
        currency: existing.report?.currency ?? existing.payloadRecord?.payload.currency ?? "RUB",
        quarter: existing.payloadRecord?.payload.quarter,
        year: existing.payloadRecord?.payload.year,
        fallbackDate: existing.report?.periodEnd ?? new Date(existing.payloadRecord?.payload.periodEnd ?? existing.payloadRecord?.payload.updatedAt ?? new Date()),
        adminComment: existing.payloadRecord?.payload.adminComment ?? null,
        userComment: existing.payloadRecord?.payload.userComment ?? null,
        items: existing.payloadRecord?.payload.items ?? []
      });

      await upsertReportPayloadRecord(tx, {
        payloadRecordId: existing.payloadRecord?.id ?? null,
        userId: params.userId,
        reportId: params.reportId,
        payload
      });

      await applyUserBalanceDelta(tx, params.userId, amount);
    });
  } catch (error) {
    if (!isPrismaTableMissingError(error, "financeReport")) {
      throw error;
    }

    await params.prisma.$transaction(async (tx) => {
      const payload = buildStoredUserReportPayload({
        reportId: params.reportId,
        workflowState: "agreed",
        periodStart: existing.payloadRecord?.payload.periodStart ?? null,
        periodEnd: existing.payloadRecord?.payload.periodEnd ?? null,
        amount,
        currency: existing.payloadRecord?.payload.currency ?? "RUB",
        quarter: existing.payloadRecord?.payload.quarter,
        year: existing.payloadRecord?.payload.year,
        fallbackDate: new Date(existing.payloadRecord?.payload.periodEnd ?? existing.payloadRecord?.payload.updatedAt ?? new Date()),
        adminComment: existing.payloadRecord?.payload.adminComment ?? null,
        userComment: existing.payloadRecord?.payload.userComment ?? null,
        items: existing.payloadRecord?.payload.items ?? []
      });

      await upsertReportPayloadRecord(tx, {
        payloadRecordId: existing.payloadRecord?.id ?? null,
        userId: params.userId,
        reportId: params.reportId,
        payload
      });

      await applyUserBalanceDelta(tx, params.userId, amount);
    });
  }

  return { ok: true as const };
}

export async function resendUserReportToUser(params: {
  prisma: PrismaClient;
  reportId: string;
  userId: string;
}) {
  const existing = await getExistingReportWithPayload(params.prisma, {
    reportId: params.reportId,
    userId: params.userId
  });
  if (!existing) {
    return { ok: false as const, error: "Report not found" };
  }

  const existingLifecycleState = existing.report
    ? resolveLifecycleState(existing.report.status, existing.payloadRecord?.payload ?? null)
    : existing.payloadRecord?.payload.workflowState ?? "ready_to_confirm";
  if (existingLifecycleState !== "changes_requested") {
    return {
      ok: false as const,
      error: "Повторно можно отправить только отчет на доработке."
    };
  }

  try {
    await params.prisma.$transaction(async (tx) => {
      if (existing.report) {
        await tx.financeReport.update({
          where: { id: params.reportId },
          data: {
            status: FinanceReportStatus.READY_TO_CONFIRM,
            agreedAt: null,
            updatedAt: new Date()
          }
        });
      }

      const payload = buildStoredUserReportPayload({
        reportId: params.reportId,
        workflowState: "ready_to_confirm",
        periodStart: existing.report?.periodStart ?? existing.payloadRecord?.payload.periodStart ?? null,
        periodEnd: existing.report?.periodEnd ?? existing.payloadRecord?.payload.periodEnd ?? null,
        amount: existing.report ? toNumber(existing.report.amount) : existing.payloadRecord?.payload.amount ?? 0,
        currency: existing.report?.currency ?? existing.payloadRecord?.payload.currency ?? "RUB",
        quarter: existing.payloadRecord?.payload.quarter,
        year: existing.payloadRecord?.payload.year,
        fallbackDate:
          existing.report?.periodEnd ??
          new Date(
            existing.payloadRecord?.payload.periodEnd ??
              existing.payloadRecord?.payload.updatedAt ??
              new Date()
          ),
        adminComment: existing.payloadRecord?.payload.adminComment ?? null,
        userComment: null,
        items: existing.payloadRecord?.payload.items ?? []
      });

      await upsertReportPayloadRecord(tx, {
        payloadRecordId: existing.payloadRecord?.id ?? null,
        userId: params.userId,
        reportId: params.reportId,
        payload
      });
    });
  } catch (error) {
    if (!isPrismaTableMissingError(error, "financeReport")) {
      throw error;
    }

    await params.prisma.$transaction(async (tx) => {
      const payload = buildStoredUserReportPayload({
        reportId: params.reportId,
        workflowState: "ready_to_confirm",
        periodStart: existing.payloadRecord?.payload.periodStart ?? null,
        periodEnd: existing.payloadRecord?.payload.periodEnd ?? null,
        amount: existing.payloadRecord?.payload.amount ?? 0,
        currency: existing.payloadRecord?.payload.currency ?? "RUB",
        quarter: existing.payloadRecord?.payload.quarter,
        year: existing.payloadRecord?.payload.year,
        fallbackDate: new Date(
          existing.payloadRecord?.payload.periodEnd ??
            existing.payloadRecord?.payload.updatedAt ??
            new Date()
        ),
        adminComment: existing.payloadRecord?.payload.adminComment ?? null,
        userComment: null,
        items: existing.payloadRecord?.payload.items ?? []
      });

      await upsertReportPayloadRecord(tx, {
        payloadRecordId: existing.payloadRecord?.id ?? null,
        userId: params.userId,
        reportId: params.reportId,
        payload
      });
    });
  }

  await notifyUserReportReady({
    prisma: params.prisma,
    userId: params.userId,
    reportId: params.reportId,
    amount: existing.report
      ? toNumber(existing.report.amount)
      : existing.payloadRecord?.payload.amount ?? 0,
    quarter: existing.payloadRecord?.payload.quarter,
    year: existing.payloadRecord?.payload.year,
    resetReadState: true
  });

  return { ok: true as const };
}
