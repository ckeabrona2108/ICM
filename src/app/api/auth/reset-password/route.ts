import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { resetPasswordWithToken } from "@/lib/password-reset";

const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, "Токен обязателен."),
    password: z.string().min(8, "Пароль должен содержать минимум 8 символов.").max(128),
    confirmPassword: z.string().min(8).max(128)
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Пароли не совпадают.",
    path: ["confirmPassword"]
  });

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = resetPasswordSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input data" },
        { status: 400 }
      );
    }

    try {
      await resetPasswordWithToken({
        prisma,
        token: parsed.data.token,
        password: parsed.data.password
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_RESET_TOKEN") {
        return NextResponse.json(
          { error: "Ссылка для восстановления недействительна или истекла." },
          { status: 400 }
        );
      }
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Пароль обновлён. Теперь вы можете войти с новым паролем."
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[auth] reset password failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

