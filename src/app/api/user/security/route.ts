import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { canReceiveAccountEmail, findPendingEmail } from "@/lib/account-security";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      emailVerified: true,
      password: true,
      vk_link: { select: { id: true } },
      oauth_accounts: { select: { provider: true } }
    }
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const hasRealEmail = canReceiveAccountEmail(user.email);
  return NextResponse.json({
    email: hasRealEmail ? user.email : null,
    emailVerified: hasRealEmail && Boolean(user.emailVerified),
    pendingEmail: await findPendingEmail(userId),
    hasPassword: Boolean(user.password),
    providers: {
      yandex: user.oauth_accounts.some((account) => account.provider === "yandex"),
      vk: Boolean(user.vk_link),
      telegram: user.oauth_accounts.some((account) => account.provider === "telegram")
    }
  });
}
