import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { sendTelegramMessage } from "@/lib/telegram-notifier";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
  const hasChatId = Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID?.trim());
  if (!hasToken || !hasChatId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Telegram не настроен: заполните TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID в .env и перезапустите сервер.",
        diagnostics: {
          hasToken,
          hasChatId
        }
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  try {
    const ok = await sendTelegramMessage(
      [
        "Тестовое уведомление поддержки",
        "",
        `Время: ${now} UTC`,
        "Статус: Telegram подключен"
      ].join("\n")
    );
    if (!ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Telegram не настроен: заполните TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID."
        },
        { status: 400 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram send failed";
    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
