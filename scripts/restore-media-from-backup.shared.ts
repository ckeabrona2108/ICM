import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import { getReleaseCoverAsset } from "@/lib/release-cover";
import { resolveRenderableStoredFileUrl } from "@/lib/s3";

const execFileAsync = promisify(execFile);

type PgConnectionInfo = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  schema: string | null;
  sslmode: string | null;
  rawUrl: string;
};

export type ReleaseRow = {
  id: string;
  title: string;
  preview: string;
  roles: unknown;
  date: Date;
  startDate: Date;
  userId: string;
  track: Array<TrackRow>;
};

export type TrackRow = {
  id: string;
  title: string;
  track: string;
  text: string | null;
  text_sync: string | null;
  ringtone: string | null;
  video: string | null;
  video_shot: string | null;
  roles: unknown;
  index: number;
};

export type ReleasePreviewReportRow = {
  releaseId: string;
  title: string;
  currentPreview: string;
  backupPreview: string;
  backupPreviewHttpStatus: number | null;
  canRestore: boolean;
};

export type TrackAudioReportRow = {
  releaseId: string;
  title: string;
  trackId: string;
  currentTrack: string;
  backupTrack: string;
  currentAudioRefs: string;
  backupAudioRefs: string;
  expectedBackupAudioUrl: string;
  backupAudioHttpStatus: number | null;
  canRestore: boolean;
};

function readStringEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (!/[",\n\r]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getBackupPathFromArgs(): string {
  const backupPath = getArgValue("--backup");
  if (!backupPath) {
    throw new Error("Backup path is required. Pass --backup /path/to/icecream.backup");
  }
  return path.resolve(backupPath);
}

export function getReleaseIdFilter(): string | null {
  return getArgValue("--release-id");
}

export function getLimitFromArgs(): number | null {
  const raw = getArgValue("--limit");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function getAppBaseUrl(): string {
  return (
    readStringEnv("NEXTAUTH_URL", "NEXT_PUBLIC_DOMAIN", "NEXT_PUBLIC_APP_URL") ??
    "http://localhost:3000"
  );
}

export async function probeRenderableUrl(url: string): Promise<number | null> {
  try {
    const response = await fetch(new URL(url, getAppBaseUrl()).href, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      cache: "no-store"
    });
    return response.status;
  } catch {
    return null;
  }
}

function toEndpointUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;
  if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) return rawValue;
  const useSsl = (process.env.S3_USE_SSL ?? "true").trim().toLowerCase();
  const sslEnabled = !["0", "false", "no", "off"].includes(useSsl);
  return `${sslEnabled ? "https" : "http"}://${rawValue}`;
}

function parsePgConnection(rawUrl: string): PgConnectionInfo {
  const url = new URL(rawUrl);
  const schema = url.searchParams.get("schema");
  const sslmode = url.searchParams.get("sslmode");
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\/+/u, "")),
    schema,
    sslmode,
    rawUrl
  };
}

export function getCurrentDatabaseInfo(): PgConnectionInfo {
  const databaseUrl = readStringEnv("DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  return parsePgConnection(databaseUrl);
}

export function buildTempDatabaseUrl(base: PgConnectionInfo, database: string): string {
  const url = new URL(base.rawUrl);
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.toString();
}

export function buildTempDatabaseName(prefix: string): string {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-z0-9_]/giu, "_");
  return `${prefix}_${suffix}`.slice(0, 63);
}

async function runPgCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await execFileAsync(command, args, { env, maxBuffer: 10 * 1024 * 1024 });
}

async function runPgSql(base: PgConnectionInfo, database: string, sql: string): Promise<void> {
  await runPgCommand(
    "psql",
    [
      "--host",
      base.host,
      "--port",
      String(base.port),
      "--username",
      base.user,
      "--dbname",
      database,
      "--command",
      sql
    ],
    { ...process.env, PGPASSWORD: base.password }
  );
}

export async function createTempDatabase(base: PgConnectionInfo, database: string): Promise<void> {
  await runPgCommand(
    "createdb",
    ["--host", base.host, "--port", String(base.port), "--username", base.user, database],
    { ...process.env, PGPASSWORD: base.password }
  );
}

export async function restoreBackupToTempDatabase(
  base: PgConnectionInfo,
  database: string,
  backupPath: string
): Promise<void> {
  const schemaName = base.schema ?? "icecream";
  await runPgSql(
    base,
    database,
    [
      `CREATE SCHEMA IF NOT EXISTS ${JSON.stringify(schemaName)};`,
      "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
      `DO $$ BEGIN CREATE TYPE ${JSON.stringify(schemaName)}.order_type AS ENUM ('subscription', 'release'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE ${JSON.stringify(schemaName)}.release_status AS ENUM ('moderating', 'approved', 'rejected', 'not_paid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE ${JSON.stringify(schemaName)}.release_type AS ENUM ('single', 'album', 'ep'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE ${JSON.stringify(schemaName)}.subscribe_level AS ENUM ('standard', 'professional', 'premium', 'enterprise'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE ${JSON.stringify(schemaName)}.token_types AS ENUM ('confirm', 'recover'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE ${JSON.stringify(schemaName)}.verification_status AS ENUM ('moderating', 'approved', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE ${JSON.stringify(schemaName)}."AnalyticsImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'PARTIAL', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
    ].join(" ")
  );

  await runPgCommand(
    "pg_restore",
    [
      "--host",
      base.host,
      "--port",
      String(base.port),
      "--username",
      base.user,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--dbname",
      database,
      backupPath
    ],
    { ...process.env, PGPASSWORD: base.password }
  );
}

export async function dropTempDatabase(base: PgConnectionInfo, database: string): Promise<void> {
  await runPgCommand(
    "dropdb",
    ["--force", "--host", base.host, "--port", String(base.port), "--username", base.user, database],
    { ...process.env, PGPASSWORD: base.password }
  );
}

export function createBackupPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });
}

function normalizeStorageKeyCandidate(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return null;
  if (normalized.startsWith("/")) return null;
  const isSimpleFile = !normalized.includes("/") && /\.[a-z0-9]{2,8}$/iu.test(normalized);
  if (!normalized.includes("/") && !isSimpleFile) return null;
  const segments = normalized.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === ".." || segment.includes("\\"))
  ) {
    return null;
  }
  return segments.join("/");
}

function fileNameFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, "http://localhost");
    const candidate = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return candidate ? decodeURIComponent(candidate) : null;
  } catch {
    return null;
  }
}

function pickLegacyFileRef(value: unknown): { storageKey: string | null; url: string | null; fileName: string | null } {
  const asValue = asString(value);
  if (!asValue) return { storageKey: null, url: null, fileName: null };
  if (asValue.startsWith("http://") || asValue.startsWith("https://") || asValue.startsWith("/")) {
    const resolved = resolveRenderableStoredFileUrl({ url: asValue, storageKey: null });
    return {
      storageKey: null,
      url: resolved,
      fileName: fileNameFromUrl(resolved) ?? fileNameFromUrl(asValue)
    };
  }

  const storageKey = normalizeStorageKeyCandidate(asValue);
  if (!storageKey) return { storageKey: null, url: null, fileName: null };
  return {
    storageKey,
    url: resolveRenderableStoredFileUrl({ storageKey }),
    fileName: fileNameFromUrl(storageKey)
  };
}

function pickStoredFileRef(input: unknown): { storageKey: string | null; url: string | null; fileName: string | null } {
  if (typeof input === "string") {
    return pickLegacyFileRef(input);
  }
  const source = asRecord(input);
  if (!source) return { storageKey: null, url: null, fileName: null };

  const rawUrl = asString(source.url);
  const rawStorageKey =
    asString(source.storageKey) ??
    asString(source.key) ??
    asString(source.path) ??
    asString(source.filePath);
  const rawFileName = asString(source.fileName) ?? asString(source.filename);

  const storageKey = normalizeStorageKeyCandidate(rawStorageKey) ?? normalizeStorageKeyCandidate(rawUrl);
  const resolvedUrl = storageKey
    ? resolveRenderableStoredFileUrl({ storageKey })
    : resolveRenderableStoredFileUrl({ url: rawUrl, storageKey: null });
  const fileName = rawFileName ?? fileNameFromUrl(rawUrl) ?? fileNameFromUrl(resolvedUrl);

  return { storageKey, url: resolvedUrl, fileName };
}

function buildTrackAudioCandidateUrls(track: Record<string, unknown>): string[] {
  const candidates = new Set<string>();
  const addCandidate = (value: unknown) => {
    if (typeof value === "string") {
      const resolved = resolveRenderableStoredFileUrl({ url: value, storageKey: null });
      if (resolved) candidates.add(resolved);
      return;
    }
    const ref = pickStoredFileRef(value);
    if (ref.url) candidates.add(ref.url);
    if (ref.storageKey) {
      const resolved = resolveRenderableStoredFileUrl({ storageKey: ref.storageKey });
      if (resolved) candidates.add(resolved);
    }
  };

  addCandidate(track.audioFile);
  addCandidate(track.audioUpload);
  addCandidate(track.audioUrl);
  addCandidate(track.audio);

  const trackId = asString(track.id);
  const extHint = asString(track.track)?.trim().replace(/^\./u, "").toLowerCase() ?? null;
  const fileName = asString(track.fileName);
  const fileNames = new Set<string>();
  if (fileName) fileNames.add(fileName);
  if (trackId && extHint) fileNames.add(`${trackId}.${extHint}`);

  const prefixes = ["tracks/", "audio/", "audios/", "uploads/"];
  for (const name of fileNames) {
    candidates.add(name);
    for (const prefix of prefixes) {
      candidates.add(`${prefix}${name}`);
    }
  }

  return Array.from(candidates).filter(Boolean);
}

function buildTrackAudioUrl(track: Record<string, unknown>): string | null {
  const candidates = buildTrackAudioCandidateUrls(track);
  return candidates[0] ?? null;
}

export function summarizeTrackAudioRefs(track: TrackRow): string {
  return JSON.stringify(
    {
      audioFile: asRecord(track.roles)?.audioFile ?? null,
      audioUpload: asRecord(track.roles)?.audioUpload ?? null,
      audioUrl: asRecord(track.roles)?.audioUrl ?? null,
      audio: asRecord(track.roles)?.audio ?? null,
      track: track.track,
      text: track.text,
      text_sync: track.text_sync,
      ringtone: track.ringtone,
      video: track.video,
      video_shot: track.video_shot
    },
    null,
    0
  );
}

export async function resolveBackupReleasePreview(release: ReleaseRow): Promise<{
  dbValue: string | null;
  resolvedUrl: string | null;
  candidateUrls: string[];
}> {
  const asset = await getReleaseCoverAsset({
    id: release.id,
    preview: release.preview,
    roles: release.roles
  });
  return {
    dbValue: release.preview?.trim() || null,
    resolvedUrl: asset.url,
    candidateUrls: asset.candidateUrls
  };
}

export function resolveBackupTrackAudio(track: TrackRow): {
  dbValue: string | null;
  resolvedUrl: string | null;
  candidateUrls: string[];
} {
  return {
    dbValue: track.track?.trim() || null,
    resolvedUrl: buildTrackAudioUrl({
      id: track.id,
      track: track.track,
      fileName: null,
      audioFile: asRecord(track.roles)?.audioFile ?? null,
      audioUpload: asRecord(track.roles)?.audioUpload ?? null,
      audioUrl: asRecord(track.roles)?.audioUrl ?? null,
      audio: asRecord(track.roles)?.audio ?? null
    }),
    candidateUrls: buildTrackAudioCandidateUrls({
      id: track.id,
      track: track.track,
      fileName: null,
      audioFile: asRecord(track.roles)?.audioFile ?? null,
      audioUpload: asRecord(track.roles)?.audioUpload ?? null,
      audioUrl: asRecord(track.roles)?.audioUrl ?? null,
      audio: asRecord(track.roles)?.audio ?? null
    })
  };
}

export function buildReleaseRowQuery() {
  return {
    select: {
      id: true,
      title: true,
      preview: true,
      roles: true,
      date: true,
      startDate: true,
      userId: true,
      track: {
        orderBy: { index: "asc" as const },
        select: {
          id: true,
          title: true,
          track: true,
          text: true,
          text_sync: true,
          ringtone: true,
          video: true,
          video_shot: true,
          roles: true,
          index: true
        }
      }
    }
  } as const;
}

export function toReleaseRows(input: Array<ReleaseRow>): Array<ReleaseRow> {
  return input.map((release) => ({
    ...release,
    track: asArray<TrackRow>(release.track)
  }));
}

export async function fetchReleaseRows(client: PrismaClient): Promise<Array<ReleaseRow>> {
  const releases = await client.release.findMany(buildReleaseRowQuery());
  return releases as unknown as Array<ReleaseRow>;
}
