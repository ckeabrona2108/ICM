import type { PrismaClient } from "@prisma/client";

import { deliverUserNotificationSafely, type UserNotificationEvent } from "@/lib/notification-delivery-service";
import type { PromoSubmissionDetail, PromoSubmissionStatus } from "@/lib/promo-service";
import { PROMO_MIN_LEAD_DAYS } from "@/lib/release-promo-dates";
import { sendTelegramMessage } from "@/lib/telegram-notifier";

/** Notifications around promo requests: the admin hears about new ones, the artist about decisions. */

export const PROMO_NOTIFICATION_KIND = "release_promo_status";

/** How an artist notification is delivered; tests pass a recorder instead of the real channels. */
export type PromoNotificationDeliver = (prisma: PrismaClient, event: UserNotificationEvent) => Promise<void>;
/** How the admin Telegram message is sent; tests pass a recorder. */
export type PromoTelegramSend = (text: string) => Promise<unknown>;

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000").replace(
    /\/$/u,
    ""
  );
}

function formatRuDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function daysUntil(releaseDate: string, now: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(releaseDate);
  if (!match) return null;
  const release = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((release - today) / 86_400_000);
}

export function buildPromoSubmittedTelegramText(
  item: Pick<PromoSubmissionDetail, "id" | "artistName" | "releaseTitle" | "releaseDate">,
  options: { resubmitted?: boolean; now?: Date } = {}
): string {
  const left = daysUntil(item.releaseDate, options.now ?? new Date());
  const timing =
    left == null
      ? ""
      : left >= PROMO_MIN_LEAD_DAYS
        ? `до выхода ${left} дн. — успевает на питчинг`
        : `до выхода ${left} дн. — на питчинг поздно`;
  return [
    options.resubmitted ? "Исправленная заявка на промо" : "Новая заявка на промо",
    `${item.releaseTitle} — ${item.artistName}`,
    `Выход: ${formatRuDay(item.releaseDate)}${timing ? ` (${timing})` : ""}`,
    `${appUrl()}/admin/promo/${item.id}`
  ].join("\n");
}

export async function notifyAdminPromoSubmitted(
  item: Pick<PromoSubmissionDetail, "id" | "artistName" | "releaseTitle" | "releaseDate">,
  options: { resubmitted?: boolean; send?: PromoTelegramSend } = {}
): Promise<void> {
  try {
    await (options.send ?? sendTelegramMessage)(buildPromoSubmittedTelegramText(item, options));
  } catch (error) {
    console.error("[promo] admin telegram notification failed", { submissionId: item.id, error });
  }
}

const STATUS_MESSAGES: Partial<Record<PromoSubmissionStatus, { title: string; message: (release: string) => string }>> = {
  IN_REVIEW: {
    title: "Заявка на промо на рассмотрении",
    message: (release) => `Команда ICECREAMMUSIC взяла в работу промо-заявку на релиз «${release}».`
  },
  APPROVED: {
    title: "Заявка на промо одобрена",
    message: (release) => `Промо-заявка на релиз «${release}» одобрена. Мы сообщим, когда передадим её партнёрам.`
  },
  REJECTED: {
    title: "Заявку на промо нужно исправить",
    message: (release) => `Промо-заявка на релиз «${release}» вернулась на доработку. Исправьте её в разделе «Промо».`
  },
  SENT_TO_PARTNERS: {
    title: "Заявка на промо передана партнёрам",
    message: (release) => `Промо-заявку на релиз «${release}» передали партнёрам и редакциям площадок.`
  },
  CANCELLED: {
    title: "Заявка на промо отменена",
    message: (release) => `Промо-заявка на релиз «${release}» отменена.`
  }
};

/** Artist message for a status the admin set, or null when that status says nothing new. */
export function buildPromoStatusNotification(
  item: Pick<PromoSubmissionDetail, "releaseTitle" | "status" | "adminComment">
): { title: string; message: string } | null {
  const entry = STATUS_MESSAGES[item.status];
  if (!entry) return null;
  const comment = item.adminComment?.trim();
  return {
    title: entry.title,
    message: `${entry.message(item.releaseTitle)}${comment ? ` Комментарий: ${comment}` : ""}`
  };
}

export async function notifyArtistPromoStatus(
  prisma: PrismaClient,
  item: PromoSubmissionDetail,
  previousStatus: PromoSubmissionStatus | null,
  deliver: PromoNotificationDeliver = deliverUserNotificationSafely
): Promise<void> {
  if (previousStatus === item.status) return;
  const text = buildPromoStatusNotification(item);
  if (!text) return;
  await deliver(prisma, {
    id: `promo-status-${item.id}-${item.status}`,
    userId: item.userId,
    kind: PROMO_NOTIFICATION_KIND,
    title: text.title,
    message: text.message,
    href: "/dashboard/promo",
    sendEmail: false,
    resetReadState: true,
    sourceType: "promo_submission",
    sourceId: item.id
  });
}

export async function notifyArtistPromoComment(
  prisma: PrismaClient,
  item: PromoSubmissionDetail,
  previousComment: string | null,
  deliver: PromoNotificationDeliver = deliverUserNotificationSafely
): Promise<void> {
  const comment = item.adminComment?.trim();
  if (!comment || comment === previousComment?.trim()) return;
  await deliver(prisma, {
    id: `promo-comment-${item.id}`,
    userId: item.userId,
    kind: PROMO_NOTIFICATION_KIND,
    title: "Комментарий к заявке на промо",
    message: `По промо-заявке на релиз «${item.releaseTitle}»: ${comment}`,
    href: "/dashboard/promo",
    sendEmail: false,
    resetReadState: true,
    sourceType: "promo_submission",
    sourceId: item.id
  });
}

/**
 * Reminder sent with the release approval: promo requests open now. Null once the release is out.
 */
export function buildPromoHintAfterApproval(
  releaseTitle: string,
  releaseDate: Date | null | undefined,
  now: Date = new Date()
): { title: string; message: string } | null {
  if (!releaseDate || Number.isNaN(releaseDate.getTime())) return null;
  const iso = releaseDate.toISOString().slice(0, 10);
  const left = daysUntil(iso, now);
  if (left == null || left < 0) return null;
  if (left >= PROMO_MIN_LEAD_DAYS) {
    const deadline = new Date(releaseDate.getTime() - PROMO_MIN_LEAD_DAYS * 86_400_000).toISOString().slice(0, 10);
    return {
      title: "Подайте релиз на промо",
      message: `Релиз «${releaseTitle}» успевает на питчинг в плейлисты. Отправьте заявку на промо до ${formatRuDay(deadline)} включительно.`
    };
  }
  return {
    title: "Подайте релиз на промо",
    message: `Для питчинга в плейлисты релиз «${releaseTitle}» уже не успевает, но заявку на промо-поддержку можно отправить до ${formatRuDay(iso)}.`
  };
}

export async function notifyArtistPromoOpen(
  prisma: PrismaClient,
  release: { id: string; userId: string; title: string | null; date: Date | null },
  deliver: PromoNotificationDeliver = deliverUserNotificationSafely
): Promise<void> {
  const text = buildPromoHintAfterApproval(release.title?.trim() || "Без названия", release.date);
  if (!text) return;
  await deliver(prisma, {
    id: `promo-open-${release.id}`,
    userId: release.userId,
    kind: PROMO_NOTIFICATION_KIND,
    title: text.title,
    message: text.message,
    href: "/dashboard/promo",
    sendEmail: false,
    // VK and Telegram already get the approval message a moment earlier; the hint stays in the cabinet.
    sendVk: false,
    sendTelegram: false,
    sourceType: "release",
    sourceId: release.id
  });
}
