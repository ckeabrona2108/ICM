import { Prisma, type PrismaClient } from "@prisma/client";

import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import { getReleaseLifecycleStatus, mapReleaseStatusToSection, shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import { isReleaseHiddenFromCabinet } from "@/lib/release-deletion-state";
import { getDraftLastChangedAt } from "@/lib/draft-retention";
import { loadModerationCalendar } from "@/lib/moderation-calendar-settings";
import { isModerationDelayed } from "@/lib/moderation-schedule";
import { isMergedResubmissionCopy, readReleaseTimeline } from "@/lib/release-timeline";
import { toAbsoluteAppUrl } from "@/lib/vk-messages";
import { formatRubCurrency } from "@/lib/currency-format";
import { listUserReports } from "@/lib/report-service";
import {
  describeReportsToConfirm,
  planReportConfirmReminder,
  REPORT_CONFIRM_FIRST_AFTER_MS,
  REPORT_CONFIRM_KEY_PREFIX,
  REPORT_CONFIRM_REMINDER_KIND,
  summarizeReportsToConfirm
} from "@/lib/report-confirm-reminder";

// Account events that no user action triggers directly: the welcome, and the delayed reminders a
// scheduled run sends (no track a day after signing up, an abandoned draft, a release that came out,
// the next release after the free one, a subscription running out, reports not confirmed). Every reminder goes to all channels once per user and key.

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

// Subscription end, counted from now: each stage covers one day, so a daytime run catches it once.
export const SUBSCRIPTION_REMINDER_STAGES = [
  { stage: "3d", fromMs: 2 * DAY_MS, toMs: 3 * DAY_MS },
  { stage: "1d", fromMs: 0, toMs: DAY_MS },
  { stage: "ended", fromMs: -DAY_MS, toMs: 0 }
] as const;

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
  /** When the event the reminder is about happened; events before the launch are not reminded. */
  eventAt?: Date;
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
    select: { user_id: true, created_at: true }
  });
  const reminders: Reminder[] = [];
  for (const { user_id: userId, created_at: signedUpAt } of welcomes) {
    const tracks = await prisma.track.count({ where: { release: { userId } } });
    if (tracks > 0) continue;
    reminders.push({
      userId,
      key: "signup_no_track",
      kind: "account_signup_reminder",
      title: "Осталось 3 шага до релиза",
      message: "Загрузите трек, добавьте обложку и отправьте релиз на модерацию.",
      href: "/dashboard/releases/new",
      eventAt: signedUpAt
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
      sourceId: release.id,
      eventAt: changedAt
    });
  }
  return reminders;
}

async function findReleaseOutReminders(prisma: PrismaClient, now: Date): Promise<Reminder[]> {
  const found = await prisma.release.findMany({
    where: {
      startDate: windowRange(now, ACCOUNT_REMINDER_WINDOWS.releaseOut),
      OR: [{ status: "approved" }, { upc: { not: null } }]
    },
    select: { id: true, title: true, userId: true, status: true, confirmed: true, upc: true, roles: true, startDate: true }
  });
  const releases = found.filter(
    (release) => shouldTreatReleaseAsApproved(release) && !isReleaseHiddenFromCabinet(release.roles)
  );
  if (releases.length === 0) return [];
  // Smart links are made automatically: give the ready one to share.
  const promos = await prisma.promo_links.findMany({
    where: { releaseId: { in: releases.map((release) => release.id) } },
    select: { releaseId: true, shortName: true }
  });
  const shortNameByRelease = new Map(promos.map((promo) => [promo.releaseId, promo.shortName]));
  return releases.map((release) => {
    const title = release.title?.trim() || "Без названия";
    const shortName = shortNameByRelease.get(release.id);
    return {
      userId: release.userId,
      key: `release_out:${release.id}`,
      kind: "release_published",
      title: "Релиз вышел",
      message: shortName
        ? `«${title}» уже на площадках. Смарт-ссылка со всеми площадками — делитесь ей: ${toAbsoluteAppUrl(`/l/${shortName}`)}`
        : `«${title}» уже на площадках. Ссылки на площадки появятся в смарт-ссылке, как только релиз найдётся на них.`,
      href: `/dashboard/releases/${release.id}/smart-link`,
      sourceType: "release",
      sourceId: release.id,
      eventAt: release.startDate ?? undefined
    };
  });
}

export const MODERATION_DELAYED_KIND = "release_moderation_delayed";
/** Late moderation is reported for releases sent from this day on, so old ones are not reported in a burst. */
export const MODERATION_DELAY_NOTICES_STARTED_AT = new Date("2026-11-21T00:00:00+03:00");

// A release sent to moderation is still not checked a working day after the expected 1–2 days.
// Reported once per sending: a release sent again after changes can be reported again.
async function findModerationDelayedReminders(prisma: PrismaClient, now: Date): Promise<Reminder[]> {
  await loadModerationCalendar(prisma);
  const releases = await prisma.release.findMany({
    where: { status: "moderating", confirmed: true },
    select: { id: true, title: true, userId: true, status: true, confirmed: true, roles: true, moderationStartedAt: true }
  });
  const reminders: Reminder[] = [];
  for (const release of releases) {
    if (!release.confirmed || getReleaseLifecycleStatus(release.status, release.roles) !== "moderation") continue;
    if (isReleaseHiddenFromCabinet(release.roles) || isMergedResubmissionCopy(release.roles)) continue;
    const timeline = readReleaseTimeline(release.roles, { moderationStartedAt: release.moderationStartedAt });
    const sentAt = timeline.submittedAt;
    // Counted from the moment the moderators got it: a release paid days after sending is not late yet.
    const queuedAt = timeline.queuedAt ?? sentAt;
    if (!sentAt || !queuedAt || sentAt < MODERATION_DELAY_NOTICES_STARTED_AT || !isModerationDelayed(queuedAt, now)) continue;
    const title = release.title?.trim() || "Без названия";
    reminders.push({
      userId: release.userId,
      key: `moderation_delayed:${release.id}:${sentAt.toISOString()}`,
      kind: MODERATION_DELAYED_KIND,
      title: "Модерация релиза задерживается",
      message: `Релиз «${title}» проверяется дольше обычного. Мы уже разбираемся и постараемся проверить его как можно скорее.`,
      href: `/dashboard/releases/${release.id}`,
      sourceType: "release",
      sourceId: release.id,
      eventAt: sentAt
    });
  }
  return reminders;
}

async function findFreeReleaseNextReminders(prisma: PrismaClient, now: Date): Promise<Reminder[]> {
  const claims = await prisma.free_release_claims.findMany({
    where: { consumed_at: windowRange(now, ACCOUNT_REMINDER_WINDOWS.freeReleaseNext) },
    select: { user_id: true, release_id: true, consumed_at: true }
  });
  const reminders: Reminder[] = [];
  for (const { user_id: userId, release_id: releaseId, consumed_at: consumedAt } of claims) {
    // Already working on the next one.
    const otherReleases = await prisma.release.count({ where: { userId, ...(releaseId ? { id: { not: releaseId } } : {}) } });
    if (otherReleases > 0) continue;
    reminders.push({
      userId,
      key: "free_release_next",
      kind: "release_next_offer",
      title: "Готовы ко второму релизу?",
      message: "Бесплатный сингл принят. Выпустите следующий релиз — загрузка займёт несколько минут.",
      href: "/dashboard/releases/new",
      eventAt: consumedAt ?? undefined
    });
  }
  return reminders;
}

function formatMoscowDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
}

/** The reminder due for a subscription ending at `expiresAt`, or null. Exported for tests. */
export function planSubscriptionReminder(expiresAt: Date, now: Date): Omit<Reminder, "userId"> | null {
  const left = expiresAt.getTime() - now.getTime();
  const due = SUBSCRIPTION_REMINDER_STAGES.find((item) => left > item.fromMs && left <= item.toMs);
  if (!due) return null;
  // Keyed by the end date too: after a renewal the next end gets its own reminders.
  const key = `subscription_${due.stage}:${expiresAt.toISOString().slice(0, 10)}`;
  const until = formatMoscowDate(expiresAt);
  const href = "/dashboard/subscription";
  if (due.stage === "ended") {
    return {
      key,
      kind: "account_subscription_ended",
      title: "Подписка закончилась",
      message: "Новые релизы теперь ждут оплаты перед модерацией. Продлите подписку, чтобы выпускать их по подписке.",
      href
    };
  }
  return {
    key,
    kind: "account_subscription_ending",
    title: due.stage === "3d" ? "Подписка заканчивается через 3 дня" : "Подписка заканчивается завтра",
    message: `Подписка действует до ${until}. Продлите её, чтобы следующие релизы уходили на модерацию без отдельной оплаты.`,
    href
  };
}

async function findSubscriptionReminders(prisma: PrismaClient, now: Date): Promise<Reminder[]> {
  const first = SUBSCRIPTION_REMINDER_STAGES.reduce((min, item) => Math.min(min, item.fromMs), 0);
  const last = SUBSCRIPTION_REMINDER_STAGES.reduce((max, item) => Math.max(max, item.toMs), 0);
  const users = await prisma.user.findMany({
    where: {
      isSubscribed: true,
      expiresAt: { gt: new Date(now.getTime() + first), lte: new Date(now.getTime() + last) }
    },
    select: { id: true, expiresAt: true }
  });
  const reminders: Reminder[] = [];
  for (const user of users) {
    if (!user.expiresAt) continue;
    const reminder = planSubscriptionReminder(user.expiresAt, now);
    if (reminder) reminders.push({ ...reminder, userId: user.id });
  }
  return reminders;
}

/**
 * Reports waiting for the artist's confirmation: a weekly reminder until they are confirmed (see
 * report-confirm-reminder). Old reports are reminded too: their money is stuck until confirmed.
 */
async function findReportConfirmReminders(prisma: PrismaClient, now: Date): Promise<Reminder[]> {
  const rows = await prisma.financeReport.findMany({
    where: { status: { not: "AGREED" }, createdAt: { lte: new Date(now.getTime() - REPORT_CONFIRM_FIRST_AFTER_MS) } },
    select: { userId: true },
    distinct: ["userId"]
  });
  const reminders: Reminder[] = [];
  for (const { userId } of rows) {
    const summary = summarizeReportsToConfirm(await listUserReports(prisma, userId));
    if (!summary.newestAt) continue;
    const remindersSinceNewest = await prisma.user_notification_reminders.count({
      where: { user_id: userId, key: { startsWith: REPORT_CONFIRM_KEY_PREFIX }, created_at: { gte: summary.newestAt } }
    });
    const key = planReportConfirmReminder({ summary, remindersSinceNewest, now });
    if (!key) continue;
    reminders.push({
      userId,
      key,
      kind: REPORT_CONFIRM_REMINDER_KIND,
      title: "Подтвердите финансовый отчёт",
      message: describeReportsToConfirm(summary, formatRubCurrency),
      href: "/dashboard/finance"
    });
  }
  return reminders;
}

/**
 * Reminders started going out on 19.11.2026. What happened before that day is not reminded, so the
 * first run does not drop a backlog of old drafts and signups on artists. Subscription ends are
 * about money and are still reminded.
 */
export const ACCOUNT_REMINDERS_STARTED_AT = new Date("2026-11-19T00:00:00+03:00");

/** Reminders and tips nobody asked for: an artist gets at most one of them a day. */
export const NUDGE_KINDS = [
  REPORT_CONFIRM_REMINDER_KIND,
  "account_signup_reminder",
  "release_draft_reminder",
  "release_published",
  "release_next_offer",
  "account_subscription_ending",
  "account_subscription_ended",
  "release_tip_snippet",
  "release_tip_lyrics"
];

type NudgeDb = Pick<PrismaClient, "ai_user_notifications">;

/** Artists who already got a reminder or a tip in the last 24 hours. */
export async function findRecentlyNudgedUsers(db: NudgeDb, userIds: string[], now: Date): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.ai_user_notifications.findMany({
    where: {
      user_id: { in: userIds },
      kind: { in: NUDGE_KINDS },
      created_at: { gte: new Date(now.getTime() - DAY_MS) }
    },
    select: { user_id: true }
  });
  return new Set(rows.map((row) => row.user_id));
}

/** Most important first: money, then unfinished work, then news and offers. */
const REMINDER_PRIORITY = [
  MODERATION_DELAYED_KIND,
  REPORT_CONFIRM_REMINDER_KIND,
  "account_subscription_ended",
  "account_subscription_ending",
  "release_draft_reminder",
  "account_signup_reminder",
  "release_published",
  "release_next_offer"
];

function pluralDrafts(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "черновик";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "черновика";
  return "черновиков";
}

/** Several abandoned drafts of one artist become one message; the latest one is named. */
function mergeDrafts(drafts: Reminder[]): Reminder {
  if (drafts.length === 1) return drafts[0];
  const latest = [...drafts].sort((a, b) => (b.eventAt?.getTime() ?? 0) - (a.eventAt?.getTime() ?? 0))[0];
  const title = latest.message.match(/«(.*)»/u)?.[1] ?? "Без названия";
  return {
    ...latest,
    title: "Черновики ждут отправки",
    message: `У вас ${drafts.length} ${pluralDrafts(drafts.length)}, последний — «${title}». Закончите загрузку и отправьте релиз на модерацию.`,
    href: "/dashboard/drafts",
    sourceType: undefined,
    sourceId: undefined
  };
}

export async function runAccountReminders(params: {
  prisma: PrismaClient;
  now?: Date;
  startedAt?: Date;
}): Promise<AccountRemindersResult> {
  const now = params.now ?? new Date();
  const startedAt = params.startedAt ?? ACCOUNT_REMINDERS_STARTED_AT;
  const result: AccountRemindersResult = { sent: [], errors: [] };
  if (!isWithinReminderHours(now)) return { ...result, skipped: "outside_reminder_hours" };

  const finders = [
    findSignupNoTrackReminders,
    findAbandonedDraftReminders,
    findReleaseOutReminders,
    findFreeReleaseNextReminders,
    findSubscriptionReminders,
    findReportConfirmReminders,
    findModerationDelayedReminders
  ];
  const byUser = new Map<string, Reminder[]>();
  for (const find of finders) {
    try {
      for (const reminder of await find(params.prisma, now)) {
        if (reminder.eventAt && reminder.eventAt < startedAt) continue;
        byUser.set(reminder.userId, [...(byUser.get(reminder.userId) ?? []), reminder]);
      }
    } catch (error) {
      result.errors.push({ id: find.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (byUser.size === 0) return result;

  let nudged: Set<string>;
  try {
    nudged = await findRecentlyNudgedUsers(params.prisma, [...byUser.keys()], now);
  } catch (error) {
    // Without knowing who was reminded today, send nothing rather than risk a burst.
    result.errors.push({ id: "recent_nudges", error: error instanceof Error ? error.message : String(error) });
    return result;
  }

  for (const [userId, all] of byUser) {
    // One reminder a day: the rest wait for the next days while they are still relevant. News about
    // the artist's own release (late moderation) is not a reminder and is not held back by them.
    const reminders = nudged.has(userId) ? all.filter((reminder) => !NUDGE_KINDS.includes(reminder.kind)) : all;
    if (reminders.length === 0) continue;
    const groups = new Map<string, Reminder[]>();
    for (const reminder of reminders) groups.set(reminder.kind, [...(groups.get(reminder.kind) ?? []), reminder]);
    const kinds = [...groups.keys()].sort((a, b) => REMINDER_PRIORITY.indexOf(a) - REMINDER_PRIORITY.indexOf(b));

    for (const kind of kinds) {
      const group = groups.get(kind) ?? [];
      try {
        const fresh: Reminder[] = [];
        const mergeable = kind === "release_draft_reminder";
        for (const reminder of group) {
          if (await claimReminder(params.prisma, userId, reminder.key)) fresh.push(reminder);
          // Other kinds go one per day: the next release waits for tomorrow, unclaimed.
          if (!mergeable && fresh.length > 0) break;
        }
        if (fresh.length === 0) continue;
        // Several reminders of one kind (only drafts can repeat) go out as one message.
        const reminder = mergeable ? mergeDrafts(fresh) : fresh[0];
        await deliverUserNotificationSafely(params.prisma, {
          id: `account-reminder-${userId}-${reminder.key}`,
          userId,
          kind: reminder.kind,
          title: reminder.title,
          message: reminder.message,
          href: reminder.href,
          emailCta: true,
          sourceType: reminder.sourceType,
          sourceId: reminder.sourceId,
          resetReadState: true
        });
        for (const sent of fresh) result.sent.push({ userId, key: sent.key });
        break;
      } catch (error) {
        result.errors.push({ id: `${userId}:${kind}`, error: error instanceof Error ? error.message : String(error) });
        break;
      }
    }
  }
  return result;
}
