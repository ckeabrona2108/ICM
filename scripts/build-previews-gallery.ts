import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { HeadBucketCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const PROJECT_ROOT = process.cwd();
const OUTPUT_FILE = "/tmp/previews-gallery.html";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

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

type GalleryItem = {
  path: string;
  originalKey: string;
  size: number | null;
  lastModified: string;
  folderId: string | null;
  src: string;
};

type PreviewScanResult = {
  items: GalleryItem[];
  totalObjects: number;
  previewKeys: string[];
  previewObjects: number;
  pageCount: number;
};

async function scanPreviewImages(client: S3Client, bucket: string): Promise<PreviewScanResult> {
  const items: GalleryItem[] = [];
  const previewKeys: string[] = [];
  let totalObjects = 0;
  let previewObjects = 0;
  let pageCount = 0;
  let continuationToken: string | undefined;

  do {
    pageCount += 1;
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      })
    );

    totalObjects += response.KeyCount ?? 0;
    for (const item of response.Contents ?? []) {
      if (!item.Key) continue;
      previewKeys.push(stripBucketPrefix(item.Key, bucket));
      const normalizedKey = stripBucketPrefix(item.Key, bucket);
      if (!normalizedKey.startsWith("previews/")) continue;
      previewObjects += 1;
      if (!IMAGE_EXTENSIONS.has(path.extname(normalizedKey).toLowerCase())) continue;

      const fileName = normalizedKey.split("/").filter(Boolean).at(-1) ?? "";
      const folderId = normalizedKey.split("/").filter(Boolean)[1] ?? null;
      items.push({
        path: normalizedKey,
        originalKey: item.Key,
        size: item.Size ?? null,
        lastModified: item.LastModified ? new Date(item.LastModified).toISOString() : "",
        folderId,
        src: `/api/uploads/object/${encodePathSegments(normalizedKey)}`
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return { items, totalObjects, previewObjects, previewKeys, pageCount };
}

function compareItems(left: GalleryItem, right: GalleryItem): number {
  const leftName = left.path.split("/").filter(Boolean).at(-1) ?? "";
  const rightName = right.path.split("/").filter(Boolean).at(-1) ?? "";
  const leftIsCover = leftName.toLowerCase().includes("release-cover");
  const rightIsCover = rightName.toLowerCase().includes("release-cover");
  if (leftIsCover !== rightIsCover) return leftIsCover ? -1 : 1;
  return String(right.lastModified).localeCompare(String(left.lastModified)) || left.path.localeCompare(right.path);
}

async function main() {
  const client = buildS3Client();
  const bucket = await resolveBucket(client);
  const scan = await scanPreviewImages(client, bucket);
  const items = scan.items.sort(compareItems);
  const previewKeys = scan.previewKeys
    .filter((key) => key.startsWith("previews/"))
    .sort((left, right) => left.localeCompare(right));
  const first50 = previewKeys.slice(0, 50);
  const last50 = previewKeys.slice(-50);

  const rows = items
    .map(
      (item, index) => `
        <tr data-search="${escapeHtml(
          `${item.path} ${item.originalKey} ${item.folderId ?? ""} ${item.lastModified} ${item.size ?? ""}`
        ).toLowerCase()}">
          <td>${index + 1}</td>
          <td><img src="${item.src}" alt="${escapeHtml(item.path)}" loading="lazy" /></td>
          <td class="mono">
            <div>${escapeHtml(item.path)}</div>
            <div class="muted">original: ${escapeHtml(item.originalKey)}</div>
          </td>
          <td>${escapeHtml(item.folderId ?? "")}</td>
          <td>${escapeHtml(item.lastModified || "")}</td>
          <td>${escapeHtml(humanSize(item.size))}</td>
        </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Previews gallery</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: system-ui, sans-serif; background: #111; color: #eee; margin: 24px; }
    .meta { color: #bbb; margin-bottom: 16px; line-height: 1.5; }
    .toolbar { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0 20px; }
    input { background: #1a1a1a; color: #eee; border: 1px solid #333; border-radius: 8px; padding: 10px 12px; min-width: 320px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #2a2a2a; padding: 12px; vertical-align: top; }
    th { position: sticky; top: 0; background: #181818; text-align: left; z-index: 1; }
    img { width: 180px; height: 180px; object-fit: cover; background: #222; display: block; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
    .muted { color: #999; margin-top: 6px; }
    .hidden { display: none; }
    .count { font-weight: 600; }
  </style>
</head>
<body>
  <h1>Previews gallery</h1>
  <div class="meta">
    <div>Bucket: <span class="mono">${escapeHtml(bucket)}</span></div>
    <div>Scope: <span class="mono">previews/**/*.jpg|jpeg|png|webp</span></div>
    <div>Sorted: release-cover first, then lastModified descending</div>
    <div>Count: <span class="count" id="count">${items.length}</span></div>
    <div>Total objects in bucket: <span class="count">${scan.totalObjects}</span></div>
    <div>Total objects under previews/: <span class="count">${scan.previewObjects}</span></div>
    <div>ListObjectsV2 pages: <span class="count">${scan.pageCount}</span></div>
    <div>Preview keys found: <span class="count">${previewKeys.length}</span></div>
    <div>First 50 preview keys:</div>
    <pre class="mono">${escapeHtml(first50.length ? first50.join("\n") : "No previews objects found")}</pre>
    <div>Last 50 preview keys:</div>
    <pre class="mono">${escapeHtml(last50.length ? last50.join("\n") : "No previews objects found")}</pre>
    ${previewKeys.length === 0 ? '<div class="empty">No old previews found in this bucket.</div>' : ""}
  </div>
  <div class="toolbar">
    <input id="filter" type="search" placeholder="Filter by key, folderId, date, size..." />
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Preview</th>
        <th>Key / Path</th>
        <th>FolderId</th>
        <th>LastModified</th>
        <th>Size</th>
      </tr>
    </thead>
    <tbody id="rows">${rows}</tbody>
  </table>
  <script>
    const input = document.getElementById('filter');
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    const count = document.getElementById('count');
    function update() {
      const value = String(input.value || '').trim().toLowerCase();
      let visible = 0;
      for (const row of rows) {
        const haystack = row.getAttribute('data-search') || '';
        const match = !value || haystack.includes(value);
        row.classList.toggle('hidden', !match);
        if (match) visible += 1;
      }
      count.textContent = String(visible);
    }
    input.addEventListener('input', update);
    update();
  </script>
</body>
</html>`;

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, html, "utf8");
  console.log(OUTPUT_FILE);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
