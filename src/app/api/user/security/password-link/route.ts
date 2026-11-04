import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { AccountEmailUnavailableError, canReceiveAccountEmail, issuePasswordLink, resolveAppBaseUrl } from "@/lib/account-security";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Sends a link for setting (or, if forgotten, resetting) the password to the cabinet's email.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `security:password-link:${userId}`, limit: 3, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, password: true }
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!canReceiveAccountEmail(user.email)) {
    return NextResponse.json({ error: "Сначала укажите и подтвердите email" }, { status: 409 });
  }

  try {
    await issuePasswordLink({ user, baseUrl: resolveAppBaseUrl(request), kind: user.password ? "reset" : "set" });
  } catch (error) {
    if (!(error instanceof AccountEmailUnavailableError)) console.error("[security/password-link] send failed", error);
    return NextResponse.json({ error: "Почтовый сервис временно недоступен" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, email: user.email });
}
