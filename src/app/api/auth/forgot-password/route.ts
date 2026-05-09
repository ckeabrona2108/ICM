import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requestPasswordReset } from "@/lib/password-reset";

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Укажите корректный email.")
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = forgotPasswordSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input data" }, { status: 400 });
    }

    const result = await requestPasswordReset({
      prisma,
      email: parsed.data.email
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Если аккаунт существует, инструкция по восстановлению отправлена.",
        previewUrl: result.previewUrl
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[auth] forgot password failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

