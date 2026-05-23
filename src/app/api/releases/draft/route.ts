import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type { ReleaseDraftSaveRequest, ReleaseDraftSaveResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

function readTitle(data: Record<string, unknown>): string {
  const value = typeof data.title === "string" ? data.title.trim() : "";
  return value || "Новый релиз";
}

function readCover(data: Record<string, unknown>): string {
  const value = typeof data.cover === "string" ? data.cover.trim() : "";
  return value || "/hero/drop.png";
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
  const value = typeof data.artist === "string" ? data.artist.trim() : "";
  return value || null;
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

async function draftsCount(userId: string) {
  return prisma.release.count({ where: { userId, confirmed: false } });
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

  const created = await prisma.release.create({
    data: {
      id: randomUUID(),
      userId: session.user.id,
      preview: readCover(data),
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
      type: normalizeReleaseType(data.releaseType),
      confirmed: false,
      status: "moderating",
      roles: {
        submissionData: payload.data
      }
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

  await prisma.release.update({
    where: { id: payload.releaseId },
    data: {
      preview: readCover(data),
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
      type: normalizeReleaseType(data.releaseType),
      confirmed: existing.confirmed,
      status: existing.status,
      roles: mergeSubmissionData(
        existing.roles,
        payload.data as Record<string, unknown>
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
