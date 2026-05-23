// @ts-nocheck
import { Prisma, type PrismaClient } from "@prisma/client";
import { normalizeAnalyticsUpc } from "@/lib/analytics-upc";
import { normalizeAnalyticsPlatform } from "@/lib/analytics-platform";

type AnalyticsDailySummaryRepo = {
  findMany: (args: unknown) => Promise<
    Array<{
      report_date: Date;
      total_streams: number;
      total_pay_streams: number;
    }>
  >;
};

function getAnalyticsDailySummaryRepo(
  prisma: PrismaClient
): AnalyticsDailySummaryRepo | null {
  return (prisma as unknown as { analytics_daily_summaries?: AnalyticsDailySummaryRepo })
    .analytics_daily_summaries ?? null;
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

function toNumber(value: bigint | number | null): number {
  if (value == null) return 0;
  if (typeof value === "bigint") return Number(value);
  return value;
}

async function groupSnapshotPlatformsCompat(
  prisma: PrismaClient,
  where: {
    user_id: string;
    report_date?: Date;
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

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"user_id" = ${where.user_id}`
  ];
  if (where.report_date) conditions.push(Prisma.sql`"report_date" = ${where.report_date}`);
  if (where.release_id) conditions.push(Prisma.sql`"release_id" = ${where.release_id}`);
  if (where.release_ids?.length) {
    conditions.push(Prisma.sql`"release_id" IN (${Prisma.join(where.release_ids)})`);
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

export type AnalyticsTrend = "up" | "down" | "flat" | "new";

export interface AnalyticsChartPoint {
  date: string;
  streams: number;
  pay_streams: number;
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
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(90, Math.floor(value ?? 30)));
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
    chart: []
  };
}

async function getApprovedAnalyticsReleaseIds(
  prisma: PrismaClient,
  params: { user_id: string; release_id?: string }
): Promise<string[]> {
  const releases = await prisma.release.findMany({
    where: {
      userId: params.user_id,
      confirmed: true,
      status: "approved",
      ...(params.release_id ? { id: params.release_id } : {})
    },
    select: { id: true }
  });

  return releases.map((release) => release.id);
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

  if (latestGroups.length === 0) return null;

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
    }))
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
  const usesSnapshotAggregation = Boolean(country || upc || platform);
  const approvedReleaseIds = await getApprovedAnalyticsReleaseIds(prisma, {
    user_id: params.user_id,
    ...(params.release_id ? { release_id: params.release_id } : {})
  });

  if (approvedReleaseIds.length === 0) {
    return emptyAnalyticsOverview();
  }

  const releaseFilter = params.release_id
    ? { release_id: params.release_id }
    : { release_id: { in: approvedReleaseIds } };

  if (!usesSnapshotAggregation) {
    const dailySummaryRepo = getAnalyticsDailySummaryRepo(prisma);
    if (!dailySummaryRepo) {
      const fallback = await buildOverviewFromSnapshots(prisma, {
        where: {
          user_id: params.user_id,
          ...releaseFilter
        },
        days
      });
      if (fallback) return fallback;
      return {
        ...emptyAnalyticsOverview()
      };
    }

    const whereSummary: Prisma.analytics_daily_summariesWhereInput = {
      user_id: params.user_id,
      ...releaseFilter
    };

    let latestRows: Array<{
      report_date: Date;
      total_streams: number;
      total_pay_streams: number;
    }> = [];
    try {
      latestRows = await dailySummaryRepo.findMany({
        where: whereSummary,
        orderBy: { report_date: "desc" },
        take: 2,
        select: {
          report_date: true,
          total_streams: true,
          total_pay_streams: true
        }
      });
    } catch {
      const fallback = await buildOverviewFromSnapshots(prisma, {
        where: {
          user_id: params.user_id,
          ...releaseFilter
        },
        days
      });
      if (fallback) return fallback;
      return {
        ...emptyAnalyticsOverview()
      };
    }

    if (latestRows.length === 0) {
      const fallback = await buildOverviewFromSnapshots(prisma, {
        where: {
          user_id: params.user_id,
          ...releaseFilter
        },
        days
      });
      if (fallback) return fallback;
      return {
        ...emptyAnalyticsOverview()
      };
    }

    const current = latestRows[0];
    const previous = latestRows[1];
    const rangeStart = buildReportRangeFromLatest(current.report_date, days);

    let chartRows: Array<{
      report_date: Date;
      total_streams: number;
      total_pay_streams: number;
    }> = [];
    try {
      chartRows = await dailySummaryRepo.findMany({
        where: {
          ...whereSummary,
          report_date: {
            gte: rangeStart
          }
        },
        orderBy: { report_date: "asc" },
        select: {
          report_date: true,
          total_streams: true,
          total_pay_streams: true
        }
      });
    } catch {
      const fallback = await buildOverviewFromSnapshots(prisma, {
        where: {
          user_id: params.user_id,
          ...releaseFilter
        },
        days
      });
      if (fallback) return fallback;
      return emptyAnalyticsOverview();
    }

    const platformsBreakdown = await buildAllTimePlatformsBreakdown(prisma, {
      user_id: params.user_id,
      ...(params.release_id ? { release_id: params.release_id } : {}),
      ...(!params.release_id ? { release_ids: approvedReleaseIds } : {}),
      fallbackStreams: current.total_streams,
      fallbackPayStreams: current.total_pay_streams
    });

    const periodStreams = chartRows.reduce((sum, row) => sum + row.total_streams, 0);
    const periodPayStreams = chartRows.reduce((sum, row) => sum + row.total_pay_streams, 0);

    return {
      totalStreams: periodStreams,
      totalPayStreams: periodPayStreams,
      streamsChangePercent: calculateChangePercent(
        current.total_streams,
        previous?.total_streams ?? 0
      ),
      payStreamsChangePercent: calculateChangePercent(
        current.total_pay_streams,
        previous?.total_pay_streams ?? 0
      ),
      latestReportDate: toDateKey(current.report_date),
      topPlatform: platformsBreakdown[0]?.platform ?? null,
      platforms_count: platformsBreakdown.length,
      platformsBreakdown,
      chart: chartRows.map((row) => ({
        date: toDateKey(row.report_date),
        streams: row.total_streams,
        pay_streams: row.total_pay_streams
      }))
    };
  }

  const snapshotWhere: Prisma.analytics_report_snapshotsWhereInput = {
    user_id: params.user_id,
    ...releaseFilter,
    ...(country ? { country } : {}),
    ...(upc ? { upc } : {}),
    ...(platform ? { platform } : {})
  };

  const snapshotOverview = await buildOverviewFromSnapshots(prisma, {
    where: snapshotWhere,
    days
  });
  if (!snapshotOverview) {
    return {
      totalStreams: 0,
      totalPayStreams: 0,
      streamsChangePercent: 0,
      payStreamsChangePercent: 0,
      latestReportDate: null,
      topPlatform: null,
      platforms_count: 0,
      platformsBreakdown: [],
      chart: []
    };
  }

  const platformsBreakdown = await buildAllTimePlatformsBreakdown(prisma, {
    user_id: params.user_id,
    ...(params.release_id ? { release_id: params.release_id } : {}),
    ...(!params.release_id ? { release_ids: approvedReleaseIds } : {}),
    ...(country ? { country } : {}),
    ...(upc ? { upc } : {}),
    ...(platform ? { platform } : {}),
    fallbackStreams: snapshotOverview.totalStreams,
    fallbackPayStreams: snapshotOverview.totalPayStreams
  });

  return {
    ...snapshotOverview,
    topPlatform: platformsBreakdown[0]?.platform ?? null,
    platforms_count: platformsBreakdown.length,
    platformsBreakdown
  };
}

export async function listAnalyticsReleases(
  prisma: PrismaClient,
  params: {
    user_id: string;
    country?: string;
    upc?: string;
    platform?: string;
  }
): Promise<AnalyticsReleaseListItem[]> {
  const country = normalizeCountry(params.country);
  const upc = normalizeUpc(params.upc);
  const platform = normalizePlatform(params.platform);
  const usesSnapshotAggregation = Boolean(country || upc || platform);
  const approvedReleaseIds = await getApprovedAnalyticsReleaseIds(prisma, {
    user_id: params.user_id
  });
  if (approvedReleaseIds.length === 0) return [];

  if (usesSnapshotAggregation) {
    const totalsRows = await prisma.analytics_report_snapshots.groupBy({
      by: ["release_id"],
      where: {
        user_id: params.user_id,
        release_id: { in: approvedReleaseIds },
        ...(country ? { country } : {}),
        ...(upc ? { upc } : {}),
        ...(platform ? { platform } : {})
      },
      _sum: {
        streams: true,
        pay_streams: true
      }
    });

    const releaseIds = Array.from(new Set(totalsRows.map((item) => item.release_id)));
    const releasesMeta = releaseIds.length
      ? await prisma.release.findMany({
          where: {
            id: { in: releaseIds },
            userId: params.user_id,
            confirmed: true,
            status: "approved"
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
        })
      : [];
    const totalsByRelease = new Map(
      totalsRows.map((row) => [
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

  let totalsByRelease = new Map<string, { streams: number; pay_streams: number }>();
  try {
    const summaryTotals = await prisma.analytics_daily_summaries.groupBy({
      by: ["release_id"],
      where: {
        user_id: params.user_id,
        release_id: { in: approvedReleaseIds }
      },
      _sum: {
        total_streams: true,
        total_pay_streams: true
      }
    });
    totalsByRelease = new Map(
      summaryTotals
        .filter((row): row is typeof row & { release_id: string } => Boolean(row.release_id))
        .map((row) => [
          row.release_id,
          {
            streams: row._sum?.total_streams ?? 0,
            pay_streams: row._sum?.total_pay_streams ?? 0
          }
        ])
    );
  } catch {
    const snapshotTotals = await prisma.analytics_report_snapshots.groupBy({
      by: ["release_id"],
      where: {
        user_id: params.user_id,
        release_id: { in: approvedReleaseIds }
      },
      _sum: {
        streams: true,
        pay_streams: true
      }
    });
    totalsByRelease = new Map(
      snapshotTotals.map((row) => [
        row.release_id,
        {
          streams: row._sum.streams ?? 0,
          pay_streams: row._sum.pay_streams ?? 0
        }
      ])
    );
  }

  const allReleases = await prisma.release.findMany({
    where: {
      userId: params.user_id,
      confirmed: true,
      status: "approved"
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

  return allReleases.map((release) => {
    const totals = totalsByRelease.get(release.id);

    return {
      release_id: release.id,
      title: release.title,
      artist: release.user.name,
      upc: release.upc ?? "",
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
      userId: params.user_id,
      confirmed: true,
      status: "approved"
    },
    select: {
      id: true,
      title: true,
      upc: true,
      user: {
        select: { name: true }
      }
    }
  });

  if (!release) return null;

  const latestRows = await prisma.analytics_daily_summaries.findMany({
    where: {
      user_id: params.user_id,
      release_id: params.release_id
    },
    orderBy: { report_date: "desc" },
    take: 2,
    select: {
      report_date: true,
      total_streams: true,
      total_pay_streams: true
    }
  });

  if (latestRows.length === 0) {
    const snapshotOverview = await buildOverviewFromSnapshots(prisma, {
      where: {
        user_id: params.user_id,
        release_id: params.release_id
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
            report_date: latestReportDate
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
      countriesBreakdown: countriesBreakdown.map((item) => ({
        country: item.country,
        streams: item._sum.streams ?? 0,
        pay_streams: item._sum.pay_streams ?? 0
      })),
      chart: snapshotOverview?.chart ?? []
    };
  }

  const current = latestRows[0];
  const previous = latestRows[1];
  const rangeStart = buildReportRangeFromLatest(current.report_date, days);

  const chartRows = await prisma.analytics_daily_summaries.findMany({
    where: {
      user_id: params.user_id,
      release_id: params.release_id,
      report_date: {
        gte: rangeStart
      }
    },
    orderBy: {
      report_date: "asc"
    },
    select: {
      report_date: true,
      total_streams: true,
      total_pay_streams: true
    }
  });

  const countriesBreakdown = await prisma.analytics_report_snapshots.groupBy({
    by: ["country"],
    where: {
      user_id: params.user_id,
      release_id: params.release_id,
      report_date: current.report_date
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
  });

  return {
    release_id: release.id,
    title: release.title,
    artist: release.user.name,
    upc: release.upc ?? "",
    totalStreams: current.total_streams,
    totalPayStreams: current.total_pay_streams,
    streamsChangePercent: calculateChangePercent(
      current.total_streams,
      previous?.total_streams ?? 0
    ),
    payStreamsChangePercent: calculateChangePercent(
      current.total_pay_streams,
      previous?.total_pay_streams ?? 0
    ),
    latestReportDate: toDateKey(current.report_date),
    countriesBreakdown: countriesBreakdown.map((item) => ({
      country: item.country,
      streams: item._sum.streams ?? 0,
      pay_streams: item._sum.pay_streams ?? 0
    })),
      chart: chartRows.map((item) => ({
      date: toDateKey(item.report_date),
      streams: item.total_streams,
      pay_streams: item.total_pay_streams
    }))
  };
}
