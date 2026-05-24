import type { CabinetRelease } from "@/lib/cabinet-types";
import { mapReleaseToCabinetRelease } from "@/lib/cabinet-release-server";
import { prisma } from "@/lib/prisma";
import { resolveFirstReachableImageUrlFromCandidates } from "@/lib/s3";

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

export async function getCabinetReleasesByUser(userId: string): Promise<CabinetRelease[]> {
  const releases = await prisma.release.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    select: cabinetReleaseSelect
  });

  const mapped = releases.map((release, index) => mapReleaseToCabinetRelease(release, index + 1));
  return Promise.all(
    mapped.map(async (release) => {
      const candidateUrls = Array.from(
        new Set([release.coverUrl, ...(release.coverUrlCandidates ?? [])].filter(Boolean))
      );
      if (candidateUrls.length <= 1) return release;
      const reachableUrl = await resolveFirstReachableImageUrlFromCandidates(candidateUrls);
      return reachableUrl
        ? {
            ...release,
            coverUrl: reachableUrl
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
  if (candidateUrls.length <= 1) return mapped;
  const reachableUrl = await resolveFirstReachableImageUrlFromCandidates(candidateUrls);
  if (!reachableUrl) return mapped;
  return {
    ...mapped,
    coverUrl: reachableUrl
  };
}
