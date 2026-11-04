import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { notifyPasswordChanged, resolveAppBaseUrl } from "@/lib/account-security";
import { authOptions } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Changing an existing password. A cabinet without one sets it through the emailed link
// (password-link), which also proves the address.
const changeSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль"),
    newPassword: z.string().min(8, "Новый пароль — минимум 8 символов").max(128),
    confirmPassword: z.string()
  })
  .refine((value) => value.newPassword === value.confirmPassword, { message: "Пароли не совпадают" });

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `security:password:${userId}`, limit: 5, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const parsed = changeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Проверьте поля" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, password: true }
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!user.password) {
    return NextResponse.json({ error: "Пароль ещё не установлен — запросите ссылку на почту" }, { status: 409 });
  }
  if (!(await verifyPassword(parsed.data.currentPassword, user.password))) {
    return NextResponse.json({ error: "Текущий пароль указан неверно" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: userId }, data: { password: await hashPassword(parsed.data.newPassword) } });
  await notifyPasswordChanged({ user, kind: "changed", baseUrl: resolveAppBaseUrl(request) });
  return NextResponse.json({ ok: true });
}
