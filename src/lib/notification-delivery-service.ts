import type { PrismaClient } from "@prisma/client";
import webpush from "web-push";

import { sendDashboardEventEmail } from "@/lib/user-event-email";

export interface UserNotificationEvent {
  id: string;
  userId: string;
  kind: string;
  title: string;
  message: string;
  href: string;
  sendEmail?: boolean;
  sendPush?: boolean;
  resetReadState?: boolean;
}

function configureWebPush(): boolean {
  const subject = process.env.WEB_PUSH_SUBJECT?.trim() || process.env.NEXTAUTH_URL?.trim();
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject.startsWith("mailto:") || subject.startsWith("http") ? subject : `mailto:${subject}`, publicKey, privateKey);
  return true;
}

async function sendPushNotifications(prisma: PrismaClient, event: UserNotificationEvent): Promise<void> {
  if (!configureWebPush()) return;
  const subscriptions = await prisma.push_subscriptions.findMany({
    where: { user_id: event.userId },
    select: { endpoint: true, p256dh: true, auth: true }
  });
  const payload = JSON.stringify({
    title: event.title,
    body: event.message,
    href: event.href,
    tag: event.id
  });

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, payload);
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.push_subscriptions.deleteMany({ where: { endpoint: subscription.endpoint } });
        return;
      }
      console.error("[notification-push] delivery failed", { eventId: event.id, statusCode, error });
    }
  }));
}

export async function deliverUserNotification(
  prisma: PrismaClient,
  event: UserNotificationEvent
): Promise<void> {
  await prisma.ai_user_notifications.upsert({
    where: { id: event.id },
    create: {
      id: event.id,
      user_id: event.userId,
      kind: event.kind,
      title: event.title,
      message: event.message,
      cta_label: "Открыть",
      cta_href: event.href
    },
    update: {
      kind: event.kind,
      title: event.title,
      message: event.message,
      cta_label: "Открыть",
      cta_href: event.href,
      ...(event.resetReadState
        ? { read_at: null, created_at: new Date() }
        : {})
    }
  });

  const user = event.sendEmail === false
    ? null
    : await prisma.user.findUnique({
        where: { id: event.userId },
        select: { email: true, name: true }
      });

  const deliveries: Promise<unknown>[] = [];
  if (user) {
    deliveries.push(sendDashboardEventEmail({
      to: user.email,
      userName: user.name,
      title: event.title,
      message: event.message,
      href: event.href
    }));
  }
  if (event.sendPush !== false) {
    deliveries.push(sendPushNotifications(prisma, event));
  }
  await Promise.all(deliveries);
}

export async function deliverUserNotificationSafely(
  prisma: PrismaClient,
  event: UserNotificationEvent
): Promise<void> {
  try {
    await deliverUserNotification(prisma, event);
  } catch (error) {
    console.error("[notification-delivery] failed", { eventId: event.id, userId: event.userId, error });
  }
}
