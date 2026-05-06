import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  adminUpdateSubscriptionSchema,
  canManageUsers
} from "@/lib/admin-users-service";
import { getUserSubscription, updateUserSubscriptionByAdmin } from "@/lib/subscription-service";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await prisma.user.findUnique({
    where: { id: context.params.id },
    select: { id: true }
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const subscription = await getUserSubscription(prisma, context.params.id);
  return NextResponse.json({ subscription }, { status: 200 });
}

export async function PATCH(
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

  const parsed = adminUpdateSubscriptionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request payload" },
      { status: 400 }
    );
  }

  const result = await updateUserSubscriptionByAdmin({
    prisma,
    adminId: session.user.id,
    userId: context.params.id,
    plan: parsed.data.plan,
    status: parsed.data.status,
    endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
    comment: parsed.data.comment
  });

  if (!result.ok) {
    const status = result.error === "User not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    {
      ok: true,
      message: "Подписка пользователя обновлена."
    },
    { status: 200 }
  );
}
