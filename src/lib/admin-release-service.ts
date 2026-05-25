import type { Prisma, PrismaClient, verification_status } from "@prisma/client";
import { z } from "zod";

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

function canApproveReleaseStatus(status: verification_status): boolean {
  return status === "moderating" || status === "rejected" || status === "approved";
}

function canRejectReleaseStatus(status: verification_status): boolean {
  return status === "moderating";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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

  const submission = asRecord(next.submissionData);
  if (submission) {
    next.submissionData = {
      ...submission,
      needsChanges: false,
      moderationStatus: "approved",
      rejectReason: null,
      rejectionReason: null,
      moderationComment: null,
      moderatorComment: null
    };
  }

  return next as Prisma.InputJsonValue;
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
    select: { id: true, status: true, roles: true }
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

  if (!release) return { ok: false as const, error: "Release not found" };
  if (!canRejectReleaseStatus(release.status)) {
    return { ok: false as const, error: "Отклонение доступно только для релизов на модерации." };
  }

  const reason = parsed.data.reason;
  await params.prisma.release.update({
    where: { id: params.releaseId },
    data: {
      status: "rejected",
      rejectReason: reason
    }
  });

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

  await params.prisma.release.delete({ where: { id: params.releaseId } });
  return { releaseId: params.releaseId };
}
