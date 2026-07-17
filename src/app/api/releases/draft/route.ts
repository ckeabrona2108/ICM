import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type { ReleaseDraftSaveRequest, ReleaseDraftSaveResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeReleaseCoverUrl, resolveReleasePreviewForPersistence } from "@/lib/release-cover";
import {
  getReleaseSidebarCountsForUser,
  getReleaseLifecycleStatus,
  withReleaseLifecycleState
} from "@/lib/release-counts";
import { readReleaseTypeFromSubmissionData } from "@/lib/release-submit-tracks";

export const dynamic = "force-dynamic";

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
}

function readTitle(data: Record<string, unknown>): string {
  const value = typeof data.title === "string" ? data.title.trim() : "";
  return value || "Новый релиз";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readCoverUploadUrl(data: Record<string, unknown>): string | null {
  const coverUpload = asRecord(data.coverUpload);
  return normalizeReleaseCoverUrl(coverUpload, null);
}

function readGenre(data: Record<string, unknown>): string {
  const value = typeof data.genre === "string" ? data.genre.trim() : "";
  return value || "Не указан";
}

function readLanguage(data: Record<string, unknown>): string {
  const value = typeof data.language === "string" ? data.language.trim() : "";
  return value || "Russian";
}

function readLabel(data: Record<string, unknown>): string | null {
  const value = typeof data.label === "string" ? data.label.trim() : "";
  return value || null;
}

function readPerformer(data: Record<string, unknown>): string | null {
  const explicit = typeof data.artist === "string" ? data.artist.trim() : "";
  if (explicit) return explicit;

  const persons = Array.isArray(data.persons) ? data.persons : [];
  const performerNames = persons
    .map((item) => asRecord(item))
    .filter(Boolean)
    .filter((item) => {
      const role = typeof item?.role === "string" ? item.role.trim().toLowerCase() : "";
      return role === "исполнитель";
    })
    .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
    .filter(Boolean);

  return performerNames.join(", ") || null;
}

function mergeSubmissionData(roles: unknown, submissionData: Record<string, unknown>): Record<string, unknown> {
  const root =
    roles && typeof roles === "object" && !Array.isArray(roles)
      ? (roles as Record<string, unknown>)
      : {};
  return {
    ...root,
    submissionData
  };
}

function readSubmissionDataCover(data: Record<string, unknown>): string | null {
  return readCoverUploadUrl(data) ?? normalizeReleaseCoverUrl(data.cover, null);
}

async function draftsCount(userId: string) {
  const counts = await getReleaseSidebarCountsForUser({
    userId,
    prisma
  });
  return counts.draft;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: ReleaseDraftSaveRequest;
  try {
    payload = (await request.json()) as ReleaseDraftSaveRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload?.data || typeof payload.data !== "object") {
    return NextResponse.json({ error: "Draft payload is required" }, { status: 400 });
  }

  const data = payload.data as Record<string, unknown>;
  const now = new Date();
  const releaseDate = parseDate(data.releaseDate, now);
  const startDate = parseDate(data.startDate, releaseDate);
  const preorderDate = parseDate(data.preorderDate, releaseDate);

  const newReleaseId = randomUUID();
  const preview = await resolveReleasePreviewForPersistence({
    id: newReleaseId,
    preview: normalizeReleaseCoverUrl(data.cover, null),
    submissionData: payload.data,
    coverUpload: data.coverUpload,
    cover: data.cover,
    roles: { submissionData: payload.data },
    userId: session.user.id,
    title: readTitle(data)
  });
  const submissionDataCover = readSubmissionDataCover(data);
  console.log("[release-cover-save]", {
    releaseId: newReleaseId,
    preview,
    submissionDataCover
  });

  const created = await prisma.release.create({
    data: {
      id: newReleaseId,
      userId: session.user.id,
      preview,
      title: readTitle(data),
      date: releaseDate,
      language: readLanguage(data),
      subtitle: typeof data.subtitle === "string" ? data.subtitle : null,
      performer: readPerformer(data),
      feat: typeof data.feat === "string" ? data.feat : null,
      remixer: typeof data.remixer === "string" ? data.remixer : null,
      genre: readGenre(data),
      labelName: readLabel(data),
      startDate,
      preorderDate,
      type: readReleaseTypeFromSubmissionData(data),
      earlyStartInRussia: data.earlyRussiaStart === true,
      realTimeDelivery: data.realTimeDelivery === true,
      yandexSoonNewRelease: parseDate(data.yandexPreReleaseDate, releaseDate),
      confirmed: false,
      status: "moderating",
      roles: withReleaseLifecycleState(
        {
          submissionData: payload.data
        },
        "draft"
      ) as Prisma.InputJsonValue
    },
    select: { id: true }
  });

  const response: ReleaseDraftSaveResponse = {
    ok: true,
    releaseId: created.id,
    draftsCount: await draftsCount(session.user.id),
    message: "Черновик сохранён."
  };
  return NextResponse.json(response, { status: 200 });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: ReleaseDraftSaveRequest;
  try {
    payload = (await request.json()) as ReleaseDraftSaveRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload?.releaseId?.trim()) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }
  if (!payload?.data || typeof payload.data !== "object") {
    return NextResponse.json({ error: "Draft payload is required" }, { status: 400 });
  }

  const existing = await prisma.release.findFirst({
    where: { id: payload.releaseId, userId: session.user.id },
    select: {
      id: true,
      date: true,
      startDate: true,
      preorderDate: true,
      confirmed: true,
      status: true,
      roles: true
    }
  });
  if (!existing) {
    return NextResponse.json({ error: "Черновик не найден" }, { status: 404 });
  }

  const data = payload.data as Record<string, unknown>;
  const releaseDate = parseDate(data.releaseDate, existing.date);
  const startDate = parseDate(data.startDate, existing.startDate);
  const preorderDate = parseDate(data.preorderDate, existing.preorderDate);

  const preview = await resolveReleasePreviewForPersistence({
    id: payload.releaseId,
    preview: normalizeReleaseCoverUrl(data.cover, null),
    submissionData: payload.data,
    coverUpload: data.coverUpload,
    cover: data.cover,
    roles: mergeSubmissionData(existing.roles, payload.data as Record<string, unknown>),
    userId: session.user.id,
    title: readTitle(data)
  });
  const submissionDataCover = readSubmissionDataCover(data);
  console.log("[release-cover-save]", {
    releaseId: payload.releaseId,
    preview,
    submissionDataCover
  });

  await prisma.release.update({
    where: { id: payload.releaseId },
    data: {
      preview,
      title: readTitle(data),
      date: releaseDate,
      language: readLanguage(data),
      subtitle: typeof data.subtitle === "string" ? data.subtitle : null,
      performer: readPerformer(data),
      feat: typeof data.feat === "string" ? data.feat : null,
      remixer: typeof data.remixer === "string" ? data.remixer : null,
      genre: readGenre(data),
      labelName: readLabel(data),
      startDate,
      preorderDate,
      type: readReleaseTypeFromSubmissionData(data),
      earlyStartInRussia: data.earlyRussiaStart === true,
      realTimeDelivery: data.realTimeDelivery === true,
      yandexSoonNewRelease: parseDate(data.yandexPreReleaseDate, releaseDate),
      confirmed: existing.confirmed,
      status: existing.status,
      roles: withReleaseLifecycleState(
        mergeSubmissionData(
          existing.roles,
          payload.data as Record<string, unknown>
        ),
        getReleaseLifecycleStatus(existing.status, existing.roles) ?? "draft"
      ) as Prisma.InputJsonValue
    }
  });

  const response: ReleaseDraftSaveResponse = {
    ok: true,
    releaseId: payload.releaseId,
    draftsCount: await draftsCount(session.user.id),
    message: "Черновик обновлён."
  };
  return NextResponse.json(response, { status: 200 });
}
