import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  adminAiTokenAdjustRequestSchema,
  adjustAiTokensByAdmin
} from "@/lib/ai-token-service";
import { canManageUsers } from "@/lib/admin-user-service";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = adminAiTokenAdjustRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request payload" },
      { status: 400 }
    );
  }

  try {
    const result = await adjustAiTokensByAdmin({
      prisma,
      adminId: session.user.id,
      userId: parsed.data.userId,
      amount: parsed.data.amount,
      reason: parsed.data.reason
    });

    if (!result.ok) {
      const status = result.error === "Пользователь не найден." ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(
      {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось изменить баланс AI-токенов."
      },
      { status: 500 }
    );
  }
}
