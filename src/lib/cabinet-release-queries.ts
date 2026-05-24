import type { CabinetRelease } from "@/lib/cabinet-types";
import { mapReleaseToCabinetRelease } from "@/lib/cabinet-release-server";
import { prisma } from "@/lib/prisma";
import { resolveFirstReachableImageCandidateFromCandidates } from "@/lib/s3";

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
      track: true,
      isrc: true
    }
  }
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

  const mapped = releases.map((release, index) => mapReleaseToCabinetRelease(release, index + 1));
  return Promise.all(
    mapped.map(async (release, index) => {
      const source = releases[index];
      const candidateUrls = Array.from(
        new Set([release.coverUrl, ...(release.coverUrlCandidates ?? [])].filter(Boolean))
      );
      const resolved = await resolveFirstReachableImageCandidateFromCandidates(candidateUrls);
      const rawCover = source
        ? extractRawCover({
            preview: source.preview,
            roles: source.roles
          })
        : {
            preview: null,
            submissionCover: null,
            submissionCoverUploadUrl: null
          };
      console.log("[cover-resolver-debug]", {
        releaseId: release.id,
        title: release.title ?? "Без названия",
        rawCover,
        candidates: candidateUrls,
        foundUrl: resolved.url,
        failedReason: resolved.failedReason
      });
      return resolved.url
        ? {
            ...release,
            coverUrl: resolved.url
          }
        : release;
    })
  );
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
  const mapped = mapReleaseToCabinetRelease(release, 1);
  const candidateUrls = Array.from(
    new Set([mapped.coverUrl, ...(mapped.coverUrlCandidates ?? [])].filter(Boolean))
  );
  const resolved = await resolveFirstReachableImageCandidateFromCandidates(candidateUrls);
  const rawCover = extractRawCover({
    preview: release.preview,
    roles: release.roles
  });
  console.log("[cover-resolver-debug]", {
    releaseId: mapped.id,
    title: mapped.title ?? "Без названия",
    rawCover,
    candidates: candidateUrls,
    foundUrl: resolved.url,
    failedReason: resolved.failedReason
  });
  if (!resolved.url) return mapped;
  return {
    ...mapped,
    coverUrl: resolved.url
  };
}
