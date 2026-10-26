import { getAnalyticsOverview } from "@/lib/analytics-query-service";
import { getCabinetReleasesByUser } from "@/lib/cabinet-release-queries";
import type { CabinetReleaseStatus } from "@/lib/cabinet-types";
import { getUserBalanceTotals } from "@/lib/finance-service";
import { listPublicNews, type PublicNewsCardDto } from "@/lib/news-service";
import { prisma } from "@/lib/prisma";
import { resolveRenderableStoredFileUrl } from "@/lib/s3";

const LIVE_STATUSES = new Set<CabinetReleaseStatus>(["approved", "distributed", "dsp_confirmed"]);
const MODERATION_STATUSES = new Set<CabinetReleaseStatus>(["moderation", "pending_verification"]);

export type DashboardOverviewRelease = {
  id: string;
  title: string;
  artist: string;
  status: CabinetReleaseStatus;
  coverSrc: string | null;
  releaseDate: string;
};

export type DashboardOverviewData = {
  availableBalance: number | null;
  streams: {
    total: number;
    changePercent: number | null;
    chart: Array<{ date: string; streams: number }>;
  } | null;
  releases: {
    total: number;
    live: number;
    moderation: number;
    changesRequired: number;
    recent: DashboardOverviewRelease[];
  } | null;
  news: PublicNewsCardDto[];
};

// Каждый блок грузится независимо: если упали финансы или аналитика,
// обзор всё равно открывается, а в плитке показывается прочерк.
async function settle<T>(label: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error(`[dashboard-overview] ${label} failed`, error);
    return null;
  }
}

export async function getDashboardOverview(userId: string): Promise<DashboardOverviewData> {
  const [balance, analytics, releases, news] = await Promise.all([
    settle("balance", () => getUserBalanceTotals(prisma, userId)),
    settle("analytics", () => getAnalyticsOverview(prisma, { user_id: userId, days: 30 })),
    settle("releases", () => getCabinetReleasesByUser(userId)),
    settle("news", () => listPublicNews(prisma))
  ]);

  return {
    availableBalance: balance?.availableToWithdraw ?? null,
    streams: analytics
      ? {
          total: analytics.totalStreams,
          changePercent: analytics.streamsChangePercent,
          chart: analytics.chart.map((point) => ({ date: point.date, streams: point.streams }))
        }
      : null,
    releases: releases
      ? {
          total: releases.filter((release) => release.status !== "draft").length,
          live: releases.filter((release) => LIVE_STATUSES.has(release.status)).length,
          moderation: releases.filter((release) => MODERATION_STATUSES.has(release.status)).length,
          changesRequired: releases.filter((release) => release.status === "changes_required").length,
          recent: releases
            .filter((release) => release.status !== "draft")
            .slice(0, 4)
            .map((release) => {
              const coverSource =
                release.coverUrl ||
                release.coverUrlCandidates?.find((candidate) => candidate.trim().length > 0) ||
                release.cover ||
                "";
              return {
                id: release.id,
                title: release.title?.trim() || "Без названия",
                artist: release.artist?.trim() || "Исполнитель не указан",
                status: release.status,
                coverSrc: coverSource ? resolveRenderableStoredFileUrl({ url: coverSource, storageKey: null }) : null,
                releaseDate: release.releaseDate?.trim() || ""
              };
            })
        }
      : null,
    news: (news ?? []).slice(0, 3)
  };
}
