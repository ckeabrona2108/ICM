import type { PrismaClient } from "@prisma/client";

import { formatRubCurrency } from "@/lib/currency-format";
import {
  getReleaseLifecycleStatus,
  shouldTreatReleaseAsApproved
} from "@/lib/release-counts";
import type {
  DashboardNotificationKind,
  DashboardNotificationItemResponse,
  DashboardNotificationsResponse
} from "@/lib/api/contracts";
import { toNotificationStorageId } from "@/lib/notification-storage-id";
import { listUserReports } from "@/lib/report-service";
import {
  listUserUnreadSupportTicketSummaries
} from "@/lib/support-service";
import {
  isAnyPrismaColumnMissingError,
  isPrismaPoolTimeoutError
} from "@/lib/prisma-errors";

const MAX_RELEASE_ITEMS = 8;
const MAX_REPORT_ITEMS = 8;
const MAX_PAYOUT_ITEMS = 6;
const MAX_SUPPORT_ITEMS = 6;
const MAX_ITEMS = 20;
const DASHBOARD_NOTIFICATION_KINDS = new Set<DashboardNotificationKind>([
  "release_approved",
  "release_rejected",
  "release_changes_required",
  "report_ready",
  "report_changes_requested",
  "report_agreed",
  "payout_requested",
  "payout_paid",
  "payout_rejected",
  "support_reply",
  "direct_message",
  "artist_release_published",
  "artist_post_published",
  "artist_post_liked",
  "artist_post_commented",
  "collaboration_response_received",
  "artist_post_comment_reacted",
  "artist_release_liked",
  "artist_release_commented",
  "artist_release_comment_reacted",
  "artist_profile_followed"
]);
const RELEASE_NOTIFICATION_KINDS = new Set<DashboardNotificationKind>([
  "release_approved",
  "release_rejected",
  "release_changes_required"
]);
const REPORT_NOTIFICATION_KINDS = new Set<DashboardNotificationKind>([
  "report_ready",
  "report_changes_requested",
  "report_agreed"
]);
const PAYOUT_NOTIFICATION_KINDS = new Set<DashboardNotificationKind>([
  "payout_requested",
  "payout_paid",
  "payout_rejected"
]);

type PersistedNotificationRow = {
  id: string;
  kind: string;
  title: string;
  message: string;
  cta_href: string | null;
  created_at: Date;
  read_at: Date | null;
  source_type?: string | null;
  source_id?: string | null;
};

function getNotificationRepo(prisma: PrismaClient) {
  return (prisma as PrismaClient & {
    ai_user_notifications?: {
      findMany: (...args: unknown[]) => Promise<PersistedNotificationRow[]>;
      count: (...args: unknown[]) => Promise<number>;
      createMany: (...args: unknown[]) => Promise<unknown>;
    };
  }).ai_user_notifications;
}

function parseDashboardNotificationKind(value: string): DashboardNotificationKind {
  return DASHBOARD_NOTIFICATION_KINDS.has(value as DashboardNotificationKind)
    ? value as DashboardNotificationKind
    : "support_reply";
}

function toIsoString(value: string | Date | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
  }
  return Number.isNaN(value.getTime()) ? new Date(0).toISOString() : value.toISOString();
}

function buildReleaseHref(kind: DashboardNotificationItemResponse["kind"]): string {
  if (kind === "release_approved") return "/dashboard/releases";
  return "/dashboard/changes-required";
}

function buildReleaseNotifications(
  releases: Array<{
    id: string;
    title: string | null;
    status: string | null;
    date: Date | string | null;
    confirmed: boolean | null;
    upc: string | null;
    roles: unknown;
    rejectReason: string | null;
    moderatorComment: string | null;
  }>
): DashboardNotificationItemResponse[] {
  const items: DashboardNotificationItemResponse[] = [];

  for (const release of releases) {
    if (items.length >= MAX_RELEASE_ITEMS) break;

    const lifecycle = getReleaseLifecycleStatus(release.status, release.roles);
    const approved = shouldTreatReleaseAsApproved({
      status: release.status,
      confirmed: release.confirmed,
      upc: release.upc,
      roles: release.roles
    });
    const title = release.title?.trim() || "Без названия";
    const createdAt = toIsoString(release.date);

    if (approved) {
      items.push({
        id: `release-approved-${release.id}`,
        kind: "release_approved",
        title: "Релиз принят",
        message: `Релиз «${title}» принят. Загрузите 30-секундный фрагмент, чтобы попасть на витрину.`,
        href: `/dashboard/showcase?releaseId=${encodeURIComponent(release.id)}`,
        createdAt,
        isUnread: true
      });
      continue;
    }

    if ((release.status ?? "").toLowerCase() === "rejected") {
      items.push({
        id: `release-rejected-${release.id}`,
        kind: "release_rejected",
        title: "Релиз отклонён",
        message:
          release.rejectReason?.trim() ||
          `Релиз «${title}» отклонён администратором.`,
        href: buildReleaseHref("release_rejected"),
        createdAt,
        isUnread: true
      });
      continue;
    }

    if (lifecycle === "changes_required") {
      items.push({
        id: `release-changes-${release.id}`,
        kind: "release_changes_required",
        title: "Релиз отправлен на доработку",
        message:
          release.moderatorComment?.trim() ||
          release.rejectReason?.trim() ||
          `По релизу «${title}» требуются изменения.`,
        href: buildReleaseHref("release_changes_required"),
        createdAt,
        isUnread: true
      });
    }
  }

  return items;
}

async function listReleaseNotifications(
  prisma: PrismaClient,
  userId: string
): Promise<DashboardNotificationItemResponse[]> {
  const releases = await prisma.release.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 40,
    select: {
      id: true,
      title: true,
      status: true,
      date: true,
      confirmed: true,
      upc: true,
      roles: true,
      rejectReason: true,
      moderatorComment: true
    }
  });

  return buildReleaseNotifications(releases);
}

async function listReportNotifications(
  prisma: PrismaClient,
  userId: string
): Promise<DashboardNotificationItemResponse[]> {
  const reports = await listUserReports(prisma, userId);

  return reports.slice(0, MAX_REPORT_ITEMS).map((report) => {
    const amountLabel = formatRubCurrency(report.amount);
    if (report.lifecycleState === "agreed") {
      return {
        id: `report-agreed-${report.id}`,
        kind: "report_agreed",
        title: "Отчёт согласован",
        message: `${report.quarterLabel} · ${amountLabel}`,
        href: "/dashboard/finance",
        createdAt: toIsoString(report.agreedAt ?? report.createdAt),
        isUnread: true
      };
    }

    if (report.lifecycleState === "changes_requested") {
      return {
        id: `report-changes-${report.id}`,
        kind: "report_changes_requested",
        title: "Отчёт возвращён на доработку",
        message:
          report.adminComment?.trim() ||
          `${report.quarterLabel} · ${amountLabel}`,
        href: "/dashboard/finance",
        createdAt: toIsoString(report.createdAt),
        isUnread: true
      };
    }

    return {
      id: `report-ready-${report.id}`,
      kind: "report_ready",
      title: "Пришёл новый отчёт",
      message: `${report.quarterLabel} · ${amountLabel}`,
      href: "/dashboard/finance",
      createdAt: toIsoString(report.createdAt),
      isUnread: true
    };
  });
}

async function listPayoutNotifications(
  prisma: PrismaClient,
  userId: string
): Promise<DashboardNotificationItemResponse[]> {
  const payouts = await prisma.payouts.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: MAX_PAYOUT_ITEMS,
    select: {
      id: true,
      amount: true,
      confirmed: true,
      createdAt: true
    }
  });

  return payouts.map((payout) => {
    const amountLabel = formatRubCurrency(Number(payout.amount ?? 0));
    if (payout.confirmed === true) {
      return {
        id: `payout-paid-${payout.id}`,
        kind: "payout_paid",
        title: "Вывод средств одобрен",
        message: `Заявка на ${amountLabel} одобрена администратором.`,
        href: "/dashboard/finance",
        createdAt: toIsoString(payout.createdAt),
        isUnread: true
      };
    }

    if (payout.confirmed === null) {
      return {
        id: `payout-rejected-${payout.id}`,
        kind: "payout_rejected",
        title: "Вывод средств отклонён",
        message: `Заявка на ${amountLabel} была отклонена.`,
        href: "/dashboard/finance",
        createdAt: toIsoString(payout.createdAt),
        isUnread: true
      };
    }

    return {
      id: `payout-requested-${payout.id}`,
      kind: "payout_requested",
      title: "Заявка на вывод отправлена",
      message: `Заявка на ${amountLabel} ожидает обработки.`,
      href: "/dashboard/finance",
      createdAt: toIsoString(payout.createdAt),
      isUnread: true
    };
  });
}

async function listSupportNotifications(
  prisma: PrismaClient,
  userId: string
): Promise<DashboardNotificationItemResponse[]> {
  const unreadTickets = await listUserUnreadSupportTicketSummaries(prisma, userId, MAX_SUPPORT_ITEMS);

  return unreadTickets
    .map((ticket) => ({
      id: `support-reply-${ticket.id}`,
      kind: "support_reply",
      title: "Новый ответ от поддержки",
      message: ticket.subject,
      href: "/dashboard/support",
      createdAt: ticket.updatedAt,
      isUnread: true
    }));
}

async function listPersistedDashboardNotifications(
  prisma: PrismaClient,
  userId: string
): Promise<PersistedNotificationRow[]> {
  const repo = getNotificationRepo(prisma);
  if (!repo) return [];
  try {
    return await repo.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: MAX_ITEMS,
      select: {
        id: true,
        kind: true,
        title: true,
        message: true,
        cta_href: true,
        created_at: true,
        read_at: true,
        source_type: true,
        source_id: true
      }
    });
  } catch (error) {
    if (!isAnyPrismaColumnMissingError(error, [
      "ai_user_notifications.source_type",
      "ai_user_notifications.source_id"
    ])) {
      throw error;
    }

    return await repo.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: MAX_ITEMS,
      select: {
        id: true,
        kind: true,
        title: true,
        message: true,
        cta_href: true,
        created_at: true,
        read_at: true
      }
    });
  }
}

async function withNotificationFallback<T>(
  load: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isPrismaPoolTimeoutError(error)) {
      console.warn("[dashboard-notifications] pool timeout fallback", error);
      return fallback;
    }
    throw error;
  }
}

async function buildVisibleDashboardNotifications(
  prisma: PrismaClient,
  persisted: PersistedNotificationRow[],
  userId: string
): Promise<DashboardNotificationsResponse> {
  const repo = getNotificationRepo(prisma);
  const unreadCount = await withNotificationFallback(
    () => repo
      ? repo.count({
          where: {
            user_id: userId,
            read_at: null
          }
        })
      : Promise.resolve(0),
    0
  );
  const postSourceIds = persisted.filter((item) => item.source_type === "post" && item.source_id).map((item) => item.source_id!);
  const releaseSourceIds = persisted.filter((item) => item.source_type === "release" && item.source_id).map((item) => item.source_id!);
  const existingPosts = await withNotificationFallback(
    () => postSourceIds.length
      ? prisma.artist_profile_posts.findMany({ where: { id: { in: postSourceIds } }, select: { id: true } })
      : Promise.resolve([]),
    []
  );
  const existingReleases = await withNotificationFallback(
    () => releaseSourceIds.length
      ? prisma.release.findMany({ where: { id: { in: releaseSourceIds } }, select: { id: true } })
      : Promise.resolve([]),
    []
  );
  const existingSourceKeys = new Set([
    ...existingPosts.map((item) => `post:${item.id}`),
    ...existingReleases.map((item) => `release:${item.id}`)
  ]);
  const visibleItems = persisted.map((item) => ({
    id: item.id,
    kind: parseDashboardNotificationKind(item.kind),
    title: item.title,
    message: item.message,
    href: item.source_type && item.source_id && !existingSourceKeys.has(`${item.source_type}:${item.source_id}`)
      ? "/feed"
      : item.cta_href || "/dashboard",
    createdAt: item.created_at.toISOString(),
    isUnread: item.read_at === null
  }));

  return {
    unreadCount,
    items: visibleItems
  };
}

export async function listDashboardNotifications(
  prisma: PrismaClient,
  userId: string
): Promise<DashboardNotificationsResponse> {
  const persisted = await withNotificationFallback(
    () => listPersistedDashboardNotifications(prisma, userId),
    []
  );
  const persistedKinds = new Set(
    persisted.map((item) => parseDashboardNotificationKind(item.kind))
  );
  const needReleaseItems = !Array.from(RELEASE_NOTIFICATION_KINDS).some((kind) => persistedKinds.has(kind));
  const needReportItems = !Array.from(REPORT_NOTIFICATION_KINDS).some((kind) => persistedKinds.has(kind));
  const needPayoutItems = !Array.from(PAYOUT_NOTIFICATION_KINDS).some((kind) => persistedKinds.has(kind));
  const needSupportItems = !persistedKinds.has("support_reply");

  const releaseItems = needReleaseItems
    ? await withNotificationFallback(() => listReleaseNotifications(prisma, userId), [])
    : [];
  const reportItems = needReportItems
    ? await withNotificationFallback(() => listReportNotifications(prisma, userId), [])
    : [];
  const payoutItems = needPayoutItems
    ? await withNotificationFallback(() => listPayoutNotifications(prisma, userId), [])
    : [];
  const supportItems = needSupportItems
    ? await withNotificationFallback(() => listSupportNotifications(prisma, userId), [])
    : [];

  const derivedItems = [...supportItems, ...reportItems, ...payoutItems, ...releaseItems];

  if (derivedItems.length > 0) {
    const storageIdByItemId = new Map(
      derivedItems.map((item) => [item.id, toNotificationStorageId(item.id)])
    );
    await withNotificationFallback(
      () => {
        const notificationRepo = getNotificationRepo(prisma);
        if (!notificationRepo) return Promise.resolve(null);
        return notificationRepo.createMany({
        data: derivedItems.map((item) => ({
          id: storageIdByItemId.get(item.id)!,
          user_id: userId,
          kind: item.kind,
          title: item.title,
          message: item.message,
          cta_label: "Открыть",
          cta_href: item.href,
          created_at: new Date(item.createdAt),
          read_at: item.isUnread ? null : new Date(item.createdAt)
        })),
        skipDuplicates: true
      });
      },
      null
    );

  }

  if (persisted.length > 0) {
    const mergedPersisted = [
      ...persisted,
      ...derivedItems.map((item) => ({
        id: toNotificationStorageId(item.id),
        kind: item.kind,
        title: item.title,
        message: item.message,
        cta_href: item.href,
        created_at: new Date(item.createdAt),
        read_at: item.isUnread ? null : new Date(item.createdAt)
      }))
    ];
    return buildVisibleDashboardNotifications(prisma, mergedPersisted, userId);
  }
  const refreshedPersisted = await withNotificationFallback(
    () => listPersistedDashboardNotifications(prisma, userId),
    []
  );
  return buildVisibleDashboardNotifications(prisma, refreshedPersisted, userId);
}

export async function markAllDashboardNotificationsRead(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const result = await prisma.ai_user_notifications.updateMany({
    where: {
      user_id: userId,
      read_at: null
    },
    data: { read_at: new Date() }
  });
  return result.count;
}


export async function markDashboardNotificationRead(
  prisma: PrismaClient,
  userId: string,
  notificationId: string
): Promise<boolean> {
  const result = await prisma.ai_user_notifications.updateMany({
    where: {
      id: notificationId,
      user_id: userId,
      read_at: null
    },
    data: { read_at: new Date() }
  });
  return result.count > 0;
}
