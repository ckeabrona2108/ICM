import type { Prisma, PrismaClient } from "@prisma/client";

import { deliverUserNotification } from "@/lib/notification-delivery-service";

type OutboxPrisma = PrismaClient | Prisma.TransactionClient;

export interface SocialNotificationEvent {
  id: string;
  userId: string;
  kind: string;
  title: string;
  message: string;
  href: string;
  sourceType?: "post" | "release" | "comment";
  sourceId?: string;
  sendPush?: boolean;
}

export async function enqueueSocialNotification(
  prisma: OutboxPrisma,
  event: SocialNotificationEvent
): Promise<boolean> {
  const result = await prisma.social_notification_outbox.createMany({
    data: [{
      event_id: event.id,
      user_id: event.userId,
      kind: event.kind,
      title: event.title,
      message: event.message,
      href: event.href,
      source_type: event.sourceType ?? null,
      source_id: event.sourceId ?? null,
      send_push: event.sendPush !== false
    }],
    skipDuplicates: true
  });
  return result.count === 1;
}

export async function dispatchSocialNotification(
  prisma: PrismaClient,
  eventId: string
): Promise<boolean> {
  const now = new Date();
  const staleLock = new Date(now.getTime() - 5 * 60_000);
  const claimed = await prisma.social_notification_outbox.updateMany({
    where: {
      event_id: eventId,
      delivered_at: null,
      available_at: { lte: now },
      OR: [
        { status: { in: ["pending", "failed"] } },
        { status: "processing", locked_at: { lt: staleLock } }
      ]
    },
    data: {
      status: "processing",
      locked_at: now,
      attempt_count: { increment: 1 },
      last_error: null
    }
  });
  if (claimed.count === 0) return false;

  const row = await prisma.social_notification_outbox.findUnique({ where: { event_id: eventId } });
  if (!row) return false;
  try {
    await deliverUserNotification(prisma, {
      id: row.event_id,
      userId: row.user_id,
      kind: row.kind,
      title: row.title,
      message: row.message,
      href: row.href,
      sourceType: row.source_type ?? undefined,
      sourceId: row.source_id ?? undefined,
      sendEmail: false,
      sendPush: row.send_push,
      resetReadState: false,
      deliveryKey: row.id
    });
    await prisma.social_notification_outbox.update({
      where: { id: row.id },
      data: { status: "delivered", delivered_at: new Date(), locked_at: null, last_error: null }
    });
    return true;
  } catch (error) {
    const delayMs = Math.min(60 * 60_000, 2 ** Math.min(row.attempt_count, 10) * 1_000);
    await prisma.social_notification_outbox.update({
      where: { id: row.id },
      data: {
        status: "failed",
        available_at: new Date(Date.now() + delayMs),
        locked_at: null,
        last_error: String(error).slice(0, 4_000)
      }
    });
    throw error;
  }
}

export async function dispatchSocialNotificationsSafely(
  prisma: PrismaClient,
  eventIds: readonly string[]
): Promise<void> {
  await Promise.all(Array.from(new Set(eventIds)).map((eventId) =>
    dispatchSocialNotification(prisma, eventId).catch((error) => {
      console.error("[social-notification-outbox] delivery failed", { eventId, error });
    })
  ));
}

export async function retryPendingSocialNotifications(
  prisma: PrismaClient,
  limit = 50
): Promise<number> {
  const staleLock = new Date(Date.now() - 5 * 60_000);
  const rows = await prisma.social_notification_outbox.findMany({
    where: {
      delivered_at: null,
      available_at: { lte: new Date() },
      OR: [
        { status: { in: ["pending", "failed"] } },
        { status: "processing", locked_at: { lt: staleLock } }
      ]
    },
    orderBy: { available_at: "asc" },
    take: Math.min(Math.max(limit, 1), 200),
    select: { event_id: true }
  });
  const results = await Promise.all(rows.map((row) =>
    dispatchSocialNotification(prisma, row.event_id).catch(() => false)
  ));
  return results.filter(Boolean).length;
}
