import type { CabinetRelease } from "@/lib/cabinet-types";
import { mapReleaseToCabinetRelease } from "@/lib/cabinet-release-server";
import { isReleaseDraftExpired } from "@/lib/draft-retention";
import { prisma } from "@/lib/prisma";
import { isReleaseVisibleOnScene } from "@/lib/scene-policy";
import { isReleaseHiddenFromCabinet } from "@/lib/release-deletion-state";

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
  rejectReason: true,
  moderatorComment: true,
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

async function deleteExpiredDraftsForUser(userId: string, now = new Date()) {
  const releases = await prisma.release.findMany({
    where: { userId },
    select: {
      id: true,
      status: true,
      confirmed: true,
      upc: true,
      roles: true
    }
  });
  const expiredIds = releases
    .filter((release) => isReleaseDraftExpired(release, now))
    .map((release) => release.id);

  if (expiredIds.length === 0) return;
  await prisma.release.deleteMany({
    where: {
      id: { in: expiredIds },
      userId
    }
  });
}

export async function getCabinetReleasesByUser(userId: string): Promise<CabinetRelease[]> {
  await deleteExpiredDraftsForUser(userId);

  const releases = await prisma.release.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    select: cabinetReleaseSelect
  });

  const visible = releases.filter((release) => !isReleaseHiddenFromCabinet(release.roles));
  return Promise.all(visible.map((release, index) => mapReleaseToCabinetRelease(release, index + 1)));
}

export async function getSceneEligibleCabinetReleasesByUser(
  userId: string,
  now = new Date()
): Promise<CabinetRelease[]> {
  await deleteExpiredDraftsForUser(userId, now);

  const releases = await prisma.release.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    select: cabinetReleaseSelect
  });
  const eligible = releases.filter((release) =>
    !isReleaseHiddenFromCabinet(release.roles) &&
    isReleaseVisibleOnScene(
      {
        status: release.status,
        confirmed: release.confirmed,
        upc: release.upc,
        roles: release.roles,
        releaseDate: release.date
      },
      now
    )
  );

  return Promise.all(
    eligible.map((release, index) => mapReleaseToCabinetRelease(release, index + 1))
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
  if (isReleaseDraftExpired(release)) {
    await prisma.release.delete({
      where: { id: release.id }
    });
    return null;
  }
  return mapReleaseToCabinetRelease(release, 1);
}
