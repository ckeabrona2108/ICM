import { Prisma, ReleaseStatus, type PrismaClient } from "@prisma/client";
import { normalizeAnalyticsUpc } from "@/lib/analytics-upc";
import { normalizeAnalyticsPlatform } from "@/lib/analytics-platform";

type AnalyticsPlatformSummaryRepo = {
  findMany: (args: unknown) => Promise<
    Array<{
      platform: string;
      streams: number;
      payStreams: number;
      sharePercent: Prisma.Decimal | number;
      changePercent: Prisma.Decimal | number | null;
    }>
  >;
};

type AnalyticsDailySummaryRepo = {
  findMany: (args: unknown) => Promise<
    Array<{
      reportDate: Date;
      totalStreams: number;
      totalPayStreams: number;
    }>
  >;
};

function getAnalyticsPlatformSummaryRepo(
  prisma: PrismaClient
): AnalyticsPlatformSummaryRepo | null {
  return (prisma as { analyticsPlatformSummary?: AnalyticsPlatformSummaryRepo })
    .analyticsPlatformSummary ?? null;
}

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
    reportDate: Date;
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
    Prisma.sql`"user_id" = ${where.userId}`,
    Prisma.sql`"report_date" = ${where.reportDate}`
  ];
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

    const platformSummaryRepo = getAnalyticsPlatformSummaryRepo(prisma);
    let platformRows: Array<{
      platform: string;
      streams: number;
      payStreams: number;
      sharePercent: Prisma.Decimal | number;
      changePercent: Prisma.Decimal | number | null;
    }> = [];
    if (platformSummaryRepo) {
      try {
        platformRows = await platformSummaryRepo.findMany({
          where: {
            userId: params.userId,
            releaseId: params.releaseId ?? null,
            reportDate: current.reportDate
          },
          orderBy: [{ streams: "desc" }, { platform: "asc" }],
          select: {
            platform: true,
            streams: true,
            payStreams: true,
            sharePercent: true,
            changePercent: true
          }
        });
      } catch {
        platformRows = [];
      }
    }

    if (platformRows.length === 0) {
      const previousDate = latestRows[1]?.reportDate ?? null;

      const latestSnapshotPlatforms = await groupSnapshotPlatformsCompat(prisma, {
        userId: params.userId,
        reportDate: current.reportDate,
        ...(params.releaseId ? { releaseId: params.releaseId } : {})
      });

      const previousSnapshotPlatforms = previousDate
        ? await groupSnapshotPlatformsCompat(prisma, {
            userId: params.userId,
            reportDate: previousDate,
            ...(params.releaseId ? { releaseId: params.releaseId } : {})
          })
        : [];

      const previousByPlatform = new Map(
        previousSnapshotPlatforms.map((row) => [row.platform ?? "Unknown", row._sum.streams ?? 0])
      );
      const totalStreams = current.totalStreams;

      platformRows = latestSnapshotPlatforms.map((row) => {
        const platform = row.platform ?? "Unknown";
        const streams = row._sum.streams ?? 0;
        const payStreams = row._sum.payStreams ?? 0;
        const prevStreams = previousByPlatform.get(platform) ?? 0;
        return {
          platform,
          streams,
          payStreams,
          sharePercent: totalStreams > 0 ? Number((((streams / totalStreams) * 100)).toFixed(3)) : 0,
          changePercent: calculateChangePercent(streams, prevStreams)
        };
      });
    }

    if (platformRows.length === 0 && (current.totalStreams > 0 || current.totalPayStreams > 0)) {
      const previousStreams = previous?.totalStreams ?? 0;
      platformRows = [
        {
          platform: "Unknown",
          streams: current.totalStreams,
          payStreams: current.totalPayStreams,
          sharePercent: 100,
          changePercent: calculateChangePercent(current.totalStreams, previousStreams)
        }
      ];
    }

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
      topPlatform: platformRows[0]?.platform ?? null,
      platformsCount: platformRows.length,
      platformsBreakdown: platformRows.map((row) => ({
        platform: row.platform,
        streams: row.streams,
        payStreams: row.payStreams,
        sharePercent: Number(row.sharePercent),
        changePercent:
          row.changePercent == null
            ? null
            : Number(clampReadableChangePercent(Number(row.changePercent)).toFixed(2))
      })),
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

  const latestDate = snapshotOverview.latestReportDate
    ? new Date(`${snapshotOverview.latestReportDate}T00:00:00.000Z`)
    : null;

  const platformGroups = latestDate
    ? await groupSnapshotPlatformsCompat(prisma, {
        userId: params.userId,
        reportDate: latestDate,
        ...(params.releaseId ? { releaseId: params.releaseId } : {}),
        ...(country ? { country } : {}),
        ...(upc ? { upc } : {}),
        ...(platform ? { platform } : {})
      })
    : [];

  const previousDate = snapshotOverview.chart.length > 1
    ? new Date(`${snapshotOverview.chart[snapshotOverview.chart.length - 2]?.date}T00:00:00.000Z`)
    : null;

  const previousPlatformGroups = previousDate
    ? await groupSnapshotPlatformsCompat(prisma, {
        userId: params.userId,
        reportDate: previousDate,
        ...(params.releaseId ? { releaseId: params.releaseId } : {}),
        ...(country ? { country } : {}),
        ...(upc ? { upc } : {}),
        ...(platform ? { platform } : {})
      })
    : [];
  const previousByPlatform = new Map(
    previousPlatformGroups.map((item) => [item.platform ?? "Unknown", item._sum.streams ?? 0])
  );

  const totalStreams = snapshotOverview.totalStreams;
  const platformsBreakdown = platformGroups.map((item) => {
    const name = item.platform ?? "Unknown";
    const streams = item._sum.streams ?? 0;
    const payStreams = item._sum.payStreams ?? 0;
    const prev = previousByPlatform.get(name) ?? 0;
    return {
      platform: name,
      streams,
      payStreams,
      sharePercent: totalStreams > 0 ? Number((((streams / totalStreams) * 100)).toFixed(3)) : 0,
      changePercent: calculateChangePercent(streams, prev)
    };
  });

  if (platformsBreakdown.length === 0 && (snapshotOverview.totalStreams > 0 || snapshotOverview.totalPayStreams > 0)) {
    const previousStreams = snapshotOverview.chart.length > 1
      ? snapshotOverview.chart[snapshotOverview.chart.length - 2]?.streams ?? 0
      : 0;
    platformsBreakdown.push({
      platform: "Unknown",
      streams: snapshotOverview.totalStreams,
      payStreams: snapshotOverview.totalPayStreams,
      sharePercent: 100,
      changePercent: calculateChangePercent(snapshotOverview.totalStreams, previousStreams)
    });
  }

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
    const latestDates = await prisma.analyticsReportSnapshot.groupBy({
      by: ["reportDate"],
      where: {
        userId: params.userId,
        ...(country ? { country } : {}),
        ...(upc ? { upc } : {}),
        ...(platform ? { platform } : {})
      },
      orderBy: { reportDate: "desc" },
      take: 2
    });

    const latest = latestDates[0]?.reportDate ?? null;
    const previous = latestDates[1]?.reportDate ?? null;

    const currentRows = latest
      ? await prisma.analyticsReportSnapshot.groupBy({
          by: ["releaseId"],
          where: {
            userId: params.userId,
            reportDate: latest,
            ...(country ? { country } : {}),
            ...(upc ? { upc } : {}),
            ...(platform ? { platform } : {})
          },
          _sum: {
            streams: true,
            payStreams: true
          }
        })
      : [];

    const previousRows = previous
      ? await prisma.analyticsReportSnapshot.groupBy({
          by: ["releaseId"],
          where: {
            userId: params.userId,
            reportDate: previous,
            ...(country ? { country } : {}),
            ...(upc ? { upc } : {}),
            ...(platform ? { platform } : {})
          },
          _sum: {
            streams: true
          }
        })
      : [];

    const releaseIds = Array.from(new Set(currentRows.map((item) => item.releaseId)));
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
    const metaById = new Map(releasesMeta.map((row) => [row.id, row]));
    const previousByRelease = new Map(
      previousRows.map((row) => [row.releaseId, row._sum.streams ?? 0])
    );

    return currentRows
      .map((row) => {
        const meta = metaById.get(row.releaseId);
        if (!meta) return null;
        const streams = row._sum.streams ?? 0;
        const payStreams = row._sum.payStreams ?? 0;
        const previousStreams = previousByRelease.get(row.releaseId) ?? 0;
        const changePercent = calculateChangePercent(streams, previousStreams);
        return {
          releaseId: row.releaseId,
          title: meta.title,
          artist: meta.user.name,
          upc: meta.upc ?? "",
          streams,
          payStreams,
          changePercent,
          trend: toTrend(changePercent, streams, previousStreams)
        };
      })
      .filter((item): item is AnalyticsReleaseListItem => Boolean(item));
  }

  const latestUserSummary = await prisma.analyticsDailySummary.findMany({
    where: {
      userId: params.userId,
      releaseId: null
    },
    orderBy: { reportDate: "desc" },
    take: 2,
    select: { reportDate: true }
  });

  let latestReportDate = latestUserSummary[0]?.reportDate ?? null;
  let previousReportDate = latestUserSummary[1]?.reportDate ?? null;

  if (!latestReportDate) {
    const snapshotDates = await prisma.analyticsReportSnapshot.groupBy({
      by: ["reportDate"],
      where: { userId: params.userId },
      orderBy: { reportDate: "desc" },
      take: 2
    });
    latestReportDate = snapshotDates[0]?.reportDate ?? null;
    previousReportDate = snapshotDates[1]?.reportDate ?? null;
  }

  let currentRows = latestReportDate
    ? await prisma.analyticsDailySummary.findMany({
        where: {
          userId: params.userId,
          reportDate: latestReportDate,
          releaseId: {
            not: null
          }
        },
        select: {
          releaseId: true,
          totalStreams: true,
          totalPayStreams: true
        }
      })
    : [];

  let previousRows = previousReportDate
    ? await prisma.analyticsDailySummary.findMany({
        where: {
          userId: params.userId,
          reportDate: previousReportDate,
          releaseId: {
            not: null
          }
        },
        select: {
          releaseId: true,
          totalStreams: true
        }
      })
    : [];

  if (latestReportDate && currentRows.length === 0) {
    const currentSnapshotRows = await prisma.analyticsReportSnapshot.groupBy({
      by: ["releaseId"],
      where: { userId: params.userId, reportDate: latestReportDate },
      _sum: { streams: true, payStreams: true }
    });
    currentRows = currentSnapshotRows.map((row) => ({
      releaseId: row.releaseId,
      totalStreams: row._sum.streams ?? 0,
      totalPayStreams: row._sum.payStreams ?? 0
    }));
  }

  if (previousReportDate && previousRows.length === 0) {
    const previousSnapshotRows = await prisma.analyticsReportSnapshot.groupBy({
      by: ["releaseId"],
      where: { userId: params.userId, reportDate: previousReportDate },
      _sum: { streams: true }
    });
    previousRows = previousSnapshotRows.map((row) => ({
      releaseId: row.releaseId,
      totalStreams: row._sum.streams ?? 0
    }));
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

  const currentByRelease = new Map(
    currentRows
      .filter((item): item is typeof item & { releaseId: string } => Boolean(item.releaseId))
      .map((item) => [item.releaseId, item])
  );
  const previousByRelease = new Map(
    previousRows
      .filter((item): item is typeof item & { releaseId: string } => Boolean(item.releaseId))
      .map((item) => [item.releaseId, item])
  );

  return allReleases.map((release) => {
    const current = currentByRelease.get(release.id);
    const previous = previousByRelease.get(release.id);
    const currentStreams = current?.totalStreams ?? 0;
    const previousStreams = previous?.totalStreams ?? 0;
    const changePercent = calculateChangePercent(currentStreams, previousStreams);

    return {
      releaseId: release.id,
      title: release.title,
      artist: release.user.name,
      upc: release.upc ?? "",
      streams: currentStreams,
      payStreams: current?.totalPayStreams ?? 0,
      changePercent,
      trend: toTrend(changePercent, currentStreams, previousStreams)
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
