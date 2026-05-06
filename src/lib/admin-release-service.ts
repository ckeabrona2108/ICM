import { Prisma, ReleaseStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";

export const upcSchema = z
  .string()
  .trim()
  .regex(/^\d{12,14}$/u, "UPC должен содержать 12-14 цифр.");

export const rejectReleaseSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Причина отклонения обязательна.")
    .max(2000, "Причина слишком длинная.")
});

export function canManageReleases(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

export function isReleaseInAdminTab(
  status: ReleaseStatus,
  tab: "moderation" | "pending_verification" | "all" | "approved" | "rejected"
): boolean {
  if (tab === "all") return true;
  if (tab === "moderation") return status === ReleaseStatus.MODERATION;
  if (tab === "pending_verification") {
    return status === ReleaseStatus.PENDING_VERIFICATION;
  }
  if (tab === "approved") {
    return status === ReleaseStatus.APPROVED || status === ReleaseStatus.DISTRIBUTED;
  }
  return status === ReleaseStatus.REJECTED;
}

export function canApproveReleaseStatus(status: ReleaseStatus): boolean {
  return status === ReleaseStatus.MODERATION;
}

export function canRejectReleaseStatus(status: ReleaseStatus): boolean {
  return status === ReleaseStatus.MODERATION;
}

export async function approveReleaseByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  releaseId: string;
  upc: string;
}) {
  const upcParsed = upcSchema.safeParse(params.upc);
  if (!upcParsed.success) {
    return {
      releaseId: params.releaseId,
      error: upcParsed.error.issues[0]?.message ?? "UPC обязателен."
    } as const;
  }

  const release = await params.prisma.release.findUnique({
    where: { id: params.releaseId },
    select: { id: true, status: true, priority: true }
  });
  if (!release) return null;
  if (!canApproveReleaseStatus(release.status)) {
    return { releaseId: params.releaseId, error: "STATUS_TRANSITION_NOT_ALLOWED" } as const;
  }

  const normalizedUpc = upcParsed.data;
  const existingByUpc = await params.prisma.release.findFirst({
    where: {
      upc: normalizedUpc,
      id: { not: params.releaseId }
    },
    select: { id: true }
  });
  if (existingByUpc) {
    return {
      releaseId: params.releaseId,
      error: "UPC_ALREADY_EXISTS"
    } as const;
  }

  const now = new Date();
  await params.prisma.$transaction([
    params.prisma.release.update({
      where: { id: params.releaseId },
      data: {
        status: ReleaseStatus.APPROVED,
        upc: normalizedUpc,
        approvedAt: now,
        approvedBy: params.adminId,
        rejectionReason: null,
        rejectedAt: null,
        rejectedBy: null,
        moderationComment: null,
        moderationRemarks: Prisma.DbNull
      }
    }),
    params.prisma.adminLog.create({
      data: {
        adminId: params.adminId,
        action: "RELEASE_APPROVED",
        targetType: "Release",
        targetId: params.releaseId,
        payload: { status: "APPROVED", upc: normalizedUpc, priority: release.priority }
      }
    })
  ]);

  return { releaseId: params.releaseId } as const;
}

export async function rejectReleaseByAdmin(params: {
  prisma: PrismaClient;
  adminId: string;
  releaseId: string;
  reason: string;
}) {
  const parsed = rejectReleaseSchema.safeParse({ reason: params.reason });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid reason" };
  }

  const release = await params.prisma.release.findUnique({
    where: { id: params.releaseId },
    select: { id: true, status: true }
  });
  if (!release) {
    return { ok: false as const, error: "Release not found" };
  }
  if (!canRejectReleaseStatus(release.status)) {
    return {
      ok: false as const,
      error: "Отклонение доступно только для релизов на модерации."
    };
  }

  const reason = parsed.data.reason;
  const now = new Date();
  await params.prisma.$transaction([
    params.prisma.release.update({
      where: { id: params.releaseId },
      data: {
        status: ReleaseStatus.CHANGES_REQUIRED,
        rejectionReason: reason,
        rejectedAt: now,
        rejectedBy: params.adminId,
        moderationComment: reason,
        moderationReturnedAt: now
      }
    }),
    params.prisma.adminLog.create({
      data: {
        adminId: params.adminId,
        action: "RELEASE_REJECTED",
        targetType: "Release",
        targetId: params.releaseId,
        payload: { reason }
      }
    })
  ]);

  return { ok: true as const, reason };
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

  await params.prisma.$transaction([
    params.prisma.adminLog.deleteMany({
      where: {
        targetType: "Release",
        targetId: params.releaseId
      }
    }),
    params.prisma.marketingCampaign.deleteMany({
      where: { releaseId: params.releaseId }
    }),
    params.prisma.release.delete({
      where: { id: params.releaseId }
    }),
    params.prisma.adminLog.create({
      data: {
        adminId: params.adminId,
        action: "RELEASE_DELETED",
        targetType: "Release",
        targetId: params.releaseId
      }
    })
  ]);

  return { releaseId: params.releaseId };
}
