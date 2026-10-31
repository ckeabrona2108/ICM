import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkVkGroupMembership, getVkIdConfig } from "@/lib/vk-id";

export const dynamic = "force-dynamic";

// Re-checks the VK group subscription after the artist subscribed.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `vk:membership:${session.user.id}`, limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const config = getVkIdConfig();
  if (!config) return NextResponse.json({ error: "Проверка подписки временно недоступна." }, { status: 503 });

  try {
    const link = await prisma.vk_links.findUnique({ where: { user_id: session.user.id }, select: { vk_user_id: true } });
    if (!link) return NextResponse.json({ error: "Сначала привяжите ВКонтакте." }, { status: 409 });

    let isMember: boolean;
    try {
      isMember = await checkVkGroupMembership({ config, vkUserId: link.vk_user_id });
    } catch (error) {
      console.error("[vk-membership] check failed", error);
      return NextResponse.json({ error: "ВКонтакте не ответил. Попробуйте через минуту." }, { status: 502 });
    }

    await prisma.vk_links.update({
      where: { user_id: session.user.id },
      data: { is_group_member: isMember, member_checked_at: new Date() }
    });
    return NextResponse.json({ ok: true, isMember });
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, ["vk_links", "icecream.vk_links"])) {
      return NextResponse.json({ error: "Проверка подписки временно недоступна." }, { status: 503 });
    }
    throw error;
  }
}
