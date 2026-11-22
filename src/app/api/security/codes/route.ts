import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  CHANNEL_LABELS,
  formatHoldUntil,
  issueSecurityCode,
  isSecurityStorageMissing,
  readCodeChannels,
  SECURITY_ACTIONS,
  CODE_CHANNELS
} from "@/lib/security-codes";

export const dynamic = "force-dynamic";

// Sends a code for one action to the chosen channel (or the first one the cabinet has).
const bodySchema = z.object({
  action: z.enum(SECURITY_ACTIONS as [string, ...string[]]),
  channel: z.enum(CODE_CHANNELS as [string, ...string[]]).optional()
});

const ERRORS = {
  no_channel: "Нет способа получить код. Подключите Telegram или подтвердите почту в профиле.",
  channel_unavailable: "Сюда код отправить не получилось. Выберите другой способ.",
  delivery_failed: "Не удалось отправить код. Попробуйте ещё раз или выберите другой способ.",
  too_soon: "Код уже отправлен. Повторно можно через минуту.",
  too_many: "Слишком много кодов за час. Попробуйте позже."
} as const;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `security:codes:${userId}`, limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  const action = parsed.data.action as (typeof SECURITY_ACTIONS)[number];
  const channel = (parsed.data.channel ?? null) as (typeof CODE_CHANNELS)[number] | null;

  try {
    const result = await issueSecurityCode(prisma, { userId, action, channel });
    if (!result.ok) {
      const channels = await readCodeChannels(prisma, userId);
      let error: string = ERRORS[result.error];
      if (result.error === "too_soon" && result.retryAt) {
        const seconds = Math.max(1, Math.ceil((result.retryAt.getTime() - Date.now()) / 1000));
        error = `Код уже отправлен. Повторно можно через ${seconds} с.`;
      }
      if (result.error === "no_channel" && channels.held[0]) {
        error = `Коды начнут приходить в ${CHANNEL_LABELS[channels.held[0].channel]} ${formatHoldUntil(channels.held[0].until)} (МСК).`;
      }
      return NextResponse.json(
        {
          error,
          reason: result.error,
          retryAt: result.retryAt?.toISOString() ?? null,
          channels: channels.ready
        },
        { status: result.error === "too_soon" || result.error === "too_many" ? 429 : 409 }
      );
    }
    return NextResponse.json({
      ok: true,
      challengeId: result.challengeId,
      channel: result.channel,
      expiresAt: result.expiresAt.toISOString(),
      resendAt: result.resendAt.toISOString()
    });
  } catch (error) {
    if (isSecurityStorageMissing(error)) {
      return NextResponse.json({ error: "Сервис кодов обновляется. Попробуйте через несколько минут." }, { status: 503 });
    }
    console.error("[security/codes] send failed", error);
    return NextResponse.json({ error: "Не удалось отправить код. Попробуйте позже." }, { status: 500 });
  }
}
