import path from "node:path";
import { copyFile, mkdir, stat } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";

import {
  normalizeReleaseCoverStorageKey,
  normalizeReleaseCoverUrl
} from "@/lib/release-cover";

const prisma = new PrismaClient();
const STORAGE_ROOT = path.join(process.cwd(), ".tmp", "local-object-storage");
const APPLY = process.argv.includes("--apply");

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function extractSourceStorageKeyCandidate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;

  if (raw.startsWith("/api/uploads/object/")) {
    return decodeURIComponent(raw.replace(/^\/api\/uploads\/object\//u, ""));
  }
  if (raw.startsWith("api/uploads/object/")) {
    return decodeURIComponent(raw.replace(/^api\/uploads\/object\//u, ""));
  }
  if (raw.startsWith("/api/storage/preview") || raw.startsWith("api/storage/preview")) {
    const query = raw.split("?")[1] ?? "";
    const key = new URLSearchParams(query).get("key");
    return key ? decodeURIComponent(key) : null;
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      const pathname = parsed.pathname.replace(/^\/+/u, "");
      return pathname || null;
    } catch {
      return null;
    }
  }

  const normalized = raw.replace(/^\/+/u, "");
  if (!normalized) return null;
  if (normalized.startsWith("uploads/") || normalized.startsWith("previews/") || normalized.startsWith("covers/")) {
    return normalized;
  }
  if (normalized.includes("/")) return normalized;
  return null;
}

async function localObjectExists(storageKey: string): Promise<boolean> {
  try {
    await stat(path.join(STORAGE_ROOT, storageKey));
    return true;
  } catch {
    return false;
  }
}

async function copyLocalObject(sourceKey: string, targetKey: string): Promise<boolean> {
  const sourcePath = path.join(STORAGE_ROOT, sourceKey);
  const targetPath = path.join(STORAGE_ROOT, targetKey);
  const sourceMetaPath = `${sourcePath}.meta.json`;
  const targetMetaPath = `${targetPath}.meta.json`;

  if (!(await localObjectExists(sourceKey))) {
    return false;
  }

  if (await localObjectExists(targetKey)) {
    return true;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);

  try {
    await copyFile(sourceMetaPath, targetMetaPath);
  } catch {
    // Metadata is optional for local object storage.
  }

  return true;
}

type CoverImageRow = {
  id: string;
  releaseId: string;
  storageKey: string;
  url: string;
  width: number;
  height: number;
};

async function readCoverImages(): Promise<CoverImageRow[]> {
  try {
    return await prisma.$queryRawUnsafe<CoverImageRow[]>(
      `SELECT id, "releaseId", "storageKey", url, width, height FROM "icecream"."CoverImage"`
    );
  } catch {
    return [];
  }
}

function selectCanonicalCoverCandidate(release: {
  id: string;
  preview: string | null;
  roles: unknown;
}, coverImage: CoverImageRow | null) {
  const root = asRecord(release.roles);
  const submission = asRecord(root?.submissionData);

  const candidates = [
    root?.coverUpload,
    submission?.coverUpload,
    submission?.cover,
    root?.cover,
    coverImage
      ? {
          storageKey: coverImage.storageKey,
          url: coverImage.url
        }
      : null,
    release.preview
  ];

  for (const candidate of candidates) {
    const targetKey = normalizeReleaseCoverStorageKey(candidate, release.id);
    if (!targetKey) continue;
    const sourceKey =
      extractSourceStorageKeyCandidate(candidate) ??
      extractSourceStorageKeyCandidate(asRecord(candidate)?.storageKey) ??
      extractSourceStorageKeyCandidate(asRecord(candidate)?.url);

    return {
      sourceKey,
      targetKey,
      targetUrl: normalizeReleaseCoverUrl({ storageKey: targetKey }, release.id)
    };
  }

  return null;
}

function updateJsonCoverRefs(
  roles: unknown,
  targetUrl: string,
  targetKey: string
): Record<string, unknown> {
  const nextRoles = cloneJson(asRecord(roles) ?? {});
  const nextSubmission = asRecord(nextRoles.submissionData)
    ? cloneJson(asRecord(nextRoles.submissionData) ?? {})
    : null;

  if (asRecord(nextRoles.coverUpload)) {
    nextRoles.coverUpload = {
      ...(nextRoles.coverUpload as Record<string, unknown>),
      storageKey: targetKey,
      url: targetUrl
    };
  }

  if (nextSubmission) {
    if (asRecord(nextSubmission.coverUpload)) {
      nextSubmission.coverUpload = {
        ...(nextSubmission.coverUpload as Record<string, unknown>),
        storageKey: targetKey,
        url: targetUrl
      };
    } else if (nextSubmission.coverUpload == null) {
      nextSubmission.coverUpload = {
        storageKey: targetKey,
        url: targetUrl
      };
    }
    nextSubmission.cover = targetUrl;
    nextRoles.submissionData = nextSubmission;
  }

  if (typeof nextRoles.cover === "string") {
    nextRoles.cover = targetUrl;
  }

  return nextRoles;
}

async function main() {
  const releases = await prisma.release.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      preview: true,
      roles: true
    },
    orderBy: { date: "desc" }
  });
  const coverImages = await readCoverImages();

  const report: Array<Record<string, unknown>> = [];
  let updatedCount = 0;

  for (const release of releases) {
    const coverImage = coverImages.find((item) => item.releaseId === release.id) ?? null;
    const canonical = selectCanonicalCoverCandidate(release, coverImage);
    const currentPreview = asString(release.preview);
    const issues: string[] = [];

    if (!canonical) {
      report.push({
        releaseId: release.id,
        title: release.title,
        status: release.status,
        preview: release.preview,
        issues: ["no_cover_candidate"],
        wouldUpdate: false
      });
      continue;
    }

    if (!canonical.targetUrl) {
      issues.push("target_url_unavailable");
    }

    if (canonical.sourceKey && canonical.sourceKey !== canonical.targetKey) {
      const copied = await copyLocalObject(canonical.sourceKey, canonical.targetKey);
      if (!copied) {
        issues.push(`source_missing:${canonical.sourceKey}`);
      }
    } else if (canonical.sourceKey && canonical.sourceKey === canonical.targetKey) {
      await copyLocalObject(canonical.sourceKey, canonical.targetKey);
    }

    const nextPreview = canonical.targetUrl ?? normalizeReleaseCoverUrl({ storageKey: canonical.targetKey }, release.id);
    const nextRoles = nextPreview
      ? updateJsonCoverRefs(release.roles, nextPreview, canonical.targetKey)
      : cloneJson(asRecord(release.roles) ?? {});
    const needsPreviewUpdate = currentPreview !== nextPreview;

    if (needsPreviewUpdate || JSON.stringify(release.roles ?? {}) !== JSON.stringify(nextRoles)) {
      if (APPLY) {
        await prisma.release.update({
          where: { id: release.id },
          data: {
            preview: nextPreview ?? release.preview,
            roles: nextRoles as never
          }
        });
      }
      updatedCount += 1;
    }

    if (coverImage && nextPreview) {
      const coverImageTargetUrl = nextPreview;
      if (APPLY) {
        await prisma.$executeRawUnsafe(
          `UPDATE "icecream"."CoverImage"
           SET "storageKey" = $1, url = $2
           WHERE id = $3`,
          canonical.targetKey,
          coverImageTargetUrl,
          coverImage.id
        );
      }
    }

    if (issues.length > 0 || needsPreviewUpdate) {
      report.push({
        releaseId: release.id,
        title: release.title,
        status: release.status,
        preview: release.preview,
        targetKey: canonical.targetKey,
        targetUrl: nextPreview,
        sourceKey: canonical.sourceKey,
        issues,
        wouldUpdate: true
      });
    }
  }

  console.log(JSON.stringify({ apply: APPLY, updatedCount, rows: report }, null, 2));
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
