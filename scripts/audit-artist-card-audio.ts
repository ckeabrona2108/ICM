import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { prisma } from "@/lib/prisma";
import { normalizeStoredFileKey } from "@/lib/file-resolver";
import { getSceneShowcaseState } from "@/lib/scene-showcase-state";

type RecordLike = Record<string, unknown>;

type BucketObjectIndex = Set<string>;

type AuditRow = {
  releaseId: string;
  releaseTitle: string;
  trackId: string | null;
  trackTitle: string | null;
  status:
    | "ok_preview"
    | "ok_track"
    | "missing_preview"
    | "missing_track"
    | "missing_all"
    | "no_audio_source";
  chosenSource: "preview" | "track" | "none";
  previewKey: string | null;
  resolvedTrackKey: string | null;
  matchedKey: string | null;
  details: string;
};

function readStringEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function readBooleanEnv(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (typeof raw !== "string") return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function toEndpointUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;
  if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) return rawValue;
  const useSsl = readBooleanEnv("S3_USE_SSL", true);
  return `${useSsl ? "https" : "http"}://${rawValue}`;
}

function getS3Client(): S3Client {
  const endpoint = toEndpointUrl(readStringEnv("S3_ENDPOINT", "MINIO_ENDPOINT", "S3_HOST"));
  const region = readStringEnv("S3_REGION", "AWS_REGION") ?? "ru";
  const accessKeyId = readStringEnv(
    "S3_ACCESS_KEY_ID",
    "S3_ACCESS_KEY",
    "MINIO_ACCESS_KEY",
    "MINIO_ROOT_USER"
  );
  const secretAccessKey = readStringEnv(
    "S3_SECRET_ACCESS_KEY",
    "S3_SECRET_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_ROOT_PASSWORD"
  );

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 credentials are missing in env.");
  }

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  });
}

function getBucketCandidates(): string[] {
  const configuredBucket = readStringEnv(
    "S3_BUCKET",
    "S3_BUCKET_NAME",
    "MINIO_BUCKET",
    "MINIO_BUCKET_NAME"
  );
  return Array.from(new Set([
    configuredBucket,
    "contracts",
    "uploads",
    "signatures",
    "verification"
  ].filter((value): value is string => Boolean(value?.trim()))));
}

async function listBucketKeys(client: S3Client, bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
      MaxKeys: 1000
    }));
    for (const item of response.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function buildObjectIndex(): Promise<BucketObjectIndex> {
  const client = getS3Client();
  const keys = new Set<string>();
  for (const bucket of getBucketCandidates()) {
    try {
      const bucketKeys = await listBucketKeys(client, bucket);
      for (const key of bucketKeys) keys.add(key);
      process.stderr.write(`bucket ${bucket}: ${bucketKeys.length} objects indexed\n`);
    } catch (error) {
      process.stderr.write(`bucket ${bucket}: skipped (${error instanceof Error ? error.message : String(error)})\n`);
    }
  }
  return keys;
}

function asRecord(value: unknown): RecordLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RecordLike;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function splitFileNameParts(value: string): { baseName: string; extension: string | null } {
  const trimmed = value.trim();
  const withoutQuery = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  const fileName = withoutQuery.split("/").filter(Boolean).at(-1) ?? "";
  if (!fileName) return { baseName: "", extension: null };
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= fileName.length - 1) {
    return { baseName: fileName, extension: null };
  }
  return {
    baseName: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex + 1).toLowerCase()
  };
}

function extractRawCandidateString(value: unknown): string | null {
  const raw = asString(value);
  if (raw) return raw;
  const record = asRecord(value);
  if (!record) return null;
  for (const candidate of [record.storageKey, record.key, record.url, record.path, record.filePath, record.fileName]) {
    const normalized = asString(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function extractExtensionHint(value: unknown): string | null {
  const raw = extractRawCandidateString(value);
  if (!raw) return null;
  if (/^[a-z0-9]{2,8}$/iu.test(raw.replace(/^\./u, ""))) {
    return raw.replace(/^\./u, "").toLowerCase();
  }
  return splitFileNameParts(raw).extension;
}

function buildOrderedExtensions(extensionHint: string | null, fallbackExtensions: string[]): string[] {
  return unique([extensionHint, ...fallbackExtensions]);
}

function buildVariantKeysFromSeeds(seeds: string[], fallbackExtensions: string[]): string[] {
  const candidates: string[] = [];
  for (const seed of seeds) {
    const storageKey = normalizeStoredFileKey(seed);
    if (!storageKey) continue;
    const segments = storageKey.split("/").filter(Boolean);
    const fileName = segments.at(-1) ?? "";
    const prefix = segments.slice(0, -1).join("/");
    const { baseName, extension } = splitFileNameParts(fileName);
    if (!baseName) continue;
    for (const ext of buildOrderedExtensions(extension, fallbackExtensions)) {
      candidates.push(prefix ? `${prefix}/${baseName}.${ext}` : `${baseName}.${ext}`);
    }
  }
  return unique(candidates);
}

function buildLegacyAudioKeys(trackId: string | null, trackValue: unknown, fileHint: unknown): string[] {
  if (!trackId) return [];
  const extensionHint = extractExtensionHint(trackValue) ?? extractExtensionHint(fileHint);
  return buildOrderedExtensions(extensionHint, ["wav", "mp3", "flac", "aac", "m4a", "aiff"]).flatMap((ext) => [
    `tracks/${trackId}.${ext}`,
    `uploads/${trackId}.${ext}`,
    `contracts/tracks/${trackId}.${ext}`,
    `contracts/uploads/${trackId}.${ext}`,
    `previews/${trackId}.${ext}`,
    `contracts/previews/${trackId}.${ext}`,
    `audio/${trackId}.${ext}`,
    `audios/${trackId}.${ext}`
  ]);
}

function buildTrackAudioKeys(input: {
  trackId: string;
  trackRow: RecordLike;
  submissionTrack: RecordLike | null;
}): string[] {
  const exactKeys = unique([
    normalizeStoredFileKey(input.trackRow.audioFile),
    normalizeStoredFileKey(input.trackRow.audioUpload),
    normalizeStoredFileKey(input.trackRow.audioUrl),
    normalizeStoredFileKey(input.trackRow.audio),
    normalizeStoredFileKey(input.trackRow.track),
    normalizeStoredFileKey(input.submissionTrack?.audioFile),
    normalizeStoredFileKey(input.submissionTrack?.audioUpload),
    normalizeStoredFileKey(input.submissionTrack?.audioUrl),
    normalizeStoredFileKey(input.submissionTrack?.audio),
    normalizeStoredFileKey(input.submissionTrack?.track)
  ]);
  const variantKeys = buildVariantKeysFromSeeds(exactKeys, ["wav", "mp3", "flac", "aac", "m4a", "aiff"]);
  const legacyKeys = buildLegacyAudioKeys(
    input.trackId,
    input.trackRow.track,
    input.submissionTrack?.audioFile ?? input.submissionTrack?.audioUrl ?? input.trackRow.audioFile ?? input.trackRow.audioUrl
  );
  return unique([...exactKeys, ...variantKeys, ...legacyKeys]);
}

function csvEscape(value: string | null | undefined): string {
  if (!value) return "";
  if (!/[",\n\r]/u.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

async function main() {
  const objectIndex = await buildObjectIndex();

  const releases = await prisma.release.findMany({
    select: {
      id: true,
      title: true,
      roles: true,
      track: {
        select: {
          id: true,
          index: true,
          title: true,
          track: true,
          roles: true
        },
        orderBy: { index: "asc" }
      }
    },
    orderBy: { date: "asc" }
  });

  const rows: AuditRow[] = [];

  for (const release of releases) {
    const showcase = getSceneShowcaseState(release.roles);
    const previewKey = showcase.enabled ? showcase.previewAsset?.storageKey ?? null : null;
    const releaseRoles = asRecord(release.roles);
    const submissionData = asRecord(releaseRoles?.submissionData);
    const submissionTracks = Array.isArray(submissionData?.tracks)
      ? submissionData.tracks.map(asRecord)
      : [];
    const firstTrack = release.track[0] ?? null;
    const firstTrackRoles = firstTrack?.roles ? asRecord(firstTrack.roles) ?? {} : {};
    const submissionTrack = firstTrack
      ? submissionTracks.find((track) => asString(track?.id) === firstTrack.id)
        ?? submissionTracks[Math.max(0, firstTrack.index - 1)]
        ?? null
      : null;
    const trackKeys = firstTrack
      ? buildTrackAudioKeys({
          trackId: firstTrack.id,
          trackRow: { ...firstTrack, ...firstTrackRoles },
          submissionTrack
        })
      : [];
    const matchedTrackKey = trackKeys.find((key) => objectIndex.has(key)) ?? null;
    const previewExists = previewKey ? objectIndex.has(previewKey) : false;

    if (previewExists) {
      rows.push({
        releaseId: release.id,
        releaseTitle: release.title,
        trackId: firstTrack?.id ?? null,
        trackTitle: firstTrack?.title ?? null,
        status: "ok_preview",
        chosenSource: "preview",
        previewKey,
        resolvedTrackKey: trackKeys[0] ?? null,
        matchedKey: previewKey,
        details: "scene showcase preview exists"
      });
      continue;
    }

    if (matchedTrackKey) {
      rows.push({
        releaseId: release.id,
        releaseTitle: release.title,
        trackId: firstTrack?.id ?? null,
        trackTitle: firstTrack?.title ?? null,
        status: previewKey ? "missing_preview" : "ok_track",
        chosenSource: "track",
        previewKey,
        resolvedTrackKey: trackKeys[0] ?? null,
        matchedKey: matchedTrackKey,
        details: previewKey
          ? "preview missing, track fallback exists"
          : "track audio exists"
      });
      continue;
    }

    if (previewKey || trackKeys.length > 0) {
      rows.push({
        releaseId: release.id,
        releaseTitle: release.title,
        trackId: firstTrack?.id ?? null,
        trackTitle: firstTrack?.title ?? null,
        status: previewKey ? "missing_all" : "missing_track",
        chosenSource: "none",
        previewKey,
        resolvedTrackKey: trackKeys[0] ?? null,
        matchedKey: null,
        details: previewKey
          ? "preview key missing and no track candidate exists in storage"
          : "no track candidate exists in storage"
      });
      continue;
    }

    rows.push({
      releaseId: release.id,
      releaseTitle: release.title,
      trackId: firstTrack?.id ?? null,
      trackTitle: firstTrack?.title ?? null,
      status: "no_audio_source",
      chosenSource: "none",
      previewKey,
      resolvedTrackKey: null,
      matchedKey: null,
      details: "release has no preview asset and no track audio source candidates"
    });
  }

  const badRows = rows.filter((row) =>
    row.status === "missing_all" ||
    row.status === "missing_track" ||
    row.status === "no_audio_source"
  );

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  process.stdout.write(`TOTAL_RELEASES=${rows.length}\n`);
  process.stdout.write(`OK_PREVIEW=${counts.ok_preview ?? 0}\n`);
  process.stdout.write(`OK_TRACK=${counts.ok_track ?? 0}\n`);
  process.stdout.write(`MISSING_PREVIEW_FALLBACK_TO_TRACK=${counts.missing_preview ?? 0}\n`);
  process.stdout.write(`MISSING_TRACK=${counts.missing_track ?? 0}\n`);
  process.stdout.write(`MISSING_ALL=${counts.missing_all ?? 0}\n`);
  process.stdout.write(`NO_AUDIO_SOURCE=${counts.no_audio_source ?? 0}\n`);
  process.stdout.write("\nBROKEN_RELEASES\n");
  process.stdout.write([
    "releaseId",
    "releaseTitle",
    "trackId",
    "trackTitle",
    "status",
    "previewKey",
    "resolvedTrackKey",
    "matchedKey",
    "details"
  ].join(",") + "\n");
  for (const row of badRows) {
    process.stdout.write([
      csvEscape(row.releaseId),
      csvEscape(row.releaseTitle),
      csvEscape(row.trackId),
      csvEscape(row.trackTitle),
      csvEscape(row.status),
      csvEscape(row.previewKey),
      csvEscape(row.resolvedTrackKey),
      csvEscape(row.matchedKey),
      csvEscape(row.details)
    ].join(",") + "\n");
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
