import { Prisma, type PrismaClient } from "@prisma/client";

import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import { mapReleaseStatusToSection, shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import { isReleaseHiddenFromCabinet } from "@/lib/release-deletion-state";
import { getDraftLastChangedAt } from "@/lib/draft-retention";

// Account events that no user action triggers directly: the welcome, and the delayed reminders a
// cron run sends (no track a day after signing up, an abandoned draft, a release that came out,
// the next release after the free one). Every reminder goes to all channels once per user and key.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const WELCOME_KIND = "account_welcome";

export const ACCOUNT_REMINDER_WINDOWS = {
  // A day after signing up without a single track; signups older than a week are left alone.
  signupNoTrack: { afterMs: DAY_MS, untilMs: 7 * DAY_MS },
  // Two hours after the last change of a draft that was not submitted.
  abandonedDraft: { afterMs: 2 * HOUR_MS, untilMs: 3 * DAY_MS },
  // The release date has come; releases out for more than 3 days are not announced.
  releaseOut: { afterMs: 0, untilMs: 3 * DAY_MS },
  // Three days after the free single was accepted.
  freeReleaseNext: { afterMs: 3 * DAY_MS, untilMs: 14 * DAY_MS }
} as const;

// Reminders wait for the daytime in Moscow (UTC+3, no DST): 09:00–22:00.
export function isWithinReminderHours(now: Date): boolean {
  const moscowHour = (now.getUTCHours() + 3) % 24;
  return moscowHour >= 9 && moscowHour < 22;
}

function windowRange(now: Date, window: { afterMs: number; untilMs: number }) {
  return { gte: new Date(now.getTime() - window.untilMs), lte: new Date(now.getTime() - window.afterMs) };
}

function isWithin(date: Date, now: Date, window: { afterMs: number; untilMs: number }): boolean {
  const elapsed = now.getTime() - date.getTime();
  return elapsed >= window.afterMs && elapsed <= window.untilMs;
}

export async function notifyUserRegistered(prisma: PrismaClient, userId: string): Promise<void> {
  // The welcome also anchors the "no track a day later" reminder.
  await deliverUserNotificationSafely(prisma, {
    id: `account-welcome-${userId}`,
    userId,
    kind: WELCOME_KIND,
    title: "Добро пожаловать в ICECREAMMUSIC",
    message: "Загрузите трек, добавьте обложку и отправьте релиз на модерацию — это займёт несколько минут.",
    href: "/dashboard/releases/new",
    sendEmail: false,
    sendPush: false
  });
}

export async function notifyVkMessagesAllowed(prisma: PrismaClient, userId: string): Promise<void> {
  await deliverUserNotificationSafely(prisma, {
    id: `vk-messages-allowed-${userId}`,
    userId,
    kind: "vk_messages_allowed",
    title: "Уведомления во ВКонтакте включены",
    message: "Сюда будут приходить статусы релизов, финансовые отчёты и начисления.",
    vkMessage:
      "Привет! Это ICECREAMMUSIC. Сюда будут приходить статусы ваших релизов, финансовые отчёты и начисления. Кабинет:",
    href: "/dashboard",
    sendEmail: false,
    sendPush: false,
    sendVk: true
  });
}

export interface AccountRemindersResult {
  skipped?: "outside_reminder_hours";
  sent: Array<{ userId: string; key: string }>;
  errors: Array<{ id: string; error: string }>;
}

type Reminder = {
  userId: string;
  key: string;
  kind: string;
  title: string;
  message: string;
  href: string;
  sourceType?: string;
  sourceId?: string;
};

// Claims the reminder before sending it: a second cron run, or one running in parallel, skips it.
async function claimReminder(prisma: PrismaClient, userId: string, key: string): Promise<boolean> {
  try {
    await prisma.user_notification_reminders.create({ data: { user_id: userId, key } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

async function findSignupNoTrackReminders(prisma: PrismaClient, now: Date): Promise<Reminder[]> {
  const welcomes = await prisma.ai_user_notifications.findMany({
    where: { kind: WELCOME_KIND, created_at: windowRange(now, ACCOUNT_REMINDER_WINDOWS.signupNoTrack) },
    select: { user_id: true }
  });
  const reminders: Reminder[] = [];
  for (const { user_id: userId } of welcomes) {
    const tracks = await prisma.track.count({ where: { release: { userId } } });
    if (tracks > 0) continue;
    reminders.push({
      userId,
      key: "signup_no_track",
      kind: "account_signup_reminder",
      title: "Осталось 3 шага до релиза",
      message: "Загрузите трек, добавьте обложку и отправьте релиз на модерацию.",
      href: "/dashboard/releases/new"
    });
  }
  return reminders;
}

async function findAbandonedDraftReminders(prisma: PrismaClient, now: Date): Promise<Reminder[]> {
  const releases = await prisma.release.findMany({
    where: { confirmed: false, upc: null },
    select: { id: true, title: true, userId: true, status: true, confirmed: true, upc: true, roles: true }
  });
  const reminders: Reminder[] = [];
  for (const release of releases) {
    const section = mapReleaseStatusToSection(release.status, release.confirmed, undefined, {
      upc: release.upc,
      roles: release.roles
    });
    if (section !== "draft" || isReleaseHiddenFromCabinet(release.roles)) continue;
    const changedAt = getDraftLastChangedAt(release.roles);
    if (!changedAt || !isWithin(changedAt, now, ACCOUNT_REMINDER_WINDOWS.abandonedDraft)) continue;
    const title = release.title?.trim() || "Без названия";
    reminders.push({
      userId: release.userId,
      key: `draft:${release.id}`,
      kind: "release_draft_reminder",
      title: "Релиз сохранён в черновиках",
      message: `Черновик «${title}» ждёт вас. Закончите загрузку и отправьте релиз на модерацию.`,
      href: `/dashboard/releases/${release.id}/edit`,
      sourceType: "release",
      sourceId: release.id
    });
  }
  return reminders;
}

async function findReleaseOutReminders(prisma: PrismaClient, now: Date): Promise<Reminder[]> {
  const releases = await prisma.release.findMany({
    where: {
      startDate: windowRange(now, ACCOUNT_REMINDER_WINDOWS.releaseOut),
      OR: [{ status: "approved" }, { upc: { not: null } }]
    },
    select: { id: true, title: true, userId: true, status: true, confirmed: true, upc: true, roles: true }
  });
  return releases
    .filter((release) => shouldTreatReleaseAsApproved(release) && !isReleaseHiddenFromCabinet(release.roles))
    .map((release) => ({
      userId: release.userId,
      key: `release_out:${release.id}`,
      kind: "release_published",
      title: "Релиз вышел",
      message: `«${release.title?.trim() || "Без названия"}» уже на площадках. Соберите все ссылки на одной странице — создайте смарт-линк.`,
      href: `/dashboard/releases/${release.id}/smart-link`,
      sourceType: "release",
      sourceId: release.id
    }));
}

async function findFreeReleaseNextReminders(prisma: PrismaClient, now: Date): Promise<Reminder[]> {
  const claims = await prisma.free_release_claims.findMany({
    where: { consumed_at: windowRange(now, ACCOUNT_REMINDER_WINDOWS.freeReleaseNext) },
    select: { user_id: true, release_id: true }
  });
  const reminders: Reminder[] = [];
  for (const { user_id: userId, release_id: releaseId } of claims) {
    // Already working on the next one.
    const otherReleases = await prisma.release.count({ where: { userId, ...(releaseId ? { id: { not: releaseId } } : {}) } });
    if (otherReleases > 0) continue;
    reminders.push({
      userId,
      key: "free_release_next",
      kind: "release_next_offer",
      title: "Готовы ко второму релизу?",
      message: "Бесплатный сингл принят. Выпустите следующий релиз — загрузка займёт несколько минут.",
      href: "/dashboard/releases/new"
    });
  }
  return reminders;
}

export async function runAccountReminders(params: {
  prisma: PrismaClient;
  now?: Date;
}): Promise<AccountRemindersResult> {
  const now = params.now ?? new Date();
  const result: AccountRemindersResult = { sent: [], errors: [] };
  if (!isWithinReminderHours(now)) return { ...result, skipped: "outside_reminder_hours" };

  const finders = [
    findSignupNoTrackReminders,
    findAbandonedDraftReminders,
    findReleaseOutReminders,
    findFreeReleaseNextReminders
  ];
  for (const find of finders) {
    let reminders: Reminder[];
    try {
      reminders = await find(params.prisma, now);
    } catch (error) {
      result.errors.push({ id: find.name, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    for (const reminder of reminders) {
      try {
        if (!(await claimReminder(params.prisma, reminder.userId, reminder.key))) continue;
        await deliverUserNotificationSafely(params.prisma, {
          id: `account-reminder-${reminder.userId}-${reminder.key}`,
          userId: reminder.userId,
          kind: reminder.kind,
          title: reminder.title,
          message: reminder.message,
          href: reminder.href,
          emailCta: true,
          sourceType: reminder.sourceType,
          sourceId: reminder.sourceId,
          resetReadState: true
        });
        result.sent.push({ userId: reminder.userId, key: reminder.key });
      } catch (error) {
        result.errors.push({
          id: `${reminder.userId}:${reminder.key}`,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
  return result;
}
