import type { PrismaClient } from "@prisma/client";

import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";

// Per-artist switches for the channels account events go to. Turning a channel off keeps the
// account linked (VK still signs in, Telegram still signs in), it only stops the messages.
// Security mail (password links, email confirmation) is not an event and always goes out.

export type NotificationChannelId = "email" | "vk" | "telegram";
export const NOTIFICATION_CHANNEL_IDS: readonly NotificationChannelId[] = ["email", "vk", "telegram"];

export type NotificationSettings = Record<NotificationChannelId, boolean>;
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { email: true, vk: true, telegram: true };

const STORAGE = ["user_notification_settings", "icecream.user_notification_settings"];

type SettingsDb = Pick<PrismaClient, "user_notification_settings">;

export function isNotificationChannelId(value: unknown): value is NotificationChannelId {
  return typeof value === "string" && (NOTIFICATION_CHANNEL_IDS as readonly string[]).includes(value);
}

// Never throws for a missing table: before the migration every channel simply stays on.
export async function readNotificationSettings(db: SettingsDb, userId: string): Promise<NotificationSettings> {
  try {
    const row = await db.user_notification_settings.findUnique({
      where: { user_id: userId },
      select: { email: true, vk: true, telegram: true }
    });
    return row ?? { ...DEFAULT_NOTIFICATION_SETTINGS };
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, STORAGE)) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    throw error;
  }
}

export async function setNotificationChannel(
  db: SettingsDb,
  userId: string,
  channel: NotificationChannelId,
  enabled: boolean
): Promise<NotificationSettings> {
  return db.user_notification_settings.upsert({
    where: { user_id: userId },
    create: { user_id: userId, [channel]: enabled },
    update: { [channel]: enabled },
    select: { email: true, vk: true, telegram: true }
  });
}
