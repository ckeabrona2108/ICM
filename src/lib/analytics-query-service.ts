import { Prisma, ReleaseStatus, type PrismaClient } from "@prisma/client";
import { normalizeAnalyticsUpc } from "@/lib/analytics-upc";
import { normalizeAnalyticsPlatform } from "@/lib/analytics-platform";

type AnalyticsDailySummaryRepo = {
  findMany: (args: unknown) => Promise<
    Array<{
      reportDate: Date;
      totalStreams: number;
      totalPayStreams: number;
    }>
  >;
};

function getAnalyticsDailySummaryRepo(
  prisma: PrismaClient
): AnalyticsDailySummaryRepo | null {
  return (prisma as { analyticsDailySummary?: AnalyticsDailySummaryRepo })
    .analyticsDailySummary ?? null;
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
    userId: string;
    reportDate?: Date;
    releaseId?: string;
    country?: string;
    upc?: string;
    platform?: string;
  }
): Promise<Array<{ platform: string | null; _sum: { streams: number; payStreams: number } }>> {
  try {
    const rows = await prisma.analyticsReportSnapshot.groupBy({
      by: ["platform"],
      where,
      _sum: {
        streams: true,
        payStreams: true
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
        payStreams: row._sum.payStreams ?? 0
      }
    }));
  } catch (error) {
    if (!isUnknownSnapshotPlatformFieldError(error)) throw error;
  }

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"user_id" = ${where.userId}`
  ];
  if (where.reportDate) conditions.push(Prisma.sql`"report_date" = ${where.reportDate}`);
  if (where.releaseId) conditions.push(Prisma.sql`"release_id" = ${where.releaseId}`);
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
        payStreams: toNumber(row.pay_streams)
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
    userId: string;
    releaseId?: string;
    country?: string;
    upc?: string;
    platform?: string;
    fallbackStreams?: number;
    fallbackPayStreams?: number;
  }
): Promise<AnalyticsOverviewResponse["platformsBreakdown"]> {
  const groups = await groupSnapshotPlatformsCompat(prisma, {
    userId: params.userId,
    ...(params.releaseId ? { releaseId: params.releaseId } : {}),
    ...(params.country ? { country: params.country } : {}),
    ...(params.upc ? { upc: params.upc } : {}),
    ...(params.platform ? { platform: params.platform } : {})
  });

  const totalStreams = groups.reduce((sum, item) => sum + (item._sum.streams ?? 0), 0);

  const breakdown = groups.map((item) => {
    const name = item.platform ?? "Unknown";
    const streams = item._sum.streams ?? 0;
    const payStreams = item._sum.payStreams ?? 0;
    return {
      platform: name,
      streams,
      payStreams,
      sharePercent: totalStreams > 0 ? Number((((streams / totalStreams) * 100)).toFixed(3)) : 0,
      changePercent: null
    };
  });

  if (breakdown.length === 0 && ((params.fallbackStreams ?? 0) > 0 || (params.fallbackPayStreams ?? 0) > 0)) {
    breakdown.push({
      platform: "Unknown",
      streams: params.fallbackStreams ?? 0,
      payStreams: params.fallbackPayStreams ?? 0,
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
  payStreams: number;
}

export interface AnalyticsOverviewResponse {
  totalStreams: number;
  totalPayStreams: number;
  streamsChangePercent: number | null;
  payStreamsChangePercent: number | null;
  latestReportDate: string | null;
  topPlatform: string | null;
  platformsCount: number;
  platformsBreakdown: Array<{
    platform: string;
    streams: number;
    payStreams: number;
    sharePercent: number;
    changePercent: number | null;
  }>;
  chart: AnalyticsChartPoint[];
}

export interface AnalyticsReleaseListItem {
  releaseId: string;
  title: string;
  artist: string;
  upc: string;
  streams: number;
  payStreams: number;
  changePercent: number | null;
  trend: AnalyticsTrend;
}

export interface AnalyticsReleaseDetailsResponse {
  releaseId: string;
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
    payStreams: number;
  }>;
  chart: AnalyticsChartPoint[];
}

export interface AnalyticsOverviewParams {
  userId: string;
  releaseId?: string;
  country?: string;
  upc?: string;
  platform?: string;
  days?: number;
}

function clampDays(value: number | undefined): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(90, Math.floor(value ?? 30)));
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

function toTrend(changePercent: number | null, current: number, previous: number): AnalyticsTrend {
  if (previous === 0 && current > 0) return "new";
  if (changePercent == null) return "flat";
  if (changePercent > 0) return "up";
  if (changePercent < 0) return "down";
  return "flat";
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
    where: Prisma.AnalyticsReportSnapshotWhereInput;
    days: number;
  }
): Promise<AnalyticsOverviewResponse | null> {
  const latestGroups = await prisma.analyticsReportSnapshot.groupBy({
    by: ["reportDate"],
    where: params.where,
    _sum: {
      streams: true,
      payStreams: true
    },
    orderBy: {
      reportDate: "desc"
    },
    take: 2
  });

  if (latestGroups.length === 0) return null;

  const current = latestGroups[0];
  const previous = latestGroups[1];
  const rangeStart = buildReportRangeFromLatest(current.reportDate, params.days);

  const chartGroups = await prisma.analyticsReportSnapshot.groupBy({
    by: ["reportDate"],
    where: {
      ...params.where,
      reportDate: {
        gte: rangeStart
      }
    },
    _sum: {
      streams: true,
      payStreams: true
    },
    orderBy: {
      reportDate: "asc"
    }
  });

  const currentStreams = current._sum.streams ?? 0;
  const currentPayStreams = current._sum.payStreams ?? 0;
  const previousStreams = previous?._sum.streams ?? 0;
  const previousPayStreams = previous?._sum.payStreams ?? 0;
  const periodStreams = chartGroups.reduce((sum, row) => sum + (row._sum.streams ?? 0), 0);
  const periodPayStreams = chartGroups.reduce((sum, row) => sum + (row._sum.payStreams ?? 0), 0);

  return {
    totalStreams: periodStreams,
    totalPayStreams: periodPayStreams,
    streamsChangePercent: calculateChangePercent(currentStreams, previousStreams),
    payStreamsChangePercent: calculateChangePercent(currentPayStreams, previousPayStreams),
    latestReportDate: toDateKey(current.reportDate),
    topPlatform: null,
    platformsCount: 0,
    platformsBreakdown: [],
    chart: chartGroups.map((row) => ({
      date: toDateKey(row.reportDate),
      streams: row._sum.streams ?? 0,
      payStreams: row._sum.payStreams ?? 0
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

  if (!usesSnapshotAggregation) {
    const dailySummaryRepo = getAnalyticsDailySummaryRepo(prisma);
    if (!dailySummaryRepo) {
      const fallback = await buildOverviewFromSnapshots(prisma, {
        where: {
          userId: params.userId,
          ...(params.releaseId ? { releaseId: params.releaseId } : {})
        },
        days
      });
      if (fallback) return fallback;
      return {
        totalStreams: 0,
        totalPayStreams: 0,
        streamsChangePercent: 0,
        payStreamsChangePercent: 0,
        latestReportDate: null,
        topPlatform: null,
        platformsCount: 0,
        platformsBreakdown: [],
        chart: []
      };
    }

    const whereSummary: Prisma.AnalyticsDailySummaryWhereInput = {
      userId: params.userId,
      releaseId: params.releaseId ?? null
    };

    let latestRows: Array<{
      reportDate: Date;
      totalStreams: number;
      totalPayStreams: number;
    }> = [];
    try {
      latestRows = await dailySummaryRepo.findMany({
        where: whereSummary,
        orderBy: { reportDate: "desc" },
        take: 2,
        select: {
          reportDate: true,
          totalStreams: true,
          totalPayStreams: true
        }
      });
    } catch {
      const fallback = await buildOverviewFromSnapshots(prisma, {
        where: {
          userId: params.userId,
          ...(params.releaseId ? { releaseId: params.releaseId } : {})
        },
        days
      });
      if (fallback) return fallback;
      return {
        totalStreams: 0,
        totalPayStreams: 0,
        streamsChangePercent: 0,
        payStreamsChangePercent: 0,
        latestReportDate: null,
        topPlatform: null,
        platformsCount: 0,
        platformsBreakdown: [],
        chart: []
      };
    }

    if (latestRows.length === 0) {
      const fallback = await buildOverviewFromSnapshots(prisma, {
        where: {
          userId: params.userId,
          ...(params.releaseId ? { releaseId: params.releaseId } : {})
        },
        days
      });
      if (fallback) return fallback;
      return {
        totalStreams: 0,
        totalPayStreams: 0,
        streamsChangePercent: 0,
        payStreamsChangePercent: 0,
        latestReportDate: null,
        topPlatform: null,
        platformsCount: 0,
        platformsBreakdown: [],
        chart: []
      };
    }

    const current = latestRows[0];
    const previous = latestRows[1];
    const rangeStart = buildReportRangeFromLatest(current.reportDate, days);

    let chartRows: Array<{
      reportDate: Date;
      totalStreams: number;
      totalPayStreams: number;
    }> = [];
    try {
      chartRows = await dailySummaryRepo.findMany({
        where: {
          ...whereSummary,
          reportDate: {
            gte: rangeStart
          }
        },
        orderBy: { reportDate: "asc" },
        select: {
          reportDate: true,
          totalStreams: true,
          totalPayStreams: true
        }
      });
    } catch {
      const fallback = await buildOverviewFromSnapshots(prisma, {
        where: {
          userId: params.userId,
          ...(params.releaseId ? { releaseId: params.releaseId } : {})
        },
        days
      });
      if (fallback) return fallback;
      return {
        totalStreams: 0,
        totalPayStreams: 0,
        streamsChangePercent: 0,
        payStreamsChangePercent: 0,
        latestReportDate: null,
        topPlatform: null,
        platformsCount: 0,
        platformsBreakdown: [],
        chart: []
      };
    }

    const platformsBreakdown = await buildAllTimePlatformsBreakdown(prisma, {
      userId: params.userId,
      ...(params.releaseId ? { releaseId: params.releaseId } : {}),
      fallbackStreams: current.totalStreams,
      fallbackPayStreams: current.totalPayStreams
    });

    const periodStreams = chartRows.reduce((sum, row) => sum + row.totalStreams, 0);
    const periodPayStreams = chartRows.reduce((sum, row) => sum + row.totalPayStreams, 0);

    return {
      totalStreams: periodStreams,
      totalPayStreams: periodPayStreams,
      streamsChangePercent: calculateChangePercent(
        current.totalStreams,
        previous?.totalStreams ?? 0
      ),
      payStreamsChangePercent: calculateChangePercent(
        current.totalPayStreams,
        previous?.totalPayStreams ?? 0
      ),
      latestReportDate: toDateKey(current.reportDate),
      topPlatform: platformsBreakdown[0]?.platform ?? null,
      platformsCount: platformsBreakdown.length,
      platformsBreakdown,
      chart: chartRows.map((row) => ({
        date: toDateKey(row.reportDate),
        streams: row.totalStreams,
        payStreams: row.totalPayStreams
      }))
    };
  }

  const snapshotWhere: Prisma.AnalyticsReportSnapshotWhereInput = {
    userId: params.userId,
    ...(params.releaseId ? { releaseId: params.releaseId } : {}),
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
      platformsCount: 0,
      platformsBreakdown: [],
      chart: []
    };
  }

  const platformsBreakdown = await buildAllTimePlatformsBreakdown(prisma, {
    userId: params.userId,
    ...(params.releaseId ? { releaseId: params.releaseId } : {}),
    ...(country ? { country } : {}),
    ...(upc ? { upc } : {}),
    ...(platform ? { platform } : {}),
    fallbackStreams: snapshotOverview.totalStreams,
    fallbackPayStreams: snapshotOverview.totalPayStreams
  });

  return {
    ...snapshotOverview,
    topPlatform: platformsBreakdown[0]?.platform ?? null,
    platformsCount: platformsBreakdown.length,
    platformsBreakdown
  };
}

export async function listAnalyticsReleases(
  prisma: PrismaClient,
  params: {
    userId: string;
    country?: string;
    upc?: string;
    platform?: string;
  }
): Promise<AnalyticsReleaseListItem[]> {
  const country = normalizeCountry(params.country);
  const upc = normalizeUpc(params.upc);
  const platform = normalizePlatform(params.platform);
  const usesSnapshotAggregation = Boolean(country || upc || platform);

  if (usesSnapshotAggregation) {
    const totalsRows = await prisma.analyticsReportSnapshot.groupBy({
      by: ["releaseId"],
      where: {
        userId: params.userId,
        ...(country ? { country } : {}),
        ...(upc ? { upc } : {}),
        ...(platform ? { platform } : {})
      },
      _sum: {
        streams: true,
        payStreams: true
      }
    });

    const releaseIds = Array.from(new Set(totalsRows.map((item) => item.releaseId)));
    const releasesMeta = releaseIds.length
      ? await prisma.release.findMany({
          where: {
            id: { in: releaseIds },
            userId: params.userId,
            status: {
              in: [ReleaseStatus.APPROVED, ReleaseStatus.DISTRIBUTED]
            }
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
          orderBy: { createdAt: "desc" }
        })
      : [];
    const totalsByRelease = new Map(
      totalsRows.map((row) => [
        row.releaseId,
        {
          streams: row._sum.streams ?? 0,
          payStreams: row._sum.payStreams ?? 0
        }
      ])
    );

    return releasesMeta.map((meta) => {
      const totals = totalsByRelease.get(meta.id);
      return {
        releaseId: meta.id,
        title: meta.title,
        artist: meta.user.name,
        upc: meta.upc ?? "",
        streams: totals?.streams ?? 0,
        payStreams: totals?.payStreams ?? 0,
        changePercent: null,
        trend: "flat" as const
      };
    });
  }

  let totalsByRelease = new Map<string, { streams: number; payStreams: number }>();
  try {
    const summaryTotals = await prisma.analyticsDailySummary.groupBy({
      by: ["releaseId"],
      where: {
        userId: params.userId,
        releaseId: {
          not: null
        }
      },
      _sum: {
        totalStreams: true,
        totalPayStreams: true
      }
    });
    totalsByRelease = new Map(
      summaryTotals
        .filter((row): row is typeof row & { releaseId: string } => Boolean(row.releaseId))
        .map((row) => [
          row.releaseId,
          {
            streams: row._sum.totalStreams ?? 0,
            payStreams: row._sum.totalPayStreams ?? 0
          }
        ])
    );
  } catch {
    const snapshotTotals = await prisma.analyticsReportSnapshot.groupBy({
      by: ["releaseId"],
      where: { userId: params.userId },
      _sum: {
        streams: true,
        payStreams: true
      }
    });
    totalsByRelease = new Map(
      snapshotTotals.map((row) => [
        row.releaseId,
        {
          streams: row._sum.streams ?? 0,
          payStreams: row._sum.payStreams ?? 0
        }
      ])
    );
  }

  const allReleases = await prisma.release.findMany({
    where: {
      userId: params.userId,
      status: {
        in: [ReleaseStatus.APPROVED, ReleaseStatus.DISTRIBUTED]
      }
    },
    select: {
      id: true,
      title: true,
      upc: true,
      submissionData: true,
      user: {
        select: {
          name: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return allReleases.map((release) => {
    const totals = totalsByRelease.get(release.id);

    return {
      releaseId: release.id,
      title: release.title,
      artist: release.user.name,
      upc: release.upc ?? "",
      streams: totals?.streams ?? 0,
      payStreams: totals?.payStreams ?? 0,
      changePercent: null,
      trend: "flat" as const
    };
  });
}

export async function getAnalyticsReleaseDetails(
  prisma: PrismaClient,
  params: {
    userId: string;
    releaseId: string;
    days?: number;
  }
): Promise<AnalyticsReleaseDetailsResponse | null> {
  const days = clampDays(params.days);

  const release = await prisma.release.findFirst({
    where: {
      id: params.releaseId,
      userId: params.userId,
      status: {
        in: [ReleaseStatus.APPROVED, ReleaseStatus.DISTRIBUTED]
      }
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

  const latestRows = await prisma.analyticsDailySummary.findMany({
    where: {
      userId: params.userId,
      releaseId: params.releaseId
    },
    orderBy: { reportDate: "desc" },
    take: 2,
    select: {
      reportDate: true,
      totalStreams: true,
      totalPayStreams: true
    }
  });

  if (latestRows.length === 0) {
    const snapshotOverview = await buildOverviewFromSnapshots(prisma, {
      where: {
        userId: params.userId,
        releaseId: params.releaseId
      },
      days
    });

    const latestReportDate = snapshotOverview?.latestReportDate
      ? new Date(`${snapshotOverview.latestReportDate}T00:00:00.000Z`)
      : null;

    const countriesBreakdown = latestReportDate
      ? await prisma.analyticsReportSnapshot.groupBy({
          by: ["country"],
          where: {
            userId: params.userId,
            releaseId: params.releaseId,
            reportDate: latestReportDate
          },
          _sum: {
            streams: true,
            payStreams: true
          },
          orderBy: {
            _sum: {
              streams: "desc"
            }
          }
        })
      : [];

    return {
      releaseId: release.id,
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
        payStreams: item._sum.payStreams ?? 0
      })),
      chart: snapshotOverview?.chart ?? []
    };
  }

  const current = latestRows[0];
  const previous = latestRows[1];
  const rangeStart = buildReportRangeFromLatest(current.reportDate, days);

  const chartRows = await prisma.analyticsDailySummary.findMany({
    where: {
      userId: params.userId,
      releaseId: params.releaseId,
      reportDate: {
        gte: rangeStart
      }
    },
    orderBy: {
      reportDate: "asc"
    },
    select: {
      reportDate: true,
      totalStreams: true,
      totalPayStreams: true
    }
  });

  const countriesBreakdown = await prisma.analyticsReportSnapshot.groupBy({
    by: ["country"],
    where: {
      userId: params.userId,
      releaseId: params.releaseId,
      reportDate: current.reportDate
    },
    _sum: {
      streams: true,
      payStreams: true
    },
    orderBy: {
      _sum: {
        streams: "desc"
      }
    }
  });

  return {
    releaseId: release.id,
    title: release.title,
    artist: release.user.name,
    upc: release.upc ?? "",
    totalStreams: current.totalStreams,
    totalPayStreams: current.totalPayStreams,
    streamsChangePercent: calculateChangePercent(
      current.totalStreams,
      previous?.totalStreams ?? 0
    ),
    payStreamsChangePercent: calculateChangePercent(
      current.totalPayStreams,
      previous?.totalPayStreams ?? 0
    ),
    latestReportDate: toDateKey(current.reportDate),
    countriesBreakdown: countriesBreakdown.map((item) => ({
      country: item.country,
      streams: item._sum.streams ?? 0,
      payStreams: item._sum.payStreams ?? 0
    })),
    chart: chartRows.map((item) => ({
      date: toDateKey(item.reportDate),
      streams: item.totalStreams,
      payStreams: item.totalPayStreams
    }))
  };
}
