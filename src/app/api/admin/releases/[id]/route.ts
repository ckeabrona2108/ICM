import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdminReleaseDetailsById, mapAdminReleaseDetails } from "@/lib/admin-release-details";
import { carryReleaseEditsToTrack, joinNames, normalizePersonGroups, toWizardPersons } from "@/lib/admin-release-edit";
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
    include: {
      user: { select: { name: true } },
      track: { orderBy: { index: "asc" } }
    }
  });
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }
  // What the page showed before this edit: used to tell which track fields still follow the release.
  const before = mapAdminReleaseDetails(release);

  const releaseGroups = normalizePersonGroups(body?.roles);
  const rolesRoot = asRecord(release.roles);
  const nextRoles = rolesRoot ? structuredClone(rolesRoot) : {};
  const submission = asRecord(nextRoles.submissionData);
  const nextSubmission = submission ? structuredClone(submission) : {};
  nextSubmission.title = title;
  nextSubmission.subtitle = subtitle || null;
  nextSubmission.label = label || null;
  nextSubmission.roles = releaseGroups;
  // The admin's list replaces the artist's one everywhere it is read: the wizard-format `persons`
  // (cabinet, resubmission), the `artist` string and the flat performer columns below.
  nextSubmission.persons = toWizardPersons(releaseGroups);
  if (typeof nextSubmission.artist === "string") {
    nextSubmission.artist = joinNames(releaseGroups.performers) ?? "";
  }
  nextRoles.adminPersons = releaseGroups;
  if (body?.dates) {
    nextSubmission.preorderDate = body.dates.preorder_date?.trim() || null;
    nextSubmission.startDate = body.dates.start_date?.trim() || null;
    nextSubmission.releaseDate = body.dates.release_date?.trim() || null;
  }

  const isSingle = release.track.length === 1 && /single|сингл/iu.test(before.release.release_type);
  const incomingTracks = Array.isArray(body?.tracks) ? body.tracks : [];
  const currentSubmissionTracks = Array.isArray(nextSubmission.tracks) ? structuredClone(nextSubmission.tracks) : [];
  const nextSubmissionTracks = currentSubmissionTracks as Array<Record<string, unknown>>;
  const trackUpdates: Prisma.PrismaPromise<unknown>[] = [];

  for (const trackRow of release.track) {
    const incoming = incomingTracks.find((item) => item?.id?.trim() === trackRow.id);
    if (!incoming) continue;
    const beforeTrack = before.tracks.find((item) => item.id === trackRow.id);
    const incomingGroups = normalizePersonGroups(incoming.roles);
    const carried = carryReleaseEditsToTrack({
      isSingle,
      releaseTitleBefore: before.release.title,
      releaseTitleAfter: title,
      releasePerformersBefore: before.release.roles.performers,
      releasePerformersAfter: releaseGroups.performers,
      trackTitleBefore: beforeTrack?.title ?? trackRow.title,
      trackTitleIncoming: asString(incoming.title) ?? trackRow.title,
      trackPerformersBefore: beforeTrack?.track_roles.performers ?? [],
      trackPerformersIncoming: incomingGroups.performers
    });
    const titleValue = carried.title;
    const subtitleValue = typeof incoming.subtitle === "string" ? incoming.subtitle.trim() : "";
    const trackGroups = { ...incomingGroups, performers: carried.performers };
    const nextTrackRoles = asRecord(trackRow.roles) ? structuredClone(trackRow.roles as Record<string, unknown>) : {};
    nextTrackRoles.persons = trackGroups;
    if (Array.isArray(nextTrackRoles.trackPersons)) {
      nextTrackRoles.trackPersons = toWizardPersons(trackGroups);
    }

    const trackIndex = Math.max(0, trackRow.index - 1);
    const prevSubmissionTrack = asRecord(nextSubmissionTracks[trackIndex]) ?? {};
    nextSubmissionTracks[trackIndex] = {
      ...prevSubmissionTrack,
      id: trackRow.id,
      title: titleValue,
      subtitle: subtitleValue || null,
      roles: trackGroups,
      ...(Array.isArray(prevSubmissionTrack.persons) ? { persons: toWizardPersons(trackGroups) } : {}),
      ...(Array.isArray(prevSubmissionTrack.trackPersons) ? { trackPersons: toWizardPersons(trackGroups) } : {})
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
        performer: joinNames(releaseGroups.performers),
        feat: joinNames(releaseGroups.feats),
        remixer: joinNames(releaseGroups.remixers),
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
