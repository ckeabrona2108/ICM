import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions, isAdminEmail } from "@/lib/auth";
import { disconnectLoginMethod, isLoginMethodId, readLinkedAccounts, type LoginMethodId } from "@/lib/linked-accounts";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireSecurityCode } from "@/lib/security-code-route";
import { notifySecurityEvent } from "@/lib/security-codes";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const state = await readLinkedAccounts(prisma, userId, { isAdminEmail });
  if (!state) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `linked-accounts:disconnect:${userId}`, limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const method = new URL(request.url).searchParams.get("method");
  if (!isLoginMethodId(method)) return NextResponse.json({ error: "Неизвестный способ входа." }, { status: 400 });

  const securityCode = await requireSecurityCode(userId, "unlink");
  if (!securityCode.ok) return securityCode.response;

  const result = await disconnectLoginMethod(prisma, userId, method);
  if (!result.ok) {
    await securityCode.release();
    return NextResponse.json(
      {
        error:
          result.error === "last_method"
            ? "Это единственный способ входа. Сначала подключите другой."
            : "Этот способ входа уже отключён."
      },
      { status: 409 }
    );
  }
  await notifySecurityEvent(prisma, {
    userId,
    eventId: `unlink-${method}-${Date.now()}`,
    title: "Способ входа отключён",
    message: `От кабинета ICECREAMMUSIC отключили вход через ${UNLINK_LABELS[method]}.`
  });
  return NextResponse.json({ ok: true });
}

const UNLINK_LABELS: Record<LoginMethodId, string> = {
  password: "email и пароль",
  yandex: "Яндекс",
  vk: "VK",
  telegram: "Telegram"
};
