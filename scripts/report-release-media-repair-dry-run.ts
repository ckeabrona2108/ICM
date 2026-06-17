import { writeFile } from "node:fs/promises";

import {
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RELEASE_ID_FILTER = getArgValue("--release-id");
const LIMIT_RAW = getArgValue("--limit");
const OUTPUT_PATH = getArgValue("--output");
const FORMAT = (getArgValue("--format") ?? "json").toLowerCase();
const LIMIT = LIMIT_RAW ? Number(LIMIT_RAW) : null;
const COVER_PREFIXES = ["previews", "uploads", "covers", "contracts/previews", "contracts/uploads", "contracts/covers"] as const;
const AUDIO_PREFIXES = ["tracks", "uploads", "contracts/tracks", "contracts/uploads"] as const;
const COVER_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
const AUDIO_EXTENSIONS = ["wav", "mp3", "flac", "aac", "m4a", "aiff"] as const;
const S3_BUCKET_CANDIDATES = ["contracts", "uploads", "signatures", "verification"] as const;

type Status = "ok" | "missing" | "ambiguous";

type CandidateCheck = {
  source: string;
  candidates: string[];
  existing: string[];
  proposed: string | null;
  status: Status;
};

type ReleaseReport = {
  releaseId: string;
  currentPreview: string | null;
  proposedCoverKey: string | null;
  coverStatus: Status;
  currentAudio: Array<{ trackId: string; currentAudio: string | null }>;
  proposedAudioKey: Array<{ trackId: string; proposedAudioKey: string | null }>;
  audioStatus: Status;
  candidatesChecked: {
    cover: CandidateCheck[];
    audio: Array<{ trackId: string; check: CandidateCheck }>;
  };
};

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

async function resolveBucket(client: S3Client): Promise<string> {
  const configuredBucket = readStringEnv("S3_BUCKET", "S3_BUCKET_NAME", "MINIO_BUCKET", "MINIO_BUCKET_NAME");
  const candidates = [configuredBucket, ...S3_BUCKET_CANDIDATES]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);

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

async function listBucketKeys(client: S3Client, bucket: string): Promise<Set<string>> {
  const keys = new Set<string>();
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
      if (item.Key) keys.add(item.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!/[",\n\r]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function stripQueryHash(value: string): string {
  return value.split("?")[0]?.split("#")[0] ?? value;
}

function looksLikeOnlyExtension(value: string): boolean {
  return /^[a-z0-9]{2,8}$/iu.test(value.trim().replace(/^\./u, ""));
}

function normalizeExtension(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^\./u, "").toLowerCase();
  return /^[a-z0-9]{2,8}$/u.test(normalized) ? normalized : null;
}

function splitFileNameParts(value: string): { baseName: string; extension: string | null } {
  const trimmed = stripQueryHash(value.trim());
  const fileName = trimmed.split("/").filter(Boolean).at(-1) ?? "";
  if (!fileName) return { baseName: "", extension: null };
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return { baseName: fileName, extension: null };
  }
  return {
    baseName: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex + 1)
  };
}

function normalizeStoredKeyLike(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/api/storage/preview") || trimmed.startsWith("api/storage/preview")) {
    const query = trimmed.split("?")[1] ?? "";
    const key = new URLSearchParams(query).get("key");
    return key ? normalizeStoredKeyLike(decodeURIComponent(key)) : null;
  }
  if (trimmed.startsWith("/api/uploads/object/") || trimmed.startsWith("api/uploads/object/")) {
    return decodeURIComponent(trimmed.replace(/^\/?api\/uploads\/object\/+/u, ""));
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      return parsed.pathname.replace(/^\/+/u, "") || null;
    } catch {
      return trimmed.replace(/^\/+/u, "") || null;
    }
  }
  return trimmed.replace(/^\/+/u, "") || null;
}

function parseCandidateSource(rawValue: string, fallbackBaseName: string | null): {
  prefix: string | null;
  folderSegments: string[];
  baseName: string;
  extension: string | null;
} | null {
  const normalized = normalizeStoredKeyLike(rawValue);
  if (!normalized) {
    if (looksLikeOnlyExtension(rawValue)) {
      return {
        prefix: null,
        folderSegments: [],
        baseName: fallbackBaseName ?? "",
        extension: normalizeExtension(rawValue)
      };
    }
    return null;
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const fileName = segments.at(-1) ?? "";
  const fileParts = splitFileNameParts(fileName);
  const prefix =
    segments[0] === "contracts" && ["previews", "uploads", "covers", "tracks"].includes(segments[1] ?? "")
      ? `contracts/${segments[1]}`
      : ["previews", "uploads", "covers", "tracks"].includes(segments[0] ?? "")
        ? segments[0]
        : null;

  const folderSegments =
    prefix === null
      ? segments.slice(0, -1)
      : prefix.startsWith("contracts/")
        ? segments.slice(2, -1)
        : segments.slice(1, -1);

  const baseName = fileParts.baseName || fallbackBaseName || fileName;
  const extension = fileParts.extension;
  return { prefix, folderSegments, baseName, extension };
}

function buildOrderedExtensions(extensionHint: string | null, fallbackExtensions: readonly string[]): string[] {
  return unique([extensionHint, ...fallbackExtensions, ...fallbackExtensions.map((value) => value.toUpperCase())].filter(Boolean) as string[]);
}

function buildCandidatesFromSources(input: {
  rawValues: unknown[];
  fallbackBaseName: string;
  prefixes: readonly string[];
  fallbackExtensions: readonly string[];
}): string[] {
  const candidates: string[] = [];
  for (const rawValue of input.rawValues) {
    const raw = asString(rawValue);
    if (!raw) continue;
    const source = parseCandidateSource(raw, input.fallbackBaseName);
    if (!source) continue;
    const orderedExtensions = buildOrderedExtensions(source.extension, input.fallbackExtensions);
    const prefixOrder = source.prefix ? [source.prefix, ...input.prefixes.filter((prefix) => prefix !== source.prefix)] : [...input.prefixes];
    const folderPath = source.folderSegments.join("/");
    for (const prefix of prefixOrder) {
      for (const ext of orderedExtensions) {
        const key = `${prefix}${folderPath ? `/${folderPath}` : ""}/${source.baseName}.${ext}`;
        candidates.push(key);
      }
    }
  }
  return unique(candidates);
}

function collectReleaseSubmissionData(release: { roles: unknown }): Record<string, unknown> | null {
  const root = asRecord(release.roles);
  return asRecord(root?.submissionData);
}

function collectCoverSources(release: {
  id: string;
  preview: string | null;
  roles: unknown;
}): string[] {
  const root = asRecord(release.roles);
  const submission = collectReleaseSubmissionData(release);
  return [
    release.preview,
    submission?.coverUpload,
    asRecord(submission?.coverUpload)?.storageKey,
    asRecord(submission?.coverUpload)?.url,
    asRecord(submission?.coverUpload)?.key,
    asRecord(submission?.coverUpload)?.path,
    asRecord(submission?.coverUpload)?.filePath,
    root?.coverUpload,
    asRecord(root?.coverUpload)?.storageKey,
    asRecord(root?.coverUpload)?.url,
    asRecord(root?.coverUpload)?.key,
    asRecord(root?.coverUpload)?.path,
    asRecord(root?.coverUpload)?.filePath,
    submission?.cover,
    root?.cover,
    submission?.coverImage,
    root?.coverImage
  ]
    .map((value) => (typeof value === "string" ? value : null))
    .filter((value): value is string => Boolean(value));
}

function collectTrackAudioSources(track: Record<string, unknown>, submissionTrack: Record<string, unknown> | null): string[] {
  return [
    submissionTrack?.audioFile,
    submissionTrack?.audioUpload,
    submissionTrack?.audioUrl,
    submissionTrack?.audio,
    submissionTrack?.track,
    track.audioFile,
    track.audioUpload,
    track.audioUrl,
    track.audio,
    track.track
  ]
    .map((value) => (typeof value === "string" ? value : null))
    .filter((value): value is string => Boolean(value));
}

function pickCurrentValue(values: string[]): string | null {
  return values.find((value) => Boolean(value.trim())) ?? null;
}

function summarizeCandidateCheck(source: string, candidates: string[], existingKeys: Set<string>): CandidateCheck {
  const existing = candidates.filter((candidate) => existingKeys.has(candidate));
  return {
    source,
    candidates,
    existing,
    proposed: existing.length === 1 ? existing[0] ?? null : null,
    status: existing.length === 1 ? "ok" : existing.length === 0 ? "missing" : "ambiguous"
  };
}

function aggregateStatus(statuses: Status[]): Status {
  if (statuses.includes("ambiguous")) return "ambiguous";
  if (statuses.includes("missing")) return "missing";
  return "ok";
}

async function main() {
  const client = createS3Client();
  if (!client) {
    throw new Error("S3 credentials are missing. Check S3_HOST, S3_ACCESS_KEY and S3_SECRET_KEY.");
  }

  const bucket = await resolveBucket(client);
  const existingKeys = await listBucketKeys(client, bucket);

  const releases = await prisma.release.findMany({
    select: {
      id: true,
      preview: true,
      roles: true,
      track: {
        select: {
          id: true,
          index: true,
          track: true,
          roles: true,
          title: true
        },
        orderBy: { index: "asc" }
      }
    },
    orderBy: { date: "asc" }
  });

  const filtered = RELEASE_ID_FILTER ? releases.filter((release) => release.id === RELEASE_ID_FILTER) : releases;
  const limited = typeof LIMIT === "number" && Number.isFinite(LIMIT) ? filtered.slice(0, Math.max(0, LIMIT)) : filtered;

  const rows: ReleaseReport[] = [];
  const summary = {
    releases: limited.length,
    cover: { ok: 0, missing: 0, ambiguous: 0 },
    audio: { ok: 0, missing: 0, ambiguous: 0 }
  };

  for (const release of limited) {
    const releaseRecord = asRecord(release.roles);
    const submission = collectReleaseSubmissionData(release);
    const coverSources = collectCoverSources(release);
    const coverCandidates = buildCandidatesFromSources({
      rawValues: coverSources,
      fallbackBaseName: release.id,
      prefixes: COVER_PREFIXES,
      fallbackExtensions: COVER_EXTENSIONS
    });
    const coverCheck = summarizeCandidateCheck("cover", coverCandidates, existingKeys);
    summary.cover[coverCheck.status] += 1;

    const submissionTracks = Array.isArray(submission?.tracks) ? submission?.tracks : [];
    const currentAudio: Array<{ trackId: string; currentAudio: string | null }> = [];
    const proposedAudioKey: Array<{ trackId: string; proposedAudioKey: string | null }> = [];
    const audioChecks: Array<{ trackId: string; check: CandidateCheck }> = [];
    const audioStatuses: Status[] = [];

    for (const track of release.track) {
      const trackRecord = asRecord(track) ?? {};
      const trackIndex = Number(trackRecord.index);
      const submissionTrack = Number.isFinite(trackIndex) ? asRecord(submissionTracks[trackIndex]) ?? null : null;
      const sources = collectTrackAudioSources(trackRecord, submissionTrack);
      const candidates = buildCandidatesFromSources({
        rawValues: sources,
        fallbackBaseName: asString(trackRecord.id) ?? `track-${(Number(trackRecord.index) || 0) + 1}`,
        prefixes: AUDIO_PREFIXES,
        fallbackExtensions: AUDIO_EXTENSIONS
      });
      const check = summarizeCandidateCheck(`track:${asString(trackRecord.id) ?? ""}`, candidates, existingKeys);
      audioChecks.push({ trackId: asString(trackRecord.id) ?? "", check });
      currentAudio.push({
        trackId: asString(trackRecord.id) ?? "",
        currentAudio: pickCurrentValue(sources)
      });
      proposedAudioKey.push({
        trackId: asString(trackRecord.id) ?? "",
        proposedAudioKey: check.proposed
      });
      audioStatuses.push(check.status);
    }

    const audioStatus = aggregateStatus(audioStatuses.length > 0 ? audioStatuses : ["missing"]);
    summary.audio[audioStatus] += 1;

    rows.push({
      releaseId: release.id,
      currentPreview: asString(release.preview),
      proposedCoverKey: coverCheck.proposed,
      coverStatus: coverCheck.status,
      currentAudio,
      proposedAudioKey,
      audioStatus,
      candidatesChecked: {
        cover: [coverCheck],
        audio: audioChecks
      }
    });
  }

  const output =
    FORMAT === "csv"
      ? toCsv(rows)
      : JSON.stringify(
          {
            dryRun: true,
            bucket,
            summary,
            rows
          },
          null,
          2
        ) + "\n";

  if (OUTPUT_PATH) {
    await writeFile(OUTPUT_PATH, output, "utf8");
  } else {
    process.stdout.write(output);
  }

  await prisma.$disconnect();
}

function toCsv(rows: ReleaseReport[]): string {
  const headers = [
    "releaseId",
    "currentPreview",
    "proposedCoverKey",
    "coverStatus",
    "currentAudio",
    "proposedAudioKey",
    "audioStatus",
    "candidatesChecked"
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.releaseId),
        csvEscape(row.currentPreview),
        csvEscape(row.proposedCoverKey),
        csvEscape(row.coverStatus),
        csvEscape(row.currentAudio),
        csvEscape(row.proposedAudioKey),
        csvEscape(row.audioStatus),
        csvEscape(row.candidatesChecked)
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
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
