import { prisma as currentPrisma } from "@/lib/prisma";

import {
  asString,
  buildTempDatabaseName,
  buildTempDatabaseUrl,
  createBackupPrismaClient,
  createTempDatabase,
  csvEscape,
  dropTempDatabase,
  fetchReleaseRows,
  getBackupPathFromArgs,
  getCurrentDatabaseInfo,
  getLimitFromArgs,
  getReleaseIdFilter,
  resolveBackupReleasePreview,
  resolveBackupTrackAudio,
  summarizeTrackAudioRefs,
  restoreBackupToTempDatabase
} from "./restore-media-from-backup.shared";
import { normalizeReleaseCoverStorageKey } from "@/lib/release-cover";
import { probeStorageKeyDiagnostics } from "@/lib/s3";

function extractStorageKeyFromUrl(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const relativeMatch = trimmed.match(/\/api\/uploads\/object\/(.+)$/iu);
  if (relativeMatch?.[1]) {
    return decodeURIComponent(relativeMatch[1].split("?")[0]?.split("#")[0] ?? "");
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      const absoluteMatch = parsed.pathname.match(/\/api\/uploads\/object\/(.+)$/iu);
      if (absoluteMatch?.[1]) {
        return decodeURIComponent(absoluteMatch[1].split("?")[0]?.split("#")[0] ?? "");
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function main() {
  const backupPath = getBackupPathFromArgs();
  const currentDb = getCurrentDatabaseInfo();
  const tempDbName = buildTempDatabaseName("icecream_restore_tmp");
  const tempDbUrl = buildTempDatabaseUrl(currentDb, tempDbName);
  const releaseIdFilter = getReleaseIdFilter();
  const limit = getLimitFromArgs();

  let tempDbCreated = false;
  let backupPrisma: ReturnType<typeof createBackupPrismaClient> | null = null;

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

    process.stdout.write("# releases\n");
    process.stdout.write(
      [
        "releaseId",
        "title",
        "currentPreview",
        "backupPreview",
        "publicHttpStatus",
        "sdkHeadExists",
        "appRouteHttpStatus",
        "finalDiagnosis",
        "canRestore"
      ].join(",") + "\n"
    );

    for (const backupRelease of limitedBackupReleases) {
      const currentRelease = currentById.get(backupRelease.id) ?? null;
      const backupPreview = await resolveBackupReleasePreview(backupRelease);
      const backupPreviewStorageKey = normalizeReleaseCoverStorageKey(backupRelease.preview, backupRelease.id);
      const backupPreviewProbe = await probeStorageKeyDiagnostics({
        storageKey: backupPreviewStorageKey,
        publicUrl: backupPreview.candidateUrls.find((candidateUrl) => /^https?:\/\//iu.test(candidateUrl)) ?? null
      });
      const canRestore = backupPreviewProbe.finalDiagnosis === "ok";

      process.stdout.write(
        [
          csvEscape(backupRelease.id),
          csvEscape(backupRelease.title),
          csvEscape(asString(currentRelease?.preview) ?? ""),
          csvEscape(backupPreview.dbValue ?? ""),
          csvEscape(backupPreviewProbe.publicHttpStatus ?? ""),
          csvEscape(backupPreviewProbe.sdkHeadExists ?? ""),
          csvEscape(backupPreviewProbe.appRouteHttpStatus ?? ""),
          csvEscape(backupPreviewProbe.finalDiagnosis),
          csvEscape(canRestore)
        ].join(",") + "\n"
      );
    }

    process.stdout.write("\n# tracks\n");
    process.stdout.write(
      [
        "releaseId",
        "title",
        "trackId",
        "currentTrack",
        "backupTrack",
        "currentAudioRefs",
        "backupAudioRefs",
        "expectedBackupAudioUrl",
        "publicHttpStatus",
        "sdkHeadExists",
        "appRouteHttpStatus",
        "finalDiagnosis",
        "canRestore"
      ].join(",") + "\n"
    );

    for (const backupRelease of limitedBackupReleases) {
      const currentRelease = currentById.get(backupRelease.id) ?? null;
      const currentTracksById = new Map(
        (currentRelease?.track ?? []).map((track) => [track.id, track])
      );

      for (const backupTrack of backupRelease.track) {
        const currentTrack = currentTracksById.get(backupTrack.id) ?? null;
        const backupAudio = resolveBackupTrackAudio(backupTrack);
        const backupAudioStorageKey = extractStorageKeyFromUrl(backupAudio.resolvedUrl);
        const backupAudioProbe = await probeStorageKeyDiagnostics({
          storageKey: backupAudioStorageKey,
          publicUrl: backupAudio.candidateUrls.find((candidateUrl) => /^https?:\/\//iu.test(candidateUrl)) ?? null
        });
        const canRestore = backupAudioProbe.finalDiagnosis === "ok";

        process.stdout.write(
          [
            csvEscape(backupRelease.id),
            csvEscape(backupRelease.title),
            csvEscape(backupTrack.id),
            csvEscape(asString(currentTrack?.track) ?? ""),
            csvEscape(asString(backupTrack.track) ?? ""),
            csvEscape(summarizeTrackAudioRefs(currentTrack ?? backupTrack)),
            csvEscape(summarizeTrackAudioRefs(backupTrack)),
            csvEscape(backupAudio.resolvedUrl ?? ""),
            csvEscape(backupAudioProbe.publicHttpStatus ?? ""),
            csvEscape(backupAudioProbe.sdkHeadExists ?? ""),
            csvEscape(backupAudioProbe.appRouteHttpStatus ?? ""),
            csvEscape(backupAudioProbe.finalDiagnosis),
            csvEscape(canRestore)
          ].join(",") + "\n"
        );
      }
    }
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
