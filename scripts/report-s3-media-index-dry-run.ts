import {
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import path from "node:path";

const TARGET_PREFIXES = [
  "previews/",
  "uploads/",
  "covers/",
  "contracts/previews/",
  "contracts/uploads/",
  "contracts/covers/",
  "tracks/",
  "contracts/tracks/"
] as const;

const COVER_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "jpe", "jfif", "avif"]);
const AUDIO_EXTENSIONS = new Set(["wav", "mp3", "flac", "aac", "m4a", "aiff", "ogg", "oga", "opus"]);
const BUCKET_CANDIDATES = ["contracts", "uploads", "signatures", "verification", "storage"] as const;

type IndexedObject = {
  bucket: string;
  key: string;
  size: number | null;
  lastModified: string | null;
  prefix: (typeof TARGET_PREFIXES)[number];
  kind: "cover-like" | "audio-like" | "other";
  basename: string;
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

async function loadDotEnvFile(filePath: string): Promise<void> {
  try {
    const content = await readFile(filePath, "utf8");
    for (const line of content.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex < 0) continue;
      const key = trimmed.slice(0, equalsIndex).trim();
      if (!key || process.env[key] != null) continue;
      let value = trimmed.slice(equalsIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // ignore missing env files
  }
}

async function loadEnvironment(): Promise<void> {
  const cwd = process.cwd();
  await loadDotEnvFile(path.join(cwd, ".env"));
  await loadDotEnvFile(path.join(cwd, ".env.local"));
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

async function bucketExists(client: S3Client, bucket: string): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/accessdenied|forbidden|403/i.test(message)) return true;
    return false;
  }
}

function getBucketCandidates(): string[] {
  const configuredBucket = readStringEnv(
    "S3_BUCKET",
    "S3_BUCKET_NAME",
    "MINIO_BUCKET",
    "MINIO_BUCKET_NAME"
  );
  return Array.from(
    new Set([configuredBucket, ...BUCKET_CANDIDATES].map((value) => (value ?? "").trim()).filter(Boolean))
  );
}

function getExtension(key: string): string {
  const fileName = key.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) return "";
  return fileName.slice(dotIndex + 1).toLowerCase();
}

function getBaseName(key: string): string {
  const fileName = key.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) return fileName;
  return fileName.slice(0, dotIndex);
}

function classifyKey(key: string): "cover-like" | "audio-like" | "other" {
  const extension = getExtension(key);
  if (COVER_EXTENSIONS.has(extension)) return "cover-like";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio-like";
  return "other";
}

function matchPrefix(key: string): (typeof TARGET_PREFIXES)[number] | null {
  for (const prefix of TARGET_PREFIXES) {
    if (key.startsWith(prefix)) return prefix;
  }
  return null;
}

async function listPrefixObjects(
  client: S3Client,
  bucket: string,
  prefix: string
): Promise<Array<{ key: string; size: number | null; lastModified: string | null }>> {
  const rows: Array<{ key: string; size: number | null; lastModified: string | null }> = [];
  let continuationToken: string | undefined;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      })
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
  await loadEnvironment();
  const client = buildS3Client();
  const buckets = getBucketCandidates();
  const existingBuckets: string[] = [];

  for (const bucket of buckets) {
    if (await bucketExists(client, bucket)) {
      existingBuckets.push(bucket);
    }
  }

  const indexedByKey = new Map<string, IndexedObject>();

  for (const bucket of existingBuckets) {
    for (const prefix of TARGET_PREFIXES) {
      const objects = await listPrefixObjects(client, bucket, prefix);
      for (const object of objects) {
        const matchedPrefix = matchPrefix(object.key);
        if (!matchedPrefix) continue;
        const indexedObject: IndexedObject = {
          bucket,
          key: object.key,
          size: object.size,
          lastModified: object.lastModified,
          prefix: matchedPrefix,
          kind: classifyKey(object.key),
          basename: getBaseName(object.key)
        };
        indexedByKey.set(`${bucket}::${object.key}`, indexedObject);
      }
    }
  }

  const indexedObjects = Array.from(indexedByKey.values()).sort((left, right) => {
    if (left.bucket !== right.bucket) return left.bucket.localeCompare(right.bucket);
    return left.key.localeCompare(right.key);
  });

  const prefixDistribution = TARGET_PREFIXES.reduce<Record<string, number>>((accumulator, prefix) => {
    accumulator[prefix] = 0;
    return accumulator;
  }, {});

  const basenameGroups = new Map<string, IndexedObject[]>();
  let coverLikeCount = 0;
  let audioLikeCount = 0;

  for (const object of indexedObjects) {
    prefixDistribution[object.prefix] += 1;
    if (object.kind === "cover-like") coverLikeCount += 1;
    if (object.kind === "audio-like") audioLikeCount += 1;
    const group = basenameGroups.get(object.basename) ?? [];
    group.push(object);
    basenameGroups.set(object.basename, group);
  }

  const duplicateBasenames = Array.from(basenameGroups.entries())
    .filter(([, objects]) => objects.length > 1)
    .map(([basename, objects]) => ({
      basename,
      count: objects.length,
      keys: objects.map((object) => `${object.bucket}/${object.key}`).sort()
    }))
    .sort((left, right) => right.count - left.count || left.basename.localeCompare(right.basename));

  const output = {
    dryRun: true,
    bucketsScanned: buckets,
    bucketsExisting: existingBuckets,
    summary: {
      totalIndexed: indexedObjects.length,
      coverLikeCount,
      audioLikeCount,
      prefixDistribution,
      duplicateBasenameCount: duplicateBasenames.length
    },
    first20Keys: indexedObjects.slice(0, 20).map((object) => ({
      bucket: object.bucket,
      key: object.key,
      size: object.size,
      lastModified: object.lastModified,
      prefix: object.prefix,
      kind: object.kind
    })),
    duplicateBasenames
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
