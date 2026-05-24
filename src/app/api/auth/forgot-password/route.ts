import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSmtpBzTransporter, getSmtpFromAddress } from "@/lib/smtp-bz";
import { isPrismaConnectionError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const forgotSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase())
});

function resolveBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(request: Request) {
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
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: parsed.data.email,
          mode: "insensitive"
        }
      },
      select: { id: true, email: true, name: true }
    });

    if (user) {
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 1000 * 60 * 30);

      await prisma.verification_tokens.deleteMany({
        where: {
          user_id: user.id,
          type: "recover"
        }
      });

      await prisma.verification_tokens.create({
        data: {
          user_id: user.id,
          token,
          type: "recover",
          expires
        }
      });

      const baseUrl = resolveBaseUrl(request);
      const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

      const transporter = getSmtpBzTransporter();
      const from = getSmtpFromAddress();
      if (transporter && from) {
        try {
          await transporter.sendMail({
            from,
            to: user.email,
            subject: "Восстановление пароля ICECREAMMUSIC",
            text: `Здравствуйте, ${user.name}.\n\nПерейдите по ссылке для сброса пароля: ${resetUrl}\n\nСсылка действует 30 минут.`,
            html: `<p>Здравствуйте, ${user.name}.</p><p>Перейдите по ссылке для сброса пароля:</p><p><a href=\"${resetUrl}\">${resetUrl}</a></p><p>Ссылка действует 30 минут.</p>`
          });
        } catch (error) {
          console.error("[auth/forgot-password] failed to send reset email", error);
        }
      }
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
