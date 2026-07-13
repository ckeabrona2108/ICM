// @ts-nocheck
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  getAnalyticsPeriodVariantHour,
  normalizeAnalyticsPeriodDays
} from "@/lib/analytics-period";
import { normalizeAnalyticsUpc } from "@/lib/analytics-upc";
import { normalizeAnalyticsPlatform } from "@/lib/analytics-platform";
import {
  isPrismaColumnMissingError,
  isPrismaTableMissingError
} from "@/lib/prisma-errors";
import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";

type AnalyticsDailySummaryRepo = {
  findMany: (args: unknown) => Promise<
    Array<{
      report_date: Date;
      release_id?: string | null;
      total_streams: number;
      total_pay_streams: number;
    }>
  >;
};

type AnalyticsPlatformSummaryRepo = {
  findMany: (args: unknown) => Promise<
    Array<{
      report_date: Date;
      platform: string;
      streams: number;
      pay_streams: number;
    }>
  >;
};

function getAnalyticsDailySummaryRepo(
  prisma: PrismaClient
): AnalyticsDailySummaryRepo | null {
  return (prisma as unknown as { analytics_daily_summaries?: AnalyticsDailySummaryRepo })
    .analytics_daily_summaries ?? null;
}

function getAnalyticsPlatformSummaryRepo(
  prisma: PrismaClient
): AnalyticsPlatformSummaryRepo | null {
  return (prisma as unknown as { analytics_platform_summaries?: AnalyticsPlatformSummaryRepo })
    .analytics_platform_summaries ?? null;
}

function isUnknownSnapshotPlatformFieldError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown argument `platform`") ||
    error.message.includes("Invalid value for argument `by`") ||
    error.message.includes("Expected AnalyticsReportSnapshotScalarFieldEnum")
  );
}

function isRawPlatformQueryUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("column \"platform\" does not exist") ||
    error.message.includes("relation \"analytics_report_snapshots\" does not exist")
  );
}

function isAnalyticsSummaryUnavailableError(error: unknown): boolean {
  return (
    isPrismaTableMissingError(error, "analytics_daily_summaries") ||
    isPrismaTableMissingError(error, "analytics_platform_summaries") ||
    isPrismaColumnMissingError(error, "release_id") ||
    isPrismaColumnMissingError(error, "platform") ||
    (error instanceof Error &&
      (error.message.includes("analytics_daily_summaries") ||
        error.message.includes("analytics_platform_summaries")))
  );
}

function toNumber(value: bigint | number | null): number {
  if (value == null) return 0;
  if (typeof value === "bigint") return Number(value);
  return value;
}

function hasRawQueryClient(prisma: PrismaClient): prisma is PrismaClient & {
  $queryRaw: typeof prisma.$queryRaw;
} {
  return typeof (prisma as PrismaClient & { $queryRaw?: unknown }).$queryRaw === "function";
}

function sqlUuid(value: string): Prisma.Sql {
  return Prisma.sql`${value}::uuid`;
}

function sqlUuidList(values: string[]): Prisma.Sql {
  return Prisma.join(values.map((value) => sqlUuid(value)));
}

function buildLegacyPeriodHourCondition(periodDays: number): Prisma.Sql {
  return Prisma.sql`EXTRACT(HOUR FROM "report_date") = ${getAnalyticsPeriodVariantHour(periodDays)}`;
}

function matchesAnalyticsPeriodVariant(date: Date, periodDays: number): boolean {
  return date.getUTCHours() === getAnalyticsPeriodVariantHour(periodDays);
}

async function groupSnapshotPlatformsCompat(
  prisma: PrismaClient,
  where: {
    user_id: string;
    report_date?: Date;
    period_days?: number;
    release_id?: string;
    release_ids?: string[];
    country?: string;
    upc?: string;
    platform?: string;
  }
): Promise<Array<{ platform: string | null; _sum: { streams: number; pay_streams: number } }>> {
  const snapshotWhere = {
    user_id: where.user_id,
    ...(where.report_date ? { report_date: where.report_date } : {}),
    ...(where.period_days ? { period_days: where.period_days } : {}),
    ...(where.release_id ? { release_id: where.release_id } : {}),
    ...(where.release_ids?.length ? { release_id: { in: where.release_ids } } : {}),
    ...(where.country ? { country: where.country } : {}),
    ...(where.upc ? { upc: where.upc } : {}),
    ...(where.platform ? { platform: where.platform } : {})
  };

  try {
    const rows = await prisma.analytics_report_snapshots.groupBy({
      by: ["platform"],
      where: snapshotWhere,
      _sum: {
        streams: true,
        pay_streams: true
      },
      orderBy: {
        _sum: {
          streams: "desc"
        }
      }
    });

    return rows.map((row) => ({
      platform: row.platform,
      _sum: {
        streams: row._sum.streams ?? 0,
        pay_streams: row._sum.pay_streams ?? 0
      }
    }));
  } catch (error) {
    if (!isUnknownSnapshotPlatformFieldError(error)) throw error;
  }

  if (!hasRawQueryClient(prisma)) {
    return [];
  }

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"user_id" = ${sqlUuid(where.user_id)}`
  ];
  if (where.report_date) conditions.push(Prisma.sql`"report_date" = ${where.report_date}`);
  if (where.period_days) {
    conditions.push(
      Prisma.sql`("period_days" = ${where.period_days} OR ${buildLegacyPeriodHourCondition(where.period_days)})`
    );
  }
  if (where.release_id) conditions.push(Prisma.sql`"release_id" = ${sqlUuid(where.release_id)}`);
  if (where.release_ids?.length) {
    conditions.push(Prisma.sql`"release_id" IN (${sqlUuidList(where.release_ids)})`);
  }
  if (where.country) conditions.push(Prisma.sql`"country" = ${where.country}`);
  if (where.upc) conditions.push(Prisma.sql`"upc" = ${where.upc}`);
  if (where.platform) conditions.push(Prisma.sql`"platform" = ${where.platform}`);

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        platform: string | null;
        streams: bigint | number | null;
        pay_streams: bigint | number | null;
      }>
    >(Prisma.sql`
      SELECT
        "platform",
        SUM("streams")::bigint AS "streams",
        SUM("pay_streams")::bigint AS "pay_streams"
      FROM "analytics_report_snapshots"
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY "platform"
      ORDER BY SUM("streams") DESC
    `);

    return rows.map((row) => ({
      platform: row.platform,
      _sum: {
        streams: toNumber(row.streams),
        pay_streams: toNumber(row.pay_streams)
      }
    }));
  } catch (error) {
    if (isRawPlatformQueryUnavailableError(error)) {
      return [];
    }
    throw error;
  }
}

async function buildAllTimePlatformsBreakdown(
  prisma: PrismaClient,
  params: {
    user_id: string;
    release_id?: string;
    release_ids?: string[];
    period_days?: number;
    country?: string;
    upc?: string;
    platform?: string;
    fallbackStreams?: number;
    fallbackPayStreams?: number;
  }
): Promise<AnalyticsOverviewResponse["platformsBreakdown"]> {
  const groups = await groupSnapshotPlatformsCompat(prisma, {
    user_id: params.user_id,
    ...(params.release_id ? { release_id: params.release_id } : {}),
    ...(params.release_ids?.length ? { release_ids: params.release_ids } : {}),
    ...(params.period_days ? { period_days: params.period_days } : {}),
    ...(params.country ? { country: params.country } : {}),
    ...(params.upc ? { upc: params.upc } : {}),
    ...(params.platform ? { platform: params.platform } : {})
  });

  const totalStreams = groups.reduce((sum, item) => sum + (item._sum.streams ?? 0), 0);

  const breakdown = groups.map((item) => {
    const name = item.platform ?? "Unknown";
    const streams = item._sum.streams ?? 0;
    const pay_streams = item._sum.pay_streams ?? 0;
    return {
      platform: name,
      streams,
      pay_streams,
      sharePercent: totalStreams > 0 ? Number((((streams / totalStreams) * 100)).toFixed(3)) : 0,
      changePercent: null
    };
  });

  if (breakdown.length === 0 && ((params.fallbackStreams ?? 0) > 0 || (params.fallbackPayStreams ?? 0) > 0)) {
    breakdown.push({
      platform: "Unknown",
      streams: params.fallbackStreams ?? 0,
      pay_streams: params.fallbackPayStreams ?? 0,
      sharePercent: 100,
      changePercent: null
    });
  }

  return breakdown;
}

async function groupSnapshotPlatformsChartCompat(
  prisma: PrismaClient,
  where: {
    user_id: string;
    release_id?: string;
    release_ids?: string[];
    period_days?: number;
    country?: string;
    upc?: string;
    platform?: string;
    rangeStart: Date;
  }
): Promise<AnalyticsPlatformsChartPoint[]> {
  const snapshotWhere = {
    user_id: where.user_id,
    report_date: {
      gte: where.rangeStart
    },
    ...(where.release_id ? { release_id: where.release_id } : {}),
    ...(where.release_ids?.length ? { release_id: { in: where.release_ids } } : {}),
    ...(where.period_days ? { period_days: where.period_days } : {}),
    ...(where.country ? { country: where.country } : {}),
    ...(where.upc ? { upc: where.upc } : {}),
    ...(where.platform ? { platform: where.platform } : {})
  };

  try {
    const rows = await prisma.analytics_report_snapshots.groupBy({
      by: ["report_date", "platform"],
      where: snapshotWhere,
      _sum: {
        streams: true,
        pay_streams: true
      },
      orderBy: [{ report_date: "asc" }, { platform: "asc" }]
    });

    const byDate = new Map<string, AnalyticsPlatformsChartPoint["values"]>();
    for (const row of rows) {
      const date = toDateKey(row.report_date);
      const bucket = byDate.get(date) ?? [];
      bucket.push({
        platform: row.platform ?? "Unknown",
        streams: row._sum.streams ?? 0,
        pay_streams: row._sum.pay_streams ?? 0
      });
      byDate.set(date, bucket);
    }

    return Array.from(byDate.entries()).map(([date, values]) => ({
      date,
      values: values.sort((left, right) => right.streams - left.streams)
    }));
  } catch (error) {
    if (!isUnknownSnapshotPlatformFieldError(error)) throw error;
  }

  if (!hasRawQueryClient(prisma)) {
    return [];
  }

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"user_id" = ${sqlUuid(where.user_id)}`,
    Prisma.sql`"report_date" >= ${where.rangeStart}`
  ];
  if (where.release_id) conditions.push(Prisma.sql`"release_id" = ${sqlUuid(where.release_id)}`);
  if (where.release_ids?.length) {
    conditions.push(Prisma.sql`"release_id" IN (${sqlUuidList(where.release_ids)})`);
  }
  if (where.period_days) {
    conditions.push(
      Prisma.sql`("period_days" = ${where.period_days} OR ${buildLegacyPeriodHourCondition(where.period_days)})`
    );
  }
  if (where.country) conditions.push(Prisma.sql`"country" = ${where.country}`);
  if (where.upc) conditions.push(Prisma.sql`"upc" = ${where.upc}`);
  if (where.platform) conditions.push(Prisma.sql`"platform" = ${where.platform}`);

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        report_date: Date;
        platform: string | null;
        streams: bigint | number | null;
        pay_streams: bigint | number | null;
      }>
    >(Prisma.sql`
      SELECT
        "report_date" AS "report_date",
        "platform" AS "platform",
        SUM("streams")::bigint AS "streams",
        SUM("pay_streams")::bigint AS "pay_streams"
      FROM "analytics_report_snapshots"
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY "report_date", "platform"
      ORDER BY "report_date" ASC, "platform" ASC
    `);

    const byDate = new Map<string, AnalyticsPlatformsChartPoint["values"]>();
    for (const row of rows) {
      const date = toDateKey(row.report_date);
      const bucket = byDate.get(date) ?? [];
      bucket.push({
        platform: row.platform ?? "Unknown",
        streams: toNumber(row.streams),
        pay_streams: toNumber(row.pay_streams)
      });
      byDate.set(date, bucket);
    }

    return Array.from(byDate.entries()).map(([date, values]) => ({
      date,
      values: values.sort((left, right) => right.streams - left.streams)
    }));
  } catch (error) {
    if (isRawPlatformQueryUnavailableError(error)) {
      return [];
    }
    throw error;
  }
}

export type AnalyticsTrend = "up" | "down" | "flat" | "new";

export interface AnalyticsChartPoint {
  date: string;
  streams: number;
  pay_streams: number;
}

export interface AnalyticsPlatformsChartPoint {
  date: string;
  values: Array<{
    platform: string;
    streams: number;
    pay_streams: number;
  }>;
}

export interface AnalyticsOverviewResponse {
  totalStreams: number;
  totalPayStreams: number;
  streamsChangePercent: number | null;
  payStreamsChangePercent: number | null;
  latestReportDate: string | null;
  topPlatform: string | null;
  platforms_count: number;
  platformsBreakdown: Array<{
    platform: string;
    streams: number;
    pay_streams: number;
    sharePercent: number;
    changePercent: number | null;
  }>;
  chart: AnalyticsChartPoint[];
  platformsChart: AnalyticsPlatformsChartPoint[];
}

export interface AnalyticsReleaseListItem {
  release_id: string;
  title: string;
  artist: string;
  upc: string;
  streams: number;
  pay_streams: number;
  changePercent: number | null;
  trend: AnalyticsTrend;
}

export interface AnalyticsReleaseDetailsResponse {
  release_id: string;
  title: string;
  artist: string;
  upc: string;
  totalStreams: number;
  totalPayStreams: number;
  streamsChangePercent: number | null;
  payStreamsChangePercent: number | null;
  latestReportDate: string | null;
  countriesBreakdown: Array<{
    country: string;
    streams: number;
    pay_streams: number;
  }>;
  chart: AnalyticsChartPoint[];
}

export interface AnalyticsOverviewParams {
  user_id: string;
  release_id?: string;
  country?: string;
  upc?: string;
  platform?: string;
  days?: number;
}

function clampDays(value: number | undefined): number {
  return normalizeAnalyticsPeriodDays(value);
}

function emptyAnalyticsOverview(): AnalyticsOverviewResponse {
  return {
    totalStreams: 0,
    totalPayStreams: 0,
    streamsChangePercent: 0,
    payStreamsChangePercent: 0,
    latestReportDate: null,
    topPlatform: null,
    platforms_count: 0,
    platformsBreakdown: [],
    chart: [],
    platformsChart: []
  };
}

export async function listAnalyticsAccessibleReleaseIds(
  prisma: PrismaClient,
  params: { user_id: string; release_id?: string }
): Promise<string[]> {
  const releases = await prisma.release.findMany({
    where: {
      userId: params.user_id,
      ...(params.release_id ? { id: params.release_id } : {})
    },
    select: {
      id: true,
      status: true,
      confirmed: true,
      upc: true,
      roles: true
    }
  });

  const approvedReleaseIds = releases
    .filter((release) =>
      shouldTreatReleaseAsApproved({
        status: release.status,
        confirmed: release.confirmed,
        upc: release.upc,
        roles: release.roles
      })
    )
    .map((release) => release.id);

  const hiddenReleaseIds = releases
    .map((release) => release.id)
    .filter((releaseId) => !approvedReleaseIds.includes(releaseId));

  if (hiddenReleaseIds.length === 0) {
    return approvedReleaseIds;
  }

  let snapshotBackedReleaseIds: string[] = [];

  try {
    const rows = await prisma.analytics_report_snapshots.groupBy({
      by: ["release_id"],
      where: {
        user_id: params.user_id,
        release_id: { in: hiddenReleaseIds }
      }
    });
    snapshotBackedReleaseIds = rows.map((row) => row.release_id);
  } catch {
    if (hasRawQueryClient(prisma)) {
      const rows = await prisma.$queryRaw<Array<{ release_id: string }>>(Prisma.sql`
        SELECT DISTINCT "release_id" AS "release_id"
        FROM "analytics_report_snapshots"
        WHERE "user_id" = ${sqlUuid(params.user_id)}
          AND "release_id" IN (${sqlUuidList(hiddenReleaseIds)})
      `);
      snapshotBackedReleaseIds = rows.map((row) => row.release_id);
    }
  }

  return Array.from(new Set([...approvedReleaseIds, ...snapshotBackedReleaseIds]));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const MAX_READABLE_CHANGE_PERCENT = 150;

function clampReadableChangePercent(value: number): number {
  return Math.max(-MAX_READABLE_CHANGE_PERCENT, Math.min(MAX_READABLE_CHANGE_PERCENT, value));
}

function calculateChangePercent(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current > 0) return null;
    return 0;
  }

  const percent = ((current - previous) / previous) * 100;
  return Number(clampReadableChangePercent(percent).toFixed(2));
}

function buildReportRangeFromLatest(latest: Date, days: number): Date {
  const start = new Date(latest);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return start;
}

async function buildOverviewFromUpcs(
  prisma: PrismaClient,
  params: {
    upcs: string[];
    days: number;
    country?: string;
    platform?: string;
    upc?: string;
  }
): Promise<AnalyticsOverviewResponse | null> {
  if (!hasRawQueryClient(prisma) || params.upcs.length === 0) {
    return null;
  }

  const targetUpcs = params.upc ? params.upcs.filter((item) => item === params.upc) : params.upcs;
  if (targetUpcs.length === 0) {
    return null;
  }

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"upc" IN (${Prisma.join(targetUpcs)})`,
    Prisma.sql`("period_days" = ${params.days} OR ${buildLegacyPeriodHourCondition(params.days)})`
  ];
  if (params.country) conditions.push(Prisma.sql`"country" = ${params.country}`);
  if (params.platform) conditions.push(Prisma.sql`"platform" = ${params.platform}`);

  const latestRows = await prisma.$queryRaw<
    Array<{ report_date: Date; streams: bigint | number | null; pay_streams: bigint | number | null }>
  >(Prisma.sql`
    SELECT
      "report_date" AS "report_date",
      SUM("streams")::bigint AS "streams",
      SUM("pay_streams")::bigint AS "pay_streams"
    FROM "analytics_report_snapshots"
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY "report_date"
    ORDER BY "report_date" DESC
    LIMIT 2
  `);

  if (latestRows.length === 0) {
    return null;
  }

  const current = latestRows[0];
  const previous = latestRows[1];
  const rangeStart = buildReportRangeFromLatest(current.report_date, params.days);
  const chartRows = await prisma.$queryRaw<
    Array<{ report_date: Date; streams: bigint | number | null; pay_streams: bigint | number | null }>
  >(Prisma.sql`
    SELECT
      "report_date" AS "report_date",
      SUM("streams")::bigint AS "streams",
      SUM("pay_streams")::bigint AS "pay_streams"
    FROM "analytics_report_snapshots"
    WHERE ${Prisma.join([...conditions, Prisma.sql`"report_date" >= ${rangeStart}`], " AND ")}
    GROUP BY "report_date"
    ORDER BY "report_date" ASC
  `);

  const currentStreams = toNumber(current.streams);
  const currentPayStreams = toNumber(current.pay_streams);
  const previousStreams = toNumber(previous?.streams ?? 0);
  const previousPayStreams = toNumber(previous?.pay_streams ?? 0);
  const periodStreams = chartRows.reduce((sum, row) => sum + toNumber(row.streams), 0);
  const periodPayStreams = chartRows.reduce((sum, row) => sum + toNumber(row.pay_streams), 0);

  return {
    totalStreams: periodStreams,
    totalPayStreams: periodPayStreams,
    streamsChangePercent: calculateChangePercent(currentStreams, previousStreams),
    payStreamsChangePercent: calculateChangePercent(currentPayStreams, previousPayStreams),
    latestReportDate: toDateKey(current.report_date),
    topPlatform: null,
    platforms_count: 0,
    platformsBreakdown: [],
    chart: chartRows.map((row) => ({
      date: toDateKey(row.report_date),
      streams: toNumber(row.streams),
      pay_streams: toNumber(row.pay_streams)
    })),
    platformsChart: []
  };
}

async function enrichOverviewWithPlatformChartsByUpcs(
  prisma: PrismaClient,
  params: {
    base: AnalyticsOverviewResponse;
    upcs: string[];
    days: number;
    country?: string;
    platform?: string;
    upc?: string;
  }
): Promise<AnalyticsOverviewResponse> {
  if (!hasRawQueryClient(prisma) || params.base.latestReportDate == null || params.upcs.length === 0) {
    return params.base;
  }

  const targetUpcs = params.upc ? params.upcs.filter((item) => item === params.upc) : params.upcs;
  if (targetUpcs.length === 0) {
    return params.base;
  }

  const baseConditions: Prisma.Sql[] = [
    Prisma.sql`"upc" IN (${Prisma.join(targetUpcs)})`,
    Prisma.sql`("period_days" = ${params.days} OR ${buildLegacyPeriodHourCondition(params.days)})`
  ];
  if (params.country) baseConditions.push(Prisma.sql`"country" = ${params.country}`);
  if (params.platform) baseConditions.push(Prisma.sql`"platform" = ${params.platform}`);

  const latestDate = new Date(`${params.base.latestReportDate}T00:00:00.000Z`);
  const rangeStart = buildReportRangeFromLatest(latestDate, params.days);

  const platformRows = await prisma.$queryRaw<
    Array<{ platform: string | null; streams: bigint | number | null; pay_streams: bigint | number | null }>
  >(Prisma.sql`
    SELECT
      "platform" AS "platform",
      SUM("streams")::bigint AS "streams",
      SUM("pay_streams")::bigint AS "pay_streams"
    FROM "analytics_report_snapshots"
    WHERE ${Prisma.join(baseConditions, " AND ")}
    GROUP BY "platform"
    ORDER BY SUM("streams") DESC
  `);

  const totalStreams = platformRows.reduce((sum, row) => sum + toNumber(row.streams), 0);
  const platformsBreakdown = platformRows.map((row) => {
    const streams = toNumber(row.streams);
    return {
      platform: row.platform ?? "Unknown",
      streams,
      pay_streams: toNumber(row.pay_streams),
      sharePercent: totalStreams > 0 ? Number(((streams / totalStreams) * 100).toFixed(3)) : 0,
      changePercent: null
    };
  });

  const platformChartRows = await prisma.$queryRaw<
    Array<{ report_date: Date; platform: string | null; streams: bigint | number | null; pay_streams: bigint | number | null }>
  >(Prisma.sql`
    SELECT
      "report_date" AS "report_date",
      "platform" AS "platform",
      SUM("streams")::bigint AS "streams",
      SUM("pay_streams")::bigint AS "pay_streams"
    FROM "analytics_report_snapshots"
    WHERE ${Prisma.join([...baseConditions, Prisma.sql`"report_date" >= ${rangeStart}`], " AND ")}
    GROUP BY "report_date", "platform"
    ORDER BY "report_date" ASC, "platform" ASC
  `);

  const chartByDate = new Map<string, AnalyticsPlatformsChartPoint["values"]>();
  for (const row of platformChartRows) {
    const dateKey = toDateKey(row.report_date);
    const bucket = chartByDate.get(dateKey) ?? [];
    bucket.push({
      platform: row.platform ?? "Unknown",
      streams: toNumber(row.streams),
      pay_streams: toNumber(row.pay_streams)
    });
    chartByDate.set(dateKey, bucket);
  }

  return {
    ...params.base,
    topPlatform: platformsBreakdown[0]?.platform ?? null,
    platforms_count: platformsBreakdown.length,
    platformsBreakdown,
    platformsChart: Array.from(chartByDate.entries()).map(([date, values]) => ({
      date,
      values: values.sort((left, right) => right.streams - left.streams)
    }))
  };
}

async function buildOverviewFromDailySummaries(
  prisma: PrismaClient,
  params: {
    user_id: string;
    release_id?: string;
    release_ids?: string[];
    days: number;
  }
): Promise<AnalyticsOverviewResponse | null> {
  const summaryRepo = getAnalyticsDailySummaryRepo(prisma);
  if (!summaryRepo?.findMany) {
    return null;
  }

  let rows;
  try {
    rows = await summaryRepo.findMany({
      where: {
        user_id: params.user_id,
        ...(params.release_id ? { release_id: params.release_id } : {}),
        ...(params.release_ids?.length ? { release_id: { in: params.release_ids } } : {})
      },
      orderBy: {
        report_date: "asc"
      }
    });
  } catch (error) {
    if (isAnalyticsSummaryUnavailableError(error)) {
      return null;
    }
    throw error;
  }

  const filteredRows = rows.filter((row) => matchesAnalyticsPeriodVariant(row.report_date, params.days));
  if (filteredRows.length === 0) {
    return null;
  }

  const byDate = new Map<string, { report_date: Date; streams: number; pay_streams: number }>();
  for (const row of filteredRows) {
    const key = row.report_date.toISOString();
    const bucket = byDate.get(key) ?? {
      report_date: row.report_date,
      streams: 0,
      pay_streams: 0
    };
    bucket.streams += row.total_streams ?? 0;
    bucket.pay_streams += row.total_pay_streams ?? 0;
    byDate.set(key, bucket);
  }

  const groupedRows = Array.from(byDate.values()).sort(
    (left, right) => left.report_date.getTime() - right.report_date.getTime()
  );
  const current = groupedRows[groupedRows.length - 1];
  const previous = groupedRows[groupedRows.length - 2];
  if (!current) {
    return null;
  }

  const rangeStart = buildReportRangeFromLatest(current.report_date, params.days);
  const chartRows = groupedRows.filter((row) => row.report_date >= rangeStart);
  const totalStreams = chartRows.reduce((sum, row) => sum + row.streams, 0);
  const totalPayStreams = chartRows.reduce((sum, row) => sum + row.pay_streams, 0);

  return {
    totalStreams,
    totalPayStreams,
    streamsChangePercent: calculateChangePercent(current.streams, previous?.streams ?? 0),
    payStreamsChangePercent: calculateChangePercent(current.pay_streams, previous?.pay_streams ?? 0),
    latestReportDate: toDateKey(current.report_date),
    topPlatform: null,
    platforms_count: 0,
    platformsBreakdown: [],
    chart: chartRows.map((row) => ({
      date: toDateKey(row.report_date),
      streams: row.streams,
      pay_streams: row.pay_streams
    })),
    platformsChart: []
  };
}

async function buildPlatformChartsFromSummaries(
  prisma: PrismaClient,
  params: {
    user_id: string;
    release_id?: string;
    release_ids?: string[];
    days: number;
    latestReportDate: string | null;
  }
): Promise<Pick<AnalyticsOverviewResponse, "topPlatform" | "platforms_count" | "platformsBreakdown" | "platformsChart"> | null> {
  const platformRepo = getAnalyticsPlatformSummaryRepo(prisma);
  if (!platformRepo?.findMany || !params.latestReportDate) {
    return null;
  }

  let rows;
  try {
    rows = await platformRepo.findMany({
      where: {
        user_id: params.user_id,
        ...(params.release_id ? { release_id: params.release_id } : {}),
        ...(params.release_ids?.length ? { release_id: { in: params.release_ids } } : {})
      },
      orderBy: {
        report_date: "asc"
      }
    });
  } catch (error) {
    if (isAnalyticsSummaryUnavailableError(error)) {
      return null;
    }
    throw error;
  }

  const filteredRows = rows.filter((row) => matchesAnalyticsPeriodVariant(row.report_date, params.days));
  if (filteredRows.length === 0) {
    return null;
  }

  const latestDate = new Date(`${params.latestReportDate}T00:00:00.000Z`);
  const rangeStart = buildReportRangeFromLatest(latestDate, params.days);

  const totalsByPlatform = new Map<string, { streams: number; pay_streams: number }>();
  const chartByDate = new Map<string, Map<string, { streams: number; pay_streams: number }>>();

  for (const row of filteredRows) {
    const platform = row.platform || "Unknown";
    const totals = totalsByPlatform.get(platform) ?? { streams: 0, pay_streams: 0 };
    totals.streams += row.streams ?? 0;
    totals.pay_streams += row.pay_streams ?? 0;
    totalsByPlatform.set(platform, totals);

    if (row.report_date < rangeStart) continue;

    const dateKey = toDateKey(row.report_date);
    const byPlatform = chartByDate.get(dateKey) ?? new Map<string, { streams: number; pay_streams: number }>();
    const point = byPlatform.get(platform) ?? { streams: 0, pay_streams: 0 };
    point.streams += row.streams ?? 0;
    point.pay_streams += row.pay_streams ?? 0;
    byPlatform.set(platform, point);
    chartByDate.set(dateKey, byPlatform);
  }

  const totalStreams = Array.from(totalsByPlatform.values()).reduce((sum, item) => sum + item.streams, 0);
  const platformsBreakdown = Array.from(totalsByPlatform.entries())
    .map(([platform, totals]) => ({
      platform,
      streams: totals.streams,
      pay_streams: totals.pay_streams,
      sharePercent: totalStreams > 0 ? Number(((totals.streams / totalStreams) * 100).toFixed(3)) : 0,
      changePercent: null
    }))
    .sort((left, right) => right.streams - left.streams || left.platform.localeCompare(right.platform, "ru"));

  const platformsChart = Array.from(chartByDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, platformMap]) => ({
      date,
      values: Array.from(platformMap.entries())
        .map(([platform, totals]) => ({
          platform,
          streams: totals.streams,
          pay_streams: totals.pay_streams
        }))
        .sort((left, right) => right.streams - left.streams)
    }));

  return {
    topPlatform: platformsBreakdown[0]?.platform ?? null,
    platforms_count: platformsBreakdown.length,
    platformsBreakdown,
    platformsChart
  };
}

async function listAnalyticsReleasesFromDailySummaries(
  prisma: PrismaClient,
  params: {
    user_id: string;
    release_ids: string[];
    days: number;
  }
): Promise<AnalyticsReleaseListItem[]> {
  const summaryRepo = getAnalyticsDailySummaryRepo(prisma);
  if (!summaryRepo?.findMany || params.release_ids.length === 0) {
    return [];
  }

  let rows;
  try {
    rows = await summaryRepo.findMany({
      where: {
        user_id: params.user_id,
        release_id: {
          in: params.release_ids
        }
      },
      orderBy: {
        report_date: "asc"
      }
    });
  } catch (error) {
    if (isAnalyticsSummaryUnavailableError(error)) {
      return [];
    }
    throw error;
  }

  const filteredRows = rows.filter(
    (row) => row.release_id && matchesAnalyticsPeriodVariant(row.report_date, params.days)
  );
  if (filteredRows.length === 0) {
    return [];
  }

  const totalsByRelease = new Map<string, { streams: number; pay_streams: number }>();
  for (const row of filteredRows) {
    const releaseId = row.release_id as string;
    const totals = totalsByRelease.get(releaseId) ?? { streams: 0, pay_streams: 0 };
    totals.streams += row.total_streams ?? 0;
    totals.pay_streams += row.total_pay_streams ?? 0;
    totalsByRelease.set(releaseId, totals);
  }

  const releaseIds = Array.from(totalsByRelease.keys());
  const releasesMeta = await prisma.release.findMany({
    where: {
      id: { in: releaseIds },
      userId: params.user_id
    },
    select: {
      id: true,
      title: true,
      upc: true,
      user: {
        select: {
          name: true
        }
      }
    },
    orderBy: { date: "desc" }
  });

  return releasesMeta.map((meta) => {
    const totals = totalsByRelease.get(meta.id);
    return {
      release_id: meta.id,
      title: meta.title,
      artist: meta.user.name,
      upc: meta.upc ?? "",
      streams: totals?.streams ?? 0,
      pay_streams: totals?.pay_streams ?? 0,
      changePercent: null,
      trend: "flat" as const
    };
  });
}

function normalizeCountry(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized || undefined;
}

function normalizeUpc(value: string | undefined): string | undefined {
  const normalized = normalizeAnalyticsUpc(value);
  return normalized || undefined;
}

function normalizePlatform(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const normalized = normalizeAnalyticsPlatform(raw);
  return normalized || undefined;
}

async function buildOverviewFromSnapshots(
  prisma: PrismaClient,
  params: {
    where: Prisma.analytics_report_snapshotsWhereInput;
    days: number;
  }
): Promise<AnalyticsOverviewResponse | null> {
  const latestGroups = await prisma.analytics_report_snapshots.groupBy({
    by: ["report_date"],
    where: params.where,
    _sum: {
      streams: true,
      pay_streams: true
    },
    orderBy: {
      report_date: "desc"
    },
    take: 2
  });

  if (latestGroups.length === 0) {
    if (!hasRawQueryClient(prisma) || !("period_days" in params.where) || !params.where.period_days) {
      return null;
    }

    const baseConditions: Prisma.Sql[] = [];
    const userId = params.where.user_id;
    if (typeof userId === "string") {
      baseConditions.push(Prisma.sql`"user_id" = ${sqlUuid(userId)}`);
    }

    const releaseId = params.where.release_id;
    if (typeof releaseId === "string") {
      baseConditions.push(Prisma.sql`"release_id" = ${sqlUuid(releaseId)}`);
    } else if (
      releaseId &&
      typeof releaseId === "object" &&
      "in" in releaseId &&
      Array.isArray(releaseId.in) &&
      releaseId.in.length > 0
    ) {
      baseConditions.push(Prisma.sql`"release_id" IN (${sqlUuidList(releaseId.in)})`);
    }

    if (typeof params.where.country === "string") {
      baseConditions.push(Prisma.sql`"country" = ${params.where.country}`);
    }
    if (typeof params.where.upc === "string") {
      baseConditions.push(Prisma.sql`"upc" = ${params.where.upc}`);
    }
    if (typeof params.where.platform === "string") {
      baseConditions.push(Prisma.sql`"platform" = ${params.where.platform}`);
    }

    baseConditions.push(buildLegacyPeriodHourCondition(params.where.period_days as number));

    const latestRows = await prisma.$queryRaw<
      Array<{ report_date: Date; streams: bigint | number | null; pay_streams: bigint | number | null }>
    >(Prisma.sql`
      SELECT
        "report_date" AS "report_date",
        SUM("streams")::bigint AS "streams",
        SUM("pay_streams")::bigint AS "pay_streams"
      FROM "analytics_report_snapshots"
      WHERE ${Prisma.join(baseConditions, " AND ")}
      GROUP BY "report_date"
      ORDER BY "report_date" DESC
      LIMIT 2
    `);

    if (latestRows.length === 0) return null;

    const current = latestRows[0];
    const previous = latestRows[1];
    const rangeStart = buildReportRangeFromLatest(current.report_date, params.days);
    const chartRows = await prisma.$queryRaw<
      Array<{ report_date: Date; streams: bigint | number | null; pay_streams: bigint | number | null }>
    >(Prisma.sql`
      SELECT
        "report_date" AS "report_date",
        SUM("streams")::bigint AS "streams",
        SUM("pay_streams")::bigint AS "pay_streams"
      FROM "analytics_report_snapshots"
      WHERE ${Prisma.join([...baseConditions, Prisma.sql`"report_date" >= ${rangeStart}`], " AND ")}
      GROUP BY "report_date"
      ORDER BY "report_date" ASC
    `);

    const currentStreams = toNumber(current.streams);
    const currentPayStreams = toNumber(current.pay_streams);
    const previousStreams = toNumber(previous?.streams ?? 0);
    const previousPayStreams = toNumber(previous?.pay_streams ?? 0);
    const periodStreams = chartRows.reduce((sum, row) => sum + toNumber(row.streams), 0);
    const periodPayStreams = chartRows.reduce((sum, row) => sum + toNumber(row.pay_streams), 0);

    return {
      totalStreams: periodStreams,
      totalPayStreams: periodPayStreams,
      streamsChangePercent: calculateChangePercent(currentStreams, previousStreams),
      payStreamsChangePercent: calculateChangePercent(currentPayStreams, previousPayStreams),
      latestReportDate: toDateKey(current.report_date),
      topPlatform: null,
      platforms_count: 0,
      platformsBreakdown: [],
      chart: chartRows.map((row) => ({
        date: toDateKey(row.report_date),
        streams: toNumber(row.streams),
        pay_streams: toNumber(row.pay_streams)
      })),
      platformsChart: []
    };
  }

  const current = latestGroups[0];
  const previous = latestGroups[1];
  const rangeStart = buildReportRangeFromLatest(current.report_date, params.days);

  const chartGroups = await prisma.analytics_report_snapshots.groupBy({
    by: ["report_date"],
    where: {
      ...params.where,
      report_date: {
        gte: rangeStart
      }
    },
    _sum: {
      streams: true,
      pay_streams: true
    },
    orderBy: {
      report_date: "asc"
    }
  });

  const currentStreams = current._sum.streams ?? 0;
  const currentPayStreams = current._sum.pay_streams ?? 0;
  const previousStreams = previous?._sum.streams ?? 0;
  const previousPayStreams = previous?._sum.pay_streams ?? 0;
  const periodStreams = chartGroups.reduce((sum, row) => sum + (row._sum.streams ?? 0), 0);
  const periodPayStreams = chartGroups.reduce((sum, row) => sum + (row._sum.pay_streams ?? 0), 0);

  return {
    totalStreams: periodStreams,
    totalPayStreams: periodPayStreams,
    streamsChangePercent: calculateChangePercent(currentStreams, previousStreams),
    payStreamsChangePercent: calculateChangePercent(currentPayStreams, previousPayStreams),
    latestReportDate: toDateKey(current.report_date),
    topPlatform: null,
    platforms_count: 0,
    platformsBreakdown: [],
    chart: chartGroups.map((row) => ({
      date: toDateKey(row.report_date),
      streams: row._sum.streams ?? 0,
      pay_streams: row._sum.pay_streams ?? 0
    })),
    platformsChart: []
  };
}

async function enrichOverviewWithPlatformCharts(
  prisma: PrismaClient,
  params: {
    base: AnalyticsOverviewResponse;
    user_id: string;
    release_id?: string;
    release_ids?: string[];
    period_days?: number;
    country?: string;
    upc?: string;
    platform?: string;
    days: number;
  }
): Promise<AnalyticsOverviewResponse> {
  const platformsBreakdown = await buildAllTimePlatformsBreakdown(prisma, {
    user_id: params.user_id,
    ...(params.release_id ? { release_id: params.release_id } : {}),
    ...(params.release_ids?.length ? { release_ids: params.release_ids } : {}),
    ...(params.period_days ? { period_days: params.period_days } : {}),
    ...(params.country ? { country: params.country } : {}),
    ...(params.upc ? { upc: params.upc } : {}),
    ...(params.platform ? { platform: params.platform } : {}),
    fallbackStreams: params.base.totalStreams,
    fallbackPayStreams: params.base.totalPayStreams
  });

  const latestChartPoint = params.base.chart[params.base.chart.length - 1];
  const latestDate = latestChartPoint ? new Date(`${latestChartPoint.date}T00:00:00.000Z`) : null;
  const rangeStart = latestDate ? buildReportRangeFromLatest(latestDate, params.days) : null;
  const platformsChart = rangeStart
    ? await groupSnapshotPlatformsChartCompat(prisma, {
        user_id: params.user_id,
        ...(params.release_id ? { release_id: params.release_id } : {}),
        ...(params.release_ids?.length ? { release_ids: params.release_ids } : {}),
        ...(params.period_days ? { period_days: params.period_days } : {}),
        ...(params.country ? { country: params.country } : {}),
        ...(params.upc ? { upc: params.upc } : {}),
        ...(params.platform ? { platform: params.platform } : {}),
        rangeStart
      })
    : [];

  return {
    ...params.base,
    topPlatform: platformsBreakdown[0]?.platform ?? null,
    platforms_count: platformsBreakdown.length,
    platformsBreakdown,
    platformsChart
  };
}

export async function getAnalyticsOverview(
  prisma: PrismaClient,
  params: AnalyticsOverviewParams
): Promise<AnalyticsOverviewResponse> {
  const days = clampDays(params.days);
  const country = normalizeCountry(params.country);
  const upc = normalizeUpc(params.upc);
  const platform = normalizePlatform(params.platform);
  const approvedReleaseIds = await listAnalyticsAccessibleReleaseIds(prisma, {
    user_id: params.user_id,
    ...(params.release_id ? { release_id: params.release_id } : {})
  });

  if (approvedReleaseIds.length === 0) {
    return emptyAnalyticsOverview();
  }

  const canUseSummaryFastPath = !country && !upc && !platform;
  if (canUseSummaryFastPath) {
    try {
      const summaryOverview = await buildOverviewFromDailySummaries(prisma, {
        user_id: params.user_id,
        ...(params.release_id ? { release_id: params.release_id } : {}),
        ...(!params.release_id ? { release_ids: approvedReleaseIds } : {}),
        days
      });

      if (summaryOverview) {
        const platformSummary = await buildPlatformChartsFromSummaries(prisma, {
          user_id: params.user_id,
          ...(params.release_id ? { release_id: params.release_id } : {}),
          ...(!params.release_id ? { release_ids: approvedReleaseIds } : {}),
          days,
          latestReportDate: summaryOverview.latestReportDate
        });

        return platformSummary
          ? {
              ...summaryOverview,
              ...platformSummary
            }
          : summaryOverview;
      }
    } catch (error) {
      if (!isAnalyticsSummaryUnavailableError(error)) {
        throw error;
      }
    }
  }

  const releaseFilter = params.release_id
    ? { release_id: params.release_id }
    : { release_id: { in: approvedReleaseIds } };

  const snapshotWhere: Prisma.analytics_report_snapshotsWhereInput = {
    user_id: params.user_id,
    ...releaseFilter,
    period_days: days,
    ...(country ? { country } : {}),
    ...(upc ? { upc } : {}),
    ...(platform ? { platform } : {})
  };

  const snapshotOverview = await buildOverviewFromSnapshots(prisma, {
    where: snapshotWhere,
    days
  });
  if (!snapshotOverview) {
    const accessibleReleases = await prisma.release.findMany({
      where: {
        id: { in: approvedReleaseIds },
        userId: params.user_id
      },
      select: {
        upc: true
      }
    });

    const accessibleUpcs = accessibleReleases
      .map((release) => normalizeUpc(release.upc ?? undefined))
      .filter((value): value is string => Boolean(value));

    const fallbackOverview = await buildOverviewFromUpcs(prisma, {
      upcs: accessibleUpcs,
      days,
      ...(country ? { country } : {}),
      ...(platform ? { platform } : {}),
      ...(upc ? { upc } : {})
    });

    return fallbackOverview
      ? enrichOverviewWithPlatformChartsByUpcs(prisma, {
          base: fallbackOverview,
          upcs: accessibleUpcs,
          days,
          ...(country ? { country } : {}),
          ...(platform ? { platform } : {}),
          ...(upc ? { upc } : {})
        })
      : emptyAnalyticsOverview();
  }

  return enrichOverviewWithPlatformCharts(prisma, {
    base: snapshotOverview,
    user_id: params.user_id,
    ...(params.release_id ? { release_id: params.release_id } : {}),
    ...(!params.release_id ? { release_ids: approvedReleaseIds } : {}),
    period_days: days,
    ...(country ? { country } : {}),
    ...(upc ? { upc } : {}),
    ...(platform ? { platform } : {}),
    days
  });
}

export async function listAnalyticsReleases(
  prisma: PrismaClient,
  params: {
    user_id: string;
    country?: string;
    upc?: string;
    platform?: string;
    days?: number;
  }
): Promise<AnalyticsReleaseListItem[]> {
  const country = normalizeCountry(params.country);
  const upc = normalizeUpc(params.upc);
  const platform = normalizePlatform(params.platform);
  const days = clampDays(params.days);
  const approvedReleaseIds = await listAnalyticsAccessibleReleaseIds(prisma, {
    user_id: params.user_id
  });
  if (approvedReleaseIds.length === 0) return [];

  const canUseSummaryFastPath = !country && !upc && !platform;
  if (canUseSummaryFastPath) {
    try {
      const summaryItems = await listAnalyticsReleasesFromDailySummaries(prisma, {
        user_id: params.user_id,
        release_ids: approvedReleaseIds,
        days
      });
      if (summaryItems.length > 0) {
        return summaryItems;
      }
    } catch (error) {
      if (!isAnalyticsSummaryUnavailableError(error)) {
        throw error;
      }
    }
  }

  let totalsRows:
    | Array<{
        release_id: string;
        _sum: {
          streams: number | null;
          pay_streams: number | null;
        };
      }>
    | [] = [];

  try {
    totalsRows = await prisma.analytics_report_snapshots.groupBy({
      by: ["release_id"],
      where: {
        user_id: params.user_id,
        release_id: { in: approvedReleaseIds },
        period_days: days,
        ...(country ? { country } : {}),
        ...(upc ? { upc } : {}),
        ...(platform ? { platform } : {})
      },
      _sum: {
        streams: true,
        pay_streams: true
      }
    });
  } catch {
    totalsRows = [];
  }

  let effectiveTotalsRows = totalsRows;
  if (effectiveTotalsRows.length === 0 && hasRawQueryClient(prisma)) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"user_id" = ${sqlUuid(params.user_id)}`,
      Prisma.sql`"release_id" IN (${sqlUuidList(approvedReleaseIds)})`
    ];
    conditions.push(
      Prisma.sql`("period_days" = ${days} OR ${buildLegacyPeriodHourCondition(days)})`
    );
    if (country) conditions.push(Prisma.sql`"country" = ${country}`);
    if (upc) conditions.push(Prisma.sql`"upc" = ${upc}`);
    if (platform) conditions.push(Prisma.sql`"platform" = ${platform}`);

    effectiveTotalsRows = await prisma.$queryRaw<
      Array<{ release_id: string; _sum_streams: bigint | number | null; _sum_pay_streams: bigint | number | null }>
    >(Prisma.sql`
      SELECT
        "release_id" AS "release_id",
        SUM("streams")::bigint AS "_sum_streams",
        SUM("pay_streams")::bigint AS "_sum_pay_streams"
      FROM "analytics_report_snapshots"
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY "release_id"
    `).then((rows) =>
      rows.map((row) => ({
        release_id: row.release_id,
        _sum: {
          streams: toNumber(row._sum_streams),
          pay_streams: toNumber(row._sum_pay_streams)
        }
      }))
    );
  }

  let releasesMeta = await prisma.release.findMany({
    where: {
      id: { in: approvedReleaseIds },
      userId: params.user_id
    },
    select: {
      id: true,
      title: true,
      upc: true,
      user: {
        select: {
          name: true
        }
      }
    },
    orderBy: { date: "desc" }
  });

  if (effectiveTotalsRows.length === 0 && hasRawQueryClient(prisma)) {
    const metaByUpc = new Map(
      releasesMeta
        .map((meta) => {
          const normalizedMetaUpc = normalizeUpc(meta.upc ?? undefined);
          return normalizedMetaUpc ? [normalizedMetaUpc, meta] : null;
        })
        .filter((entry): entry is [string, (typeof releasesMeta)[number]] => Boolean(entry))
    );

    const targetUpcs = upc
      ? Array.from(metaByUpc.keys()).filter((value) => value === upc)
      : Array.from(metaByUpc.keys());

    if (targetUpcs.length > 0) {
      const conditions: Prisma.Sql[] = [
        Prisma.sql`"upc" IN (${Prisma.join(targetUpcs)})`,
        Prisma.sql`("period_days" = ${days} OR ${buildLegacyPeriodHourCondition(days)})`
      ];
      if (country) conditions.push(Prisma.sql`"country" = ${country}`);
      if (platform) conditions.push(Prisma.sql`"platform" = ${platform}`);

      const upcTotalsRows = await prisma.$queryRaw<
        Array<{ upc: string; _sum_streams: bigint | number | null; _sum_pay_streams: bigint | number | null }>
      >(Prisma.sql`
        SELECT
          "upc" AS "upc",
          SUM("streams")::bigint AS "_sum_streams",
          SUM("pay_streams")::bigint AS "_sum_pay_streams"
        FROM "analytics_report_snapshots"
        WHERE ${Prisma.join(conditions, " AND ")}
        GROUP BY "upc"
      `);

      effectiveTotalsRows = upcTotalsRows
        .map((row) => {
          const meta = metaByUpc.get(normalizeUpc(row.upc) ?? "");
          if (!meta) return null;

          return {
            release_id: meta.id,
            _sum: {
              streams: toNumber(row._sum_streams),
              pay_streams: toNumber(row._sum_pay_streams)
            }
          };
        })
        .filter(
          (
            row
          ): row is {
            release_id: string;
            _sum: {
              streams: number | null;
              pay_streams: number | null;
            };
          } => Boolean(row)
        );
    }
  }

  if (upc) {
    releasesMeta = releasesMeta.filter((meta) => normalizeUpc(meta.upc ?? undefined) === upc);
  }

  if (releasesMeta.length === 0) return [];

  const totalsByRelease = new Map(
    effectiveTotalsRows.map((row) => [
      row.release_id,
      {
        streams: row._sum.streams ?? 0,
        pay_streams: row._sum.pay_streams ?? 0
      }
    ])
  );

  return releasesMeta.map((meta) => {
    const totals = totalsByRelease.get(meta.id);
    return {
      release_id: meta.id,
      title: meta.title,
      artist: meta.user.name,
      upc: meta.upc ?? "",
      streams: totals?.streams ?? 0,
      pay_streams: totals?.pay_streams ?? 0,
      changePercent: null,
      trend: "flat" as const
    };
  });
}

export async function getAnalyticsReleaseDetails(
  prisma: PrismaClient,
  params: {
    user_id: string;
    release_id: string;
    days?: number;
  }
): Promise<AnalyticsReleaseDetailsResponse | null> {
  const days = clampDays(params.days);

  const release = await prisma.release.findFirst({
    where: {
      id: params.release_id,
      userId: params.user_id
    },
    select: {
      id: true,
      title: true,
      upc: true,
      status: true,
      confirmed: true,
      roles: true,
      user: {
        select: { name: true }
      }
    }
  });

  if (
    !release ||
    !shouldTreatReleaseAsApproved({
      status: release.status,
      confirmed: release.confirmed,
      upc: release.upc,
      roles: release.roles
    })
  ) {
    return null;
  }

  const snapshotOverview = await buildOverviewFromSnapshots(prisma, {
    where: {
      user_id: params.user_id,
      release_id: params.release_id,
      period_days: days
    },
    days
  });

  const latestReportDate = snapshotOverview?.latestReportDate
    ? new Date(`${snapshotOverview.latestReportDate}T00:00:00.000Z`)
    : null;

  const countriesBreakdown = latestReportDate
    ? await prisma.analytics_report_snapshots.groupBy({
        by: ["country"],
        where: {
          user_id: params.user_id,
          release_id: params.release_id,
          period_days: days,
          report_date: {
            gte: latestReportDate,
            lt: new Date(latestReportDate.getTime() + 24 * 60 * 60 * 1000)
          }
        },
        _sum: {
          streams: true,
          pay_streams: true
        },
        orderBy: {
          _sum: {
            streams: "desc"
          }
        }
      })
    : [];

  const effectiveCountriesBreakdown =
    countriesBreakdown.length > 0 || !latestReportDate || !hasRawQueryClient(prisma)
      ? countriesBreakdown
      : await prisma.$queryRaw<
          Array<{ country: string; streams: bigint | number | null; pay_streams: bigint | number | null }>
        >(Prisma.sql`
          SELECT
            "country" AS "country",
            SUM("streams")::bigint AS "streams",
            SUM("pay_streams")::bigint AS "pay_streams"
          FROM "analytics_report_snapshots"
          WHERE "user_id" = ${sqlUuid(params.user_id)}
            AND "release_id" = ${sqlUuid(params.release_id)}
            AND DATE("report_date") = DATE(${latestReportDate})
            AND ${buildLegacyPeriodHourCondition(days)}
          GROUP BY "country"
          ORDER BY SUM("streams") DESC
        `).then((rows) =>
          rows.map((row) => ({
            country: row.country,
            _sum: {
              streams: toNumber(row.streams),
              pay_streams: toNumber(row.pay_streams)
            }
          }))
        );

  return {
    release_id: release.id,
    title: release.title,
    artist: release.user.name,
    upc: release.upc ?? "",
    totalStreams: snapshotOverview?.totalStreams ?? 0,
    totalPayStreams: snapshotOverview?.totalPayStreams ?? 0,
    streamsChangePercent: snapshotOverview?.streamsChangePercent ?? 0,
    payStreamsChangePercent: snapshotOverview?.payStreamsChangePercent ?? 0,
    latestReportDate: snapshotOverview?.latestReportDate ?? null,
    countriesBreakdown: effectiveCountriesBreakdown.map((item) => ({
      country: item.country,
      streams: item._sum.streams ?? 0,
      pay_streams: item._sum.pay_streams ?? 0
    })),
    chart: snapshotOverview?.chart ?? []
  };
}
