import type { CabinetRelease } from "@/lib/cabinet-types";
import { mapReleaseToCabinetRelease } from "@/lib/cabinet-release-server";
import { prisma } from "@/lib/prisma";

const cabinetReleaseSelect = {
  id: true,
  title: true,
  upc: true,
  date: true,
  startDate: true,
  preorderDate: true,
  genre: true,
  status: true,
  confirmed: true,
  labelName: true,
  preview: true,
  performer: true,
  roles: true,
  track: {
    select: {
      id: true,
      index: true,
      title: true,
      subtitle: true,
      track: true,
      isrc: true,
      partner_code: true,
      language: true,
      preview_start: true,
      focus: true,
      explicit: true,
      author_rights: true,
      roles: true
    }
  },
  userId: true
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function extractRawCover(source: {
  preview: string;
  roles: unknown;
}): { preview: string | null; submissionCover: string | null; submissionCoverUploadUrl: string | null } {
  const root = asRecord(source.roles);
  const submission = asRecord(root?.submissionData);
  const submissionCoverUpload = asRecord(submission?.coverUpload);
  return {
    preview: asString(source.preview),
    submissionCover: asString(submission?.cover),
    submissionCoverUploadUrl: asString(submissionCoverUpload?.url)
  };
}

export async function getCabinetReleasesByUser(userId: string): Promise<CabinetRelease[]> {
  const releases = await prisma.release.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    select: cabinetReleaseSelect
  });

  return Promise.all(releases.map((release, index) => mapReleaseToCabinetRelease(release, index + 1)));
}

export async function getCabinetDraftReleasesByUser(userId: string): Promise<CabinetRelease[]> {
  const releases = await getCabinetReleasesByUser(userId);
  return releases.filter((release) => release.status === "draft");
}

export async function getCabinetReleaseByIdForUser(userId: string, releaseId: string) {
  const release = await prisma.release.findFirst({
    where: {
      id: releaseId,
      userId
    },
    select: cabinetReleaseSelect
  });
  if (!release) return null;
  return mapReleaseToCabinetRelease(release, 1);
}
