import { Prisma, ReleaseStatus, ReleaseType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type {
  ReleaseSubmitFailureResponse,
  ReleaseSubmitRequest,
  ReleaseSubmitSuccessResponse
} from "@/lib/api/contracts";
import { prisma } from "@/lib/prisma";
import {
  canEditRelease,
  groupReleaseValidationIssuesByStep,
  releaseSubmitRequestSchema,
  type ReleaseLifecycleStatus,
  type ReleaseValidationIssue,
  validateReleaseSubmission
} from "@/lib/release-policy";
import {
  checkPriorityReleaseAccess,
  checkReleaseCreationLimit,
  incrementReleaseUsage
} from "@/lib/subscription-limits";

function parseDateInput(input: string): Date {
  const normalized = input.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(normalized);
  if (iso) {
    return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
  }
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(normalized);
  if (ru) {
    return new Date(`${ru[3]}-${ru[2]}-${ru[1]}T00:00:00.000Z`);
  }
  return new Date();
}

function toPrismaReleaseType(value: ReleaseSubmitRequest["data"]["type"]): ReleaseType {
  if (value === "ep") return ReleaseType.EP;
  if (value === "album") return ReleaseType.ALBUM;
  return ReleaseType.SINGLE;
}

function toLifecycleStatus(status: ReleaseStatus): ReleaseLifecycleStatus {
  switch (status) {
    case ReleaseStatus.MODERATION:
      return "moderation";
    case ReleaseStatus.CHANGES_REQUIRED:
      return "changes_required";
    case ReleaseStatus.REJECTED:
      return "rejected";
    case ReleaseStatus.APPROVED:
      return "approved";
    case ReleaseStatus.DISTRIBUTED:
      return "distributed";
    case ReleaseStatus.ARCHIVED:
      return "archived";
    case ReleaseStatus.DRAFT:
    default:
      return "draft";
  }
}

function toPrismaReleaseKind(value: string | null | undefined): "STANDARD" | "SINGLE_MAXI" | "MIXTAPE" | "AUDIOBOOK" {
  if (value === "single_maxi") return "SINGLE_MAXI";
  if (value === "mixtape") return "MIXTAPE";
  if (value === "audiobook") return "AUDIOBOOK";
  return "STANDARD";
}

function toPrismaPlatformMode(value: string | undefined): "ALL" | "SELECTED" {
  if (value === "selected") return "SELECTED";
  return "ALL";
}

function buildTrackCreateData(
  tracks: ReleaseSubmitRequest["data"]["tracks"]
) {
  const parsePercent = (value: string | undefined): number | null => {
    if (!value?.trim()) return null;
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed)) return null;
    if (parsed < 0) return 0;
    if (parsed > 100) return 100;
    return parsed;
  };

  return tracks.map((track, index) => ({
    title: track.title,
    subtitle: track.subtitle?.trim() || null,
    durationSec:
      track.durationSec && Number.isFinite(track.durationSec)
        ? Math.max(0, Math.floor(track.durationSec))
        : 0,
    trackNumber: index + 1,
    isrc: track.isrc?.trim() || null,
    partnerCode: track.partnerCode?.trim() || null,
    hasAudio: track.hasAudio ?? true,
    metadataLanguage: track.metadataLanguage,
    previewStart: track.previewStart?.trim() || null,
    instantGratification: Boolean(track.instantGratification),
    focusTrack: Boolean(track.focusTrack),
    versionExplicit: Boolean(track.versionExplicit),
    versionLive: Boolean(track.versionLive),
    versionCover: Boolean(track.versionCover),
    versionRemix: Boolean(track.versionRemix),
    versionInstrumental: Boolean(track.versionInstrumental),
    lyrics: track.lyrics?.trim() || null,
    ringtoneDurationSec: track.ringtoneDurationSec?.trim()
      ? Number(track.ringtoneDurationSec.replace(",", "."))
      : null,
    copyrightPct: parsePercent(track.copyrightPct),
    relatedRightsPct: parsePercent(track.relatedRightsPct),
    contributors: track.trackPersons as unknown as Prisma.InputJsonValue
  }));
}

async function upsertReleaseMediaFromSubmission(params: {
  tx: Prisma.TransactionClient;
  releaseId: string;
  data: ReleaseSubmitRequest["data"];
}) {
  const { tx, releaseId, data } = params;

  if (data.coverUpload?.storageKey && data.coverUpload.url) {
    await tx.coverImage.upsert({
      where: { releaseId },
      create: {
        releaseId,
        storageKey: data.coverUpload.storageKey,
        url: data.coverUpload.url,
        width: data.coverMeta?.width ?? data.coverUpload.width ?? 3000,
        height: data.coverMeta?.height ?? data.coverUpload.height ?? 3000
      },
      update: {
        storageKey: data.coverUpload.storageKey,
        url: data.coverUpload.url,
        width: data.coverMeta?.width ?? data.coverUpload.width ?? 3000,
        height: data.coverMeta?.height ?? data.coverUpload.height ?? 3000
      }
    });
  }

  const firstAudioFile = data.tracks.find(
    (track) => track.audioFile?.storageKey && track.audioFile.url
  )?.audioFile;

  if (firstAudioFile?.storageKey && firstAudioFile.url) {
    await tx.releaseFile.upsert({
      where: { releaseId },
      create: {
        releaseId,
        storageKey: firstAudioFile.storageKey,
        url: firstAudioFile.url,
        mimeType: firstAudioFile.contentType ?? "audio/wav",
        sizeBytes: firstAudioFile.sizeBytes ?? 0
      },
      update: {
        storageKey: firstAudioFile.storageKey,
        url: firstAudioFile.url,
        mimeType: firstAudioFile.contentType ?? "audio/wav",
        sizeBytes: firstAudioFile.sizeBytes ?? 0
      }
    });
  }
}

function slugFromTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return `${base || "release"}-${Date.now()}`;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = releaseSubmitRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const body: ReleaseSubmitRequest = parsed.data;

  if (body.data.priorityRelease) {
    const priorityAccess = await checkPriorityReleaseAccess(prisma, session.user.id);
    if (!priorityAccess.allowed) {
      const issue = {
        code: "forbidden",
        field: "priorityRelease",
        message:
          priorityAccess.reason ??
          "Приоритетный релиз доступен на тарифе PRO и выше."
      } satisfies ReleaseValidationIssue;
      const response: ReleaseSubmitFailureResponse = {
        ok: false,
        errors: [issue],
        errors_by_step: {
          release_info: [issue]
        }
      };
      return NextResponse.json(response, { status: 403 });
    }
  }

  const existingRelease = body.releaseId
    ? await prisma.release.findFirst({
        where: {
          id: body.releaseId,
          userId: session.user.id
        }
      })
    : null;

  if (body.mode === "edit" && !body.releaseId) {
    return NextResponse.json({ error: "releaseId is required for edit mode" }, { status: 400 });
  }

  if (body.mode === "edit" && !existingRelease) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  if (body.mode === "new" && existingRelease && existingRelease.status !== ReleaseStatus.DRAFT) {
    const response: ReleaseSubmitFailureResponse = {
      ok: false,
      errors: [
        {
          code: "status_conflict",
          field: "status",
          message: "Этот релиз уже отправлен. Обновите страницу и проверьте актуальный статус."
        }
      ]
    };
    return NextResponse.json(response, { status: 409 });
  }

  if (body.mode === "edit") {
    const effectiveStatus = existingRelease
      ? toLifecycleStatus(existingRelease.status)
      : "draft";

    const permission = canEditRelease({
      status: effectiveStatus,
      moderationStarted: Boolean(existingRelease?.moderationStartedAt)
    });

    if (!permission.allowed) {
      const response: ReleaseSubmitFailureResponse = {
        ok: false,
        errors: [
          {
            code: "forbidden",
            field: "status",
            message:
              permission.message ??
              "Редактирование релиза сейчас недоступно по текущему статусу."
          }
        ]
      };
      return NextResponse.json(response, { status: 409 });
    }
  }

  if (body.mode === "new" && !existingRelease) {
    const releaseLimit = await checkReleaseCreationLimit(prisma, session.user.id);
    const allowUnpaidStandardModeration =
      !releaseLimit.allowed &&
      releaseLimit.code === "release_limit_reached" &&
      releaseLimit.plan === "STANDARD" &&
      releaseLimit.limits.releasesLimit === 0;

    if (!releaseLimit.allowed && !allowUnpaidStandardModeration) {
      const issue = {
        code: releaseLimit.code ?? "release_limit_reached",
        field: "payment_required",
        message: releaseLimit.reason ?? "Создание релиза недоступно по текущему тарифу."
      } satisfies ReleaseValidationIssue;
      const response: ReleaseSubmitFailureResponse = {
        ok: false,
        errors: [issue],
        errors_by_step: {
          pricing: [issue]
        }
      };
      return NextResponse.json(response, { status: 402 });
    }
  }

  const validationIssues = validateReleaseSubmission(body.data);
  if (validationIssues.length > 0) {
    const response: ReleaseSubmitFailureResponse = {
      ok: false,
      errors: validationIssues,
      errors_by_step: groupReleaseValidationIssuesByStep(validationIssues)
    };
    return NextResponse.json(response, { status: 422 });
  }

  const releasePayload = {
    title: body.data.title,
    subtitle: body.data.subtitle?.trim() || null,
    genre: body.data.genre,
    subgenre: body.data.subgenre?.trim() || null,
    language: body.data.language,
    releaseDate: parseDateInput(body.data.releaseDate),
    type: toPrismaReleaseType(body.data.type),
    releaseKind: toPrismaReleaseKind(body.data.releaseKind),
    platformMode: toPrismaPlatformMode(body.data.platformMode),
    platforms: (body.data.platforms ?? []) as unknown as Prisma.InputJsonValue,
    partnerCode: body.data.partnerCode?.trim() || null,
    rightsYear: body.data.rightsYear?.trim() ? Number(body.data.rightsYear) : null,
    status: ReleaseStatus.MODERATION,
    explicit: body.data.tracks.some((track) => Boolean(track.versionExplicit)),
    upc: body.data.upc?.trim() || null,
    isrc: body.data.tracks[0]?.isrc?.trim() || null,
    lyrics:
      body.data.tracks
        .map((track) => track.lyrics?.trim() || "")
        .filter(Boolean)
        .join("\n\n") || null,
    moderationComment: body.data.moderatorComment?.trim() || null,
    priority: Boolean(body.data.priorityRelease),
    moderationRemarks: Prisma.DbNull,
    moderationReturnedAt: null,
    coverMeta: body.data.coverMeta
      ? (body.data.coverMeta as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull,
    submissionData: body.data as unknown as Prisma.InputJsonValue,
    moderationCancelledAt: null,
    moderationStartedAt: null
  };

  const trackCreateData = buildTrackCreateData(body.data.tracks);

  const moderationReleaseId = await prisma.$transaction(async (tx) => {
    const previousStatus = existingRelease?.status ?? ReleaseStatus.DRAFT;
    const isResubmission = previousStatus !== ReleaseStatus.DRAFT;

    const releaseId = existingRelease
      ? (
          await tx.release.update({
            where: { id: existingRelease.id },
            data: {
              ...releasePayload,
              tracks: {
                deleteMany: {},
                create: trackCreateData
              }
            },
            select: { id: true }
          })
        ).id
      : (
          await tx.release.create({
            data: {
              ...releasePayload,
              slug: slugFromTitle(body.data.title),
              user: {
                connect: {
                  id: session.user.id
                }
              },
              tracks: {
                create: trackCreateData
              }
            },
            select: { id: true }
          })
        ).id;

    await upsertReleaseMediaFromSubmission({
      tx,
      releaseId,
      data: body.data
    });

    await tx.adminLog.create({
      data: {
        adminId: session.user.id,
        action: isResubmission
          ? "RELEASE_RESUBMITTED_TO_MODERATION"
          : "RELEASE_SUBMITTED_TO_MODERATION",
        targetType: "Release",
        targetId: releaseId,
        payload: {
          previousStatus,
          nextStatus: ReleaseStatus.MODERATION,
          moderationSnapshot: body.data
        } as Prisma.InputJsonValue
      }
    });

    return releaseId;
  });

  if (body.mode === "new" && !existingRelease) {
    await incrementReleaseUsage(prisma, session.user.id);
  }

  const response: ReleaseSubmitSuccessResponse = {
    ok: true,
    nextStatus: "moderation",
    message:
      (existingRelease?.status ?? ReleaseStatus.DRAFT) === ReleaseStatus.DRAFT
        ? "Релиз отправлен на модерацию."
        : body.mode === "edit"
        ? "Изменения приняты. Релиз отправлен на повторную модерацию."
        : "Релиз отправлен на повторную модерацию."
  };

  return NextResponse.json(
    {
      ...response,
      releaseId: moderationReleaseId
    },
    { status: 200 }
  );
}
