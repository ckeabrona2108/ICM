import { writeFile } from "node:fs/promises";

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { prisma } from "@/lib/prisma";
import { resolvePublicStorageUrlFromKey } from "@/lib/s3";

import {
  asRecord,
  asString,
  csvEscape,
  extractExactStoredKeyCandidate,
  getArgValue,
  hasFlag,
  readShellHistoryCoverSources,
  resolveReleaseCoverMapping,
  type ReleaseCoverSourceRow
} from "./release-cover-mapping.shared";

const RELEASE_ID_FILTER = getArgValue("--release-id");
const LIMIT_RAW = getArgValue("--limit");
const OUTPUT_PATH = getArgValue("--output");
const NO_S3_PROBE = hasFlag("--no-s3-probe");
const LIMIT = LIMIT_RAW ? Number(LIMIT_RAW) : null;
const PUBLIC_ROOT_BASE = "https://s3.icecreammusic.net";
const CONTRACTS_BUCKET = "contracts";
const APP_BASE_URL = readStringEnv("APP_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
const PROBE_TIMEOUT_MS = 3000;
const AUDIO_EXTENSIONS = new Set(["wav", "flac", "mp3", "aac", "m4a", "aiff"]);

type MediaDiagnosis = "ok" | "recovered_by_fallback" | "missing_file" | "no_source";

type ReportRow = {
  kind: "cover" | "track-audio";
  releaseId: string;
  title: string;
  trackId: string;
  key: string;
  publicRootUrl: string;
  publicRootStatus: number | null;
  appRouteStatus: number | null;
  sdkContractsExists: boolean | null;
  diagnosis: MediaDiagnosis;
  sourceReason: string;
  confidence: "high" | "medium" | "low" | "none";
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function splitFileExtension(value: string | null | undefined): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const base = raw.split("?")[0]?.split("#")[0] ?? raw;
  const fileName = base.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return null;
  const extension = fileName.slice(dotIndex + 1).trim().toLowerCase();
  return /^[a-z0-9]{2,8}$/u.test(extension) ? extension : null;
}

function buildTrackTargetKey(trackId: string, trackRow: Record<string, unknown>, submissionTrack: Record<string, unknown> | null): string | null {
  const candidates = [
    extractExactStoredKeyCandidate(submissionTrack?.audioFile),
    extractExactStoredKeyCandidate(submissionTrack?.audioUpload),
    extractExactStoredKeyCandidate(submissionTrack?.audioUrl),
    extractExactStoredKeyCandidate(submissionTrack?.audio),
    extractExactStoredKeyCandidate(trackRow.audioFile),
    extractExactStoredKeyCandidate(trackRow.audioUpload),
    extractExactStoredKeyCandidate(trackRow.audioUrl),
    extractExactStoredKeyCandidate(trackRow.audio)
  ];

  for (const candidate of candidates) {
    const ext = splitFileExtension(candidate);
    if (ext && AUDIO_EXTENSIONS.has(ext)) {
      return `tracks/${trackId}.${ext}`;
    }
  }

  const extHint = [
    asString(trackRow.track),
    asString(submissionTrack?.fileName),
    asString(
      submissionTrack?.audioFile && typeof submissionTrack.audioFile === "object"
        ? (submissionTrack.audioFile as Record<string, unknown>).fileName
        : null
    )
  ]
    .map((value) => splitFileExtension(value))
    .find((value) => Boolean(value) && AUDIO_EXTENSIONS.has(value as string));

  if (extHint) return `tracks/${trackId}.${extHint}`;

  const normalizedTrack = asString(trackRow.track)?.trim().replace(/^\./u, "").toLowerCase() ?? null;
  if (normalizedTrack && AUDIO_EXTENSIONS.has(normalizedTrack)) {
    return `tracks/${trackId}.${normalizedTrack}`;
  }

  return null;
}

function resolveTrackSource(input: {
  trackRow: Record<string, unknown>;
  submissionTrack: Record<string, unknown> | null;
}): { sourceKey: string; sourceReason: string; confidence: ReportRow["confidence"] } {
  const candidates: Array<{ reason: string; raw: unknown; confidence: ReportRow["confidence"] }> = [
    { reason: "submissionData.tracks.audioFile.storageKey", raw: input.submissionTrack?.audioFile, confidence: "high" },
    { reason: "submissionData.tracks.audioUpload.storageKey", raw: input.submissionTrack?.audioUpload, confidence: "high" },
    { reason: "submissionData.tracks.audioUrl", raw: input.submissionTrack?.audioUrl, confidence: "high" },
    { reason: "submissionData.tracks.audio", raw: input.submissionTrack?.audio, confidence: "high" },
    { reason: "tracks.audioFile", raw: input.trackRow.audioFile, confidence: "high" },
    { reason: "tracks.audioUpload", raw: input.trackRow.audioUpload, confidence: "high" },
    { reason: "tracks.audioUrl", raw: input.trackRow.audioUrl, confidence: "high" },
    { reason: "tracks.audio", raw: input.trackRow.audio, confidence: "high" },
    { reason: "tracks.track", raw: input.trackRow.track, confidence: "medium" }
  ];

  for (const candidate of candidates) {
    const exact = extractExactStoredKeyCandidate(candidate.raw);
    if (exact) {
      return { sourceKey: exact, sourceReason: candidate.reason, confidence: candidate.confidence };
    }
  }

  return { sourceKey: "", sourceReason: "missing", confidence: "none" };
}

function diagnose(sourceKey: string, targetKey: string, sourceExists: boolean, targetExists: boolean): MediaDiagnosis {
  if (!sourceKey && !targetKey) return "no_source";
  if (targetExists) return "ok";
  if (sourceExists) return "recovered_by_fallback";
  if (sourceKey || targetKey) return "missing_file";
  return "no_source";
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

function createS3Client(): S3Client | null {
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

  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeContractsSdkExists(key: string | null): Promise<boolean | null> {
  if (!key || NO_S3_PROBE) return null;
  const client = createS3Client();
  if (!client) return null;
  try {
    const result = await withTimeout(
      client.send(
        new HeadObjectCommand({
          Bucket: CONTRACTS_BUCKET,
          Key: key
        })
      ),
      PROBE_TIMEOUT_MS
    );
    return result === null ? null : true;
  } catch {
    return false;
  }
}

async function probeUrlStatus(url: string | null): Promise<number | null> {
  if (!url || NO_S3_PROBE) return null;
  try {
    const response = await withTimeout(
      fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
        cache: "no-store"
      }),
      PROBE_TIMEOUT_MS
    );
    return response?.status ?? null;
  } catch {
    return null;
  }
}

function normalizeObjectKeyLike(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let pathname = trimmed;
  if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return trimmed.replace(/^\/+/, "");
    }
  }
  pathname = pathname.replace(/^\/+/, "");
  if (!pathname) return "";
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2) {
    const root = segments[0];
    const next = segments[1];
    if (["contracts", "uploads", "signatures", "verification"].includes(root) && ["previews", "tracks", "covers", "uploads"].includes(next)) {
      segments.shift();
    }
  }
  return segments.join("/");
}

function buildAppRouteUrl(key: string | null): string {
  if (!key) return "";
  const encodedPath = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`/api/uploads/object/${encodedPath}`, APP_BASE_URL).toString();
}

function currentPreviewKey(release: { preview: string | null; id: string }): string {
  const preview = asString(release.preview);
  if (!preview) return "";
  const normalized = normalizeObjectKeyLike(preview);
  if (!normalized) return "";
  if (normalized.startsWith("previews/") || normalized.startsWith("tracks/")) return normalized;
  if (normalized.startsWith("api/uploads/object/")) {
    return normalized.replace(/^api\/uploads\/object\//u, "").split("?")[0]?.split("#")[0] ?? "";
  }
  if (normalized.includes("/")) return normalized;
  const ext = splitFileExtension(normalized);
  return ext ? `previews/${release.id}.${ext}` : normalized;
}

async function main() {
  const releases = await prisma.release.findMany({
    select: {
      id: true,
      preview: true,
      title: true,
      userId: true,
      roles: true,
      track: {
        select: {
          id: true,
          index: true,
          title: true,
          track: true,
          roles: true
        },
        orderBy: { index: "asc" }
      }
    },
    orderBy: { date: "asc" }
  });

  const filtered = RELEASE_ID_FILTER ? releases.filter((release) => release.id === RELEASE_ID_FILTER) : releases;
  const limited = Number.isFinite(LIMIT ?? Number.NaN) && (LIMIT ?? 0) > 0 ? filtered.slice(0, LIMIT ?? 0) : filtered;
  const shellHistory = await readShellHistoryCoverSources();
  const shellHistoryByReleaseId = new Map(shellHistory.map((entry) => [entry.releaseId, entry]));

  const rows: ReportRow[] = [];
  let checked = 0;

  for (const release of limited as ReleaseCoverSourceRow[]) {
    const coverMapping = await resolveReleaseCoverMapping({
      release,
      shellHistoryByReleaseId,
      noS3Probe: NO_S3_PROBE
    });
    const coverKey = currentPreviewKey(release);
    const coverPublicRootUrl = coverKey ? resolvePublicStorageUrlFromKey(coverKey) ?? `${PUBLIC_ROOT_BASE}/${coverKey}` : "";
    const coverPublicStatus = await probeUrlStatus(coverPublicRootUrl);
    const coverAppRouteUrl = buildAppRouteUrl(coverKey);
    const coverAppRouteStatus = await probeUrlStatus(coverAppRouteUrl);
    const coverSdkExists = await probeContractsSdkExists(coverKey);
    const coverSourceKey = coverMapping.sourceKey && normalizeObjectKeyLike(coverMapping.sourceKey) !== coverKey ? normalizeObjectKeyLike(coverMapping.sourceKey) : null;
    const coverSourcePublicUrl = coverSourceKey ? resolvePublicStorageUrlFromKey(coverSourceKey) ?? `${PUBLIC_ROOT_BASE}/${coverSourceKey}` : "";
    const coverSourceStatus = await probeUrlStatus(coverSourcePublicUrl);
    const coverSourceSdk = await probeContractsSdkExists(coverSourceKey);
    const coverExists = coverPublicStatus === 200 || coverPublicStatus === 206 || coverAppRouteStatus === 200 || coverAppRouteStatus === 206 || coverSdkExists === true;
    const coverFallbackExists = coverSourceStatus === 200 || coverSourceStatus === 206 || coverSourceSdk === true;
    const coverDiagnosis = coverExists
      ? "ok"
      : coverFallbackExists
        ? "recovered_by_fallback"
        : coverKey || coverSourceKey
          ? "missing_file"
          : "no_source";

    if (coverDiagnosis !== "ok") {
      rows.push({
        kind: "cover",
        releaseId: release.id,
        title: release.title,
        trackId: "",
        key: coverKey || coverMapping.targetKey,
        publicRootUrl: coverPublicRootUrl,
        publicRootStatus: coverPublicStatus,
        appRouteStatus: coverAppRouteStatus,
        sdkContractsExists: coverSdkExists,
        diagnosis: coverDiagnosis,
        sourceReason: coverMapping.sourceReason,
        confidence: coverMapping.confidence
      });
    }

    const submissionData = asRecord(asRecord(release.roles)?.submissionData);
    const submissionTracks = asArray(submissionData?.tracks);

    for (const track of release.track) {
      const trackRow = asRecord(track) ?? {};
      const submissionTrack = asRecord(submissionTracks[trackRow.index as number]) ?? null;
      const source = resolveTrackSource({ trackRow, submissionTrack });
      const trackId = asString(trackRow.id) ?? "";
      const targetKey = buildTrackTargetKey(trackId, trackRow, submissionTrack);
      const publicRootUrl = targetKey ? resolvePublicStorageUrlFromKey(targetKey) ?? `${PUBLIC_ROOT_BASE}/${targetKey}` : "";
      const publicRootStatus = await probeUrlStatus(publicRootUrl);
      const appRouteUrl = buildAppRouteUrl(targetKey);
      const appRouteStatus = await probeUrlStatus(appRouteUrl);
      const sdkContractsExists = await probeContractsSdkExists(targetKey);
      const sourceKey = source.sourceKey && normalizeObjectKeyLike(source.sourceKey) !== targetKey ? normalizeObjectKeyLike(source.sourceKey) : null;
      const sourcePublicUrl = sourceKey ? resolvePublicStorageUrlFromKey(sourceKey) ?? `${PUBLIC_ROOT_BASE}/${sourceKey}` : "";
      const sourcePublicStatus = await probeUrlStatus(sourcePublicUrl);
      const sourceSdk = await probeContractsSdkExists(sourceKey);
      const targetExists = publicRootStatus === 200 || publicRootStatus === 206 || appRouteStatus === 200 || appRouteStatus === 206 || sdkContractsExists === true;
      const sourceExists = sourcePublicStatus === 200 || sourcePublicStatus === 206 || sourceSdk === true;
      const diagnosis = targetExists
        ? "ok"
        : sourceExists
          ? "recovered_by_fallback"
          : targetKey || sourceKey
            ? "missing_file"
            : "no_source";

      if (diagnosis !== "ok") {
        rows.push({
          kind: "track-audio",
          releaseId: release.id,
          title: asString(trackRow.title) ?? "",
          trackId,
          key: targetKey ?? source.sourceKey,
          publicRootUrl,
          publicRootStatus,
          appRouteStatus,
          sdkContractsExists,
          diagnosis,
          sourceReason: source.sourceReason,
          confidence: source.confidence
        });
      }
    }

    checked += 1;
    process.stderr.write(`checked ${checked}/${limited.length}\n`);
  }

  const outputRows: string[] = [];
  outputRows.push([
    "kind",
    "releaseId",
    "title",
    "trackId",
    "key",
    "publicRootUrl",
    "publicRootStatus",
    "appRouteStatus",
    "sdkContractsExists",
    "diagnosis",
    "sourceReason",
    "confidence"
  ].join(","));

  for (const row of rows) {
    outputRows.push([
      csvEscape(row.kind),
      csvEscape(row.releaseId),
      csvEscape(row.title),
      csvEscape(row.trackId),
      csvEscape(row.key),
      csvEscape(row.publicRootUrl),
      csvEscape(row.publicRootStatus),
      csvEscape(row.appRouteStatus),
      csvEscape(row.sdkContractsExists),
      csvEscape(row.diagnosis),
      csvEscape(row.sourceReason),
      csvEscape(row.confidence)
    ].join(","));
  }

  const output = `${outputRows.join("\n")}\n`;
  if (OUTPUT_PATH) {
    await writeFile(OUTPUT_PATH, output, "utf8");
  } else {
    process.stdout.write(output);
  }

  process.stderr.write(
    [
      `summary checked=${checked}`,
      `rows=${rows.length}`,
      `noS3Probe=${NO_S3_PROBE}`
    ].join(" ") + "\n"
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
  process.exitCode = 1;
});
