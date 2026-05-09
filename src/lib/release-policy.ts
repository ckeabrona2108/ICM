import { z } from "zod";

import {
  allReleasePlatformCodes,
  streamingPlatformCodes
} from "@/lib/release-platforms";
import {
  isAllowedReleasePersonRole,
  isAllowedTrackPersonRole
} from "@/lib/person-roles";

export const releaseLifecycleStatuses = [
  "draft",
  "pending_verification",
  "moderation",
  "changes_required",
  "approved",
  "distributed",
  "archived",
  "rejected"
] as const;

export type ReleaseLifecycleStatus = (typeof releaseLifecycleStatuses)[number];

export const releaseTypeSchema = z.enum(["single", "ep", "album"]);
export const releaseKindSchema = z.enum([
  "standard",
  "single_maxi",
  "mixtape",
  "audiobook"
]);
export const territoryModeSchema = z.enum(["all", "selected", "exclude", "cis"]);
export const platformModeSchema = z.enum(["all", "selected"]);

function isAcceptableUploadedFileUrl(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (normalized.startsWith("/api/uploads/object/")) return true;

  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const personSchema = z.object({
  name: z.string().trim(),
  role: z.string().trim()
});

const coverMetaSchema = z.object({
  mimeType: z.string().trim(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dpi: z.number().positive().optional()
});

const uploadedFileSchema = z.object({
  storageKey: z.string().trim().min(1),
  url: z.string().trim().refine(isAcceptableUploadedFileUrl, {
    message: "Некорректный URL загруженного файла."
  }),
  fileName: z.string().trim().optional(),
  contentType: z.string().trim().optional(),
  sizeBytes: z.number().int().nonnegative().optional()
});

const uploadedCoverSchema = uploadedFileSchema.extend({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
});

const paymentSnapshotSchema = z.object({
  version: z.literal(1),
  kind: z.literal("subscription_included"),
  plan: z.enum(["STANDARD", "PRO", "ENTERPRISE"]),
  releasesUsedAfterSubmit: z.number().int().positive(),
  releasesLimit: z.number().int().positive().nullable()
});

const trackSchema = z.object({
  fileName: z.string().trim().min(1),
  hasAudio: z.boolean().optional(),
  audioFile: uploadedFileSchema.optional(),
  durationSec: z.number().positive().optional().nullable(),
  title: z.string().trim(),
  subtitle: z.string().trim().optional(),
  isrc: z.string().trim().optional(),
  partnerCode: z.string().trim().optional(),
  metadataLanguage: z.string().trim(),
  trackPersons: z.array(personSchema),
  copyrightPct: z.string().trim().optional(),
  relatedRightsPct: z.string().trim().optional(),
  previewStart: z.string().trim().optional(),
  instantGratification: z.boolean().optional(),
  focusTrack: z.boolean().optional(),
  versionExplicit: z.boolean().optional(),
  versionLive: z.boolean().optional(),
  versionCover: z.boolean().optional(),
  versionRemix: z.boolean().optional(),
  versionInstrumental: z.boolean().optional(),
  lyrics: z.string().trim().optional(),
  ringtoneDurationSec: z.string().trim().optional(),
  syncedLyricsFile: uploadedFileSchema.optional(),
  ringtoneFile: uploadedFileSchema.optional(),
  videoFile: uploadedFileSchema.optional(),
  // Legacy aliases kept for backward compatibility with older submissions/admin mappings.
  textFile: uploadedFileSchema.optional(),
  karaokeFile: uploadedFileSchema.optional(),
  videoShotFile: uploadedFileSchema.optional(),
  videoClipFile: uploadedFileSchema.optional()
});

export const releaseSubmissionDataSchema = z.object({
  cover: z.string().nullable(),
  coverUpload: uploadedCoverSchema.nullable().optional(),
  coverMeta: coverMetaSchema.nullable().optional(),
  language: z.string().trim(),
  title: z.string().trim(),
  subtitle: z.string().trim().optional(),
  genre: z.string().trim(),
  subgenre: z.string().trim().optional(),
  type: releaseTypeSchema.nullable(),
  releaseKind: releaseKindSchema.nullable().optional(),
  label: z.string().trim(),
  persons: z.array(personSchema),
  upc: z.string().trim().optional(),
  partnerCode: z.string().trim().optional(),
  rightsYear: z.string().trim().optional(),
  preorderDate: z.string().trim(),
  startDate: z.string().trim(),
  releaseDate: z.string().trim(),
  territoryMode: territoryModeSchema,
  territoryCountries: z.array(z.string().trim()),
  platformMode: platformModeSchema.optional(),
  platforms: z.array(z.string().trim()).optional(),
  tracks: z.array(trackSchema),
  paymentSnapshot: paymentSnapshotSchema.optional(),
  moderatorComment: z.string().trim().optional(),
  realTimeDelivery: z.boolean().optional(),
  yandexPreReleaseDate: z.string().trim().optional(),
  priorityRelease: z.boolean().optional()
});

export const releaseSubmitRequestSchema = z.object({
  mode: z.enum(["new", "edit"]),
  releaseId: z.string().trim().min(1).optional(),
  currentStatus: z.enum(releaseLifecycleStatuses).optional(),
  moderationStarted: z.boolean().optional(),
  data: releaseSubmissionDataSchema
});

export type ReleaseType = z.infer<typeof releaseTypeSchema>;
export type ReleaseKind = z.infer<typeof releaseKindSchema>;
export type ReleaseSubmissionData = z.infer<typeof releaseSubmissionDataSchema>;

export interface ReleaseValidationIssue {
  code: string;
  field: string;
  message: string;
}

export type ReleaseValidationStepKey =
  | "release_info"
  | "tracks"
  | "stores"
  | "pricing";

export type ReleaseValidationErrorsByStep = Record<
  ReleaseValidationStepKey,
  ReleaseValidationIssue[]
>;

export interface EditPermissionResult {
  allowed: boolean;
  message?: string;
  requiresCancellation?: boolean;
  createsModerationCopy?: boolean;
}

export function mapReleaseValidationStep(field: string): ReleaseValidationStepKey {
  if (
    field === "tracks" ||
    field.startsWith("tracks.") ||
    field === "tracks.audio_file"
  ) {
    return "tracks";
  }

  if (
    field === "selected_stores" ||
    field === "streaming_requires_audio" ||
    field === "platforms"
  ) {
    return "stores";
  }

  if (
    field === "selected_options" ||
    field === "payment_required" ||
    field.startsWith("pricing.")
  ) {
    return "pricing";
  }

  return "release_info";
}

export function groupReleaseValidationIssuesByStep(
  issues: ReleaseValidationIssue[]
): ReleaseValidationErrorsByStep {
  const grouped: ReleaseValidationErrorsByStep = {
    release_info: [],
    tracks: [],
    stores: [],
    pricing: []
  };

  for (const issue of issues) {
    grouped[mapReleaseValidationStep(issue.field)].push(issue);
  }

  return grouped;
}

const coverMimeTypes = new Set(["image/jpeg", "image/jpg", "image/png"]);
const coverMinSidePx = 1400;
const coverMaxSidePx = 6000;
const coverMaxBytes = 20 * 1024 * 1024;

const upcPattern = /^\d{12,14}$/u;
const isrcPattern = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/u;
const previewStartPattern = /^([0-5]?\d):([0-5]\d)$/u;

interface PersonRoleLike {
  role: string;
}

function parseDateInput(input: string): Date | null {
  const normalized = input.trim();
  if (!normalized) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(normalized);
  if (iso) {
    const date = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(normalized);
  if (ru) {
    const date = new Date(`${ru[3]}-${ru[2]}-${ru[1]}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function parsePercent(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pushIssue(
  issues: ReleaseValidationIssue[],
  code: string,
  field: string,
  message: string
) {
  issues.push({ code, field, message });
}

function isAuthorRole(role: string): boolean {
  const normalized = role.toLowerCase();
  return normalized.includes("автор") || normalized.includes("author");
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase().replace(/\s+/gu, " ");
}

function isMusicAuthorRole(role: string): boolean {
  const normalized = normalizeRole(role);
  return (
    normalized === "автор музыки" ||
    normalized.includes("music author") ||
    normalized.includes("composer")
  );
}

function isLyricsAuthorRole(role: string): boolean {
  const normalized = normalizeRole(role);
  return (
    normalized === "автор слов" ||
    normalized === "автор текста" ||
    normalized.includes("lyrics author") ||
    normalized.includes("lyricist")
  );
}

export function getTrackAuthorCoverage(trackPersons: PersonRoleLike[]): {
  hasMusicAuthor: boolean;
  hasLyricsAuthor: boolean;
} {
  return {
    hasMusicAuthor: trackPersons.some((person) =>
      isMusicAuthorRole(person.role)
    ),
    hasLyricsAuthor: trackPersons.some((person) =>
      isLyricsAuthorRole(person.role)
    )
  };
}

function isMainArtistRole(role: string): boolean {
  const normalized = role.toLowerCase();
  return normalized.includes("исполн") || normalized.includes("artist");
}

function isValidLegalName(value: string): boolean {
  const parts = value
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2;
}

function normalizeIsrc(value: string): string {
  return value.replace(/[-\s]/gu, "").toUpperCase();
}

function daysBetween(start: Date, end: Date): number {
  const msInDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msInDay);
}

function hasStreamingPlatforms(platforms: string[]): boolean {
  return platforms.some((platformCode) =>
    streamingPlatformCodes.includes(platformCode)
  );
}

function normalizePlatforms(data: ReleaseSubmissionData): string[] {
  if (data.platformMode === "selected") {
    return data.platforms ?? [];
  }
  return allReleasePlatformCodes;
}

export function getFocusTrackLimit(params: {
  releaseType: ReleaseType | null;
  releaseKind: ReleaseKind | null;
  trackCount: number;
}): number {
  const { releaseType, releaseKind, trackCount } = params;

  if (
    releaseType === "single" ||
    releaseKind === "single_maxi" ||
    releaseKind === "audiobook"
  ) {
    return 0;
  }

  if (trackCount < 3) return 0;
  if (trackCount <= 4) return 1;
  if (trackCount <= 10) return 2;
  return 3;
}

export function validateReleaseSubmission(data: ReleaseSubmissionData): ReleaseValidationIssue[] {
  const issues: ReleaseValidationIssue[] = [];

  if (!data.cover) {
    pushIssue(issues, "required", "cover", "Загрузите обложку релиза.");
  }

  if (data.cover) {
    if (!data.coverMeta) {
      pushIssue(
        issues,
        "required",
        "coverMeta",
        "Не удалось определить параметры обложки. Перезагрузите файл обложки." 
      );
    } else {
      if (!coverMimeTypes.has(data.coverMeta.mimeType.toLowerCase())) {
        pushIssue(
          issues,
          "invalid",
          "cover",
          "Обложка должна быть в формате JPG или PNG."
        );
      }

      if (data.coverMeta.sizeBytes > coverMaxBytes) {
        pushIssue(
          issues,
          "invalid",
          "cover",
          "Размер обложки не должен превышать 20 МБ."
        );
      }

      if (
        data.coverMeta.width < coverMinSidePx ||
        data.coverMeta.height < coverMinSidePx
      ) {
        pushIssue(
          issues,
          "invalid",
          "cover",
          "Минимальное разрешение обложки — 1400×1400 px."
        );
      }

      if (
        data.coverMeta.width > coverMaxSidePx ||
        data.coverMeta.height > coverMaxSidePx
      ) {
        pushIssue(
          issues,
          "invalid",
          "cover",
          "Максимальное разрешение обложки — 6000×6000 px."
        );
      }

      if (data.coverMeta.dpi != null && data.coverMeta.dpi < 72) {
        pushIssue(
          issues,
          "invalid",
          "cover",
          "Разрешение обложки должно быть не менее 72 dpi."
        );
      }
    }
  }

  if (!data.language) {
    pushIssue(issues, "required", "language", "Укажите язык метаданных.");
  }

  if (!data.title) {
    pushIssue(issues, "required", "title", "Укажите название релиза.");
  }

  if (!data.genre) {
    pushIssue(issues, "required", "genre", "Выберите жанр релиза.");
  }

  if (!data.type) {
    pushIssue(issues, "required", "type", "Выберите тип релиза.");
  }

  if (data.subgenre && data.subgenre.toLowerCase() === data.genre.toLowerCase()) {
    pushIssue(
      issues,
      "invalid",
      "subgenre",
      "Поджанр должен отличаться от основного жанра."
    );
  }

  if (!data.label) {
    pushIssue(issues, "required", "label", "Укажите название лейбла.");
  }

  if (data.persons.length === 0) {
    pushIssue(
      issues,
      "required",
      "persons",
      "Добавьте минимум одного участника релиза (персона и роль)."
    );
  }

  if (
    data.persons.some(
      (person) => person.name.trim().length === 0 || person.role.trim().length === 0
    )
  ) {
    pushIssue(
      issues,
      "invalid",
      "persons",
      "Для каждой персоны заполните имя и роль."
    );
  }

  if (data.persons.some((person) => !isAllowedReleasePersonRole(person.role))) {
    pushIssue(
      issues,
      "invalid",
      "persons",
      "Для персоны указана недопустимая роль. Используйте роли из списка: Исполнитель, feat., Remixer."
    );
  }

  if (!data.persons.some((person) => isMainArtistRole(person.role))) {
    pushIssue(
      issues,
      "required",
      "persons",
      "Добавьте хотя бы одного исполнителя в разделе «Персоны и роли»."
    );
  }

  data.persons.forEach((person) => {
    if (isAuthorRole(person.role) && !isValidLegalName(person.name)) {
      pushIssue(
        issues,
        "invalid",
        "persons",
        "Для ролей автора укажите фактические имя и фамилию."
      );
    }
  });

  if (data.upc && !upcPattern.test(data.upc)) {
    pushIssue(
      issues,
      "invalid",
      "upc",
      "UPC должен содержать от 12 до 14 цифр."
    );
  }

  const rightsYearRaw = data.rightsYear?.trim() ?? "";
  if (!rightsYearRaw) {
    pushIssue(
      issues,
      "required",
      "rightsYear",
      "Укажите год получения прав на релиз."
    );
  } else if (!/^\d{4}$/u.test(rightsYearRaw)) {
    pushIssue(
      issues,
      "invalid",
      "rightsYear",
      "Год получения прав должен быть в формате YYYY."
    );
  } else {
    const rightsYear = Number(rightsYearRaw);
    const currentYear = new Date().getUTCFullYear();
    if (rightsYear < 1900 || rightsYear > currentYear + 1) {
      pushIssue(
        issues,
        "invalid",
        "rightsYear",
        "Укажите корректный год получения прав."
      );
    }
  }

  const releaseDate = parseDateInput(data.releaseDate);
  if (!releaseDate) {
    pushIssue(issues, "required", "releaseDate", "Укажите корректную дату релиза.");
  }

  const startDate = parseDateInput(data.startDate);
  if (!startDate) {
    pushIssue(issues, "required", "startDate", "Укажите корректную дату старта.");
  }

  const preorderDate = parseDateInput(data.preorderDate);
  if (!preorderDate) {
    pushIssue(
      issues,
      "required",
      "preorderDate",
      "Укажите корректную дату предзаказа. Если предзаказ не нужен, поставьте дату старта."
    );
  }

  if (releaseDate && startDate && releaseDate.getTime() > startDate.getTime()) {
    pushIssue(
      issues,
      "invalid",
      "releaseDate",
      "Дата релиза не должна быть позже даты старта на площадках."
    );
  }

  if (preorderDate && startDate && preorderDate.getTime() > startDate.getTime()) {
    pushIssue(
      issues,
      "invalid",
      "preorderDate",
      "Дата предзаказа не может быть позже даты старта."
    );
  }

  if (data.yandexPreReleaseDate?.trim()) {
    const yandexDate = parseDateInput(data.yandexPreReleaseDate);
    if (!yandexDate) {
      pushIssue(
        issues,
        "invalid",
        "yandexPreReleaseDate",
        "Укажите корректную дату «Скоро новый релиз» для Яндекс Музыки."
      );
    } else if (startDate) {
      const delta = daysBetween(yandexDate, startDate);
      if (delta !== 7) {
        pushIssue(
          issues,
          "invalid",
          "yandexPreReleaseDate",
          "Дата «Скоро новый релиз» должна быть ровно за 7 дней до даты старта."
        );
      }
    }
  }

  if (
    (data.territoryMode === "selected" || data.territoryMode === "exclude") &&
    data.territoryCountries.length === 0
  ) {
    pushIssue(
      issues,
      "required",
      "territoryCountries",
      "Для выбранного режима территорий добавьте минимум одну страну."
    );
  }

  if (new Set(data.territoryCountries).size !== data.territoryCountries.length) {
    pushIssue(
      issues,
      "invalid",
      "territoryCountries",
      "Список территорий содержит дубли."
    );
  }

  if (data.platformMode === "selected" && (data.platforms?.length ?? 0) === 0) {
    pushIssue(
      issues,
      "required",
      "selected_stores",
      "Выберите хотя бы одну площадку."
    );
  }

  const selectedPlatforms = normalizePlatforms(data);
  const unsupportedPlatforms = selectedPlatforms.filter(
    (platformCode) => !allReleasePlatformCodes.includes(platformCode)
  );

  if (unsupportedPlatforms.length > 0) {
    pushIssue(
      issues,
      "invalid",
      "selected_stores",
      "В списке площадок найдены неподдерживаемые значения."
    );
  }

  if (data.tracks.length === 0) {
    pushIssue(issues, "required", "tracks", "Добавьте минимум один трек в релиз.");
  }

  const audioTracks = data.tracks.filter((track) => track.hasAudio !== false);

  if (audioTracks.length === 0 && hasStreamingPlatforms(selectedPlatforms)) {
    pushIssue(
      issues,
      "forbidden",
      "tracks.audio_file",
      "Добавьте аудиофайл хотя бы к одному треку или уберите стриминговые площадки."
    );
  }

  data.tracks.forEach((track, index) => {
    const prefix = `tracks.${index}`;

    if (!track.title.trim()) {
      pushIssue(
        issues,
        "required",
        `${prefix}.title`,
        `Заполните название трека №${index + 1}.`
      );
    }

    if (!track.metadataLanguage.trim()) {
      pushIssue(
        issues,
        "required",
        `${prefix}.metadataLanguage`,
        `Укажите язык метаданных для трека №${index + 1}.`
      );
    }

    if (track.trackPersons.length === 0) {
      pushIssue(
        issues,
        "required",
        `${prefix}.trackPersons`,
        `Добавьте участников для трека №${index + 1}.`
      );
    }

    if (
      track.trackPersons.some(
        (person) => person.name.trim().length === 0 || person.role.trim().length === 0
      )
    ) {
      pushIssue(
        issues,
        "invalid",
        `${prefix}.trackPersons`,
        `Укажите имя и роль для всех участников трека №${index + 1}.`
      );
    }

    if (track.trackPersons.some((person) => !isAllowedTrackPersonRole(person.role))) {
      pushIssue(
        issues,
        "invalid",
        `${prefix}.trackPersons`,
        `В треке №${index + 1} указана недопустимая роль персоны. Выберите роль из списка в форме.`
      );
    }

    const authorCoverage = getTrackAuthorCoverage(track.trackPersons);
    if (!authorCoverage.hasMusicAuthor || !authorCoverage.hasLyricsAuthor) {
      const message =
        !authorCoverage.hasMusicAuthor && !authorCoverage.hasLyricsAuthor
          ? `Для трека №${index + 1} добавьте автора музыки и автора слов.`
          : !authorCoverage.hasMusicAuthor
            ? `Для трека №${index + 1} добавьте автора музыки.`
            : `Для трека №${index + 1} добавьте автора слов.`;
      pushIssue(issues, "required", `${prefix}.trackPersons`, message);
    }

    track.trackPersons.forEach((person) => {
      if (isAuthorRole(person.role) && !isValidLegalName(person.name)) {
        pushIssue(
          issues,
          "invalid",
          `${prefix}.trackPersons`,
          `Для автора в треке №${index + 1} укажите фактические имя и фамилию.`
        );
      }
    });

    if (track.isrc) {
      const normalizedIsrc = normalizeIsrc(track.isrc);
      if (!isrcPattern.test(normalizedIsrc)) {
        pushIssue(
          issues,
          "invalid",
          `${prefix}.isrc`,
          `ISRC трека №${index + 1} должен быть в формате CCXXXYYNNNNN.`
        );
      }
    }

    const copyrightPct = parsePercent(track.copyrightPct);
    if (copyrightPct == null) {
      pushIssue(
        issues,
        "required",
        `${prefix}.copyrightPct`,
        `Укажите процент авторских прав для трека №${index + 1}.`
      );
    } else {
      if (copyrightPct < 0) {
        pushIssue(
          issues,
          "invalid",
          `${prefix}.copyrightPct`,
          `Процент авторских прав трека №${index + 1} должен быть от 0 до 100.`
        );
      }
      if (copyrightPct > 100) {
        pushIssue(
          issues,
          "invalid",
          `${prefix}.copyrightPct`,
          "Доля не может быть больше 100%"
        );
      }
      if (track.trackPersons.length > 1 && copyrightPct !== 100) {
        pushIssue(
          issues,
          "invalid",
          `${prefix}.copyrightPct`,
          `Сумма долей по © для трека №${index + 1} должна быть ровно 100%.`
        );
      }
    }

    const relatedRightsPct = parsePercent(track.relatedRightsPct ?? "100");
    if (relatedRightsPct == null) {
      pushIssue(
        issues,
        "required",
        `${prefix}.relatedRightsPct`,
        `Укажите процент смежных прав для трека №${index + 1}.`
      );
    } else {
      if (relatedRightsPct < 0) {
        pushIssue(
          issues,
          "invalid",
          `${prefix}.relatedRightsPct`,
          `Процент смежных прав трека №${index + 1} должен быть от 0 до 100.`
        );
      }
      if (relatedRightsPct > 100) {
        pushIssue(
          issues,
          "invalid",
          `${prefix}.relatedRightsPct`,
          "Доля не может быть больше 100%"
        );
      }
      if (track.trackPersons.length > 1 && relatedRightsPct !== 100) {
        pushIssue(
          issues,
          "invalid",
          `${prefix}.relatedRightsPct`,
          `Сумма долей по ℗ для трека №${index + 1} должна быть ровно 100%.`
        );
      }
    }

    if (track.previewStart?.trim()) {
      if (!previewStartPattern.test(track.previewStart.trim())) {
        pushIssue(
          issues,
          "invalid",
          `${prefix}.previewStart`,
          `Начало предпрослушивания трека №${index + 1} укажите в формате MM:SS.`
        );
      }
    }

    if (track.ringtoneDurationSec?.trim()) {
      const ringtoneDuration = Number(track.ringtoneDurationSec.replace(",", "."));
      if (!Number.isFinite(ringtoneDuration)) {
        pushIssue(
          issues,
          "invalid",
          `${prefix}.ringtoneDurationSec`,
          `Длительность рингтона для трека №${index + 1} должна быть числом в секундах.`
        );
      } else if (ringtoneDuration < 5 || ringtoneDuration > 29.99) {
        pushIssue(
          issues,
          "invalid",
          `${prefix}.ringtoneDurationSec`,
          `Длительность рингтона для трека №${index + 1} должна быть от 5 до 29.99 секунд.`
        );
      }
    }

    if (track.hasAudio !== false && (!track.durationSec || track.durationSec <= 0)) {
      pushIssue(
        issues,
        "required",
        `${prefix}.durationSec`,
        `Не удалось определить длительность аудио трека №${index + 1}. Перезагрузите файл.`
      );
    }
  });

  const releaseType = data.type;
  const audioTrackCount = audioTracks.length;
  const totalDuration = audioTracks.reduce((sum, track) => sum + (track.durationSec ?? 0), 0);

  if (releaseType === "single" && audioTrackCount > 0) {
    if (audioTrackCount < 1 || audioTrackCount > 3) {
      pushIssue(
        issues,
        "invalid",
        "type",
        "Single должен содержать от 1 до 3 треков."
      );
    }
    if (audioTracks.some((track) => (track.durationSec ?? 0) > 600)) {
      pushIssue(
        issues,
        "invalid",
        "type",
        "В типе Single каждый трек должен быть не длиннее 10 минут."
      );
    }
  }

  if (releaseType === "ep" && audioTrackCount > 0) {
    const hasLongTrack = audioTracks.some((track) => (track.durationSec ?? 0) >= 600);
    const variantA =
      audioTrackCount >= 1 &&
      audioTrackCount <= 3 &&
      hasLongTrack &&
      totalDuration <= 1800;
    const variantB =
      audioTrackCount >= 4 &&
      audioTrackCount <= 6 &&
      totalDuration <= 1800;

    if (!variantA && !variantB) {
      pushIssue(
        issues,
        "invalid",
        "type",
        "EP должен соответствовать правилам: 1–3 трека (хотя бы один ≥10 мин) или 4–6 треков, общая длительность до 30 минут."
      );
    }
  }

  if (releaseType === "album" && audioTrackCount > 0) {
    if (audioTrackCount < 7 || totalDuration <= 1800) {
      pushIssue(
        issues,
        "invalid",
        "type",
        "Album должен содержать 7+ треков и быть длиннее 30 минут."
      );
    }
  }

  if (data.releaseKind === "single_maxi") {
    if (data.tracks.length < 2 || data.tracks.length > 3) {
      pushIssue(
        issues,
        "invalid",
        "releaseKind",
        "Single Maxi должен содержать от 2 до 3 треков."
      );
    }
  }

  if (data.releaseKind === "audiobook" && totalDuration > 7200) {
    pushIssue(
      issues,
      "invalid",
      "releaseKind",
      "Аудиокнига не должна превышать 120 минут."
    );
  }

  const instantCount = data.tracks.filter((track) => Boolean(track.instantGratification)).length;
  if (instantCount > 0) {
    const maxInstantTracks = Math.max(1, Math.floor(data.tracks.length / 2));
    if (instantCount > maxInstantTracks) {
      pushIssue(
        issues,
        "invalid",
        "tracks",
        "Instant Gratification: в предзаказе может быть открыто не более 50% треков релиза."
      );
    }
  }

  const focusCount = data.tracks.filter((track) => Boolean(track.focusTrack)).length;
  const focusLimit = getFocusTrackLimit({
    releaseType: data.type,
    releaseKind: data.releaseKind ?? null,
    trackCount: data.tracks.length
  });

  if (focusCount > focusLimit) {
    const message =
      focusLimit === 0
        ? "Focus track недоступен для выбранного типа/вида релиза."
        : `Превышен лимит Focus track: доступно ${focusLimit}.`;
    pushIssue(issues, "invalid", "tracks", message);
  }

  return issues;
}

export function canEditRelease(params: {
  status: ReleaseLifecycleStatus;
  moderationStarted?: boolean;
}): EditPermissionResult {
  const { status, moderationStarted = false } = params;

  if (status === "archived") {
    return {
      allowed: false,
      message: "Архивный релиз нельзя редактировать."
    };
  }

  if (status === "moderation" && moderationStarted) {
    return {
      allowed: false,
      message:
        "Заявка уже в работе у модератора. Редактирование станет доступно после решения модерации."
    };
  }

  if (status === "moderation") {
    return {
      allowed: false,
      requiresCancellation: true,
      message:
        "Перед редактированием отмените заявку на модерацию. Это возможно только пока модератор не начал проверку."
    };
  }

  if (status === "approved" || status === "distributed") {
    return {
      allowed: true,
      createsModerationCopy: true
    };
  }

  return { allowed: true };
}

export function canCancelModeration(params: {
  status: ReleaseLifecycleStatus;
  moderationStarted?: boolean;
}): EditPermissionResult {
  const { status, moderationStarted = false } = params;

  if (status !== "moderation") {
    return {
      allowed: false,
      message: "Отменить можно только релиз со статусом «На модерации»."
    };
  }

  if (moderationStarted) {
    return {
      allowed: false,
      message:
        "Отмена недоступна: модератор уже начал проверку релиза."
    };
  }

  return { allowed: true };
}
