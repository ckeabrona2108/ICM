import type { PrismaClient, subscribe_level } from "@prisma/client";

import { createAdminLog } from "@/lib/admin-log-service";

export type SubscriptionPlan = subscribe_level;
export type SubscriptionStatus = "active" | "canceled";
export type SubscriptionSource = "ADMIN_GRANT" | "PAYMENT";

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
  ends_at?: Date | null;
  renewalAt?: Date | null;
  expiresAt?: Date | null;
}): Date | null {
  return subscription.ends_at ?? subscription.renewalAt ?? subscription.expiresAt ?? null;
}

function isActiveSubscription(user: { isSubscribed: boolean; expiresAt: Date | null }): boolean {
  if (!user.isSubscribed) return false;
  if (!user.expiresAt) return true;
  return user.expiresAt.getTime() > Date.now();
}

function normalizePlan(plan: string): SubscriptionPlan {
  if (plan === "enterprise") return "enterprise";
  if (plan === "premium") return "premium";
  if (plan === "professional" || plan === "pro") return "professional";
  return "standard";
}

function normalizeStatus(status: string): SubscriptionStatus {
  return status === "active" ? "active" : "canceled";
}

export async function getUserSubscription(
  prisma: PrismaClient,
  userId: string
): Promise<UserSubscriptionView | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSubscribed: true,
      subscribeLevel: true,
      expiresAt: true,
      emailVerified: true
    }
  });

  if (!user?.subscribeLevel) return null;

  const active = isActiveSubscription(user);
  return {
    plan: user.subscribeLevel,
    status: active ? "active" : "canceled",
    source: "PAYMENT",
    adminComment: null,
    grantedByAdminId: null,
    startedAt: (user.emailVerified ?? new Date(0)).toISOString(),
    endsAt: user.expiresAt?.toISOString() ?? null,
    renewalAt: user.expiresAt?.toISOString() ?? null,
    trialEndsAt: null
  };
}

export async function updateUserSubscriptionByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  userId: string;
  plan: SubscriptionPlan | string;
  status: SubscriptionStatus | string;
  endsAt: Date | null;
  comment?: string;
}) {
  const oldUser = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      isSubscribed: true,
      subscribeLevel: true,
      expiresAt: true
    }
  });

  if (!oldUser) return { ok: false as const, error: "User not found" };

  const nextStatus = normalizeStatus(String(params.status));
  const nextPlan = normalizePlan(String(params.plan));
  const nextIsSubscribed = nextStatus === "active";

  await params.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: params.userId },
      data: {
        isSubscribed: nextIsSubscribed,
        subscribeLevel: nextIsSubscribed ? nextPlan : oldUser.subscribeLevel ?? nextPlan,
        expiresAt: nextIsSubscribed ? params.endsAt : null
      }
    });

    await createAdminLog(tx, {
      adminId: params.adminId,
      action: "USER_SUBSCRIPTION_UPDATED",
      targetType: "User",
      targetId: params.userId,
      oldValue: {
        plan: oldUser.subscribeLevel,
        status: oldUser.isSubscribed ? "active" : "canceled",
        endsAt: oldUser.expiresAt?.toISOString() ?? null
      },
      newValue: {
        plan: nextPlan,
        status: nextStatus,
        endsAt: params.endsAt?.toISOString() ?? null
      },
      comment: params.comment
    });
  });

  return { ok: true as const };
}
