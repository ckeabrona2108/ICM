import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { isNotificationChannelId, setNotificationChannel } from "@/lib/notification-settings";
import { prisma } from "@/lib/prisma";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { enforceRateLimit } from "@/lib/rate-limit";

// Turns one notification channel on or off for the signed-in artist.
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `notification-settings:${userId}`, limit: 30, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { channel?: unknown; enabled?: unknown } | null;
  if (!isNotificationChannelId(body?.channel) || typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  try {
    const settings = await setNotificationChannel(prisma, userId, body.channel, body.enabled);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, ["user_notification_settings", "icecream.user_notification_settings"])) {
      return NextResponse.json({ error: "Настройки уведомлений временно недоступны." }, { status: 503 });
    }
    throw error;
  }
}
