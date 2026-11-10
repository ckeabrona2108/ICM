import type { Prisma, PrismaClient } from "@prisma/client";

import { createAdminLog } from "@/lib/admin-log-service";

/**
 * ICECREAMMUSIC commission withheld from royalties during a financial import.
 * Admin-only: rates and commission amounts are never sent to the artist cabinet,
 * because accounts are sometimes handed over to other people.
 */
export const DEFAULT_PLATFORM_COMMISSION_RATE = 0.1;
export const PLATFORM_COMMISSION_SETTING_KEY = "platform_commission_rate";

type Db = PrismaClient | Prisma.TransactionClient;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(typeof value === "object" ? String(value) : value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "12,5" / "12.5" / 12.5 → 0.125. Percent must be within 0–100. */
export function parseCommissionPercent(value: unknown): { ok: true; rate: number } | { ok: false; error: string } {
  const raw = typeof value === "string" ? value.trim().replace(",", ".").replace(/%$/u, "").trim() : value;
  if (raw === "" || raw === null || raw === undefined) return { ok: false, error: "Укажите процент комиссии." };
  const percent = Number(raw);
  if (!Number.isFinite(percent)) return { ok: false, error: "Процент должен быть числом." };
  if (percent < 0 || percent > 100) return { ok: false, error: "Процент должен быть от 0 до 100." };
  return { ok: true, rate: Math.round(percent * 100) / 10000 };
}

export function rateToPercent(rate: number): number {
  return Math.round(rate * 10000) / 100;
}

/** The global rate; 0% is a valid setting (it no longer falls back to the default). */
export async function readGlobalCommissionRate(prisma: Db): Promise<number> {
  const setting = await prisma.platform_settings.findUnique({ where: { key: PLATFORM_COMMISSION_SETTING_KEY } });
  const value = toNumber(setting?.value_number);
  return value === null ? DEFAULT_PLATFORM_COMMISSION_RATE : value;
}

export async function writeGlobalCommissionRate(params: { prisma: PrismaClient; adminId: string; rate: number }) {
  const previous = await readGlobalCommissionRate(params.prisma);
  await params.prisma.platform_settings.upsert({
    where: { key: PLATFORM_COMMISSION_SETTING_KEY },
    create: { key: PLATFORM_COMMISSION_SETTING_KEY, value_number: params.rate, updated_by_id: params.adminId },
    update: { value_number: params.rate, updated_by_id: params.adminId }
  });
  await createAdminLog(params.prisma, {
    adminId: params.adminId,
    action: "commission.global.update",
    targetType: "platform_settings",
    targetId: PLATFORM_COMMISSION_SETTING_KEY,
    oldValue: rateToPercent(previous),
    newValue: rateToPercent(params.rate)
  });
}

export interface ArtistCommissionRateItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  percent: number;
  notes: string | null;
  updatedAt: string;
  /** A contract-level rate overrides this one in imports (legacy table, managed outside this page). */
  overriddenByContractPercent: number | null;
}

export async function listArtistCommissionRates(prisma: PrismaClient): Promise<ArtistCommissionRateItem[]> {
  const [rows, contractRates] = await Promise.all([
    prisma.user_commission_rates.findMany({
      where: { active: true },
      orderBy: { updated_at: "desc" },
      include: { user: { select: { name: true, email: true } } }
    }),
    prisma.contract_commission_rates.findMany({
      where: { active: true },
      orderBy: { created_at: "desc" },
      select: { user_id: true, commission_rate: true }
    })
  ]);
  const contractByUser = new Map<string, number>();
  for (const rate of contractRates) {
    if (!contractByUser.has(rate.user_id)) contractByUser.set(rate.user_id, toNumber(rate.commission_rate) ?? 0);
  }

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user.name,
    userEmail: row.user.email,
    percent: rateToPercent(toNumber(row.commission_rate) ?? 0),
    notes: row.notes,
    updatedAt: row.updated_at.toISOString(),
    overriddenByContractPercent: contractByUser.has(row.user_id)
      ? rateToPercent(contractByUser.get(row.user_id) ?? 0)
      : null
  }));
}

/** Sets an artist's individual rate. The previous one is deactivated, not deleted, so history is kept. */
export async function setArtistCommissionRate(params: {
  prisma: PrismaClient;
  adminId: string;
  userId: string;
  rate: number;
  notes?: string | null;
}) {
  const user = await params.prisma.user.findUnique({ where: { id: params.userId }, select: { id: true } });
  if (!user) throw new Error("Пользователь не найден.");

  const notes = params.notes?.trim() ? params.notes.trim().slice(0, 500) : null;
  const previous = await params.prisma.$transaction(async (tx) => {
    const current = await tx.user_commission_rates.findFirst({
      where: { user_id: params.userId, active: true },
      orderBy: { created_at: "desc" }
    });
    await tx.user_commission_rates.updateMany({
      where: { user_id: params.userId, active: true },
      data: { active: false, ends_at: new Date() }
    });
    await tx.user_commission_rates.create({
      data: { user_id: params.userId, commission_rate: params.rate, notes, active: true, starts_at: new Date() }
    });
    return current;
  });

  await createAdminLog(params.prisma, {
    adminId: params.adminId,
    action: "commission.user.set",
    targetType: "user",
    targetId: params.userId,
    oldValue: previous ? rateToPercent(toNumber(previous.commission_rate) ?? 0) : null,
    newValue: rateToPercent(params.rate),
    comment: notes ?? undefined
  });
}

/** Removes an artist's individual rate: their imports use the global rate again. */
export async function removeArtistCommissionRate(params: { prisma: PrismaClient; adminId: string; userId: string }) {
  const current = await params.prisma.user_commission_rates.findFirst({
    where: { user_id: params.userId, active: true },
    orderBy: { created_at: "desc" }
  });
  await params.prisma.user_commission_rates.updateMany({
    where: { user_id: params.userId, active: true },
    data: { active: false, ends_at: new Date() }
  });
  await createAdminLog(params.prisma, {
    adminId: params.adminId,
    action: "commission.user.remove",
    targetType: "user",
    targetId: params.userId,
    oldValue: current ? rateToPercent(toNumber(current.commission_rate) ?? 0) : null,
    newValue: null
  });
}

export interface CommissionReportArtist {
  userId: string;
  userName: string;
  userEmail: string;
  gross: number;
  commission: number;
  net: number;
  /** Commission / gross across the period: shows the rate actually applied. */
  effectivePercent: number;
}

export interface CommissionReport {
  from: string | null;
  to: string | null;
  gross: number;
  commission: number;
  net: number;
  effectivePercent: number;
  artists: CommissionReportArtist[];
}

/** Royalties credited by confirmed, not rolled back imports, split into ICECREAMMUSIC commission and artist share. */
export async function getCommissionReport(
  prisma: PrismaClient,
  params: { from?: Date | null; to?: Date | null }
): Promise<CommissionReport> {
  const createdAt: Prisma.DateTimeFilter = {};
  if (params.from) createdAt.gte = params.from;
  if (params.to) createdAt.lt = params.to;

  const grouped = await prisma.royalty_transactions.groupBy({
    by: ["user_id"],
    where: {
      reversed_at: null,
      import: { is: { status: "CONFIRMED" } },
      ...(params.from || params.to ? { created_at: createdAt } : {})
    },
    _sum: { gross_amount: true, platform_commission_amount: true, net_amount: true }
  });

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((row) => row.user_id) } },
    select: { id: true, name: true, email: true }
  });
  const userById = new Map(users.map((user) => [user.id, user]));

  const artists = grouped
    .map((row) => {
      const gross = roundMoney(toNumber(row._sum.gross_amount) ?? 0);
      const commission = roundMoney(toNumber(row._sum.platform_commission_amount) ?? 0);
      const net = roundMoney(toNumber(row._sum.net_amount) ?? 0);
      const user = userById.get(row.user_id);
      return {
        userId: row.user_id,
        userName: user?.name ?? "Удалённый пользователь",
        userEmail: user?.email ?? "",
        gross,
        commission,
        net,
        effectivePercent: gross > 0 ? Math.round((commission / gross) * 10000) / 100 : 0
      };
    })
    .sort((left, right) => right.gross - left.gross);

  const gross = roundMoney(artists.reduce((sum, item) => sum + item.gross, 0));
  const commission = roundMoney(artists.reduce((sum, item) => sum + item.commission, 0));
  const net = roundMoney(artists.reduce((sum, item) => sum + item.net, 0));

  return {
    from: params.from?.toISOString() ?? null,
    to: params.to?.toISOString() ?? null,
    gross,
    commission,
    net,
    effectivePercent: gross > 0 ? Math.round((commission / gross) * 10000) / 100 : 0,
    artists
  };
}

export async function searchUsersForCommission(prisma: PrismaClient, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } }
      ]
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 10
  });
}
