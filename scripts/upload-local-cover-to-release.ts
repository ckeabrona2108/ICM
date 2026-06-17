import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, HeadBucketCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

import { createPresignedDownload, resolveRenderableStoredFileUrl } from "@/lib/s3";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

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

function stripBucketPrefix(key: string, bucket: string): string {
  const prefix = `${bucket}/`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function encodePathSegments(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function inferContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".jpe" || ext === ".jfif") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
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

async function main() {
  const releaseId = getArgValue("--release-id");
  const filePathArg = getArgValue("--file");

  if (!releaseId) {
    throw new Error("Missing --release-id");
  }
  if (!filePathArg) {
    throw new Error("Missing --file");
  }

  const absoluteFilePath = path.isAbsolute(filePathArg) ? filePathArg : path.resolve(process.cwd(), filePathArg);
  const fileStat = await stat(absoluteFilePath);
  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${absoluteFilePath}`);
  }

  const fileBuffer = await readFile(absoluteFilePath);
  const extension = path.extname(absoluteFilePath).toLowerCase().replace(/^\./u, "");
  if (!extension) {
    throw new Error("File must have an extension.");
  }

  const client = getS3Client();
  const bucket = await resolveBucket(client);

  const key = `previews/${releaseId}.${extension}`;
  const publicUrl = resolveRenderableStoredFileUrl({ storageKey: key }) ?? `/api/uploads/object/${encodePathSegments(key)}`;
  const existing = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(() => true).catch(() => false);
  const httpBefore = existing ? await httpCheck(bucket, key) : null;

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true,
      title: true,
      preview: true
    }
  });

  if (!release) {
    throw new Error(`Release not found: ${releaseId}`);
  }

  const result = {
    apply: APPLY,
    releaseId,
    title: release.title,
    filePath: absoluteFilePath,
    fileSize: fileStat.size,
    contentType: inferContentType(absoluteFilePath),
    bucket,
    key,
    publicUrl,
    existedBefore: existing,
    httpBefore: httpBefore?.status ?? null
  };

  if (!APPLY) {
    console.log(JSON.stringify({ ...result, status: "would_upload" }, null, 2));
    await prisma.$disconnect();
    return;
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: inferContentType(absoluteFilePath)
    })
  );

  const headOk = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(() => true).catch(() => false);
  const httpAfter = await httpCheck(bucket, key);

  if (!headOk || !httpAfter || (httpAfter.status !== 200 && httpAfter.status !== 206)) {
    throw new Error(`Upload verification failed for ${key}`);
  }

  await prisma.release.update({
    where: { id: releaseId },
    data: {
      preview: publicUrl
    }
  });

  console.log(
    JSON.stringify(
      {
        ...result,
        status: "uploaded",
        headOk,
        httpAfter: httpAfter.status,
        dbUpdated: true
      },
      null,
      2
    )
  );

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
