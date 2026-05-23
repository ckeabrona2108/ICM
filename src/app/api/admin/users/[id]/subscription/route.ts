import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/admin-user-service";
import {
  adminUpdateSubscriptionSchema,
  adminUpdateUserSubscription
} from "@/lib/admin-users-service";
import { prisma } from "@/lib/prisma";
import { getUserSubscription } from "@/lib/subscription-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const subscription = await getUserSubscription(prisma, context.params.id);
  return NextResponse.json({ subscription }, { status: 200 });
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminUpdateSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные подписки." }, { status: 400 });
  }

  const result = await adminUpdateUserSubscription({
    prisma,
    adminId: session.user.id,
    userId: context.params.id,
    ...parsed.data
  }).catch((error) => {
    console.error("[admin/users/subscription] update failed", error);
    return {
      ok: false as const,
      error:
        error instanceof Error && error.message
          ? error.message
          : "Не удалось обновить подписку."
    };
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ message: "Подписка обновлена." }, { status: 200 });
}
