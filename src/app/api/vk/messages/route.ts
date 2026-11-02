import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { notifyVkMessagesAllowed } from "@/lib/account-lifecycle-notifications";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyPrismaColumnMissingError, isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkVkMessagesAllowed, getVkMessagesConfig } from "@/lib/vk-messages";
import { setVkMessagesAllowed } from "@/lib/vk-notification-channel";

export const dynamic = "force-dynamic";

export interface VkMessagesStatus {
  available: boolean;
  linked: boolean;
  allowed: boolean;
}

function isStorageMissing(error: unknown): boolean {
  return (
    isAnyPrismaTableMissingError(error, ["vk_links", "icecream.vk_links"]) ||
    isAnyPrismaColumnMissingError(error, ["vk_links.messages_allowed", "messages_allowed"])
  );
}

async function readStatus(userId: string): Promise<VkMessagesStatus> {
  if (!getVkMessagesConfig()) return { available: false, linked: false, allowed: false };
  const link = await prisma.vk_links.findUnique({ where: { user_id: userId }, select: { messages_allowed: true } });
  return { available: true, linked: Boolean(link), allowed: Boolean(link?.messages_allowed) };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await readStatus(session.user.id), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (isStorageMissing(error)) return NextResponse.json({ available: false, linked: false, allowed: false });
    throw error;
  }
}

// Asks VK whether the artist has allowed messages from the community, in case the
// message_allow callback has not reached us.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `vk:messages:${session.user.id}`, limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const config = getVkMessagesConfig();
  if (!config) return NextResponse.json({ error: "Уведомления во ВКонтакте временно недоступны." }, { status: 503 });

  try {
    const link = await prisma.vk_links.findUnique({ where: { user_id: session.user.id }, select: { vk_user_id: true } });
    if (!link) return NextResponse.json({ error: "Сначала привяжите ВКонтакте." }, { status: 409 });

    let allowed: boolean;
    try {
      allowed = await checkVkMessagesAllowed({ config, vkUserId: link.vk_user_id });
    } catch (error) {
      console.error("[vk-messages] check failed", error);
      return NextResponse.json({ error: "ВКонтакте не ответил. Попробуйте через минуту." }, { status: 502 });
    }

    const result = await setVkMessagesAllowed(prisma, { vkUserId: link.vk_user_id, allowed });
    if (result?.newlyAllowed) await notifyVkMessagesAllowed(prisma, result.userId);
    return NextResponse.json({ ok: true, allowed });
  } catch (error) {
    if (isStorageMissing(error)) {
      return NextResponse.json({ error: "Уведомления во ВКонтакте временно недоступны." }, { status: 503 });
    }
    throw error;
  }
}
