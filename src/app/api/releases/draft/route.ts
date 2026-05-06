import { Prisma, ReleaseStatus, ReleaseType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import type {
  ReleaseDraftSaveFailureResponse,
  ReleaseDraftSaveRequest,
  ReleaseDraftSaveResponse
} from "@/lib/api/contracts";
import { getUserContractStatus } from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";
import { releaseSubmissionDataSchema } from "@/lib/release-policy";
import { canSaveDraft } from "@/lib/draft-policy";
import {
  checkPriorityReleaseAccess,
  checkReleaseCreationLimit
} from "@/lib/subscription-limits";

const releaseDraftSaveRequestSchema = z.object({
  releaseId: z.string().trim().min(1).optional(),
  data: releaseSubmissionDataSchema
});

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

function toPrismaReleaseType(value: ReleaseDraftSaveRequest["data"]["type"]): ReleaseType {
  if (value === "ep") return ReleaseType.EP;
  if (value === "album") return ReleaseType.ALBUM;
  return ReleaseType.SINGLE;
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

function parseOptionalYear(value: string | undefined): number | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (!/^\d{4}$/u.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugFromTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return `${base || "draft"}-${Date.now()}`;
}

function buildTracks(data: ReleaseDraftSaveRequest["data"]) {
  const parseOptionalNumber = (value: string | undefined): number | null => {
    if (!value?.trim()) return null;
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parsePercent = (value: string | undefined): number | null => {
    const parsed = parseOptionalNumber(value);
    if (parsed == null) return null;
    if (parsed < 0) return 0;
    if (parsed > 100) return 100;
    return parsed;
  };

  return data.tracks.map((track, index) => ({
    title:
      track.title.trim() ||
      track.fileName.trim() ||
      `Track ${index + 1}`,
    subtitle: track.subtitle?.trim() || null,
    durationSec:
      track.durationSec && Number.isFinite(track.durationSec)
        ? Math.max(0, Math.floor(track.durationSec))
        : 0,
    trackNumber: index + 1,
    isrc: track.isrc?.trim() || null,
    partnerCode: track.partnerCode?.trim() || null,
    hasAudio: track.hasAudio ?? true,
    metadataLanguage: track.metadataLanguage?.trim() || null,
    previewStart: track.previewStart?.trim() || null,
    instantGratification: Boolean(track.instantGratification),
    focusTrack: Boolean(track.focusTrack),
    versionExplicit: Boolean(track.versionExplicit),
    versionLive: Boolean(track.versionLive),
    versionCover: Boolean(track.versionCover),
    versionRemix: Boolean(track.versionRemix),
    versionInstrumental: Boolean(track.versionInstrumental),
    lyrics: track.lyrics?.trim() || null,
    ringtoneDurationSec: parseOptionalNumber(track.ringtoneDurationSec),
    copyrightPct: parsePercent(track.copyrightPct),
    relatedRightsPct: parsePercent(track.relatedRightsPct),
    contributors: track.trackPersons as unknown as Prisma.InputJsonValue
  }));
}

async function upsertReleaseMediaFromDraft(params: {
  releaseId: string;
  data: ReleaseDraftSaveRequest["data"];
}) {
  const { releaseId, data } = params;

  if (data.coverUpload?.storageKey && data.coverUpload.url) {
    await prisma.coverImage.upsert({
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
    await prisma.releaseFile.upsert({
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

  const parsed = releaseDraftSaveRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const body: ReleaseDraftSaveRequest = parsed.data;
  const contractStatus = await getUserContractStatus({
    prisma,
    userId: session.user.id
  });

  if (!contractStatus.isVerified) {
    return NextResponse.json(
      {
        error: "verification_required",
        message: "Для выпуска релизов необходимо пройти верификацию и подписать договор."
      },
      { status: 403 }
    );
  }

  if (body.data.priorityRelease) {
    const priorityAccess = await checkPriorityReleaseAccess(prisma, session.user.id);
    if (!priorityAccess.allowed) {
      const response: ReleaseDraftSaveFailureResponse = {
        ok: false,
        errors: [
          {
            code: "forbidden",
            field: "priorityRelease",
            message:
              priorityAccess.reason ??
              "Приоритетный релиз доступен на тарифе PRO и выше."
          }
        ]
      };
      return NextResponse.json(response, { status: 403 });
    }
  }

  const releasePayload = {
    title: body.data.title.trim() || "Новый черновик",
    subtitle: body.data.subtitle?.trim() || null,
    genre: body.data.genre.trim() || "Не указан",
    subgenre: body.data.subgenre?.trim() || null,
    language: body.data.language.trim() || "RU",
    releaseDate: parseDateInput(body.data.releaseDate),
    type: toPrismaReleaseType(body.data.type),
    releaseKind: toPrismaReleaseKind(body.data.releaseKind),
    platformMode: toPrismaPlatformMode(body.data.platformMode),
    platforms: (body.data.platforms ?? []) as unknown as Prisma.InputJsonValue,
    partnerCode: body.data.partnerCode?.trim() || null,
    rightsYear: parseOptionalYear(body.data.rightsYear),
    status: ReleaseStatus.DRAFT,
    explicit: body.data.tracks.some((track) => Boolean(track.versionExplicit)),
    upc: body.data.upc?.trim() || null,
    isrc: body.data.tracks[0]?.isrc?.trim() || null,
    lyrics:
      body.data.tracks
        .map((track) => track.lyrics?.trim() || "")
        .filter(Boolean)
        .join("\n\n") || null,
    moderationComment: body.data.moderatorComment?.trim() || null,
    coverMeta: body.data.coverMeta
      ? (body.data.coverMeta as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull,
    submissionData: body.data as unknown as Prisma.InputJsonValue,
    priority: Boolean(body.data.priorityRelease)
  };

  let releaseId = body.releaseId;
  let draftsCount = 0;

  if (releaseId) {
    const existing = await prisma.release.findFirst({
      where: {
        id: releaseId
      },
      select: { id: true, status: true, userId: true }
    });

    if (!existing) {
      const response: ReleaseDraftSaveFailureResponse = {
        ok: false,
        errors: [
          {
            code: "not_found",
            field: "releaseId",
            message: "Черновик не найден или недоступен."
          }
        ]
      };
      return NextResponse.json(response, { status: 404 });
    }

    const permission = canSaveDraft({
      status: existing.status,
      isOwner: existing.userId === session.user.id
    });

    if (!permission.allowed) {
      const response: ReleaseDraftSaveFailureResponse = {
        ok: false,
        errors: [
          {
            code: "forbidden",
            field: permission.reason === "forbidden_owner" ? "releaseId" : "status",
            message:
              permission.reason === "forbidden_owner"
                ? "Недостаточно прав для сохранения этого черновика."
                : "Сохранение черновика недоступно: релиз можно сохранять только в статусе черновика или требуемых изменений."
          }
        ]
      };
      return NextResponse.json(response, { status: 403 });
    }

    await prisma.release.update({
      where: { id: existing.id },
      data: {
        ...releasePayload,
        status: existing.status,
        tracks: {
          deleteMany: {},
          create: buildTracks(body.data)
        }
      },
      select: { id: true }
    });
    await upsertReleaseMediaFromDraft({
      releaseId: existing.id,
      data: body.data
    });
  } else {
    const releaseLimit = await checkReleaseCreationLimit(prisma, session.user.id);
    const allowUnpaidStandardDraft =
      !releaseLimit.allowed &&
      releaseLimit.code === "release_limit_reached" &&
      releaseLimit.plan === "STANDARD" &&
      releaseLimit.limits.releasesLimit === 0;

    if (!releaseLimit.allowed && !allowUnpaidStandardDraft) {
      const response: ReleaseDraftSaveFailureResponse = {
        ok: false,
        errors: [
          {
            code: releaseLimit.code ?? "release_limit_reached",
            field: "subscription",
            message: releaseLimit.reason ?? "Создание релиза недоступно по текущему тарифу."
          }
        ]
      };
      return NextResponse.json(response, { status: 402 });
    }

    const created = await prisma.release.create({
      data: {
        ...releasePayload,
        slug: slugFromTitle(body.data.title),
        user: {
          connect: {
            id: session.user.id
          }
        },
        tracks: {
          create: buildTracks(body.data)
        }
      },
      select: { id: true }
    });
    releaseId = created.id;
    await upsertReleaseMediaFromDraft({
      releaseId,
      data: body.data
    });
  }

  draftsCount = await prisma.release.count({
    where: {
      userId: session.user.id,
      status: ReleaseStatus.DRAFT
    }
  });

  const response: ReleaseDraftSaveResponse = {
    ok: true,
    releaseId,
    draftsCount,
    message: "Черновик сохранен."
  };

  return NextResponse.json(response, { status: 200 });
}

export async function PATCH(request: Request) {
  return POST(request);
}
