import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  adminAdjustUserBalance,
  adminBalanceAdjustSchema,
  canManageUsers
} from "@/lib/admin-users-service";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
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

  const parsed = adminBalanceAdjustSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request payload" },
      { status: 400 }
    );
  }

  const result = await adminAdjustUserBalance({
    prisma,
    adminId: session.user.id,
    userId: context.params.id,
    type: parsed.data.type,
    amount: parsed.data.amount,
    comment: parsed.data.comment
  });

  if (!result.ok) {
    const status = result.error === "User not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    {
      ok: true,
      message:
        parsed.data.type === "credit"
          ? "Баланс пользователя пополнен."
          : "Баланс пользователя уменьшен."
    },
    { status: 200 }
  );
}
