import type { CabinetRelease } from "@/lib/cabinet-types";

interface SubmissionTrackPersonLike {
  name?: string;
  role?: string;
}

interface SubmissionDataLike {
  tracks?: unknown[];
}

export interface TrackQuickPreviewData {
  num: number;
  title: string;
  subtitle: string;
  identification: {
    isrc: string;
    partnerCode: string;
  };
  roles: {
    performer: string[];
    feat: string[];
    remixer: string[];
    coPerformer: string[];
    producer: string[];
    musicAuthor: string[];
    lyricsAuthor: string[];
  };
  rights: {
    copyrightPct: string;
    relatedRightsPct: string;
  };
  additional: {
    focusTrack: boolean;
    previewStart: string;
    explicit: boolean;
    language: string;
  };
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

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

function normalizeRole(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function uniqueNames(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function parseSubmissionData(value: unknown): SubmissionDataLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as SubmissionDataLike;
}

function formatSharePercent(value: unknown): string {
  const raw = typeof value === "number" ? String(value) : (asString(value) ?? "").replace(",", ".");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return "Данные не указаны";
  const clamped = Math.min(100, Math.max(0, parsed));
  return `${clamped.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
}

function formatLanguageLabel(value: string | null): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return "Данные не указаны";
  if (["ru", "rus", "russian", "русский"].includes(normalized)) return "Русский";
  if (["en", "eng", "english", "английский"].includes(normalized)) return "Английский";
  return value?.trim() || "Данные не указаны";
}

function readStringFromRecords(records: Array<Record<string, unknown> | null>, keys: string[]): string | null {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = asString(record[key]);
      if (value) return value;
    }
  }
  return null;
}

function readBooleanFromRecords(records: Array<Record<string, unknown> | null>, keys: string[]): boolean | undefined {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = asBoolean(record[key]);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function collectTrackPersons(records: Array<Record<string, unknown> | null>): SubmissionTrackPersonLike[] {
  const persons: SubmissionTrackPersonLike[] = [];

  for (const record of records) {
    if (!record) continue;
    for (const key of ["trackPersons", "track_persons", "persons", "contributors"]) {
      const raw = record[key];
      if (!Array.isArray(raw)) continue;
      for (const item of raw) {
        const source = asRecord(item);
        if (!source) continue;
        const name = asString(source.name);
        const role = asString(source.role);
        if (!name || !role) continue;
        persons.push({ name, role });
      }
    }
  }

  return persons;
}

function groupTrackPersons(persons: SubmissionTrackPersonLike[]) {
  const grouped = {
    performer: [] as string[],
    feat: [] as string[],
    remixer: [] as string[],
    coPerformer: [] as string[],
    producer: [] as string[],
    musicAuthor: [] as string[],
    lyricsAuthor: [] as string[]
  };

  for (const person of persons) {
    const name = person.name?.trim() ?? "";
    const role = normalizeRole(person.role ?? "");
    if (!name || !role) continue;

    if (role === "автор" || role === "автор текста") {
      continue;
    }
    if (role.includes("соисполн")) {
      grouped.coPerformer.push(name);
      continue;
    }
    if (role.includes("исполн")) {
      grouped.performer.push(name);
      continue;
    }
    if (role.includes("feat")) {
      grouped.feat.push(name);
      continue;
    }
    if (role.includes("remix")) {
      grouped.remixer.push(name);
      continue;
    }
    if (role.includes("продюсер") || role.includes("producer")) {
      grouped.producer.push(name);
      continue;
    }
    if (role.includes("автор музыки") || role.includes("composer")) {
      grouped.musicAuthor.push(name);
      continue;
    }
    if (
      role.includes("автор слов") ||
      role.includes("lyricist") ||
      role.includes("lyrics author")
    ) {
      grouped.lyricsAuthor.push(name);
    }
  }

  return {
    performer: uniqueNames(grouped.performer),
    feat: uniqueNames(grouped.feat),
    remixer: uniqueNames(grouped.remixer),
    coPerformer: uniqueNames(grouped.coPerformer),
    producer: uniqueNames(grouped.producer),
    musicAuthor: uniqueNames(grouped.musicAuthor),
    lyricsAuthor: uniqueNames(grouped.lyricsAuthor)
  };
}

export function buildTrackQuickPreviewData(
  release: CabinetRelease,
  trackNum: number
): TrackQuickPreviewData | null {
  const baseTrack = release.tracks.find((track) => track.num === trackNum);
  if (!baseTrack) return null;

  const parsedSubmission = parseSubmissionData(release.submissionData);
  const submissionTrack = asRecord(parsedSubmission?.tracks?.[Math.max(0, trackNum - 1)] ?? null);
  const baseTrackRecord = asRecord(baseTrack);
  const sources = [submissionTrack, baseTrackRecord];

  const grouped = groupTrackPersons(collectTrackPersons(sources));

  return {
    num: trackNum,
    title:
      readStringFromRecords(sources, ["title", "fileName", "file_name"]) ||
      baseTrack.title ||
      "Данные не указаны",
    subtitle: readStringFromRecords(sources, ["subtitle"]) || "Данные не указаны",
    identification: {
      isrc:
        readStringFromRecords(sources, ["isrc"]) ||
        release.isrc?.trim() ||
        "Данные не указаны",
      partnerCode:
        readStringFromRecords(sources, ["partnerCode", "partner_code"]) ||
        "Данные не указаны"
    },
    roles: grouped,
    rights: {
      copyrightPct: formatSharePercent(
        readStringFromRecords(sources, ["copyrightPct", "copyright_pct", "author_rights"])
      ),
      relatedRightsPct: formatSharePercent(
        readStringFromRecords(sources, ["relatedRightsPct", "related_rights_pct", "related_rights", "neighboringRights"])
      )
    },
    additional: {
      focusTrack: Boolean(readBooleanFromRecords(sources, ["focusTrack", "focus_track", "focus"])),
      previewStart:
        readStringFromRecords(sources, ["previewStart", "preview_start"]) ||
        "Данные не указаны",
      explicit: Boolean(readBooleanFromRecords(sources, ["versionExplicit", "version_explicit", "explicit"])),
      language: formatLanguageLabel(
        readStringFromRecords(sources, ["metadataLanguage", "metadata_language", "language"])
      )
    }
  };
}
