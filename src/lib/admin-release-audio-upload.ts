import path from "node:path";

import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { resolveRenderableStoredFileUrl } from "@/lib/s3";

const CONTRACTS_BUCKET = "contracts";
const MAX_AUDIO_UPLOAD_BYTES = 80 * 1024 * 1024;
const ALLOWED_AUDIO_EXTENSIONS = new Set([".wav", ".flac"]);
const ALLOWED_CONTENT_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/flac"]);

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

function normalizeExtension(fileName: string): string | null {
  const extension = path.extname(fileName).trim().toLowerCase();
  return ALLOWED_AUDIO_EXTENSIONS.has(extension) ? extension : null;
}

async function verifyContractsBucket(client: S3Client): Promise<void> {
  await client.send(new HeadBucketCommand({ Bucket: CONTRACTS_BUCKET }));
}

export function validateAdminReleaseAudioFile(file: File): { extension: string } {
  if (!file.name?.trim()) {
    throw new Error("Файл не выбран.");
  }
  if (file.size <= 0) {
    throw new Error("Файл не выбран.");
  }
  if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
    throw new Error("Файл слишком большой. Максимум 80 MB.");
  }

  const extension = normalizeExtension(file.name);
  if (!extension) {
    throw new Error("Разрешены только .wav и .flac.");
  }

  const contentType = file.type.trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error("Неверный формат аудиофайла.");
  }

  return { extension };
}

export async function uploadAdminReleaseAudio(input: {
  trackId: string;
  file: File;
}): Promise<{ bucket: string; key: string; fileUrl: string }> {
  const client = buildS3Client();
  await verifyContractsBucket(client);

  const { extension } = validateAdminReleaseAudioFile(input.file);
  const key = `tracks/${input.trackId}.${extension.replace(/^\./u, "")}`;
  const body = Buffer.from(await input.file.arrayBuffer());

  await client.send(
    new PutObjectCommand({
      Bucket: CONTRACTS_BUCKET,
      Key: key,
      Body: body,
      ContentType: input.file.type
    })
  );

  const fileUrl =
    resolveRenderableStoredFileUrl({ storageKey: key }) ?? `/api/uploads/object/${encodePathSegments(key)}`;

  return {
    bucket: CONTRACTS_BUCKET,
    key,
    fileUrl
  };
}
