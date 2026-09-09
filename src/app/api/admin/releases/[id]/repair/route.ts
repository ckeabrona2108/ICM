import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { resolveAdminAudioSubmissionTrackIndex } from "@/lib/admin-release-audio-upload";
import { canManageReleasesSession } from "@/lib/admin-release-service";
import { prisma } from "@/lib/prisma";
import {
  isAllowedAudioFile,
  isAllowedImageFile,
  objectExists,
  resolveRenderableStoredFileUrl
} from "@/lib/s3";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function cloneJson(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  return record ? (structuredClone(record) as Record<string, unknown>) : {};
}

function fileNameFromStorageKey(value: string): string {
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

type RepairRequestBody =
  | {
      target?: "cover";
      storageKey?: string;
    }
  | {
      target?: "track_audio";
      trackId?: string;
      storageKey?: string;
    };

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canManageReleasesSession({ prisma, userId: session.user.id, role: session.user.role }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "Release id is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as RepairRequestBody | null;
  const target = body?.target === "track_audio" ? "track_audio" : "cover";
  const storageKey = asString(body?.storageKey);
  if (!storageKey) {
    return NextResponse.json({ error: "Storage key is required" }, { status: 400 });
  }

  const exists = await objectExists(storageKey);
  if (exists !== true) {
    return NextResponse.json({ error: "Файл в storage не найден" }, { status: 404 });
  }

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true,
      preview: true,
      roles: true,
      track: {
        select: {
          id: true,
          index: true,
          title: true,
          track: true,
          roles: true
        },
        orderBy: { index: "asc" }
      }
    }
  });
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  if (target === "cover") {
    if (!isAllowedImageFile(storageKey)) {
      return NextResponse.json({ error: "Для обложки нужен image-файл" }, { status: 400 });
    }
    const previewUrl = resolveRenderableStoredFileUrl({ storageKey });
    if (!previewUrl) {
      return NextResponse.json({ error: "Не удалось построить URL обложки" }, { status: 500 });
    }
    const nextRoles = cloneJson(release.roles);
    const nextSubmission = cloneJson(nextRoles.submissionData);
    nextSubmission.coverUpload = {
      storageKey,
      url: previewUrl,
      fileName: fileNameFromStorageKey(storageKey)
    };
    nextSubmission.cover = previewUrl;
    nextRoles.submissionData = nextSubmission;

    await prisma.release.update({
      where: { id: releaseId },
      data: {
        preview: previewUrl,
        roles: nextRoles as Prisma.InputJsonValue
      }
    });

    return NextResponse.json(
      {
        ok: true,
        target,
        releaseId,
        storageKey,
        url: previewUrl
      },
      { status: 200 }
    );
  }

  const trackId = asString(body && "trackId" in body ? body.trackId : null);
  if (!trackId) {
    return NextResponse.json({ error: "Track id is required" }, { status: 400 });
  }
  if (!isAllowedAudioFile(storageKey)) {
    return NextResponse.json({ error: "Для аудио нужен audio-файл" }, { status: 400 });
  }

  const trackRow = release.track.find((item) => item.id === trackId);
  if (!trackRow) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const fileUrl = resolveRenderableStoredFileUrl({ storageKey });
  if (!fileUrl) {
    return NextResponse.json({ error: "Не удалось построить URL аудио" }, { status: 500 });
  }
  const extension = storageKey.split("/").pop()?.split(".").pop()?.trim().toLowerCase() ?? trackRow.track ?? "wav";
  const fileName = fileNameFromStorageKey(storageKey);
  const audioFile = {
    storageKey,
    url: fileUrl,
    fileName
  };

  const nextRoles = cloneJson(release.roles);
  const nextSubmission = cloneJson(nextRoles.submissionData);
  const nextTracks = Array.isArray(nextSubmission.tracks) ? [...nextSubmission.tracks] : [];
  const submissionTrackIndex = resolveAdminAudioSubmissionTrackIndex({
    trackId,
    databaseTracks: release.track,
    submissionTracks: nextTracks
  });
  if (submissionTrackIndex < 0) {
    return NextResponse.json({ error: "Track not found in submission data" }, { status: 404 });
  }

  const currentTrack = asRecord(nextTracks[submissionTrackIndex]) ?? {};
  nextTracks[submissionTrackIndex] = {
    ...currentTrack,
    id: asString(currentTrack.id) ?? trackId,
    title: asString(currentTrack.title) ?? trackRow.title ?? "",
    fileName,
    hasAudio: true,
    audioFile
  };
  nextSubmission.tracks = nextTracks;
  nextRoles.submissionData = nextSubmission;

  const nextTrackRoles = cloneJson(trackRow.roles);
  nextTrackRoles.audioFile = audioFile;
  nextTrackRoles.fileName = fileName;
  nextTrackRoles.hasAudio = true;

  await prisma.$transaction([
    prisma.track.update({
      where: { id: trackId },
      data: {
        track: extension,
        roles: nextTrackRoles as Prisma.InputJsonValue
      }
    }),
    prisma.release.update({
      where: { id: releaseId },
      data: {
        roles: nextRoles as Prisma.InputJsonValue
      }
    })
  ]);

  return NextResponse.json(
    {
      ok: true,
      target,
      releaseId,
      trackId,
      storageKey,
      url: fileUrl
    },
    { status: 200 }
  );
}
