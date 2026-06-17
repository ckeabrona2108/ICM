import { PrismaClient } from "@prisma/client";

import {
  asString,
  buildTempDatabaseName,
  buildTempDatabaseUrl,
  createBackupPrismaClient,
  createTempDatabase,
  dropTempDatabase,
  fetchReleaseRows,
  getBackupPathFromArgs,
  getCurrentDatabaseInfo,
  getLimitFromArgs,
  getReleaseIdFilter,
  probeRenderableUrl,
  resolveBackupReleasePreview,
  resolveBackupTrackAudio,
  restoreBackupToTempDatabase
} from "./restore-media-from-backup.shared";

const APPLY = process.argv.includes("--apply");
const currentPrisma = new PrismaClient();

async function main() {
  const backupPath = getBackupPathFromArgs();
  const currentDb = getCurrentDatabaseInfo();
  const tempDbName = buildTempDatabaseName("icecream_restore_tmp");
  const tempDbUrl = buildTempDatabaseUrl(currentDb, tempDbName);
  const releaseIdFilter = getReleaseIdFilter();
  const limit = getLimitFromArgs();

  let tempDbCreated = false;
  let backupPrisma: ReturnType<typeof createBackupPrismaClient> | null = null;
  const summary = {
    apply: APPLY,
    backupPath,
    releaseUpdates: 0,
    trackUpdates: 0,
    skipped: 0,
    failed: 0,
    rows: [] as Array<Record<string, unknown>>
  };

  try {
    await createTempDatabase(currentDb, tempDbName);
    tempDbCreated = true;
    await restoreBackupToTempDatabase(currentDb, tempDbName, backupPath);
    backupPrisma = createBackupPrismaClient(tempDbUrl);

    const [currentReleases, backupReleases] = await Promise.all([
      fetchReleaseRows(currentPrisma),
      fetchReleaseRows(backupPrisma)
    ]);

    const currentById = new Map(currentReleases.map((release) => [release.id, release]));
    const filteredBackupReleases = backupReleases.filter((release) =>
      releaseIdFilter ? release.id === releaseIdFilter : true
    );
    const limitedBackupReleases =
      typeof limit === "number" && Number.isFinite(limit)
        ? filteredBackupReleases.slice(0, Math.max(0, limit))
        : filteredBackupReleases;

    for (const backupRelease of limitedBackupReleases) {
      const currentRelease = currentById.get(backupRelease.id) ?? null;
      const releaseBackupPreview = await resolveBackupReleasePreview(backupRelease);
      const backupPreviewHttpStatus = releaseBackupPreview.resolvedUrl
        ? await probeRenderableUrl(releaseBackupPreview.resolvedUrl)
        : null;
      const releaseCanRestore = backupPreviewHttpStatus === 200 || backupPreviewHttpStatus === 206;

      const releaseRow = {
        releaseId: backupRelease.id,
        title: backupRelease.title,
        currentPreview: currentRelease?.preview ?? "",
        backupPreview: releaseBackupPreview.dbValue ?? "",
        backupPreviewHttpStatus,
        canRestore: releaseCanRestore
      };
      summary.rows.push({ type: "release", ...releaseRow });

      if (APPLY && releaseCanRestore && releaseBackupPreview.dbValue && currentRelease?.preview !== releaseBackupPreview.dbValue) {
      await currentPrisma.release.update({
        where: { id: backupRelease.id },
        data: {
          preview: releaseBackupPreview.dbValue
        } as any
      });
        summary.releaseUpdates += 1;
      } else {
        summary.skipped += 1;
      }

      const currentTracksById = new Map(
        (currentRelease?.track ?? []).map((track) => [track.id, track])
      );

      for (const backupTrack of backupRelease.track) {
        const currentTrack = currentTracksById.get(backupTrack.id) ?? null;
        const backupAudio = resolveBackupTrackAudio(backupTrack);
        const backupAudioHttpStatus = backupAudio.resolvedUrl
          ? await probeRenderableUrl(backupAudio.resolvedUrl)
          : null;
        const trackCanRestore = backupAudioHttpStatus === 200 || backupAudioHttpStatus === 206;

        summary.rows.push({
          type: "track",
          releaseId: backupRelease.id,
          title: backupRelease.title,
          trackId: backupTrack.id,
          currentTrack: currentTrack?.track ?? "",
          backupTrack: backupTrack.track ?? "",
          backupAudioHttpStatus,
          canRestore: trackCanRestore
        });

        if (APPLY && trackCanRestore) {
          const updateData: Record<string, unknown> = {};
          if (currentTrack?.track !== backupTrack.track) {
            updateData.track = backupTrack.track;
          }
          if (JSON.stringify(currentTrack?.roles ?? null) !== JSON.stringify(backupTrack.roles ?? null)) {
            updateData.roles = backupTrack.roles;
          }

          if (Object.keys(updateData).length > 0) {
            await currentPrisma.track.update({
              where: { id: backupTrack.id },
              data: updateData as any
            });
            summary.trackUpdates += 1;
          } else {
            summary.skipped += 1;
          }
        } else {
          summary.skipped += 1;
        }
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (backupPrisma) {
      await backupPrisma.$disconnect().catch(() => undefined);
    }
    await currentPrisma.$disconnect().catch(() => undefined);
    if (tempDbCreated) {
      await dropTempDatabase(currentDb, tempDbName).catch(() => undefined);
    }
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await currentPrisma.$disconnect();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
