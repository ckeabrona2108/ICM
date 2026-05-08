import {
  PaymentStatus,
  ReleaseStatus,
  type Prisma,
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

type ReleasePaymentSnapshotPlan = "STANDARD" | "PRO" | "ENTERPRISE";

function toReleasePaymentSnapshotPlan(
  plan: SubscriptionPlan
): ReleasePaymentSnapshotPlan | null {
  if (plan === SubscriptionPlan.STANDARD) return "STANDARD";
  if (plan === SubscriptionPlan.PRO) return "PRO";
  if (plan === SubscriptionPlan.ENTERPRISE || plan === SubscriptionPlan.LABEL) {
    return "ENTERPRISE";
  }
  return null;
}

function planReleaseLimit(plan: ReleasePaymentSnapshotPlan): number | null {
  if (plan === "ENTERPRISE") return null;
  if (plan === "PRO") return 6;
  return 1;
}

function readSubmissionData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasPaymentSnapshot(value: unknown): boolean {
  const data = readSubmissionData(value);
  if (!data || !data.paymentSnapshot || typeof data.paymentSnapshot !== "object") return false;
  const snapshot = data.paymentSnapshot as Record<string, unknown>;
  return snapshot.kind === "subscription_included" && snapshot.version === 1;
}

function resolveSubmitMoment(release: {
  moderationStartedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
}): Date {
  return release.moderationStartedAt ?? release.updatedAt ?? release.createdAt;
}

function buildSnapshot(params: {
  plan: ReleasePaymentSnapshotPlan;
  releasesUsedAfterSubmit: number;
}) {
  return {
    version: 1 as const,
    kind: "subscription_included" as const,
    plan: params.plan,
    releasesUsedAfterSubmit: params.releasesUsedAfterSubmit,
    releasesLimit: planReleaseLimit(params.plan)
  };
}

function readReleaseIdFromPaymentMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind.trim().toLowerCase() : "";
  const releaseId =
    typeof record.releaseId === "string" ? record.releaseId.trim() : "";
  if (!releaseId) return null;
  if (!kind || kind === "release") return releaseId;
  return null;
}

async function persistReleaseSnapshotsBeforeAdminSubscriptionChange(params: {
  tx: Prisma.TransactionClient;
  userId: string;
  oldSubscription: {
    plan: SubscriptionPlan;
    startedAt: Date;
    endsAt: Date | null;
    renewalAt: Date | null;
  } | null;
  nextPlan: SubscriptionPlan;
}) {
  if (!params.oldSubscription) return;

  const oldPlan = toReleasePaymentSnapshotPlan(params.oldSubscription.plan);
  const nextPlan = toReleasePaymentSnapshotPlan(params.nextPlan);
  if (!oldPlan) return;
  if (oldPlan === nextPlan) return;

  const windowStart = params.oldSubscription.startedAt;
  const windowEnd = getSubscriptionEffectiveEndDate({
    endsAt: params.oldSubscription.endsAt ?? null,
    renewalAt: params.oldSubscription.renewalAt ?? null
  });
  if (!windowEnd || windowEnd.getTime() <= windowStart.getTime()) return;

  const [releases, successfulReleasePayments] = await Promise.all([
    params.tx.release.findMany({
      where: {
        userId: params.userId,
        status: {
          in: [
            ReleaseStatus.PENDING_VERIFICATION,
            ReleaseStatus.MODERATION,
            ReleaseStatus.CHANGES_REQUIRED,
            ReleaseStatus.REJECTED,
            ReleaseStatus.APPROVED,
            ReleaseStatus.DISTRIBUTED,
            ReleaseStatus.ARCHIVED
          ]
        }
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        moderationStartedAt: true,
        submissionData: true
      }
    }),
    params.tx.subscriptionPayment.findMany({
      where: {
        userId: params.userId,
        status: PaymentStatus.SUCCEEDED
      },
      select: {
        metadata: true
      }
    })
  ]);

  const oneTimePaidReleaseIds = new Set<string>();
  for (const payment of successfulReleasePayments) {
    const releaseId = readReleaseIdFromPaymentMetadata(payment.metadata);
    if (releaseId) oneTimePaidReleaseIds.add(releaseId);
  }

  const eligible = releases
    .filter((release) => !oneTimePaidReleaseIds.has(release.id))
    .filter((release) => !hasPaymentSnapshot(release.submissionData))
    .filter((release) => {
      const submitTs = resolveSubmitMoment(release).getTime();
      return submitTs >= windowStart.getTime() && submitTs < windowEnd.getTime();
    })
    .sort(
      (a, b) => resolveSubmitMoment(a).getTime() - resolveSubmitMoment(b).getTime()
    );

  const limit = planReleaseLimit(oldPlan);
  const included =
    limit == null ? eligible : eligible.slice(0, Math.max(0, limit));

  const updates = included.map((release, index) =>
    params.tx.release.update({
      where: { id: release.id },
      data: {
        submissionData: {
          ...(readSubmissionData(release.submissionData) ?? {}),
          paymentSnapshot: buildSnapshot({
            plan: oldPlan,
            releasesUsedAfterSubmit: index + 1
          })
        } as unknown as Prisma.InputJsonValue
      },
      select: { id: true }
    })
  );

  if (updates.length > 0) {
    await Promise.all(updates);
  }
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
      startedAt: true,
      endsAt: true,
      renewalAt: true
    }
  });

  await params.prisma.$transaction(async (tx) => {
    await persistReleaseSnapshotsBeforeAdminSubscriptionChange({
      tx,
      userId: params.userId,
      oldSubscription: oldSub
        ? {
            plan: oldSub.plan,
            startedAt: oldSub.startedAt,
            endsAt: oldSub.endsAt ?? null,
            renewalAt: oldSub.renewalAt ?? null
          }
        : null,
      nextPlan: params.plan
    });

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
