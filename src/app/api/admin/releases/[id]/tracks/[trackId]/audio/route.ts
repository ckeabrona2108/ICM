import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageReleases, canManageReleasesSession } from "@/lib/admin-release-service";
import {
  uploadAdminReleaseAudio,
  validateAdminReleaseAudioFile
} from "@/lib/admin-release-audio-upload";

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

export async function POST(
  request: Request,
  context: { params: { id: string; trackId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canManageReleasesSession({ prisma, userId: session.user.id, role: session.user.role }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const releaseId = context.params.id?.trim();
  const trackId = context.params.trackId?.trim();
  if (!releaseId || !trackId) {
    return NextResponse.json({ error: "Release id and track id are required" }, { status: 400 });
  }

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true,
      title: true,
      roles: true,
      track: {
        select: {
          id: true,
          index: true,
          title: true,
          track: true
        },
        orderBy: { index: "asc" }
      }
    }
  });
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  const trackRow = release.track.find((item) => item.id === trackId);
  if (!trackRow) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  try {
    validateAdminReleaseAudioFile(fileValue);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid file" },
      { status: 400 }
    );
  }

  try {
    const uploaded = await uploadAdminReleaseAudio({
      trackId,
      file: fileValue
    });

    const extension = uploaded.key.split("/").pop()?.split(".").pop()?.trim().toLowerCase() ?? "wav";
    const nextRoles = cloneJson(release.roles);
    const nextSubmission = cloneJson(nextRoles.submissionData);
    const nextTracks = Array.isArray(nextSubmission.tracks) ? [...nextSubmission.tracks] : [];
    const currentTrack = asRecord(nextTracks[trackRow.index]) ?? {};
    nextTracks[trackRow.index] = {
      ...currentTrack,
      id: asString(currentTrack.id) ?? trackId,
      title: asString(currentTrack.title) ?? trackRow.title ?? "",
      fileName: asString(currentTrack.fileName) ?? fileValue.name,
      hasAudio: true,
      durationSec: currentTrack.durationSec ?? null,
      audioFile: {
        storageKey: uploaded.key,
        url: uploaded.fileUrl,
        fileName: fileValue.name,
        contentType: fileValue.type,
        sizeBytes: fileValue.size
      }
    };
    nextSubmission.tracks = nextTracks;
    nextRoles.submissionData = nextSubmission;

    await prisma.$transaction([
      prisma.track.update({
        where: { id: trackId },
        data: {
          track: extension
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
        releaseId,
        trackId,
        storageKey: uploaded.key,
        fileUrl: uploaded.fileUrl,
        bucket: uploaded.bucket
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const status =
      message.includes("missing") && message.includes("S3") ? 500 :
      message === "Release not found" ? 404 :
      message === "Track not found" ? 404 :
      message === "Файл не выбран." ? 400 :
      message.includes("Разрешены") || message.includes("Неверный формат") ? 400 :
      500;
    return NextResponse.json({ error: message }, { status });
  }
}
