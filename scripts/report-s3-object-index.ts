import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";

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

function getBucketCandidates(): string[] {
  const configuredBucket = readStringEnv(
    "S3_BUCKET",
    "S3_BUCKET_NAME",
    "MINIO_BUCKET",
    "MINIO_BUCKET_NAME"
  );
  const candidates = [configuredBucket, "uploads", "signatures", "verification", "contracts"]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (!/[",\n\r]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function extnameLower(key: string): string {
  const fileName = key.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

function classifyKind(ext: string): "image" | "audio" | "other" {
  const imageExts = new Set(["jpg", "jpeg", "jpe", "jfif", "png", "webp", "gif", "jpng", "avif"]);
  const audioExts = new Set(["wav", "mp3", "flac", "aac", "m4a", "aiff"]);
  if (imageExts.has(ext)) return "image";
  if (audioExts.has(ext)) return "audio";
  return "other";
}

function folderName(key: string): string {
  const parts = key.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function fileName(key: string): string {
  return key.split("/").filter(Boolean).at(-1) ?? "";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`timeout_after_${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function bucketExists(client: S3Client, bucket: string): Promise<boolean> {
  try {
    await withTimeout(client.send(new HeadBucketCommand({ Bucket: bucket })), 3000);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/accessdenied|forbidden|403/i.test(message)) return true;
    return false;
  }
}

async function listBucketObjects(client: S3Client, bucket: string): Promise<Array<{ key: string; size: number | null; lastModified: string | null }>> {
  const rows: Array<{ key: string; size: number | null; lastModified: string | null }> = [];
  let continuationToken: string | undefined;
  do {
    const response = await withTimeout(
      client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          MaxKeys: 1000
        })
      ),
      3000
    );

    for (const item of response.Contents ?? []) {
      if (!item.Key) continue;
      rows.push({
        key: item.Key,
        size: typeof item.Size === "number" ? item.Size : null,
        lastModified: item.LastModified ? item.LastModified.toISOString() : null
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return rows;
}

async function main() {
  const client = buildS3Client();
  const outputPath = "/tmp/s3-object-index.csv";
  await mkdir(path.dirname(outputPath), { recursive: true });
  const stream = createWriteStream(outputPath, { encoding: "utf8" });

  const summary = {
    bucketsScanned: 0,
    bucketsExisting: 0,
    totalObjects: 0,
    imageCount: 0,
    audioCount: 0,
    releaseCoverCount: 0,
    previewsCount: 0,
    uploadsCount: 0,
    tracksCount: 0,
    otherCount: 0
  };

  stream.write([
    "bucket",
    "key",
    "size",
    "lastModified",
    "ext",
    "kind",
    "folder",
    "filename"
  ].join(",") + "\n");

  const buckets = getBucketCandidates();
  summary.bucketsScanned = buckets.length;

  for (const bucket of buckets) {
    process.stderr.write(`bucket ${bucket}: checking\n`);
    const exists = await bucketExists(client, bucket);
    if (!exists) {
      process.stderr.write(`bucket ${bucket}: skipped (missing or inaccessible)\n`);
      continue;
    }
    summary.bucketsExisting += 1;

    let bucketObjects = 0;
    const rows = await listBucketObjects(client, bucket);
    for (const row of rows) {
      const ext = extnameLower(row.key);
      const kind = classifyKind(ext);
      const folder = folderName(row.key);
      const filename = fileName(row.key);

      bucketObjects += 1;
      summary.totalObjects += 1;
      if (kind === "image") summary.imageCount += 1;
      else if (kind === "audio") summary.audioCount += 1;
      else summary.otherCount += 1;
      if (/release-cover/iu.test(row.key)) summary.releaseCoverCount += 1;
      if (row.key.startsWith("previews/")) summary.previewsCount += 1;
      if (row.key.startsWith("uploads/")) summary.uploadsCount += 1;
      if (row.key.startsWith("tracks/")) summary.tracksCount += 1;

      stream.write(
        [
          csvEscape(bucket),
          csvEscape(row.key),
          csvEscape(row.size),
          csvEscape(row.lastModified),
          csvEscape(ext),
          csvEscape(kind),
          csvEscape(folder),
          csvEscape(filename)
        ].join(",") + "\n"
      );
    }

    process.stderr.write(`bucket ${bucket}: indexed ${bucketObjects} objects\n`);
  }

  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });

  process.stderr.write(
    [
      `summary output=${outputPath}`,
      `bucketsScanned=${summary.bucketsScanned}`,
      `bucketsExisting=${summary.bucketsExisting}`,
      `totalObjects=${summary.totalObjects}`,
      `image=${summary.imageCount}`,
      `audio=${summary.audioCount}`,
      `release-cover=${summary.releaseCoverCount}`,
      `previews=${summary.previewsCount}`,
      `uploads=${summary.uploadsCount}`,
      `tracks=${summary.tracksCount}`,
      `other=${summary.otherCount}`
    ].join(" ") + "\n"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
