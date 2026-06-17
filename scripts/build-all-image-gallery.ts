import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";

const PROJECT_ROOT = process.cwd();
const OUTPUT_FILE = "/tmp/all-image-gallery.html";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".jfif"]);
const LOCAL_SCAN_DIRS = ["public", "uploads", ".next", "media", "assets", "files"];

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

function inferLocalSourceLabel(absolutePath: string): string {
  const relativePath = path.relative(PROJECT_ROOT, absolutePath);
  const firstSegment = relativePath.split(path.sep).filter(Boolean)[0] ?? "";
  return firstSegment || "local";
}

async function walkLocalImages(rootDir: string): Promise<Array<{
  source: "local";
  path: string;
  size: number | null;
  lastModified: string;
  src: string;
}>> {
  const absoluteRoot = path.join(PROJECT_ROOT, rootDir);
  try {
    const rootStat = await stat(absoluteRoot);
    if (!rootStat.isDirectory()) return [];
  } catch {
    return [];
  }

  const results: Array<{
    source: "local";
    path: string;
    size: number | null;
    lastModified: string;
    src: string;
  }> = [];

  async function visit(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) continue;

      const fileStat = await stat(absolutePath);
      results.push({
        source: "local",
        path: path.relative(PROJECT_ROOT, absolutePath),
        size: fileStat.size,
        lastModified: fileStat.mtime.toISOString(),
        src: pathToFileURL(absolutePath).href
      });
    }
  }

  await visit(absoluteRoot);
  return results;
}

async function scanLocalImages(): Promise<Array<{
  source: "local";
  path: string;
  size: number | null;
  lastModified: string;
  src: string;
}>> {
  const collected: Array<{
    source: "local";
    path: string;
    size: number | null;
    lastModified: string;
    src: string;
  }> = [];

  for (const rootDir of LOCAL_SCAN_DIRS) {
    collected.push(...await walkLocalImages(rootDir));
  }

  return collected;
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
      // try next bucket
    }
  }

  throw new Error("Could not resolve S3 bucket.");
}

async function scanS3Images(client: S3Client, bucket: string): Promise<Array<{
  source: "s3";
  path: string;
  originalKey: string;
  size: number | null;
  lastModified: string;
  httpStatus: number | null;
  src: string;
}>> {
  const items: Array<{
    source: "s3";
    path: string;
    originalKey: string;
    size: number | null;
    lastModified: string;
    httpStatus: number | null;
    src: string;
  }> = [];

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
      if (!IMAGE_EXTENSIONS.has(path.extname(item.Key).toLowerCase())) continue;
      const normalizedKey = stripBucketPrefix(item.Key, bucket);
      let httpStatus: number | null = null;
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: normalizedKey }));
        httpStatus = 200;
        if (!head.ContentLength && item.Size) {
          httpStatus = 200;
        }
      } catch {
        httpStatus = null;
      }
      items.push({
        source: "s3",
        path: normalizedKey,
        originalKey: item.Key,
        size: item.Size ?? null,
        lastModified: item.LastModified ? new Date(item.LastModified).toISOString() : "",
        httpStatus,
        src: `/api/uploads/object/${encodePathSegments(normalizedKey)}`
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return items;
}

async function main() {
  const client = getS3Client();
  const bucket = await resolveBucket(client);

  const [s3Items, localItems] = await Promise.all([
    scanS3Images(client, bucket),
    scanLocalImages()
  ]);

  const allItems = [...s3Items, ...localItems].sort(
    (left, right) =>
      String(right.lastModified).localeCompare(String(left.lastModified)) ||
      left.path.localeCompare(right.path)
  );

  const rows = allItems
    .map(
      (item) => `
      <tr>
        <td><img src="${item.src}" alt="${item.path}" loading="lazy" /></td>
        <td class="mono">${item.source}</td>
        <td class="mono">${item.source === "s3" ? `${item.path}<div style="color:#aaa;margin-top:6px">original: ${item.originalKey}</div>` : item.path}</td>
        <td>${item.lastModified || ""}</td>
        <td>${humanSize(item.size)}</td>
        <td>${item.source === "s3" ? item.httpStatus ?? "" : ""}</td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>All image gallery</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #111; color: #eee; margin: 24px; }
    .meta { color: #bbb; margin-bottom: 16px; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #2a2a2a; padding: 12px; vertical-align: top; }
    th { position: sticky; top: 0; background: #181818; text-align: left; z-index: 1; }
    img { width: 180px; height: 180px; object-fit: cover; background: #222; display: block; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  </style>
</head>
<body>
  <h1>All image candidates</h1>
  <div class="meta">
    <div>Bucket: <span class="mono">${bucket}</span></div>
    <div>Local roots: <span class="mono">${LOCAL_SCAN_DIRS.join(", ")}</span></div>
    <div>Count: ${allItems.length}</div>
    <div>Sorted by lastModified descending when available</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Preview</th>
        <th>Source</th>
        <th>Key / Path</th>
        <th>LastModified</th>
        <th>Size</th>
        <th>HTTP</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, html, "utf8");
  console.log(OUTPUT_FILE);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
