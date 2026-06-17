import { createHash } from "node:crypto";

import {
  CopyObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";

import { createPresignedDownload } from "@/lib/s3";

const APPLY = process.argv.includes("--apply");

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
  if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) {
    return rawValue;
  }
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

function buildBucketCandidates(): string[] {
  const candidates = [configuredBucket, "contracts", "uploads", "signatures", "verification", "contracts"]
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

async function listObjects(client: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
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
      if (item.Key) keys.push(item.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function headExists(client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
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

function copyTargetKey(sourceKey: string): string | null {
  if (!sourceKey.startsWith("uploads/")) return null;
  return `previews/${sourceKey.slice("uploads/".length)}`;
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

  const sourceKeys = await listObjects(client, bucket, "uploads/");
  const report: Array<Record<string, unknown>> = [];
  let copied = 0;
  let skipped = 0;
  let missingSource = 0;
  let failed = 0;

  for (const sourceKey of sourceKeys) {
    const destKey = copyTargetKey(sourceKey);
    if (!destKey) continue;

    const sourceExists = await headExists(client, bucket, sourceKey);
    if (!sourceExists) {
      missingSource += 1;
      report.push({ sourceKey, destKey, status: "missing_source" });
      continue;
    }

    const destExists = await headExists(client, bucket, destKey);
    if (destExists) {
      skipped += 1;
      const verification = await httpCheck(bucket, destKey);
      report.push({
        sourceKey,
        destKey,
        status: "skipped_already_exists",
        httpStatus: verification?.status ?? null,
        httpUrl: verification?.url ?? null
      });
      continue;
    }

    if (!APPLY) {
      report.push({ sourceKey, destKey, status: "would_copy" });
      continue;
    }

    try {
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${encodeURIComponent(sourceKey).replace(/%2F/gu, "/")}`,
          Key: destKey
        })
      );
      const headOk = await headExists(client, bucket, destKey);
      const verification = await httpCheck(bucket, destKey);
      if (!headOk || !verification || !(verification.status === 200 || verification.status === 206)) {
        failed += 1;
        report.push({
          sourceKey,
          destKey,
          status: "failed",
          headExists: headOk,
          httpStatus: verification?.status ?? null,
          httpUrl: verification?.url ?? null
        });
        continue;
      }
      copied += 1;
      report.push({
        sourceKey,
        destKey,
        status: "copied",
        headExists: headOk,
        httpStatus: verification.status,
        httpUrl: verification.url
      });
    } catch (error) {
      failed += 1;
      report.push({
        sourceKey,
        destKey,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const summary = {
    apply: APPLY,
    bucket,
    copied,
    skippedAlreadyExists: skipped,
    missingSource,
    failed,
    total: sourceKeys.length,
    signature: createHash("sha256").update(JSON.stringify(report)).digest("hex").slice(0, 12),
    rows: report
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
