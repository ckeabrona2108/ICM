import {
  SubscriptionPlan,
  SubscriptionSource,
  SubscriptionStatus,
  type PrismaClient
} from "@prisma/client";

import { createAdminLog } from "@/lib/admin-log-service";

export interface UserSubscriptionView {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  adminComment: string | null;
  grantedByAdminId: string | null;
  startedAt: string;
  endsAt: string | null;
  renewalAt: string | null;
  trialEndsAt: string | null;
}

export function getSubscriptionEffectiveEndDate(subscription: {
  endsAt: Date | null;
  renewalAt: Date | null;
}): Date | null {
  return subscription.endsAt ?? subscription.renewalAt ?? null;
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
      source: true,
      adminComment: true,
      grantedByAdminId: true,
      startedAt: true,
      endsAt: true,
      renewalAt: true,
      trialEndsAt: true
    }
  });
  if (!subscription) return null;
  return {
    plan: subscription.plan,
    status: subscription.status,
    source: subscription.source,
    adminComment: subscription.adminComment ?? null,
    grantedByAdminId: subscription.grantedByAdminId ?? null,
    startedAt: subscription.startedAt.toISOString(),
    endsAt: getSubscriptionEffectiveEndDate(subscription)?.toISOString() ?? null,
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
  endsAt: Date | null;
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
      source: true,
      adminComment: true,
      grantedByAdminId: true,
      endsAt: true,
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
        source: SubscriptionSource.ADMIN_GRANT,
        adminComment: params.comment?.trim() || null,
        grantedByAdminId: params.adminId,
        endsAt: params.endsAt,
        renewalAt: params.endsAt
      },
      update: {
        plan: params.plan,
        status: params.status,
        source: SubscriptionSource.ADMIN_GRANT,
        adminComment: params.comment?.trim() || null,
        grantedByAdminId: params.adminId,
        endsAt: params.endsAt,
        renewalAt: params.endsAt
      }
    });

    await tx.subscriptionAdminLog.create({
      data: {
        userId: params.userId,
        adminId: params.adminId,
        oldPlan: oldSub?.plan ?? null,
        newPlan: params.plan,
        oldStatus: oldSub?.status ?? null,
        newStatus: params.status,
        oldEndsAt: getSubscriptionEffectiveEndDate({
          endsAt: oldSub?.endsAt ?? null,
          renewalAt: oldSub?.renewalAt ?? null
        }),
        newEndsAt: params.endsAt,
        comment: params.comment?.trim() || null
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
            source: oldSub.source,
            endsAt: getSubscriptionEffectiveEndDate({
              endsAt: oldSub.endsAt ?? null,
              renewalAt: oldSub.renewalAt ?? null
            })?.toISOString() ?? null
          }
        : null,
      newValue: {
        plan: params.plan,
        status: params.status,
        source: SubscriptionSource.ADMIN_GRANT,
        endsAt: params.endsAt?.toISOString() ?? null
      },
      comment: params.comment
    });
  });

  return { ok: true as const };
}
