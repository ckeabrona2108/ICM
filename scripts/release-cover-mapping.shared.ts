import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { discoverStorageKeyByUserPrefix, probeStorageKeyDiagnostics } from "@/lib/s3";
import { normalizeReleaseCoverStorageKey } from "@/lib/release-cover";

export type CoverMappingConfidence = "high" | "medium" | "low" | "none";

export type ReleaseCoverMappingRow = {
  releaseId: string;
  currentPreview: string;
  sourceKey: string;
  targetKey: string;
  sourceExists: boolean;
  targetExists: boolean;
  canCopy: boolean;
  confidence: CoverMappingConfidence;
  sourceReason: string;
};

export type ReleaseCoverSourceRow = {
  id: string;
  preview: string | null;
  title: string;
  userId: string;
  roles: unknown;
  track: Array<{
    id: string;
    index: number;
    title: string;
    track: string | null;
    roles: unknown;
  }>;
};

export type ShellHistoryCoverSource = {
  releaseId: string;
  sourceKey: string;
  lineNumber: number;
  rawLine: string;
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (!/[",\n\r]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function parseCsv(content: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  const pushField = () => {
    currentRow.push(currentField);
    currentField = "";
  };

  const pushRow = () => {
    rows.push(currentRow);
    currentRow = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }

    if (char === "\n") {
      pushField();
      if (currentRow.length > 0 || currentField.length > 0) {
        pushRow();
      } else {
        currentRow = [];
      }
      continue;
    }

    if (char === "\r") {
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    pushField();
    pushRow();
  }

  if (rows.length === 0) return [];
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((value) => value.trim());

  return dataRows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

export function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

export function splitFileExtension(value: string | null | undefined): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const base = raw.split("?")[0]?.split("#")[0] ?? raw;
  const fileName = base.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return null;
  const extension = fileName.slice(dotIndex + 1).trim().toLowerCase();
  return /^[a-z0-9]{2,8}$/u.test(extension) ? extension : null;
}

export function buildTargetKeyFromSourceKey(releaseId: string, sourceKey: string | null | undefined): string | null {
  const extension = splitFileExtension(sourceKey);
  if (!extension) return null;
  return `previews/${releaseId}.${extension}`;
}

export function normalizeCurrentPreviewToTargetKey(
  currentPreview: string | null | undefined,
  releaseId: string
): string | null {
  const normalized = normalizeReleaseCoverStorageKey(currentPreview ?? null, releaseId);
  return normalized && normalized.startsWith("previews/") ? normalized : null;
}

export function extractExactStoredKeyCandidate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;

  if (raw.startsWith("/api/uploads/object/")) {
    return decodeURIComponent(raw.replace(/^\/api\/uploads\/object\//u, "").split("?")[0]?.split("#")[0] ?? "");
  }

  if (raw.startsWith("api/uploads/object/")) {
    return decodeURIComponent(raw.replace(/^api\/uploads\/object\//u, "").split("?")[0]?.split("#")[0] ?? "");
  }

  if (raw.startsWith("/api/storage/preview") || raw.startsWith("api/storage/preview")) {
    const query = raw.split("?")[1] ?? "";
    const key = new URLSearchParams(query).get("key");
    return key ? decodeURIComponent(key) : null;
  }

  const normalized = raw.replace(/^\//u, "");
  if (
    normalized.startsWith("uploads/") ||
    normalized.startsWith("covers/") ||
    normalized.startsWith("previews/") ||
    normalized.startsWith("tracks/") ||
    normalized.startsWith("audio/") ||
    normalized.startsWith("audios/")
  ) {
    return normalized.split("?")[0]?.split("#")[0] ?? null;
  }

  return null;
}

function extractStoredFileCandidateFromRecord(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return extractExactStoredKeyCandidate(value);
  }
  const record = value as Record<string, unknown>;
  return (
    extractExactStoredKeyCandidate(record.storageKey) ??
    extractExactStoredKeyCandidate(record.key) ??
    extractExactStoredKeyCandidate(record.path) ??
    extractExactStoredKeyCandidate(record.filePath) ??
    extractExactStoredKeyCandidate(record.url)
  );
}

export async function readShellHistoryCoverSources(): Promise<ShellHistoryCoverSource[]> {
  const historyPath = process.env.HISTFILE?.trim() || path.join(os.homedir(), ".zsh_history");
  try {
    const content = await readFile(historyPath, "utf8");
    const lines = content.split(/\r?\n/u);
    const entries: ShellHistoryCoverSource[] = [];

    lines.forEach((line, index) => {
      if (!line.includes("--cover-source-key") || !line.includes("--release-id")) return;
      const releaseIdMatch = line.match(/--release-id(?:=|\s+)([^\s\\]+)/u);
      const sourceKeyMatch = line.match(/--cover-source-key(?:=|\s+)([^\s\\]+)/u);
      const releaseId = releaseIdMatch?.[1]?.trim() ?? "";
      const sourceKey = sourceKeyMatch?.[1]?.trim() ?? "";
      if (!releaseId || !sourceKey) return;
      entries.push({
        releaseId,
        sourceKey: decodeURIComponent(sourceKey),
        lineNumber: index + 1,
        rawLine: line
      });
    });

    return entries;
  } catch {
    return [];
  }
}

async function probeExistsForKey(key: string | null | undefined): Promise<boolean> {
  const normalized = asString(key);
  if (!normalized) return false;
  const probe = await probeStorageKeyDiagnostics({
    storageKey: normalized
  });
  return probe.sdkHeadExists === true || probe.finalDiagnosis === "ok";
}

function determineConfidence(sourceKind: "shell-history" | "explicit" | "s3-prefix" | "missing"): CoverMappingConfidence {
  if (sourceKind === "shell-history" || sourceKind === "explicit") return "high";
  if (sourceKind === "s3-prefix") return "medium";
  return "none";
}

export async function resolveReleaseCoverMapping(input: {
  release: ReleaseCoverSourceRow;
  shellHistoryByReleaseId: Map<string, ShellHistoryCoverSource>;
  noS3Probe?: boolean;
}): Promise<ReleaseCoverMappingRow> {
  const currentPreview = asString(input.release.preview) ?? "";
  const releaseId = input.release.id;
  const root = asRecord(input.release.roles);
  const submission = asRecord(root?.submissionData);

  const history = input.shellHistoryByReleaseId.get(releaseId) ?? null;
  const roleCandidates: Array<{ reason: string; raw: unknown }> = [
    { reason: "roles.coverUpload", raw: root?.coverUpload },
    { reason: "roles.submissionData.coverUpload", raw: submission?.coverUpload },
    { reason: "roles.submissionData.cover", raw: submission?.cover },
    { reason: "roles.cover", raw: root?.cover }
  ];

  let sourceKey: string | null = null;
  let sourceReason = "missing";
  let sourceKind: "shell-history" | "explicit" | "s3-prefix" | "missing" = "missing";

  if (history?.sourceKey) {
    sourceKey = history.sourceKey;
    sourceReason = `shell-history:line-${history.lineNumber}`;
    sourceKind = "shell-history";
  } else {
    for (const candidate of roleCandidates) {
      const extracted = extractStoredFileCandidateFromRecord(candidate.raw);
      if (!extracted) continue;
      sourceKey = extracted;
      sourceReason = candidate.reason;
      sourceKind = "explicit";
      break;
    }
  }

  const probeDisabled = Boolean(input.noS3Probe);

  if (!sourceKey && !probeDisabled) {
    const discovered = await discoverStorageKeyByUserPrefix({
      userId: input.release.userId,
      kind: "cover",
      releaseId,
      releaseTitle: input.release.title
    });
    if (discovered) {
      sourceKey = discovered;
      sourceReason = `s3-prefix:${input.release.userId}`;
      sourceKind = "s3-prefix";
    }
  }

  const targetKey =
    normalizeCurrentPreviewToTargetKey(currentPreview, releaseId) ??
    buildTargetKeyFromSourceKey(releaseId, sourceKey);

  let sourceExists = false;
  let targetExists = false;

  if (!probeDisabled) {
    [sourceExists, targetExists] = await Promise.all([
      probeExistsForKey(sourceKey),
      probeExistsForKey(targetKey)
    ]);
  } else {
    sourceReason = sourceReason === "missing" ? "s3-probe-disabled" : `${sourceReason};s3-probe-disabled`;
  }

  const confidence = determineConfidence(sourceKind);
  const canCopy =
    !probeDisabled &&
    Boolean(sourceKey) &&
    Boolean(targetKey) &&
    sourceExists &&
    !targetExists &&
    confidence === "high";

  return {
    releaseId,
    currentPreview,
    sourceKey: sourceKey ?? "",
    targetKey: targetKey ?? "",
    sourceExists,
    targetExists,
    canCopy,
    confidence,
    sourceReason
  };
}

export function parseCsvBoolean(value: string | null | undefined): boolean {
  const raw = (value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}
