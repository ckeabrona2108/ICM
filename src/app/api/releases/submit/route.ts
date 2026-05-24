import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type {
  ReleaseSubmitFailureResponse,
  ReleaseSubmitRequest,
  ReleaseSubmitSuccessResponse
} from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizePriorityReleaseFlag } from "@/lib/release-priority";
import {
  buildSubscriptionPaymentUsage,
  getUserReleaseQuota,
  mergeReleaseRolesPaymentUsage
} from "@/lib/release-quota";
import { notifyAdminReleaseSubmitted } from "@/lib/telegram-notifier";

export const dynamic = "force-dynamic";

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
}

function normalizeReleaseType(value: unknown): "single" | "album" | "ep" {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "single";
  if (normalized === "album") return "album";
  if (normalized === "ep") return "ep";
  return "single";
}

function mergeSubmissionData(roles: unknown, submissionData: Record<string, unknown>): Record<string, unknown> {
  const root =
    roles && typeof roles === "object" && !Array.isArray(roles)
      ? (roles as Record<string, unknown>)
      : {};
  return {
    ...root,
    submittedToModeration: true,
    submissionData
  };
}

function markSubmittedToModeration(roles: Prisma.InputJsonValue): Prisma.InputJsonValue {
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) {
    return { submittedToModeration: true };
  }
  return {
    ...(roles as Record<string, unknown>),
    submittedToModeration: true
  } as Prisma.InputJsonValue;
}

function readSubmissionDataCover(data: Record<string, unknown>): string | null {
  const cover = data.cover;
  if (typeof cover !== "string") return null;
  const normalized = cover.trim();
  return normalized || null;
}

async function notifyReleaseSubmittedSafe(params: {
  releaseTitle: string;
  artistName: string;
  releaseId: string;
}): Promise<void> {
  try {
    await notifyAdminReleaseSubmitted({
      releaseTitle: params.releaseTitle,
      artistName: params.artistName
    });
  } catch (error) {
    console.error("[telegram] release notification failed", {
      releaseId: params.releaseId,
      error
    });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: ReleaseSubmitRequest;
  try {
    payload = (await request.json()) as ReleaseSubmitRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload?.data || typeof payload.data !== "object") {
    return NextResponse.json({ error: "Submission payload is required" }, { status: 400 });
  }

  const data = payload.data as Record<string, unknown>;

  const releaseId = payload.releaseId?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  const existing = await prisma.release.findFirst({
    where: { id: releaseId, userId: session.user.id },
    select: {
      id: true,
      date: true,
      confirmed: true,
      status: true,
      roles: true
    }
  });

  if (!existing) {
    return NextResponse.json({ error: "Релиз не найден" }, { status: 404 });
  }

  const releaseDate = parseDate(data.releaseDate, existing.date);
  const startDate = parseDate(data.startDate, releaseDate);
  const preorderDate = parseDate(data.preorderDate, releaseDate);

  const quota = await getUserReleaseQuota(session.user.id, prisma);
  const submissionData = {
    ...(payload.data as Record<string, unknown>),
    priorityRelease: sanitizePriorityReleaseFlag({
      requested: data.priorityRelease,
      plan: quota.plan,
      isActive: quota.isActive
    })
  };
  const baseReleaseData = {
    title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Новый релиз",
    subtitle: typeof data.subtitle === "string" ? data.subtitle : null,
    performer: typeof data.artist === "string" && data.artist.trim() ? data.artist.trim() : null,
    genre: typeof data.genre === "string" && data.genre.trim() ? data.genre.trim() : "Не указан",
    preview: typeof data.cover === "string" && data.cover.trim() ? data.cover.trim() : "/hero/drop.png",
    language: typeof data.language === "string" && data.language.trim() ? data.language.trim() : "Russian",
    date: releaseDate,
    startDate,
    preorderDate,
    type: normalizeReleaseType(data.releaseType)
  };
  console.log("[release-cover-save]", {
    releaseId: existing.id,
    preview: baseReleaseData.preview,
    submissionDataCover: readSubmissionDataCover(data)
  });

  if (payload.mode === "edit") {
    await prisma.release.update({
      where: { id: existing.id },
      data: {
        ...baseReleaseData,
        confirmed: existing.confirmed,
        status: existing.status,
        roles: mergeSubmissionData(existing.roles, submissionData) as Prisma.InputJsonValue
      }
    });

    const response: ReleaseSubmitSuccessResponse = {
      ok: true,
      releaseId: existing.id,
      nextStatus: "moderation",
      message: "Изменения релиза сохранены."
    };

    return NextResponse.json(response, { status: 200 });
  }

  if (quota.requiresPaymentForNextRelease) {
    await prisma.release.update({
      where: { id: existing.id },
      data: {
        ...baseReleaseData,
        confirmed: false,
        status: "moderating",
        roles: {
          submittedToModeration: true,
          submissionData
        }
      }
    });
    await notifyReleaseSubmittedSafe({
      releaseId: existing.id,
      releaseTitle: baseReleaseData.title,
      artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
    });

    const response: ReleaseSubmitSuccessResponse & {
      payment_required: true;
      paid: false;
    } = {
      ok: true,
      releaseId: existing.id,
      nextStatus: "moderation",
      payment_required: true,
      paid: false,
      message: quota.isActive
        ? "Релиз отправлен на модерацию. Лимит подписки исчерпан, релиз нужно оплатить отдельно."
        : "Релиз отправлен на модерацию. Активной подписки нет, релиз нужно оплатить отдельно."
    };

    return NextResponse.json(response, { status: 200 });
  }

  await prisma.release.update({
    where: { id: existing.id },
    data: {
      ...baseReleaseData,
      confirmed: true,
      status: "moderating",
      roles: markSubmittedToModeration(
        mergeReleaseRolesPaymentUsage(
          existing.roles,
          buildSubscriptionPaymentUsage({ quota }),
          submissionData
        )
      )
    }
  });
  await notifyReleaseSubmittedSafe({
    releaseId: existing.id,
    releaseTitle: baseReleaseData.title,
    artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
  });

  const response: ReleaseSubmitSuccessResponse = {
    ok: true,
    releaseId: existing.id,
    nextStatus: "moderation",
    message: "Релиз отправлен на модерацию."
  };

  return NextResponse.json(response, { status: 200 });
}
