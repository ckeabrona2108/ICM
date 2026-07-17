import type { PrismaClient } from "@prisma/client";

import { formatRubCurrency } from "@/lib/currency-format";
import {
  getReleaseLifecycleStatus,
  shouldTreatReleaseAsApproved
} from "@/lib/release-counts";
import type {
  DashboardNotificationItemResponse,
  DashboardNotificationsResponse
} from "@/lib/api/contracts";
import { listUserReports } from "@/lib/report-service";
import {
  getUserUnreadSupportTicketCount,
  listUserSupportTickets
} from "@/lib/support-service";

const MAX_RELEASE_ITEMS = 8;
const MAX_REPORT_ITEMS = 8;
const MAX_PAYOUT_ITEMS = 6;
const MAX_SUPPORT_ITEMS = 6;
const MAX_ITEMS = 20;

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
        message: `Релиз «${title}» принят и доступен в каталоге.`,
        href: buildReleaseHref("release_approved"),
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
  const [tickets, unreadCount] = await Promise.all([
    listUserSupportTickets(prisma, userId),
    getUserUnreadSupportTicketCount(prisma, userId)
  ]);

  return tickets
    .slice(0, Math.min(unreadCount, MAX_SUPPORT_ITEMS))
    .map((ticket: Awaited<ReturnType<typeof listUserSupportTickets>>[number]) => ({
      id: `support-reply-${ticket.id}`,
      kind: "support_reply",
      title: "Новый ответ от поддержки",
      message: ticket.subject,
      href: "/dashboard/support",
      createdAt: toIsoString(ticket.updatedAt),
      isUnread: true
    }));
}

export async function listDashboardNotifications(
  prisma: PrismaClient,
  userId: string
): Promise<DashboardNotificationsResponse> {
  const [releaseItems, reportItems, payoutItems, supportItems] = await Promise.all([
    listReleaseNotifications(prisma, userId),
    listReportNotifications(prisma, userId),
    listPayoutNotifications(prisma, userId),
    listSupportNotifications(prisma, userId)
  ]);

  const items = [...supportItems, ...reportItems, ...payoutItems, ...releaseItems]
    .sort((left, right) => {
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    })
    .slice(0, MAX_ITEMS);

  if (items.length > 0) {
    await prisma.ai_user_notifications.createMany({
      data: items.map((item) => ({
        id: item.id,
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

    const persisted = await prisma.ai_user_notifications.findMany({
      where: {
        user_id: userId,
        id: { in: items.map((item) => item.id) }
      },
      select: { id: true, read_at: true }
    });
    const readAtById = new Map(persisted.map((item) => [item.id, item.read_at]));
    for (const item of items) {
      item.isUnread = readAtById.get(item.id) === null;
    }
  }

  return {
    unreadCount: items.filter((item) => item.isUnread).length,
    items
  };
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
