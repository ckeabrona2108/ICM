import type { PrismaClient } from "@prisma/client";

import { isAnyPrismaColumnMissingError, isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import {
  buildVkNotificationText,
  getVkMessagesConfig,
  sendVkCommunityMessage,
  vkRandomIdFor,
  type VkMessagesConfig
} from "@/lib/vk-messages";

const VK_LINK_STORAGE = ["vk_links", "icecream.vk_links"];
const VK_MESSAGES_COLUMNS = ["vk_links.messages_allowed", "messages_allowed"];

type VkLinkDb = Pick<PrismaClient, "vk_links">;

function isVkStorageMissing(error: unknown): boolean {
  return isAnyPrismaTableMissingError(error, VK_LINK_STORAGE) || isAnyPrismaColumnMissingError(error, VK_MESSAGES_COLUMNS);
}

export interface VkChannelEvent {
  id: string;
  userId: string;
  title: string;
  message: string;
  href: string;
  vkMessage?: string;
  vkHref?: string;
}

// The VK copy of a cabinet notification. Never throws: VK being down, a revoked permission or a
// missing migration must not break the action that produced the event.
export async function sendVkUserNotification(
  prisma: VkLinkDb,
  event: VkChannelEvent,
  options: { config?: VkMessagesConfig | null; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}
): Promise<boolean> {
  const config = options.config === undefined ? getVkMessagesConfig() : options.config;
  if (!config) return false;
  try {
    const link = await prisma.vk_links.findUnique({
      where: { user_id: event.userId },
      select: { vk_user_id: true, messages_allowed: true }
    });
    if (!link?.messages_allowed) return false;

    const result = await sendVkCommunityMessage({
      config,
      vkUserId: link.vk_user_id,
      text: buildVkNotificationText({
        title: event.title,
        message: event.vkMessage ?? event.message,
        href: event.vkHref ?? event.href
      }),
      randomId: vkRandomIdFor(event.id),
      fetchImpl: options.fetchImpl,
      sleep: options.sleep
    });
    if (result === "not_allowed") {
      // The artist revoked the permission and the deny callback did not reach us.
      await prisma.vk_links.update({
        where: { user_id: event.userId },
        data: { messages_allowed: false, messages_checked_at: new Date() }
      });
      return false;
    }
    return true;
  } catch (error) {
    if (!isVkStorageMissing(error)) {
      console.error("[vk-notification] failed", { eventId: event.id, userId: event.userId, error });
    }
    return false;
  }
}

// Stores the permission for a VK account. Returns the cabinet and whether messages became
// allowed just now (so the caller can greet the artist once), or null when the VK account is
// not linked to any cabinet.
export async function setVkMessagesAllowed(
  prisma: VkLinkDb,
  params: { vkUserId: string; allowed: boolean; now?: Date }
): Promise<{ userId: string; newlyAllowed: boolean } | null> {
  const now = params.now ?? new Date();
  const link = await prisma.vk_links.findUnique({
    where: { vk_user_id: params.vkUserId },
    select: { user_id: true, messages_allowed: true, messages_allowed_at: true }
  });
  if (!link) return null;

  await prisma.vk_links.update({
    where: { vk_user_id: params.vkUserId },
    data: {
      messages_allowed: params.allowed,
      messages_checked_at: now,
      ...(params.allowed && !link.messages_allowed ? { messages_allowed_at: now } : {})
    }
  });
  // Greet only the first time; allowing again after a deny stays quiet.
  return { userId: link.user_id, newlyAllowed: params.allowed && !link.messages_allowed_at };
}
