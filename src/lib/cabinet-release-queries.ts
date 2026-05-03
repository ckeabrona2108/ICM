import { ReleaseStatus } from "@prisma/client";

import type { CabinetRelease } from "@/lib/cabinet-types";
import { prisma } from "@/lib/prisma";

import { cabinetReleaseSelect, mapReleaseToCabinetRelease } from "./cabinet-release-server";

export async function getCabinetReleasesByUser(userId: string): Promise<CabinetRelease[]> {
  const releases = await prisma.release.findMany({
    where: { userId },
    select: cabinetReleaseSelect,
    orderBy: { createdAt: "desc" }
  });

  return releases.map((release, index) => mapReleaseToCabinetRelease(release, index + 1));
}

export async function getCabinetDraftReleasesByUser(userId: string): Promise<CabinetRelease[]> {
  const releases = await prisma.release.findMany({
    where: {
      userId,
      status: ReleaseStatus.DRAFT
    },
    select: cabinetReleaseSelect,
    orderBy: { createdAt: "desc" }
  });

  return releases.map((release, index) => mapReleaseToCabinetRelease(release, index + 1));
}

export async function getCabinetReleaseByIdForUser(
  userId: string,
  releaseId: string
): Promise<CabinetRelease | null> {
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
