import { prisma } from "@/lib/prisma";
import {
  buildReleaseCoverCandidateUrls,
  normalizeReleaseCoverStorageKey
} from "@/lib/release-cover";
import { probeStorageKeyDiagnostics, resolveRenderableStoredFileUrl } from "@/lib/s3";

type Diagnosis = "ok" | "missing_file" | "broken_db_path" | "access_denied" | "no_preview";

function readStringEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (!/[",\n\r]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function isPreviewRouteUrl(value: string): boolean {
  return /^\/?api\/uploads\/object\//u.test(value.trim());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function extractOldCoverUrlCandidates(releaseId: string, roles: unknown): string[] {
  const root = asRecord(roles);
  const submission = asRecord(root?.submissionData);
  const orderedValues = [
    submission?.coverUpload,
    submission?.cover,
    root?.coverUpload,
    root?.cover,
    root?.preview,
    root?.coverImage
  ];

  const urls = buildReleaseCoverCandidateUrls({
    id: releaseId,
    roles,
    submissionData: submission ?? undefined,
    coverUpload: submission?.coverUpload ?? root?.coverUpload ?? undefined,
    cover: submission?.cover ?? root?.cover ?? undefined,
    coverImage: root?.coverImage ?? undefined,
    preview: root?.preview as string | null | undefined
  });

  const normalized = new Set<string>();
  for (const candidate of orderedValues) {
    const raw = asString(candidate);
    if (!raw) continue;
    const storageKey = normalizeReleaseCoverStorageKey(raw, releaseId);
    if (storageKey) {
      const url = resolveRenderableStoredFileUrl({ storageKey });
      if (url) normalized.add(url);
      continue;
    }
    if (isPreviewRouteUrl(raw)) {
      normalized.add(raw);
    }
  }

  for (const url of urls) normalized.add(url);
  return Array.from(normalized);
}

function resolvePossibleOldCover(input: {
  releaseId: string;
  roles: unknown;
  currentPreview: string | null;
}): { url: string | null; key: string | null } {
  const candidates = extractOldCoverUrlCandidates(input.releaseId, input.roles);
  const currentPreview = input.currentPreview?.trim() ?? "";

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate === currentPreview) continue;
    const key = normalizeReleaseCoverStorageKey(candidate, input.releaseId) ?? candidate.replace(/^\/?api\/uploads\/object\/+/u, "");
    return { url: candidate, key };
  }

  return { url: null, key: null };
}

async function main() {
  const releases = await prisma.release.findMany({
    select: {
      id: true,
      title: true,
      preview: true,
      roles: true
    },
    orderBy: { date: "asc" }
  });

  process.stdout.write(
    [
      "releaseId",
      "title",
      "currentPreview",
      "currentPublicHttpStatus",
      "currentSdkHeadExists",
      "currentAppRouteHttpStatus",
      "currentFinalDiagnosis",
      "roles.submissionData.cover",
      "roles.submissionData.coverUpload",
      "roles.cover",
      "roles.preview",
      "possibleOldCoverUrl",
      "possibleOldCoverKey",
      "possibleOldCoverPublicHttpStatus",
      "possibleOldCoverSdkHeadExists",
      "possibleOldCoverAppRouteHttpStatus",
      "possibleOldCoverFinalDiagnosis"
    ].join(",") + "\n"
  );

  for (const release of releases) {
    const roles = asRecord(release.roles);
    const submission = asRecord(roles?.submissionData);
    const currentPreview = release.preview?.trim() ?? "";
    const currentProbe = currentPreview
      ? await probeStorageKeyDiagnostics({
          storageKey: normalizeReleaseCoverStorageKey(currentPreview, release.id),
          publicUrl: currentPreview
        })
      : null;
    const possibleOldCover = resolvePossibleOldCover({
      releaseId: release.id,
      roles: release.roles,
      currentPreview: release.preview
    });
    const possibleOldCoverProbe = possibleOldCover.url
      ? await probeStorageKeyDiagnostics({
          storageKey: possibleOldCover.key,
          publicUrl: possibleOldCover.url
        })
      : null;

    const shouldReport = Boolean(possibleOldCover.url) && (!currentProbe || currentProbe.finalDiagnosis !== "ok");

    if (!shouldReport) continue;

    process.stdout.write(
      [
        csvEscape(release.id),
        csvEscape(release.title),
        csvEscape(release.preview ?? ""),
        csvEscape(currentProbe?.publicHttpStatus ?? ""),
        csvEscape(currentProbe?.sdkHeadExists ?? ""),
        csvEscape(currentProbe?.appRouteHttpStatus ?? ""),
        csvEscape(currentProbe?.finalDiagnosis ?? ""),
        csvEscape(asString(submission?.cover) ?? ""),
        csvEscape(asString(submission?.coverUpload) ?? ""),
        csvEscape(asString(roles?.cover) ?? ""),
        csvEscape(asString(roles?.preview) ?? ""),
        csvEscape(possibleOldCover.url ?? ""),
        csvEscape(possibleOldCover.key ?? ""),
        csvEscape(possibleOldCoverProbe?.publicHttpStatus ?? ""),
        csvEscape(possibleOldCoverProbe?.sdkHeadExists ?? ""),
        csvEscape(possibleOldCoverProbe?.appRouteHttpStatus ?? ""),
        csvEscape(possibleOldCoverProbe?.finalDiagnosis ?? "")
      ].join(",") + "\n"
    );
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
