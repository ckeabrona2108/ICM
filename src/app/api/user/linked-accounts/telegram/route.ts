import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions, isAdminEmail } from "@/lib/auth";
import { linkOAuthIdentity } from "@/lib/oauth-login";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getTelegramLoginConfig, verifyTelegramLogin } from "@/lib/telegram-login";
import { sendTelegramWelcome } from "@/lib/telegram-notification-channel";

// "Connect Telegram" in the profile: the Login Widget data is checked locally and the Telegram
// account joins the signed-in cabinet.
export const dynamic = "force-dynamic";

const LINK_ERRORS = {
  admin: "Для этого аккаунта вход только по email и паролю.",
  taken: "Этот Telegram уже подключён к другому кабинету.",
  already_linked: "К кабинету уже подключён другой Telegram. Сначала отключите его.",
  unavailable: "Подключение Telegram временно недоступно."
} as const;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `linked-accounts:telegram:${userId}`, limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const config = getTelegramLoginConfig();
  if (!config) return NextResponse.json({ error: LINK_ERRORS.unavailable }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { payload?: unknown } | null;
  const check = verifyTelegramLogin(body?.payload, config.botToken);
  if (!check.ok) {
    return NextResponse.json({ error: "Telegram не подтвердил вход. Попробуйте ещё раз." }, { status: 400 });
  }

  const result = await linkOAuthIdentity(
    userId,
    { provider: "telegram", providerAccountId: check.telegramUserId, email: null, name: check.name },
    { isAdminEmail }
  );
  if (!result.ok) return NextResponse.json({ error: LINK_ERRORS[result.error] }, { status: 409 });

  const welcome = await sendTelegramWelcome(prisma, check.telegramUserId);
  return NextResponse.json({ ok: true, messages: welcome === "sent" ? "allowed" : welcome === "blocked" ? "blocked" : "unknown" });
}

// "Check" in the notifications block: after the artist pressed Start in the bot, a test message
// tells whether the bot can write now.
export async function PATCH() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `linked-accounts:telegram-check:${userId}`, limit: 5, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const account = await prisma.oauth_accounts
    .findUnique({ where: { user_id_provider: { user_id: userId, provider: "telegram" } }, select: { provider_account_id: true } })
    .catch(() => null);
  if (!account) return NextResponse.json({ error: "Сначала подключите Telegram." }, { status: 409 });

  const result = await sendTelegramWelcome(prisma, account.provider_account_id);
  if (result === null) return NextResponse.json({ error: LINK_ERRORS.unavailable }, { status: 503 });
  if (result === "failed") return NextResponse.json({ error: "Telegram не ответил. Попробуйте через минуту." }, { status: 502 });
  return NextResponse.json({ ok: true, allowed: result === "sent" });
}
