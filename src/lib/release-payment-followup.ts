import type { Prisma, PrismaClient } from "@prisma/client";

import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import { applyYooKassaWebhookOrder } from "@/lib/payment-order-service";
import { getReleaseLifecycleStatus } from "@/lib/release-counts";
import { isReleaseHiddenFromCabinet } from "@/lib/release-deletion-state";
import { getYooKassaPayment } from "@/lib/yookassa";

const HOUR_MS = 60 * 60 * 1000;

/** Reminder stages counted from the moment a submitted release started waiting for payment. */
export const RELEASE_PAYMENT_REMINDER_STAGES = [
  { stage: 1, afterMs: HOUR_MS },
  { stage: 2, afterMs: 24 * HOUR_MS },
  { stage: 3, afterMs: 72 * HOUR_MS }
] as const;

/** Releases that waited longer than this without any reminder are old leftovers and are not reminded. */
const MAX_FIRST_REMINDER_AGE_MS = 7 * 24 * HOUR_MS;
const ORDER_RECONCILE_WINDOW_MS = 14 * 24 * HOUR_MS;

const CANCELLATION_MESSAGES: Record<string, string> = {
  expired_on_confirmation: "Время на оплату истекло — платёж не был подтверждён. Деньги не списаны.",
  insufficient_funds: "Недостаточно средств на карте.",
  "3d_secure_failed": "Не пройдена проверка 3-D Secure. Попробуйте снова и подтвердите платёж в приложении банка.",
  card_expired: "Срок действия карты истёк. Попробуйте другую карту.",
  invalid_card_number: "Неверный номер карты.",
  invalid_csc: "Неверный CVC/CVV-код.",
  call_issuer: "Банк отклонил платёж. Обратитесь в банк или попробуйте другую карту.",
  issuer_unavailable: "Банк временно недоступен. Попробуйте позже или другую карту.",
  payment_method_limit_exceeded: "Превышен лимит по карте. Попробуйте другую карту.",
  payment_method_restricted: "Банк ограничил операции по этому способу оплаты. Попробуйте другой способ.",
  country_forbidden: "Оплата картой этой страны недоступна. Попробуйте другую карту.",
  fraud_suspected: "Платёж заблокирован системой безопасности. Попробуйте другую карту.",
  general_decline: "Банк отклонил платёж. Попробуйте снова или выберите другую карту.",
  internal_timeout: "Платёжная система не ответила вовремя. Попробуйте снова.",
  canceled_by_merchant: "Платёж отменён. Попробуйте снова."
};

export function describeYooKassaCancellation(reason: string | null | undefined): string {
  return (reason && CANCELLATION_MESSAGES[reason]) || "Оплата не прошла. Деньги не списаны — попробуйте снова.";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface PaymentReminderState {
  waitingSince: string;
  stage: number;
  lastSentAt?: string;
}

function readReminderState(roles: unknown): PaymentReminderState | null {
  const state = asRecord(asRecord(roles)?.paymentReminders);
  const waitingSince = asDate(state?.waitingSince);
  if (!state || !waitingSince) return null;
  return {
    waitingSince: waitingSince.toISOString(),
    stage: typeof state.stage === "number" ? state.stage : 0,
    lastSentAt: asDate(state.lastSentAt)?.toISOString()
  };
}

/** Marks the moment a submitted release started waiting for payment; reminders count from it. */
export function withReleasePaymentWaitingSince(roles: Record<string, unknown>, at: Date = new Date()): Record<string, unknown> {
  return { ...roles, paymentReminders: { waitingSince: at.toISOString(), stage: 0 } };
}

/** Returns the reminder stage that is due now, or null when nothing should be sent. */
export function resolveDueReminderStage(params: {
  waitingSince: Date;
  sentStage: number;
  now: Date;
}): number | null {
  const elapsed = params.now.getTime() - params.waitingSince.getTime();
  if (params.sentStage === 0 && elapsed > MAX_FIRST_REMINDER_AGE_MS) return null;
  const due = [...RELEASE_PAYMENT_REMINDER_STAGES].reverse().find((item) => elapsed >= item.afterMs);
  if (!due || due.stage <= params.sentStage) return null;
  return due.stage;
}

const REMINDER_TEXT: Record<number, { title: string; message: (title: string) => string }> = {
  1: {
    title: "Ваш релиз ждёт оплаты",
    message: (title) => `Релиз «${title}» отправлен, но ещё не оплачен. Оплатите его, чтобы модерация началась.`
  },
  2: {
    title: "Релиз всё ещё ждёт оплаты",
    message: (title) => `Релиз «${title}» не попадёт на модерацию, пока не оплачен. Оплата занимает минуту.`
  },
  3: {
    title: "Не забудьте оплатить релиз",
    message: (title) => `Релиз «${title}» ждёт оплаты уже 3 дня. Оплатите его, чтобы он вышел на площадках.`
  }
};

export interface ReleasePaymentFollowupResult {
  reconciledOrders: string[];
  remindersSent: Array<{ releaseId: string; stage: number }>;
  errors: Array<{ id: string; error: string }>;
}

/** Confirms release orders that YooKassa already charged but our webhook/return flow missed. */
async function reconcilePendingReleaseOrders(
  prisma: PrismaClient,
  now: Date,
  result: ReleasePaymentFollowupResult
): Promise<Set<string>> {
  const paidReleaseIds = new Set<string>();
  const orders = await prisma.orders.findMany({
    where: { type: "release", confirmed: false, createdAt: { gte: new Date(now.getTime() - ORDER_RECONCILE_WINDOW_MS) } },
    select: { id: true, userId: true, metadata: true }
  });

  for (const order of orders) {
    const metadata = asRecord(order.metadata);
    const providerPaymentId = typeof metadata?.providerPaymentId === "string" ? metadata.providerPaymentId : null;
    const releaseId = typeof metadata?.releaseId === "string" ? metadata.releaseId : null;
    if (!providerPaymentId || !releaseId) continue;

    try {
      const payment = await getYooKassaPayment(providerPaymentId);
      if (payment.status !== "succeeded") continue;

      // A release that is already paid (e.g. marked by an admin) must not be pushed back to moderation.
      const release = await prisma.release.findFirst({
        where: { id: releaseId, userId: order.userId },
        select: { confirmed: true }
      });
      if (!release || release.confirmed) continue;

      const applied = await applyYooKassaWebhookOrder({
        prisma,
        orderId: order.id,
        providerPaymentId,
        status: "succeeded"
      });
      if (applied.applied) {
        result.reconciledOrders.push(order.id);
        paidReleaseIds.add(releaseId);
      }
    } catch (error) {
      result.errors.push({ id: order.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return paidReleaseIds;
}

export async function runReleasePaymentFollowup(params: {
  prisma: PrismaClient;
  now?: Date;
}): Promise<ReleasePaymentFollowupResult> {
  const now = params.now ?? new Date();
  const result: ReleasePaymentFollowupResult = { reconciledOrders: [], remindersSent: [], errors: [] };
  const paidNow = await reconcilePendingReleaseOrders(params.prisma, now, result);

  const releases = await params.prisma.release.findMany({
    where: { confirmed: false, status: "moderating" },
    select: { id: true, title: true, userId: true, status: true, roles: true, _count: { select: { track: true } } }
  });

  for (const release of releases) {
    if (paidNow.has(release.id)) continue;
    if (getReleaseLifecycleStatus(release.status, release.roles) !== "moderation") continue;
    if (isReleaseHiddenFromCabinet(release.roles)) continue;
    if (release._count.track === 0) continue;

    const roles = asRecord(release.roles) ?? {};
    const state = readReminderState(roles);
    // Releases submitted before reminders existed start counting from their last draft save.
    const waitingSince = state ? new Date(state.waitingSince) : asDate(roles.draftUpdatedAt) ?? now;
    const stage = resolveDueReminderStage({ waitingSince, sentStage: state?.stage ?? 0, now });

    if (stage === null) {
      if (!state) {
        await params.prisma.release.update({
          where: { id: release.id },
          data: { roles: withReleasePaymentWaitingSince(roles, waitingSince) as Prisma.InputJsonValue }
        });
      }
      continue;
    }

    const title = release.title?.trim() || "Без названия";
    const text = REMINDER_TEXT[stage];
    try {
      await params.prisma.release.update({
        where: { id: release.id },
        data: {
          roles: {
            ...roles,
            paymentReminders: { waitingSince: waitingSince.toISOString(), stage, lastSentAt: now.toISOString() }
          } as Prisma.InputJsonValue
        }
      });
      await deliverUserNotificationSafely(params.prisma, {
        id: `release-payment-reminder-${release.id}-${stage}`,
        userId: release.userId,
        kind: "release_payment_reminder",
        title: text.title,
        message: text.message(title),
        href: `/dashboard/releases/${release.id}?pay=1`,
        emailCta: true,
        sourceType: "release",
        sourceId: release.id,
        resetReadState: true
      });
      result.remindersSent.push({ releaseId: release.id, stage });
    } catch (error) {
      result.errors.push({ id: release.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return result;
}
