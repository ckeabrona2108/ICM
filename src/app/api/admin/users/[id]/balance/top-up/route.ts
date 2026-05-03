import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/admin-user-service";
import { topUpUserBalanceByAdmin } from "@/lib/finance-service";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const topUpBodySchema = z.object({
  amount: z.number().positive("Сумма пополнения должна быть больше 0.").max(10_000_000),
  comment: z.string().trim().max(500).optional()
});

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

  const parsed = topUpBodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request payload" },
      { status: 400 }
    );
  }

  const result = await topUpUserBalanceByAdmin({
    prisma,
    adminId: session.user.id,
    userId: context.params.id,
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
      message: "Баланс пользователя пополнен."
    },
    { status: 200 }
  );
}

