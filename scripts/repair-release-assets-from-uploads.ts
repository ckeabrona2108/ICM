import { createHash } from "node:crypto";

import {
  CopyObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

import {
  createPresignedDownload,
  resolveRenderableStoredFileUrl
} from "@/lib/s3";
import { normalizeReleaseCoverStorageKey } from "@/lib/release-cover";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const CANDIDATE_LIMIT = 12;
const MANUAL_COVER_SOURCE_KEY = getArgValue("--cover-source-key");
const OVERWRITE_COVER = process.argv.includes("--overwrite-cover");
const COVER_ONLY = process.argv.includes("--cover-only");

function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

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

const endpoint = toEndpointUrl(readStringEnv("S3_ENDPOINT", "MINIO_ENDPOINT", "S3_HOST"));
const region = readStringEnv("S3_REGION", "AWS_REGION") ?? "ru";
const configuredBucket = readStringEnv(
  "S3_BUCKET",
  "S3_BUCKET_NAME",
  "MINIO_BUCKET",
  "MINIO_BUCKET_NAME"
);
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

const RELEASE_ID_FILTER = getArgValue("--release-id");
const LIMIT = getArgValue("--limit") ? Number(getArgValue("--limit")) : null;

function buildBucketCandidates(): string[] {
  const candidates = [configuredBucket, "contracts", "uploads", "signatures", "verification"]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

function getClient(): S3Client | null {
  if (!endpoint || !region || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

async function resolveBucketName(client: S3Client | null): Promise<string | null> {
  if (!client) return null;
  for (const bucketName of buildBucketCandidates()) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucketName }));
      return bucketName;
    } catch {
      // try next
    }
  }
  return null;
}

async function headExists(client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

type ListedObject = {
  key: string;
  lastModified: Date | null;
};

let uploadsObjectsCache: Promise<ListedObject[]> | null = null;

async function listObjectsDetailed(client: S3Client, bucket: string, prefix: string): Promise<ListedObject[]> {
  const items: ListedObject[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      })
    );

    for (const item of response.Contents ?? []) {
      if (!item.Key) continue;
      items.push({
        key: item.Key,
        lastModified: item.LastModified ?? null
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return items;
}

async function getAllUploadsObjects(client: S3Client, bucket: string): Promise<ListedObject[]> {
  if (!uploadsObjectsCache) {
    uploadsObjectsCache = listObjectsDetailed(client, bucket, "uploads/");
  }
  return uploadsObjectsCache;
}

async function httpCheck(bucket: string, key: string): Promise<{ status: number; url: string } | null> {
  try {
    const signed = await createPresignedDownload({
      bucket,
      key,
      expiresIn: 600
    });
    const response = await fetch(signed.url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "manual",
      cache: "no-store"
    });
    return { status: response.status, url: signed.url };
  } catch {
    return null;
  }
}

function encodeCopySource(bucket: string, key: string): string {
  return `${bucket}/${encodeURIComponent(key).replace(/%2F/gu, "/")}`;
}

function extractExtensionFromKey(key: string | null): string | null {
  if (!key) return null;
  const fileName = key.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return null;
  return fileName.slice(dotIndex + 1).toLowerCase();
}

function slugifyLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-+/gu, "-");
}

function extractTimestampCandidate(value: string): number | null {
  const baseName = value.split("/").filter(Boolean).at(-1) ?? "";
  const match = baseName.match(/^(\d{10,13})(?:[-_.]|$)/u);
  if (!match?.[1]) return null;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw)) return null;
  return match[1].length === 13 ? raw : raw * 1000;
}

function allowedExtensionForKind(key: string, kind: "cover" | "audio", extensionHint: string | null): boolean {
  const ext = extractExtensionFromKey(key);
  if (!ext) return false;

  if (extensionHint) {
    return ext === extensionHint.trim().replace(/^\./u, "").toLowerCase();
  }

  if (kind === "cover") {
    return ["jpg", "jpeg", "jpe", "jfif", "png", "webp", "jpng"].includes(ext);
  }

  return ["wav", "mp3", "flac", "aac", "m4a", "aiff"].includes(ext);
}

function getDateAnchorDistance(input: {
  candidate: Date | null;
  releaseDate: Date;
  startDate: Date | null;
}): number {
  const { candidate, releaseDate, startDate } = input;
  if (!candidate) return Number.POSITIVE_INFINITY;
  const releaseDistance = Math.abs(candidate.getTime() - releaseDate.getTime());
  const startDistance = startDate ? Math.abs(candidate.getTime() - startDate.getTime()) : Number.POSITIVE_INFINITY;
  return Math.min(releaseDistance, startDistance);
}

function scoreCandidate(params: {
  key: string;
  lastModified: Date | null;
  kind: "cover" | "audio";
  releaseId: string;
  releaseTitle: string;
  trackTitle?: string | null;
  releaseDate: Date;
  startDate: Date | null;
  preferredFolder?: string | null;
}): number {
  const { key, lastModified, kind, releaseId, releaseTitle, trackTitle, releaseDate, startDate, preferredFolder } = params;
  const baseName = key.split("/").filter(Boolean).at(-1) ?? "";
  const slug = slugifyLookup(baseName);
  const folderSlug = slugifyLookup(key.split("/").slice(0, -1).at(-1) ?? "");
  const releaseSlug = slugifyLookup(releaseTitle);
  const trackSlug = trackTitle ? slugifyLookup(trackTitle) : "";

  let score = 0;
  if (kind === "cover") {
    if (slug.includes("release-cover")) score += 120;
    if (slug.includes("cover")) score += 60;
    if (releaseSlug && slug.includes(releaseSlug)) score += 30;
    if (releaseId && slug.includes(releaseId)) score += 20;
  } else {
    if (trackSlug && slug.includes(trackSlug)) score += 100;
    if (releaseSlug && slug.includes(releaseSlug)) score += 25;
    if (releaseId && slug.includes(releaseId)) score += 20;
    if (slug.includes("track")) score += 10;
  }

  if (preferredFolder && folderSlug === slugifyLookup(preferredFolder)) {
    score += 25;
  }

  const timestamp = extractTimestampCandidate(baseName);
  const anchor = getDateAnchorDistance({
    candidate: lastModified,
    releaseDate,
    startDate
  });
  if (timestamp) {
    const timestampDistance = Math.min(
      Math.abs(timestamp - releaseDate.getTime()),
      startDate ? Math.abs(timestamp - startDate.getTime()) : Number.POSITIVE_INFINITY
    );
    score += Math.max(0, 45 - Math.min(45, Math.round(timestampDistance / 86_400_000)));
  } else if (anchor !== Number.POSITIVE_INFINITY) {
    score += Math.max(0, 25 - Math.min(25, Math.round(anchor / 86_400_000)));
  }

  return score;
}

async function findBestSourceKey(params: {
  client: S3Client;
  bucket: string;
  kind: "cover" | "audio";
  userId: string;
  releaseId: string;
  releaseTitle: string;
  releaseDate: Date;
  startDate: Date | null;
  trackTitle?: string | null;
  extensionHint?: string | null;
  preferredFolder?: string | null;
}): Promise<{
  selectedKey: string | null;
  selectedScore: number;
  selectedMargin: number;
  candidates: Array<{ key: string; score: number; lastModified: string | null }>;
}> {
  const objects = await getAllUploadsObjects(params.client, params.bucket);
  if (objects.length === 0) {
    return { selectedKey: null, selectedScore: -1, selectedMargin: 0, candidates: [] };
  }

  const filtered = objects.filter((item) =>
    allowedExtensionForKind(item.key, params.kind, params.extensionHint ?? null)
  );
  if (filtered.length === 0) {
    return { selectedKey: null, selectedScore: -1, selectedMargin: 0, candidates: [] };
  }

  const ranked = filtered
    .map((item) => ({
      key: item.key,
      lastModified: item.lastModified,
      score: scoreCandidate({
        key: item.key,
        lastModified: item.lastModified,
        kind: params.kind,
        releaseId: params.releaseId,
        releaseTitle: params.releaseTitle,
        trackTitle: params.trackTitle ?? null,
        releaseDate: params.releaseDate,
        startDate: params.startDate,
        preferredFolder: params.preferredFolder ?? null
      })
    }))
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));

  const candidates = ranked.slice(0, CANDIDATE_LIMIT).map((item) => ({
    key: item.key,
    score: item.score,
    lastModified: item.lastModified ? item.lastModified.toISOString() : null
  }));

  const top = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const selectedMargin = top && second ? top.score - second.score : top ? top.score : 0;
  return {
    selectedKey: top?.key ?? null,
    selectedScore: top?.score ?? -1,
    selectedMargin,
    candidates
  };
}

function isHighConfidence(kind: "cover" | "audio", score: number, margin: number): boolean {
  if (kind === "cover") return score >= 80 && margin >= 20;
  return score >= 60 && margin >= 15;
}

function candidateFolder(key: string | null): string | null {
  if (!key) return null;
  const parts = key.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts.slice(0, -1).at(-1) ?? null;
}

function buildPreviewTargetKey(releaseId: string, sourceKey: string | null, previewValue: string | null): string | null {
  const sourceExt = extractExtensionFromKey(sourceKey) ?? extractExtensionFromKey(normalizeReleaseCoverStorageKey(previewValue, releaseId));
  if (!sourceExt) return null;
  return `previews/${releaseId}.${sourceExt}`;
}

function buildAudioTargetKey(trackId: string, sourceKey: string | null, extHint: string | null): string | null {
  const sourceExt = extractExtensionFromKey(sourceKey) ?? extHint?.trim().replace(/^\./u, "").toLowerCase() ?? null;
  if (!sourceExt) return null;
  return `tracks/${trackId}.${sourceExt}`;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function buildNextPreviewUrl(targetKey: string): string {
  return resolveRenderableStoredFileUrl({ storageKey: targetKey }) ?? `/api/uploads/object/${targetKey}`;
}

async function copyObject(client: S3Client, bucket: string, sourceKey: string, targetKey: string): Promise<void> {
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: encodeCopySource(bucket, sourceKey),
      Key: targetKey
    })
  );
}

type AssetStatus = "copied" | "skipped" | "missing_source" | "failed" | "would_copy" | "ambiguous" | "would_overwrite";

async function processCoverRelease(params: {
  client: S3Client;
  bucket: string;
  release: {
    id: string;
    title: string;
    date: Date;
    startDate: Date;
    preview: string;
    roles: unknown;
    userId: string;
  };
}): Promise<Record<string, unknown>> {
  const { client, bucket, release } = params;
  const currentPreviewKey = normalizeReleaseCoverStorageKey(release.preview, release.id);
  const currentPreviewExists = currentPreviewKey ? await headExists(client, bucket, currentPreviewKey) : false;

  const coverMatch = await findBestSourceKey({
    client,
    bucket,
    kind: "cover",
    userId: release.userId,
    releaseId: release.id,
    releaseTitle: release.title,
    releaseDate: release.date,
    startDate: release.startDate
  });
  const manualSourceKey = MANUAL_COVER_SOURCE_KEY;
  const manualMode = Boolean(manualSourceKey);
  const manualSourceExists = manualSourceKey ? await headExists(client, bucket, manualSourceKey) : null;
  const sourceKey = manualSourceKey ?? coverMatch.selectedKey;
  const highConfidence = manualMode
    ? true
    : Boolean(sourceKey) && isHighConfidence("cover", coverMatch.selectedScore, coverMatch.selectedMargin);

  const nextPreviewKey = buildPreviewTargetKey(release.id, sourceKey, release.preview);
  const nextPreviewUrl = nextPreviewKey ? buildNextPreviewUrl(nextPreviewKey) : null;
  const targetExists = nextPreviewKey ? await headExists(client, bucket, nextPreviewKey) : false;
  const targetHttp = nextPreviewKey ? await httpCheck(bucket, nextPreviewKey) : null;

  let status: AssetStatus = "failed";
  let dbUpdateApplied = false;
  let copied = false;
  let reason: string | null = null;

  if (!nextPreviewKey || !sourceKey) {
    status = sourceKey ? "ambiguous" : "missing_source";
    reason = !nextPreviewKey ? "target_key_unavailable" : "source_not_found";
  } else if (manualMode && manualSourceExists === false) {
    status = "missing_source";
    reason = `manual_source_missing:${manualSourceKey}`;
  } else if (!highConfidence) {
    status = "ambiguous";
    reason = `low_confidence:${coverMatch.selectedScore}:${coverMatch.selectedMargin}`;
  } else if (targetExists && !OVERWRITE_COVER) {
    if (targetHttp && (targetHttp.status === 200 || targetHttp.status === 206)) {
      status = "skipped";
    } else {
      status = "failed";
      reason = `target_unreachable:${targetHttp?.status ?? "no-http"}`;
    }
  } else if (targetExists && OVERWRITE_COVER && !APPLY) {
    status = "would_overwrite";
  } else if (!APPLY) {
    status = "would_copy";
  } else {
    try {
      await copyObject(client, bucket, sourceKey, nextPreviewKey);
      const headOk = await headExists(client, bucket, nextPreviewKey);
      const verification = await httpCheck(bucket, nextPreviewKey);
      if (headOk && verification && (verification.status === 200 || verification.status === 206)) {
        status = "copied";
        copied = true;
        if (nextPreviewUrl && release.preview !== nextPreviewUrl) {
          await prisma.release.update({
            where: { id: release.id },
            data: { preview: nextPreviewUrl }
          });
          dbUpdateApplied = true;
        }
      } else {
        status = "failed";
        reason = `verification_failed:${verification?.status ?? "no-http"}`;
      }
    } catch (error) {
      status = "failed";
      reason = error instanceof Error ? error.message : String(error);
    }
  }

  if (status === "skipped" && nextPreviewUrl && release.preview !== nextPreviewUrl && APPLY) {
    await prisma.release.update({
      where: { id: release.id },
      data: { preview: nextPreviewUrl }
    });
    dbUpdateApplied = true;
  }

  return {
    releaseId: release.id,
    title: release.title,
    oldPreview: release.preview,
    oldPreviewKey: currentPreviewKey,
    oldPreviewExists: currentPreviewExists,
    sourceKey,
    newPreviewKey: nextPreviewKey,
    newPreviewUrl: nextPreviewUrl,
    selectedScore: coverMatch.selectedScore,
    selectedMargin: coverMatch.selectedMargin,
    highConfidence,
    manualMode,
    manualSourceKey,
    manualSourceExists,
    candidates: coverMatch.candidates,
    preferredFolder: candidateFolder(sourceKey),
    targetExists,
    targetHttpStatus: targetHttp?.status ?? null,
    status,
    copied,
    dbUpdateApplied,
    reason
  };
}

async function processAudioTrack(params: {
  client: S3Client;
  bucket: string;
  release: {
    id: string;
    title: string;
    date: Date;
    startDate: Date;
    userId: string;
  };
  preferredFolder?: string | null;
  track: {
    id: string;
    title: string;
    track: string;
    index: number;
  };
}): Promise<Record<string, unknown>> {
  const { client, bucket, release, track } = params;
  const extHint = asString(track.track);

  const audioMatch = await findBestSourceKey({
    client,
    bucket,
    kind: "audio",
    userId: release.userId,
    releaseId: release.id,
    releaseTitle: release.title,
    trackTitle: track.title,
    releaseDate: release.date,
    startDate: release.startDate,
    extensionHint: extHint,
    preferredFolder: params.preferredFolder ?? null
  });
  const sourceKey = audioMatch.selectedKey;
  const highConfidence = Boolean(sourceKey) && isHighConfidence("audio", audioMatch.selectedScore, audioMatch.selectedMargin);

  const targetKey = buildAudioTargetKey(track.id, sourceKey, extHint);
  const targetExists = targetKey ? await headExists(client, bucket, targetKey) : false;
  const targetHttp = targetKey ? await httpCheck(bucket, targetKey) : null;

  let status: AssetStatus = "failed";
  let copied = false;
  let reason: string | null = null;

  if (!targetKey || !sourceKey) {
    status = sourceKey ? "ambiguous" : "missing_source";
    reason = !targetKey ? "target_key_unavailable" : "source_not_found";
  } else if (!highConfidence) {
    status = "ambiguous";
    reason = `low_confidence:${audioMatch.selectedScore}:${audioMatch.selectedMargin}`;
  } else if (targetExists && !OVERWRITE_COVER) {
    if (targetHttp && (targetHttp.status === 200 || targetHttp.status === 206)) {
      status = "skipped";
    } else {
      status = "failed";
      reason = `target_unreachable:${targetHttp?.status ?? "no-http"}`;
    }
  } else if (targetExists && OVERWRITE_COVER && !APPLY) {
    status = "would_overwrite";
  } else if (!APPLY) {
    status = "would_copy";
  } else {
    try {
      await copyObject(client, bucket, sourceKey, targetKey);
      const headOk = await headExists(client, bucket, targetKey);
      const verification = await httpCheck(bucket, targetKey);
      if (headOk && verification && (verification.status === 200 || verification.status === 206)) {
        status = "copied";
        copied = true;
      } else {
        status = "failed";
        reason = `verification_failed:${verification?.status ?? "no-http"}`;
      }
    } catch (error) {
      status = "failed";
      reason = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    trackId: track.id,
    trackTitle: track.title,
    trackExt: extHint,
    sourceKey,
    targetKey,
    selectedScore: audioMatch.selectedScore,
    selectedMargin: audioMatch.selectedMargin,
    highConfidence,
    candidates: audioMatch.candidates,
    targetExists,
    targetHttpStatus: targetHttp?.status ?? null,
    status,
    copied,
    reason
  };
}

async function main() {
  const client = getClient();
  if (!client) {
    throw new Error("S3/MinIO is not configured. Check S3_HOST, S3_ACCESS_KEY and S3_SECRET_KEY.");
  }

  const bucket = await resolveBucketName(client);
  if (!bucket) {
    throw new Error("Could not resolve S3 bucket.");
  }

  const releases = await prisma.release.findMany({
    select: {
      id: true,
      title: true,
      date: true,
      startDate: true,
      preview: true,
      roles: true,
      userId: true,
      track: {
        orderBy: { index: "asc" },
        select: {
          id: true,
          title: true,
          track: true,
          index: true
        }
      }
    },
    orderBy: { date: "desc" }
  });

  const filteredReleases = RELEASE_ID_FILTER
    ? releases.filter((release) => release.id === RELEASE_ID_FILTER)
    : releases;
  const limitedReleases = typeof LIMIT === "number" && Number.isFinite(LIMIT)
    ? filteredReleases.slice(0, Math.max(0, LIMIT))
    : filteredReleases;

  const rows: Array<Record<string, unknown>> = [];
  let copied = 0;
  let skipped = 0;
  let missingSource = 0;
  let failed = 0;
  let wouldCopy = 0;

  for (const release of limitedReleases) {
    const cover = await processCoverRelease({
      client,
      bucket,
      release: {
        id: release.id,
        title: release.title,
        date: release.date,
        startDate: release.startDate,
        preview: release.preview,
        roles: release.roles,
        userId: release.userId
      }
    });

    if (cover.status === "copied") copied += 1;
    else if (cover.status === "skipped") skipped += 1;
    else if (cover.status === "missing_source") missingSource += 1;
    else if (cover.status === "failed") failed += 1;
    else if (cover.status === "would_copy") wouldCopy += 1;

    const audio = [];
    if (!COVER_ONLY) {
      for (const track of release.track) {
        const trackReport = await processAudioTrack({
          client,
          bucket,
          release: {
            id: release.id,
            title: release.title,
            date: release.date,
            startDate: release.startDate,
            userId: release.userId
          },
          preferredFolder: candidateFolder(asString(cover.sourceKey)),
          track
        });
        audio.push(trackReport);

        if (trackReport.status === "copied") copied += 1;
        else if (trackReport.status === "skipped") skipped += 1;
        else if (trackReport.status === "missing_source") missingSource += 1;
        else if (trackReport.status === "failed") failed += 1;
        else if (trackReport.status === "would_copy") wouldCopy += 1;
      }
    }

    rows.push({
      releaseId: release.id,
      title: release.title,
      oldPreview: cover.oldPreview,
      oldPreviewKey: cover.oldPreviewKey,
      cover,
      audio
    });
  }

  const summary = {
    apply: APPLY,
    bucket,
    releaseCount: limitedReleases.length,
    copied,
    skippedAlreadyExists: skipped,
    missingSource,
    failed,
    wouldCopy,
    overwriteCover: OVERWRITE_COVER,
    coverOnly: COVER_ONLY,
    total: copied + skipped + missingSource + failed + wouldCopy,
    signature: createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 12),
    rows
  };

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
