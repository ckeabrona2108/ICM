import { SubscriptionPlan, SubscriptionStatus, type PrismaClient } from "@prisma/client";

import { createAdminLog } from "@/lib/admin-log-service";

export interface UserSubscriptionView {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: string;
  endsAt: string | null;
  renewalAt: string | null;
  trialEndsAt: string | null;
}

export async function getUserSubscription(
  prisma: PrismaClient,
  userId: string
): Promise<UserSubscriptionView | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      plan: true,
      status: true,
      startedAt: true,
      renewalAt: true,
      trialEndsAt: true
    }
  });
  if (!subscription) return null;
  return {
    plan: subscription.plan,
    status: subscription.status,
    startedAt: subscription.startedAt.toISOString(),
    endsAt: subscription.renewalAt?.toISOString() ?? null,
    renewalAt: subscription.renewalAt?.toISOString() ?? null,
    trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null
  };
}

export async function updateUserSubscriptionByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  renewalAt: Date | null;
  comment?: string;
}) {
  const user = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true }
  });
  if (!user) return { ok: false as const, error: "User not found" };

  const oldSub = await params.prisma.subscription.findUnique({
    where: { userId: params.userId },
    select: {
      plan: true,
      status: true,
      renewalAt: true
    }
  });

  await params.prisma.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { userId: params.userId },
      create: {
        userId: params.userId,
        plan: params.plan,
        status: params.status,
        renewalAt: params.renewalAt
      },
      update: {
        plan: params.plan,
        status: params.status,
        renewalAt: params.renewalAt
      }
    });

    await createAdminLog(tx, {
      adminId: params.adminId,
      action: "USER_SUBSCRIPTION_UPDATED",
      targetType: "User",
      targetId: params.userId,
      oldValue: oldSub
        ? {
            plan: oldSub.plan,
            status: oldSub.status,
            renewalAt: oldSub.renewalAt?.toISOString() ?? null
          }
        : null,
      newValue: {
        plan: params.plan,
        status: params.status,
        renewalAt: params.renewalAt?.toISOString() ?? null
      },
      comment: params.comment
    });
  });

  return { ok: true as const };
}
