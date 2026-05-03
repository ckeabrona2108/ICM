import type { CabinetRelease } from "@/lib/cabinet-types";

interface SubmissionTrackPersonLike {
  name?: string;
  role?: string;
}

interface SubmissionTrackLike {
  title?: string;
  subtitle?: string;
  isrc?: string;
  partnerCode?: string;
  trackPersons?: SubmissionTrackPersonLike[];
  copyrightPct?: string;
  relatedRightsPct?: string;
  previewStart?: string;
  focusTrack?: boolean;
  versionExplicit?: boolean;
  metadataLanguage?: string;
}

interface SubmissionDataLike {
  tracks?: SubmissionTrackLike[];
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

function formatSharePercent(value: string | undefined): string {
  const raw = (value ?? "").trim().replace(",", ".");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return "Данные не указаны";
  const clamped = Math.min(100, Math.max(0, parsed));
  return `${clamped.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
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
    if (role.includes("соисполн")) {
      grouped.coPerformer.push(name);
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
  const submissionTrack =
    parsedSubmission?.tracks?.[Math.max(0, trackNum - 1)] ?? null;

  const trackPersons = submissionTrack?.trackPersons ?? [];
  const grouped = groupTrackPersons(trackPersons);

  return {
    num: trackNum,
    title: submissionTrack?.title?.trim() || baseTrack.title || "Данные не указаны",
    subtitle: submissionTrack?.subtitle?.trim() || "Данные не указаны",
    identification: {
      isrc:
        submissionTrack?.isrc?.trim() ||
        release.isrc?.trim() ||
        "Данные не указаны",
      partnerCode: submissionTrack?.partnerCode?.trim() || "Данные не указаны"
    },
    roles: grouped,
    rights: {
      copyrightPct: formatSharePercent(submissionTrack?.copyrightPct),
      relatedRightsPct: formatSharePercent(submissionTrack?.relatedRightsPct)
    },
    additional: {
      focusTrack: Boolean(submissionTrack?.focusTrack),
      previewStart: submissionTrack?.previewStart?.trim() || "Данные не указаны",
      explicit: Boolean(submissionTrack?.versionExplicit),
      language:
        submissionTrack?.metadataLanguage?.trim() || "Данные не указаны"
    }
  };
}

