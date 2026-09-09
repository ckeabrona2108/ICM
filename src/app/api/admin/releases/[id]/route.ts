import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdminReleaseDetailsById } from "@/lib/admin-release-details";
import { canManageReleasesSession, deleteReleaseByAdmin } from "@/lib/admin-release-service";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function parseOptionalDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    throw new Error("INVALID_DATE");
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("INVALID_DATE");
  }
  return date;
}

export async function GET(
  _request: Request,
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

  const details = await getAdminReleaseDetailsById(releaseId);
  if (!details) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  return NextResponse.json(details, { status: 200 });
}

export async function DELETE(
  _request: Request,
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

  const deleted = await deleteReleaseByAdmin({
    prisma,
    adminId: session.user.id,
    releaseId
  });
  if (!deleted) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      releaseId,
      message: "Релиз удалён."
    },
    { status: 200 }
  );
}

export async function PATCH(
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

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        subtitle?: string;
        label?: string;
        roles?: {
          performers?: string[];
          feats?: string[];
          remixers?: string[];
          coPerformers?: string[];
          producers?: string[];
          musicAuthors?: string[];
          lyricsAuthors?: string[];
        };
        tracks?: Array<{
          id?: string;
          title?: string;
          subtitle?: string;
          roles?: {
            performers?: string[];
            feats?: string[];
            remixers?: string[];
            coPerformers?: string[];
            producers?: string[];
            musicAuthors?: string[];
            lyricsAuthors?: string[];
          };
        }>;
        dates?: {
          preorder_date?: string;
          start_date?: string;
          release_date?: string;
        };
      }
    | null;
  const title = asString(body?.title);
  const subtitle = typeof body?.subtitle === "string" ? body.subtitle.trim() : "";
  const label = typeof body?.label === "string" ? body.label.trim() : "";

  if (!title) {
    return NextResponse.json({ error: "Название релиза обязательно." }, { status: 400 });
  }

  let preorderDate: Date | undefined;
  let startDate: Date | undefined;
  let releaseDate: Date | undefined;

  if (body?.dates && typeof body.dates.release_date === "string" && !body.dates.release_date.trim()) {
    return NextResponse.json({ error: "Дата релиза обязательна." }, { status: 400 });
  }

  try {
    preorderDate = parseOptionalDate(body?.dates?.preorder_date);
    startDate = parseOptionalDate(body?.dates?.start_date);
    releaseDate = parseOptionalDate(body?.dates?.release_date);
  } catch {
    return NextResponse.json(
      { error: "Проверьте даты релиза. Используйте формат YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true,
      roles: true,
      track: {
        select: {
          id: true,
          title: true,
          subtitle: true,
          roles: true,
          index: true
        },
        orderBy: { index: "asc" }
      }
    }
  });
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  const rolesRoot = asRecord(release.roles);
  const nextRoles = rolesRoot ? structuredClone(rolesRoot) : {};
  const submission = asRecord(nextRoles.submissionData);
  const nextSubmission = submission ? structuredClone(submission) : {};
  nextSubmission.title = title;
  nextSubmission.subtitle = subtitle || null;
  nextSubmission.label = label || null;
  nextSubmission.roles = {
    performers: asStringArray(body?.roles?.performers),
    feats: asStringArray(body?.roles?.feats),
    remixers: asStringArray(body?.roles?.remixers),
    coPerformers: asStringArray(body?.roles?.coPerformers),
    producers: asStringArray(body?.roles?.producers),
    musicAuthors: asStringArray(body?.roles?.musicAuthors),
    lyricsAuthors: asStringArray(body?.roles?.lyricsAuthors)
  };
  if (body?.dates) {
    nextSubmission.preorderDate = body.dates.preorder_date?.trim() || null;
    nextSubmission.startDate = body.dates.start_date?.trim() || null;
    nextSubmission.releaseDate = body.dates.release_date?.trim() || null;
  }

  const incomingTracks = Array.isArray(body?.tracks) ? body.tracks : [];
  const currentSubmissionTracks = Array.isArray(nextSubmission.tracks) ? structuredClone(nextSubmission.tracks) : [];
  const nextSubmissionTracks = currentSubmissionTracks as Array<Record<string, unknown>>;
  const trackUpdates: Prisma.PrismaPromise<unknown>[] = [];

  for (const trackRow of release.track) {
    const incoming = incomingTracks.find((item) => item?.id?.trim() === trackRow.id);
    if (!incoming) continue;
    const titleValue = asString(incoming.title) ?? trackRow.title;
    const subtitleValue = typeof incoming.subtitle === "string" ? incoming.subtitle.trim() : "";
    const nextTrackRoles = asRecord(trackRow.roles) ? structuredClone(trackRow.roles as Record<string, unknown>) : {};
    nextTrackRoles.persons = {
      performers: asStringArray(incoming.roles?.performers),
      feats: asStringArray(incoming.roles?.feats),
      remixers: asStringArray(incoming.roles?.remixers),
      coPerformers: asStringArray(incoming.roles?.coPerformers),
      producers: asStringArray(incoming.roles?.producers),
      musicAuthors: asStringArray(incoming.roles?.musicAuthors),
      lyricsAuthors: asStringArray(incoming.roles?.lyricsAuthors)
    };

    const trackIndex = Math.max(0, trackRow.index - 1);
    const prevSubmissionTrack = asRecord(nextSubmissionTracks[trackIndex]) ?? {};
    nextSubmissionTracks[trackIndex] = {
      ...prevSubmissionTrack,
      id: trackRow.id,
      title: titleValue,
      subtitle: subtitleValue || null,
      roles: nextTrackRoles.persons
    };

    trackUpdates.push(
      prisma.track.update({
        where: { id: trackRow.id },
        data: {
          title: titleValue,
          subtitle: subtitleValue || null,
          roles: nextTrackRoles as Prisma.InputJsonValue
        }
      })
    );
  }

  if (trackUpdates.length > 0) {
    nextSubmission.tracks = nextSubmissionTracks;
  }
  nextRoles.submissionData = nextSubmission;

  await prisma.$transaction([
    prisma.release.update({
      where: { id: releaseId },
      data: {
        title,
        subtitle: subtitle || null,
        labelName: label || null,
        ...(preorderDate !== undefined ? { preorderDate } : {}),
        ...(startDate !== undefined ? { startDate } : {}),
        ...(releaseDate !== undefined ? { date: releaseDate } : {}),
        roles: nextRoles as Prisma.InputJsonValue
      }
    }),
    ...trackUpdates
  ]);

  return NextResponse.json(
    {
      ok: true,
      releaseId,
      title,
      subtitle: subtitle || null,
      label: label || null
    },
    { status: 200 }
  );
}
