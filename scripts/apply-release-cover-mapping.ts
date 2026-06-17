import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";

import { CopyObjectCommand, HeadBucketCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

import {
  asString,
  csvEscape,
  getArgValue,
  hasFlag,
  normalizeCurrentPreviewToTargetKey,
  parseCsv,
  parseCsvBoolean
} from "./release-cover-mapping.shared";

const prisma = new PrismaClient();
const INPUT_PATH = getArgValue("--input") ?? getArgValue("--csv") ?? getArgValue("--file");
const APPLY = hasFlag("--apply");
const DRY_RUN = hasFlag("--dry-run") || !APPLY;
const OVERWRITE = hasFlag("--overwrite");

function readStringEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function toEndpointUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;
  if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) return rawValue;
  const useSsl = (process.env.S3_USE_SSL ?? "true").trim().toLowerCase();
  const sslEnabled = !["0", "false", "no", "off"].includes(useSsl);
  return `${sslEnabled ? "https" : "http"}://${rawValue}`;
}

const endpoint = toEndpointUrl(readStringEnv("S3_ENDPOINT", "MINIO_ENDPOINT", "S3_HOST"));
const region = readStringEnv("S3_REGION", "AWS_REGION") ?? "ru";
const configuredBucket = readStringEnv("S3_BUCKET", "S3_BUCKET_NAME", "MINIO_BUCKET", "MINIO_BUCKET_NAME");
const accessKeyId = readStringEnv("S3_ACCESS_KEY_ID", "S3_ACCESS_KEY", "MINIO_ACCESS_KEY", "MINIO_ROOT_USER");
const secretAccessKey = readStringEnv(
  "S3_SECRET_ACCESS_KEY",
  "S3_SECRET_KEY",
  "MINIO_SECRET_KEY",
  "MINIO_ROOT_PASSWORD"
);

function buildBucketCandidates(): string[] {
  const candidates = [configuredBucket, "contracts", "uploads", "signatures", "verification"]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

function getClient(): S3Client | null {
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
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

async function resolveBucket(client: S3Client): Promise<string> {
  for (const bucketName of buildBucketCandidates()) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucketName }));
      return bucketName;
    } catch {
      // try next
    }
  }
  throw new Error(`Could not resolve bucket from candidates: ${buildBucketCandidates().join(", ")}`);
}

async function headExists(client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function copyObject(client: S3Client, bucket: string, sourceKey: string, targetKey: string): Promise<void> {
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
      Key: targetKey
    })
  );
}

async function backupCsv(inputPath: string): Promise<string> {
  const resolved = path.resolve(inputPath);
  const backupPath = `${resolved}.${new Date().toISOString().replace(/[:.]/gu, "-")}.bak.csv`;
  await copyFile(resolved, backupPath);
  return backupPath;
}

async function main() {
  if (!INPUT_PATH) {
    throw new Error("Pass --input /path/to/report.csv (or --csv / --file).");
  }

  const inputPath = path.resolve(INPUT_PATH);
  const content = await readFile(inputPath, "utf8");
  const rows = parseCsv(content);
  if (rows.length === 0) {
    throw new Error("CSV is empty or malformed.");
  }

  const headers = Object.keys(rows[0] ?? {});
  for (const required of [
    "releaseId",
    "currentPreview",
    "sourceKey",
    "targetKey",
    "sourceExists",
    "targetExists",
    "canCopy",
    "confidence",
    "sourceReason"
  ]) {
    if (!headers.includes(required)) {
      throw new Error(`CSV is missing required column: ${required}`);
    }
  }

  const client = getClient();
  if (!client) {
    throw new Error("S3 is not configured. Check S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
  }
  const bucket = await resolveBucket(client);

  let backupPath: string | null = null;
  if (APPLY && !DRY_RUN) {
    backupPath = await backupCsv(inputPath);
  }

  const out: string[] = [];
  out.push(["releaseId", "sourceKey", "targetKey", "action", "status", "reason"].join(","));

  for (const row of rows) {
    const releaseId = asString(row.releaseId) ?? "";
    const currentPreview = asString(row.currentPreview) ?? "";
    const sourceKey = asString(row.sourceKey) ?? "";
    const targetKey = asString(row.targetKey) ?? "";
    const canCopy = parseCsvBoolean(row.canCopy);
    const confidence = asString(row.confidence) ?? "none";
    const previewTarget = normalizeCurrentPreviewToTargetKey(currentPreview, releaseId);
    const action = DRY_RUN ? "dry-run" : "apply";

    let status = "skipped";
    let reason = "";

    if (!releaseId || !sourceKey || !targetKey) {
      status = "invalid";
      reason = "missing_release_id_or_keys";
    } else if (!canCopy || confidence !== "high") {
      status = "skipped";
      reason = "row_not_safe_for_copy";
    } else {
      const release = await prisma.release.findUnique({
        where: { id: releaseId },
        select: { preview: true }
      });

      if (!release) {
        status = "missing";
        reason = "release_not_found";
      } else {
        const dbPreviewTarget = normalizeCurrentPreviewToTargetKey(release.preview, releaseId);
        const sourceExists = await headExists(client, bucket, sourceKey);
        const targetExists = await headExists(client, bucket, targetKey);

        if (!sourceExists) {
          status = "missing";
          reason = "source_missing";
        } else if (!targetExists || OVERWRITE) {
          if (DRY_RUN) {
            status = targetExists ? "would-overwrite" : "would-copy";
            reason = targetExists ? "target_exists" : "source_ready";
          } else {
            await copyObject(client, bucket, sourceKey, targetKey);
            status = targetExists ? "overwritten" : "copied";
            reason = targetExists ? "target_overwritten" : "copied_source_to_target";
          }
        } else {
          status = "exists";
          reason = "target_already_exists";
        }

        if (!dbPreviewTarget || dbPreviewTarget !== targetKey) {
          if (!DRY_RUN) {
            await prisma.release.update({
              where: { id: releaseId },
              data: {
                preview: `/api/uploads/object/${targetKey.split("/").map(encodeURIComponent).join("/")}`
              }
            });
            reason = reason ? `${reason};preview_updated` : "preview_updated";
          } else {
            reason = reason ? `${reason};preview_would_update` : "preview_would_update";
          }
        } else {
          reason = reason ? `${reason};preview_already_target` : "preview_already_target";
        }
      }
    }

    out.push(
      [
        csvEscape(releaseId),
        csvEscape(sourceKey),
        csvEscape(targetKey),
        csvEscape(action),
        csvEscape(status),
        csvEscape(reason || previewTarget || "")
      ].join(",")
    );
  }

  process.stdout.write(`${out.join("\n")}\n`);
  if (backupPath) {
    process.stderr.write(`backup_csv=${backupPath}\n`);
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
