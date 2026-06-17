import { HeadBucketCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const BUCKETS = ["uploads", "signatures", "verification", "contracts"] as const;
const PREFIXES = ["uploads/", "previews/", "covers/", "tracks/", "audio/", "audios/"] as const;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".jfif"]);
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".flac"]);

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

type BucketState = "exists" | "access_denied" | "not_found" | "error";

type BucketAudit = {
  bucket: string;
  state: BucketState;
  error?: string;
  totalObjects: number | null;
  imageCount: number | null;
  audioCount: number | null;
  prefixCounts: Record<(typeof PREFIXES)[number], number | null>;
  first20ImageKeys: string[];
  last20ImageKeys: string[];
};

function extnameLower(key: string): string {
  const fileName = key.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function classifyBucketError(error: unknown): { state: BucketState; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error && "name" in error
      ? String((error as { name?: string }).name ?? "")
      : "";
  const combined = `${code} ${message}`;
  if (/accessdenied|forbidden|403/i.test(combined)) return { state: "access_denied", message };
  if (/notfound|nosuchbucket|404/i.test(combined)) return { state: "not_found", message };
  return { state: "error", message };
}

async function checkBucketExists(client: S3Client, bucket: string): Promise<{ state: BucketState; message?: string }> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { state: "exists" };
  } catch (error) {
    const result = classifyBucketError(error);
    return { state: result.state, message: result.message };
  }
}

async function listAllObjects(client: S3Client, bucket: string): Promise<string[]> {
  const keys: string[] = [];
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
      if (item.Key) keys.push(item.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

function countByPrefix(keys: string[], prefix: string): number {
  return keys.filter((key) => key.startsWith(prefix)).length;
}

async function auditBucket(client: S3Client, bucket: string): Promise<BucketAudit> {
  const bucketCheck = await checkBucketExists(client, bucket);
  if (bucketCheck.state !== "exists") {
    return {
      bucket,
      state: bucketCheck.state,
      error: bucketCheck.message,
      totalObjects: null,
      imageCount: null,
      audioCount: null,
      prefixCounts: Object.fromEntries(PREFIXES.map((prefix) => [prefix, null])) as Record<
        (typeof PREFIXES)[number],
        number | null
      >,
      first20ImageKeys: [],
      last20ImageKeys: []
    };
  }

  const keys = await listAllObjects(client, bucket);
  const imageKeys = keys.filter((key) => IMAGE_EXTENSIONS.has(extnameLower(key))).sort((left, right) => left.localeCompare(right));
  const audioCount = keys.filter((key) => AUDIO_EXTENSIONS.has(extnameLower(key))).length;

  return {
    bucket,
    state: "exists",
    totalObjects: keys.length,
    imageCount: imageKeys.length,
    audioCount,
    prefixCounts: Object.fromEntries(
      PREFIXES.map((prefix) => [prefix, countByPrefix(keys, prefix)])
    ) as Record<(typeof PREFIXES)[number], number>,
    first20ImageKeys: imageKeys.slice(0, 20),
    last20ImageKeys: imageKeys.slice(-20)
  };
}

async function main() {
  const client = buildS3Client();
  const audits: BucketAudit[] = [];

  for (const bucket of BUCKETS) {
    audits.push(await auditBucket(client, bucket));
  }

  console.log(JSON.stringify({ buckets: audits }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
