import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AccountEmailUnavailableError, issueEmailConfirmation, resolveAppBaseUrl } from "@/lib/account-security";
import { authOptions } from "@/lib/auth";
import { isOAuthPlaceholderEmail } from "@/lib/oauth-login";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { userProfileEmailSchema } from "@/lib/user-profile-policy";

export const dynamic = "force-dynamic";

// Starts an email change (or confirms the current address): the cabinet keeps its email
// until the link sent to the new address is opened.
const emailSchema = z.object({
  email: userProfileEmailSchema.transform((value) => value.toLowerCase()),
  currentPassword: z.string().optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `security:email:${userId}`, limit: 5, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const parsed = emailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Укажите корректный email" }, { status: 400 });
  }
  const { email } = parsed.data;
  if (isOAuthPlaceholderEmail(email)) {
    return NextResponse.json({ error: "Укажите корректный email" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true, name: true, password: true }
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const isCurrent = user.email.toLowerCase() === email;
  if (isCurrent && user.emailVerified) {
    return NextResponse.json({ error: "Этот email уже подтверждён" }, { status: 409 });
  }
  if (!isCurrent) {
    if (user.password && !(await verifyPassword(parsed.data.currentPassword ?? "", user.password))) {
      return NextResponse.json({ error: "Текущий пароль указан неверно" }, { status: 400 });
    }
    const taken = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, id: { not: userId } },
      select: { id: true }
    });
    if (taken) return NextResponse.json({ error: "Этот email уже используется" }, { status: 409 });
  }

  try {
    await issueEmailConfirmation({ user, email, baseUrl: resolveAppBaseUrl(request) });
  } catch (error) {
    if (!(error instanceof AccountEmailUnavailableError)) console.error("[security/email] send failed", error);
    return NextResponse.json({ error: "Почтовый сервис временно недоступен" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, pendingEmail: email });
}
