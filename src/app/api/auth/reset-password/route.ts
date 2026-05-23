import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const resetSchema = z
  .object({
    token: z.string().trim().min(10),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128)
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"]
  });

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = resetSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" }, { status: 400 });
  }

  const tokenRecord = await prisma.verification_tokens.findUnique({
    where: { token: parsed.data.token },
    include: {
      user: {
        select: { id: true }
      }
    }
  });

  if (!tokenRecord || tokenRecord.type !== "recover") {
    return NextResponse.json({ error: "Ссылка для восстановления недействительна." }, { status: 400 });
  }

  if (tokenRecord.expires.getTime() < Date.now()) {
    await prisma.verification_tokens.delete({ where: { token: parsed.data.token } }).catch(() => undefined);
    return NextResponse.json({ error: "Срок действия ссылки истёк." }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: tokenRecord.user.id },
      data: { password: passwordHash }
    }),
    prisma.sessions.deleteMany({
      where: { user_id: tokenRecord.user.id }
    }),
    prisma.verification_tokens.deleteMany({
      where: {
        user_id: tokenRecord.user.id,
        type: "recover"
      }
    })
  ]);

  return NextResponse.json({ ok: true, message: "Пароль обновлён." });
}
