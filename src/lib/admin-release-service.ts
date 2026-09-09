import type { Prisma, PrismaClient, verification_status } from "@prisma/client";
import { z } from "zod";
import { getReleaseLifecycleStatus, withReleaseLifecycleState } from "@/lib/release-counts";
import { sendReleaseDecisionEmail } from "@/lib/user-event-email";
import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import type { ModerationRemark } from "@/lib/cabinet-types";

export const upcSchema = z
  .string()
  .trim()
  .regex(/^\d{12,14}$/u, "UPC должен содержать 12-14 цифр.");

export const rejectReleaseSchema = z.object({
  reason: z.string().trim().min(3, "Причина отклонения обязательна.").max(2000)
});

export function canManageReleases(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

export async function canManageReleasesSession(params: {
  prisma: PrismaClient;
  userId: string | null | undefined;
  role: string | null | undefined;
}): Promise<boolean> {
  if (canManageReleases(params.role)) return true;

  const userId = params.userId?.trim();
  if (!userId) return false;

  const user = await params.prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true }
  });

  return user?.isAdmin === true;
}

function canApproveReleaseStatus(status: verification_status): boolean {
  return status === "moderating" || status === "rejected" || status === "approved";
}

export function canRejectRelease(status: string, roles?: unknown): boolean {
  return getReleaseLifecycleStatus(status, roles) === "moderation";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeModerationRemarks(remarks: ModerationRemark[] | undefined): ModerationRemark[] | undefined {
  if (!remarks?.length) return undefined;

  const normalized = remarks
    .map((remark) => ({
      field: remark.field?.trim() ?? "",
      message: remark.message?.trim() ?? "",
      section: remark.section?.trim() || undefined
    }))
    .filter((remark) => remark.field.length > 0 && remark.message.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function resetNeedsChangesFlags(roles: unknown): Prisma.InputJsonValue | undefined {
  const root = asRecord(roles);
  if (!root) return undefined;

  const next: Record<string, unknown> = { ...root };
  next.needsChanges = false;
  next.moderationStatus = "approved";
  next.rejectReason = null;
  next.rejectionReason = null;
  next.moderationComment = null;
  next.moderatorComment = null;
  next.moderationRemarks = null;
  next.moderationReturnedAt = null;
  next.lifecycleState = "approved";
  delete next.submittedToModeration;

  const submission = asRecord(next.submissionData);
  if (submission) {
    next.submissionData = {
      ...submission,
      needsChanges: false,
      moderationStatus: "approved",
      rejectReason: null,
      rejectionReason: null,
      moderationComment: null,
      moderatorComment: null,
      moderationRemarks: null,
      moderationReturnedAt: null,
      lifecycleState: "approved"
    };
    delete (next.submissionData as Record<string, unknown>).submittedToModeration;
  }

  return next as Prisma.InputJsonValue;
}

export function withAdminReleaseChangesRequiredState(
  roles: unknown,
  reason: string,
  options?: {
    remarks?: ModerationRemark[];
    action?: "request_changes" | "reject";
    returnedAt?: string;
  }
): Record<string, unknown> {
  const next = withReleaseLifecycleState(roles, "changes_required");
  const moderationRemarks = normalizeModerationRemarks(options?.remarks);
  const moderationReturnedAt = options?.returnedAt?.trim() || null;
  const moderationStatus = options?.action === "reject" ? "rejected" : "changes_required";

  next.needsChanges = true;
  next.moderationStatus = moderationStatus;
  next.rejectReason = reason;
  next.rejectionReason = reason;
  next.moderationComment = reason;
  next.moderatorComment = reason;
  next.moderationRemarks = moderationRemarks ?? null;
  next.moderationReturnedAt = moderationReturnedAt;

  const submission = asRecord(next.submissionData);
  if (submission) {
    next.submissionData = {
      ...submission,
      lifecycleState: "changes_required",
      submittedToModeration: false,
      needsChanges: true,
      moderationStatus,
      rejectReason: reason,
      rejectionReason: reason,
      moderationComment: reason,
      moderatorComment: reason,
      moderationRemarks: moderationRemarks ?? null,
      moderationReturnedAt
    };
  }

  return next;
}

export async function approveReleaseByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  releaseId: string;
  upc: string;
}) {
  const upcParsed = upcSchema.safeParse(params.upc);
  if (!upcParsed.success) {
    return { releaseId: params.releaseId, error: upcParsed.error.issues[0]?.message ?? "UPC обязателен." } as const;
  }

  const release = await params.prisma.release.findUnique({
    where: { id: params.releaseId },
    select: {
      id: true,
      title: true,
      status: true,
      roles: true,
      userId: true,
      user: {
        select: {
          email: true,
          name: true
        }
      }
    }
  });

  if (!release) return null;
  if (!canApproveReleaseStatus(release.status)) {
    return { releaseId: params.releaseId, error: "STATUS_TRANSITION_NOT_ALLOWED" } as const;
  }

  const normalizedUpc = upcParsed.data;
  const existingByUpc = await params.prisma.release.findFirst({
    where: { upc: normalizedUpc, id: { not: params.releaseId } },
    select: { id: true }
  });
  if (existingByUpc) {
    return { releaseId: params.releaseId, error: "UPC_ALREADY_EXISTS" } as const;
  }

  await params.prisma.release.update({
    where: { id: params.releaseId },
    data: {
      status: "approved",
      confirmed: true,
      upc: normalizedUpc,
      rejectReason: null,
      moderatorComment: null,
      roles: resetNeedsChangesFlags(release.roles)
    }
  });

  try {
    await sendReleaseDecisionEmail({
      to: release.user?.email,
      userName: release.user?.name,
      releaseTitle: release.title ?? "Без названия",
      approved: true
    });
  } catch (error) {
    console.error("[release-email] approve notification failed", {
      releaseId: params.releaseId,
      error
    });
  }

  await deliverUserNotificationSafely(params.prisma, {
    id: `release-approved-${release.id}`,
    userId: release.userId,
    kind: "release_approved",
    title: "Релиз принят",
    message: `Релиз «${release.title ?? "Без названия"}» принят. Загрузите 30-секундный фрагмент, чтобы попасть на витрину.`,
    href: `/dashboard/showcase?releaseId=${encodeURIComponent(release.id)}`,
    sendEmail: false,
    resetReadState: true
  });

  return {
    releaseId: params.releaseId,
    userId: release.userId,
    releaseTitle: release.title ?? "Без названия"
  } as const;
}

export async function rejectReleaseByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  releaseId: string;
  reason: string;
  remarks?: ModerationRemark[];
  action?: "request_changes" | "reject";
}) {
  const parsed = rejectReleaseSchema.safeParse({ reason: params.reason });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid reason" };
  }

  const release = await params.prisma.release.findUnique({
    where: { id: params.releaseId },
    select: {
      id: true,
      title: true,
      status: true,
      roles: true,
      userId: true,
      user: {
        select: {
          email: true,
          name: true
        }
      }
    }
  });

  if (!release) return { ok: false as const, error: "Release not found" };
  if (!canRejectRelease(release.status, release.roles)) {
    return { ok: false as const, error: "Отклонение доступно только для релизов на модерации." };
  }

  const reason = parsed.data.reason;
  const moderationRemarks = normalizeModerationRemarks(params.remarks);
  const returnedAt = new Date().toISOString();
  await params.prisma.release.update({
    where: { id: params.releaseId },
    data: {
      status: "rejected",
      rejectReason: reason,
      moderatorComment: reason,
      roles: withAdminReleaseChangesRequiredState(
        release.roles,
        reason,
        {
          remarks: moderationRemarks,
          action: params.action,
          returnedAt
        }
      ) as Prisma.InputJsonValue
    }
  });

  try {
    await sendReleaseDecisionEmail({
      to: release.user?.email,
      userName: release.user?.name,
      releaseTitle: release.title ?? "Без названия",
      approved: false,
      reason
    });
  } catch (error) {
    console.error("[release-email] reject notification failed", {
      releaseId: params.releaseId,
      error
    });
  }

  await deliverUserNotificationSafely(params.prisma, {
    id: `release-rejected-${release.id}`,
    userId: release.userId,
    kind: "release_rejected",
    title: "Релиз отправлен на доработку",
    message: reason,
    href: "/dashboard/changes-required",
    sendEmail: false,
    resetReadState: true
  });

  return { ok: true as const, reason, remarks: moderationRemarks };
}

export async function deleteReleaseByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  releaseId: string;
}) {
  const release = await params.prisma.release.findUnique({
    where: { id: params.releaseId },
    select: { id: true }
  });
  if (!release) return null;

  await params.prisma.release.delete({ where: { id: params.releaseId } });
  return { releaseId: params.releaseId };
}

export async function updateReleasePaymentStatusByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  releaseId: string;
  paid: boolean;
}) {
  const release = await params.prisma.release.findUnique({
    where: { id: params.releaseId },
    select: { id: true, confirmed: true }
  });
  if (!release) return null;

  if (Boolean(release.confirmed) === params.paid) {
    return {
      releaseId: params.releaseId,
      confirmed: params.paid
    } as const;
  }

  await params.prisma.release.update({
    where: { id: params.releaseId },
    data: {
      confirmed: params.paid
    }
  });

  return {
    releaseId: params.releaseId,
    confirmed: params.paid
  } as const;
}
