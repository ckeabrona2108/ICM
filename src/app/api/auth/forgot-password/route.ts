import { NextResponse } from "next/server";
import { z } from "zod";

import { AccountEmailUnavailableError, canReceiveAccountEmail, issuePasswordLink, resolveAppBaseUrl } from "@/lib/account-security";
import { isPrismaConnectionError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const forgotSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase())
});

function shouldExposeDeliveryErrors() {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_EXPOSE_PASSWORD_RESET_DELIVERY_ERRORS === "true";
}

export async function POST(request: Request) {
  const limited = enforceRateLimit({
    key: `auth:forgot:${getRequestIp(request)}`,
    limit: 5,
    windowMs: 15 * 60_000
  });
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = forgotSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        email: {
          equals: parsed.data.email,
          mode: "insensitive"
        }
      },
      select: { id: true, email: true, name: true, password: true },
      take: 2,
      orderBy: {
        id: "asc"
      }
    });

    // The .invalid addresses of VK sign-ins without an email cannot receive the link.
    const user = users.length === 1 && canReceiveAccountEmail(users[0]?.email) ? users[0] : null;
    if (users.length > 1) {
      console.error("[auth/forgot-password] ambiguous email match", {
        email: parsed.data.email
      });
    }

    if (!user) {
      if (shouldExposeDeliveryErrors()) {
        return NextResponse.json(
          { error: "Аккаунт с таким email не найден в текущей базе." },
          { status: 404 }
        );
      }

      return NextResponse.json({
        ok: true,
        message: "Если аккаунт существует, инструкция по восстановлению отправлена."
      });
    }

    try {
      await issuePasswordLink({ user, baseUrl: resolveAppBaseUrl(request), kind: user.password ? "reset" : "set" });
    } catch (error) {
      if (error instanceof AccountEmailUnavailableError) {
        console.error("[auth/forgot-password] SMTP is not configured");
        return NextResponse.json(
          { error: shouldExposeDeliveryErrors() ? "SMTP не настроен. Проверьте SMTP_* переменные в .env." : "Почтовый сервис временно недоступен." },
          { status: 503 }
        );
      }
      console.error("[auth/forgot-password] failed to send reset email", error);
      return NextResponse.json(
        { error: shouldExposeDeliveryErrors() ? "SMTP не отправил письмо. Проверьте логин, пароль, host/port и отправителя." : "Почтовый сервис временно недоступен." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Если аккаунт существует, инструкция по восстановлению отправлена."
    });
  } catch (error) {
    if (isPrismaConnectionError(error)) {
      return NextResponse.json(
        { error: "Сервис временно недоступен. Повторите попытку позже." },
        { status: 503 }
      );
    }
    console.error("[auth/forgot-password] request failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
