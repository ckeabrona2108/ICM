import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { checkPartnerCodeForRelease } from "@/lib/partner-codes";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "Войдите в аккаунт, чтобы проверить партнёрский код."
      },
      { status: 401 }
    );
  }

  const payload = (await request.json().catch(() => null)) as {
    code?: string;
    releaseId?: string;
  } | null;

  const code = payload?.code?.trim() || "";
  if (!code) {
    return NextResponse.json(
      {
        ok: false,
        reason: "not_found",
        message: "Введите партнёрский код."
      },
      { status: 400 }
    );
  }

  const result = await checkPartnerCodeForRelease({
    prisma,
    code,
    userId: session.user.id,
    userEmail: session.user.email ?? "",
    releaseId: payload?.releaseId?.trim() || undefined
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
