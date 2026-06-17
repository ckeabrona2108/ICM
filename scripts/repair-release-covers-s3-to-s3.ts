import { createHash } from "node:crypto";

import {
  CopyObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

import { createPresignedDownload, resolveRenderableStoredFileUrl } from "@/lib/s3";
import { normalizeReleaseCoverStorageKey } from "@/lib/release-cover";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const RELEASE_ID_FILTER = getArgValue("--release-id");
const LIMIT = getArgValue("--limit") ? Number(getArgValue("--limit")) : null;

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "jfif"]);
const AUDIO_EXTENSIONS = new Set(["wav", "mp3", "flac", "aac", "m4a", "aiff", "ogg", "opus"]);
const MAX_CANDIDATES = 8;

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

function encodePathSegments(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function stripBucketPrefix(key: string, bucket: string): string {
  const prefix = `${bucket}/`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function normalizeKey(rawValue: string | null | undefined): string | null {
  const raw = (rawValue ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/api/uploads/object/")) {
    return decodeURIComponent(raw.replace(/^\/api\/uploads\/object\/+/u, "").split("?")[0] ?? "");
  }
  if (raw.startsWith("api/uploads/object/")) {
    return decodeURIComponent(raw.replace(/^api\/uploads\/object\/+/u, "").split("?")[0] ?? "");
  }
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      return parsed.pathname.replace(/^\/+/u, "") || null;
    } catch {
      return null;
    }
  }
  return raw.replace(/^\/+/u, "") || null;
}

function getFileExt(key: string | null): string | null {
  if (!key) return null;
  const fileName = key.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return null;
  return fileName.slice(dotIndex + 1).toLowerCase();
}

function folderIdFromKey(key: string): string | null {
  const parts = key.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts[1] ?? null;
}

function baseName(key: string): string {
  return key.split("/").filter(Boolean).at(-1) ?? "";
}

function slugify(value: string): string {
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
  const match = value.match(/^(\d{10,13})(?:[-_.]|$)/u);
  if (!match?.[1]) return null;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw)) return null;
  return match[1].length === 13 ? raw : raw * 1000;
}

function humanSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function buildS3Client(): S3Client {
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
    throw new Error("S3 credentials are missing. Check S3_HOST, S3_ACCESS_KEY and S3_SECRET_KEY.");
  }

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  });
}

async function resolveBucket(client: S3Client): Promise<string> {
  const candidates = [
    readStringEnv("S3_BUCKET", "S3_BUCKET_NAME", "MINIO_BUCKET", "MINIO_BUCKET_NAME"),
    "contracts",
    "uploads",
    "signatures",
    "verification"
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());

  for (const bucket of Array.from(new Set(candidates))) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return bucket;
    } catch {
      // try next
    }
  }

  throw new Error("Could not resolve S3 bucket.");
}

type S3ObjectItem = {
  key: string;
  normalizedKey: string;
  size: number | null;
  lastModified: string;
  ext: string | null;
  folderId: string | null;
};

async function listAllObjects(client: S3Client, bucket: string): Promise<S3ObjectItem[]> {
  const items: S3ObjectItem[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      })
    );
    for (const item of response.Contents ?? []) {
      if (!item.Key) continue;
      const normalizedKey = stripBucketPrefix(item.Key, bucket);
      items.push({
        key: item.Key,
        normalizedKey,
        size: item.Size ?? null,
        lastModified: item.LastModified ? new Date(item.LastModified).toISOString() : "",
        ext: getFileExt(normalizedKey),
        folderId: folderIdFromKey(normalizedKey)
      });
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return items;
}

function toAudioExt(ext: string | null): ext is string {
  return Boolean(ext && AUDIO_EXTENSIONS.has(ext));
}

function toImageExt(ext: string | null): ext is string {
  return Boolean(ext && IMAGE_EXTENSIONS.has(ext));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function collectSignals(release: {
  id: string;
  title: string;
  upc: string | null;
  date: Date;
  startDate: Date;
  performer: string | null;
  userName: string | null;
  track: Array<{ id: string; title: string; track: string }>;
}) {
  const titles = [
    release.title,
    release.performer ?? "",
    release.userName ?? "",
    release.upc ?? ""
  ]
    .map(slugify)
    .filter(Boolean);
  const trackTitles = release.track.map((track) => slugify(track.title)).filter(Boolean);
  return {
    titles,
    trackTitles,
    releaseDate: release.date,
    startDate: release.startDate
  };
}

function scoreAudioCandidate(candidate: S3ObjectItem, signals: ReturnType<typeof collectSignals>, trackIds: string[]): number {
  if (!toAudioExt(candidate.ext)) return -Infinity;
  const slug = slugify(baseName(candidate.normalizedKey));
  const folderSlug = slugify(candidate.folderId ?? "");
  let score = 0;

  for (const title of signals.titles) {
    if (title && slug.includes(title)) score += 30;
    if (title && candidate.normalizedKey.toLowerCase().includes(title)) score += 15;
  }
  for (const trackTitle of signals.trackTitles) {
    if (trackTitle && slug.includes(trackTitle)) score += 50;
  }
  for (const trackId of trackIds) {
    if (slug.includes(slugify(trackId))) score += 120;
    if (candidate.normalizedKey.includes(trackId)) score += 80;
  }

  if (folderSlug) score += 5;

  const timestamp = extractTimestampCandidate(baseName(candidate.normalizedKey));
  const anchor = signals.startDate.getTime();
  const releaseAnchor = signals.releaseDate.getTime();
  const proximity = timestamp
    ? Math.min(Math.abs(timestamp - anchor), Math.abs(timestamp - releaseAnchor))
    : candidate.lastModified
      ? Math.min(
          Math.abs(new Date(candidate.lastModified).getTime() - anchor),
          Math.abs(new Date(candidate.lastModified).getTime() - releaseAnchor)
        )
      : Number.POSITIVE_INFINITY;

  if (proximity !== Number.POSITIVE_INFINITY) {
    score += Math.max(0, 40 - Math.min(40, Math.round(proximity / 86_400_000)));
  }

  return score;
}

function scoreCoverCandidate(candidate: S3ObjectItem, signals: ReturnType<typeof collectSignals>, audioFolderId: string): number {
  if (!toImageExt(candidate.ext)) return -Infinity;
  const slug = slugify(baseName(candidate.normalizedKey));
  let score = 0;

  if (slug.includes("release-cover")) score += 120;
  if (slug.includes("cover")) score += 30;
  if (audioFolderId && candidate.folderId === audioFolderId) score += 80;

  for (const title of signals.titles) {
    if (title && slug.includes(title)) score += 20;
  }

  const timestamp = extractTimestampCandidate(baseName(candidate.normalizedKey));
  const proximity = timestamp
    ? Math.min(
        Math.abs(timestamp - signals.releaseDate.getTime()),
        Math.abs(timestamp - signals.startDate.getTime())
      )
    : candidate.lastModified
      ? Math.min(
          Math.abs(new Date(candidate.lastModified).getTime() - signals.releaseDate.getTime()),
          Math.abs(new Date(candidate.lastModified).getTime() - signals.startDate.getTime())
        )
      : Number.POSITIVE_INFINITY;

  if (proximity !== Number.POSITIVE_INFINITY) {
    score += Math.max(0, 30 - Math.min(30, Math.round(proximity / 86_400_000)));
  }

  return score;
}

async function httpCheck(bucket: string, key: string): Promise<{ status: number; url: string } | null> {
  try {
    const signed = await createPresignedDownload({ bucket, key, expiresIn: 600 });
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

async function copyObject(client: S3Client, bucket: string, sourceKey: string, targetKey: string): Promise<void> {
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${encodePathSegments(sourceKey).replace(/%2F/gu, "/")}`,
      Key: targetKey
    })
  );
}

function buildPreviewUrl(key: string): string {
  return resolveRenderableStoredFileUrl({ storageKey: key }) ?? `/api/uploads/object/${encodePathSegments(key)}`;
}

async function main() {
  const client = buildS3Client();
  const bucket = await resolveBucket(client);
  const objects = await listAllObjects(client, bucket);

  const releases = await prisma.release.findMany({
    select: {
      id: true,
      title: true,
      preview: true,
      date: true,
      startDate: true,
      upc: true,
      performer: true,
      user: {
        select: {
          name: true
        }
      },
      track: {
        orderBy: { index: "asc" },
        select: {
          id: true,
          title: true,
          track: true
        }
      }
    },
    orderBy: { date: "asc" }
  });

  const filtered = RELEASE_ID_FILTER ? releases.filter((release) => release.id === RELEASE_ID_FILTER) : releases;
  const limited = typeof LIMIT === "number" && Number.isFinite(LIMIT)
    ? filtered.slice(0, Math.max(0, LIMIT))
    : filtered;

  const reportRows: Array<Record<string, unknown>> = [];
  const summary = {
    autoMatched: 0,
    ambiguous: 0,
    missing: 0,
    failed: 0
  };

  for (const release of limited) {
    const previewKey = normalizeKey(release.preview);
    const previewTargetKey = previewKey ? stripBucketPrefix(previewKey, bucket) : null;
    const previewExists = previewTargetKey ? objects.some((item) => item.normalizedKey === previewTargetKey) : false;
    if (previewExists) continue;

    const signals = collectSignals({
      id: release.id,
      title: release.title,
      upc: asString(release.upc),
      date: release.date,
      startDate: release.startDate,
      performer: asString(release.performer),
      userName: asString(release.user?.name),
      track: release.track.map((track) => ({
        id: track.id,
        title: track.title,
        track: track.track
      }))
    });

    const trackIds = release.track.map((track) => track.id);
    const audioCandidates = objects
      .filter((item) => toAudioExt(item.ext))
      .map((item) => ({
        item,
        score: scoreAudioCandidate(item, signals, trackIds)
      }))
      .sort((left, right) => right.score - left.score || left.item.normalizedKey.localeCompare(right.item.normalizedKey));

    const topAudio = audioCandidates[0] ?? null;
    const secondAudio = audioCandidates[1] ?? null;
    const audioMargin = topAudio && secondAudio ? topAudio.score - secondAudio.score : topAudio?.score ?? 0;
    const audioHighConfidence = Boolean(topAudio) && topAudio.score >= 120 && audioMargin >= 20;

    if (!topAudio || !audioHighConfidence) {
      summary.missing += 1;
      reportRows.push({
        releaseId: release.id,
        title: release.title,
        status: "missing_audio",
        preview: release.preview,
        audioCandidates: audioCandidates.slice(0, MAX_CANDIDATES).map((candidate) => ({
          key: candidate.item.normalizedKey,
          score: candidate.score,
          folderId: candidate.item.folderId,
          lastModified: candidate.item.lastModified,
          size: candidate.item.size
        }))
      });
      continue;
    }

    const audioFolderId = topAudio.item.folderId;
    if (!audioFolderId) {
      summary.missing += 1;
      reportRows.push({
        releaseId: release.id,
        title: release.title,
        status: "missing_audio_folder",
        preview: release.preview,
        selectedAudio: {
          key: topAudio.item.normalizedKey,
          score: topAudio.score,
          folderId: topAudio.item.folderId,
          lastModified: topAudio.item.lastModified,
          size: topAudio.item.size
        }
      });
      continue;
    }

    const coverCandidates = objects
      .filter((item) => item.folderId === audioFolderId && toImageExt(item.ext))
      .filter((item) => baseName(item.normalizedKey).toLowerCase().includes("release-cover"))
      .map((item) => ({
        item,
        score: scoreCoverCandidate(item, signals, audioFolderId)
      }))
      .sort((left, right) => right.score - left.score || left.item.normalizedKey.localeCompare(right.item.normalizedKey));

    const topCover = coverCandidates[0] ?? null;
    const secondCover = coverCandidates[1] ?? null;
    const coverMargin = topCover && secondCover ? topCover.score - secondCover.score : topCover?.score ?? 0;

    if (!topCover) {
      summary.missing += 1;
      reportRows.push({
        releaseId: release.id,
        title: release.title,
        status: "missing_cover",
        audioFolderId,
        selectedAudio: {
          key: topAudio.item.normalizedKey,
          score: topAudio.score,
          folderId: topAudio.item.folderId,
          lastModified: topAudio.item.lastModified,
          size: topAudio.item.size
        }
      });
      continue;
    }

    if (coverCandidates.length > 1 && coverMargin <= 10) {
      summary.ambiguous += 1;
      reportRows.push({
        releaseId: release.id,
        title: release.title,
        status: "ambiguous",
        audioFolderId,
        selectedAudio: {
          key: topAudio.item.normalizedKey,
          score: topAudio.score,
          folderId: topAudio.item.folderId,
          lastModified: topAudio.item.lastModified,
          size: topAudio.item.size
        },
        coverCandidates: coverCandidates.slice(0, MAX_CANDIDATES).map((candidate) => ({
          key: candidate.item.normalizedKey,
          score: candidate.score,
          folderId: candidate.item.folderId,
          lastModified: candidate.item.lastModified,
          size: candidate.item.size,
          previewUrl: buildPreviewUrl(candidate.item.normalizedKey)
        }))
      });
      continue;
    }

    const targetKey = `previews/${release.id}.${topCover.item.ext}`;
    const targetExists = objects.some((item) => item.normalizedKey === targetKey);
    const targetHttpBefore = targetExists ? await httpCheck(bucket, targetKey) : null;

    if (!APPLY) {
      summary.autoMatched += 1;
      reportRows.push({
        releaseId: release.id,
        title: release.title,
        status: "autoMatched",
        audioFolderId,
        selectedAudio: {
          key: topAudio.item.normalizedKey,
          score: topAudio.score,
          folderId: topAudio.item.folderId,
          lastModified: topAudio.item.lastModified,
          size: topAudio.item.size
        },
        selectedCover: {
          key: topCover.item.normalizedKey,
          score: topCover.score,
          folderId: topCover.item.folderId,
          lastModified: topCover.item.lastModified,
          size: topCover.item.size,
          previewUrl: buildPreviewUrl(topCover.item.normalizedKey)
        },
        targetKey,
        targetExists,
        targetHttpBefore: targetHttpBefore?.status ?? null
      });
      continue;
    }

    try {
      await copyObject(client, bucket, topCover.item.normalizedKey, targetKey);
      const headOk = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: targetKey })).then(() => true).catch(() => false);
      const httpAfter = await httpCheck(bucket, targetKey);
      if (!headOk || !httpAfter || (httpAfter.status !== 200 && httpAfter.status !== 206)) {
        summary.failed += 1;
        reportRows.push({
          releaseId: release.id,
          title: release.title,
          status: "failed",
          audioFolderId,
          selectedAudio: {
            key: topAudio.item.normalizedKey,
            score: topAudio.score,
            folderId: topAudio.item.folderId,
            lastModified: topAudio.item.lastModified,
            size: topAudio.item.size
          },
          selectedCover: {
            key: topCover.item.normalizedKey,
            score: topCover.score,
            folderId: topCover.item.folderId,
            lastModified: topCover.item.lastModified,
            size: topCover.item.size,
            previewUrl: buildPreviewUrl(topCover.item.normalizedKey)
          },
          targetKey,
          targetExists,
          targetHttpBefore: targetHttpBefore?.status ?? null,
          targetHttpAfter: httpAfter?.status ?? null
        });
        continue;
      }

      await prisma.release.update({
        where: { id: release.id },
        data: {
          preview: buildPreviewUrl(targetKey)
        }
      });

      summary.autoMatched += 1;
      reportRows.push({
        releaseId: release.id,
        title: release.title,
        status: "copied",
        audioFolderId,
        selectedAudio: {
          key: topAudio.item.normalizedKey,
          score: topAudio.score,
          folderId: topAudio.item.folderId,
          lastModified: topAudio.item.lastModified,
          size: topAudio.item.size
        },
        selectedCover: {
          key: topCover.item.normalizedKey,
          score: topCover.score,
          folderId: topCover.item.folderId,
          lastModified: topCover.item.lastModified,
          size: topCover.item.size,
          previewUrl: buildPreviewUrl(topCover.item.normalizedKey)
        },
        targetKey,
        targetExists,
        targetHttpBefore: targetHttpBefore?.status ?? null,
        targetHttpAfter: httpAfter.status
      });
    } catch (error) {
      summary.failed += 1;
      reportRows.push({
        releaseId: release.id,
        title: release.title,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        audioFolderId,
        selectedAudio: {
          key: topAudio.item.normalizedKey,
          score: topAudio.score,
          folderId: topAudio.item.folderId,
          lastModified: topAudio.item.lastModified,
          size: topAudio.item.size
        },
        selectedCover: {
          key: topCover.item.normalizedKey,
          score: topCover.score,
          folderId: topCover.item.folderId,
          lastModified: topCover.item.lastModified,
          size: topCover.item.size,
          previewUrl: buildPreviewUrl(topCover.item.normalizedKey)
        },
        targetKey,
        targetExists
      });
    }
  }

  const output = {
    apply: APPLY,
    bucket,
    releaseCount: limited.length,
    autoMatched: summary.autoMatched,
    ambiguous: summary.ambiguous,
    missing: summary.missing,
    failed: summary.failed,
    signature: createHash("sha256").update(JSON.stringify(reportRows)).digest("hex").slice(0, 12),
    rows: reportRows
  };

  console.log(JSON.stringify(output, null, 2));
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
