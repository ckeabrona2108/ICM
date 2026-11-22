import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isSecurityStorageMissing, normalizeSecurityCode, verifySecurityCode } from "@/lib/security-codes";

export const dynamic = "force-dynamic";

// Checks the typed code. A correct code lets the action through once within 10 minutes.
const bodySchema = z.object({ challengeId: z.string().uuid(), code: z.string().max(20) });

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `security:codes:verify:${userId}`, limit: 20, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const code = parsed.success ? normalizeSecurityCode(parsed.data.code) : null;
  if (!parsed.success || !code) return NextResponse.json({ error: "Введите 6 цифр из сообщения." }, { status: 400 });

  try {
    const result = await verifySecurityCode(prisma, { userId, challengeId: parsed.data.challengeId, code });
    if (result.ok) return NextResponse.json({ ok: true });
    const error =
      result.error === "invalid"
        ? `Неверный код. Осталось попыток: ${result.attemptsLeft}.`
        : result.error === "attempts"
          ? "Попытки закончились. Запросите новый код."
          : "Код устарел. Запросите новый.";
    return NextResponse.json({ error, reason: result.error }, { status: 400 });
  } catch (error) {
    if (isSecurityStorageMissing(error)) {
      return NextResponse.json({ error: "Сервис кодов обновляется. Попробуйте через несколько минут." }, { status: 503 });
    }
    console.error("[security/codes/verify] failed", error);
    return NextResponse.json({ error: "Не удалось проверить код. Попробуйте позже." }, { status: 500 });
  }
}
