import type { PrismaClient } from "@prisma/client";

import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import {
  getReleaseDeletionState,
  withReleaseDeletionApproved,
  withReleaseDeletionRequested,
  withReleaseDeletionRestored
} from "@/lib/release-deletion-state";

const MAX_DELETION_COMMENT_LENGTH = 1000;

export async function requestReleaseDeletion(params: {
  prisma: PrismaClient;
  userId: string;
  releaseId: string;
  comment: string;
}) {
  const comment = params.comment.trim();
  if (!comment) {
    return { ok: false as const, status: 400 as const, error: "Комментарий обязателен." };
  }
  if (comment.length > MAX_DELETION_COMMENT_LENGTH) {
    return {
      ok: false as const,
      status: 400 as const,
      error: `Комментарий не должен быть длиннее ${MAX_DELETION_COMMENT_LENGTH} символов.`
    };
  }

  const release = await params.prisma.release.findUnique({
    where: { id: params.releaseId },
    select: {
      id: true,
      title: true,
      userId: true,
      roles: true,
      user: {
        select: {
          name: true,
          email: true
        }
      }
    }
  });
  if (!release) return { ok: false as const, status: 404 as const, error: "Релиз не найден." };
  if (release.userId !== params.userId) {
    return { ok: false as const, status: 403 as const, error: "Нельзя удалить чужой релиз." };
  }

  const current = getReleaseDeletionState(release.roles);
  if (current?.status === "requested" || current?.status === "deleted") {
    return { ok: true as const, releaseId: release.id, deletionStatus: current.status };
  }

  await params.prisma.release.update({
    where: { id: release.id },
    data: {
      roles: withReleaseDeletionRequested(release.roles, { userId: params.userId, comment })
    }
  });

  const admins = await params.prisma.user.findMany({
    where: { isAdmin: true },
    select: { id: true }
  });
  await Promise.all(
    admins.map((admin) =>
      deliverUserNotificationSafely(params.prisma, {
        id: `release-delete-request-${release.id}-${admin.id}`,
        userId: admin.id,
        kind: "release_delete_request",
        title: "Запрос на удаление релиза",
        message: `Пользователь ${release.user.name ?? release.user.email ?? "без имени"} хочет удалить релиз «${release.title || "Без названия"}». Комментарий: ${comment}`,
        href: `/admin/releases?status=deletion_requests`,
        sourceType: "release",
        sourceId: release.id,
        sendEmail: false,
        resetReadState: true
      })
    )
  );

  return { ok: true as const, releaseId: release.id, deletionStatus: "requested" as const };
}

export async function approveReleaseDeletionRequest(params: {
  prisma: PrismaClient;
  adminId: string;
  releaseId: string;
}) {
  const release = await params.prisma.release.findUnique({
    where: { id: params.releaseId },
    select: { id: true, title: true, userId: true, roles: true }
  });
  if (!release) return { ok: false as const, status: 404 as const, error: "Релиз не найден." };

  await params.prisma.release.update({
    where: { id: release.id },
    data: {
      roles: withReleaseDeletionApproved(release.roles, { adminId: params.adminId })
    }
  });

  await deliverUserNotificationSafely(params.prisma, {
    id: `release-delete-approved-${release.id}`,
    userId: release.userId,
    kind: "release_delete_approved",
    title: "Удаление релиза принято",
    message: `Запрос на удаление релиза «${release.title || "Без названия"}» принят. Удаление с площадок может занять до 72 часов.`,
    href: "/dashboard/releases",
    sourceType: "release",
    sourceId: release.id,
    sendEmail: false,
    resetReadState: true
  });

  return { ok: true as const, releaseId: release.id, deletionStatus: "deleted" as const };
}

export async function restoreReleaseForUser(params: {
  prisma: PrismaClient;
  adminId: string;
  releaseId: string;
}) {
  const release = await params.prisma.release.findUnique({
    where: { id: params.releaseId },
    select: { id: true, title: true, userId: true, roles: true }
  });
  if (!release) return { ok: false as const, status: 404 as const, error: "Релиз не найден." };

  await params.prisma.release.update({
    where: { id: release.id },
    data: {
      roles: withReleaseDeletionRestored(release.roles, { adminId: params.adminId })
    }
  });

  await deliverUserNotificationSafely(params.prisma, {
    id: `release-restored-${release.id}`,
    userId: release.userId,
    kind: "release_restored",
    title: "Релиз восстановлен",
    message: `Релиз «${release.title || "Без названия"}» снова доступен в вашем кабинете.`,
    href: "/dashboard/releases",
    sourceType: "release",
    sourceId: release.id,
    sendEmail: false,
    resetReadState: true
  });

  return { ok: true as const, releaseId: release.id, deletionStatus: "restored" as const };
}
