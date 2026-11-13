/**
 * What an artist changes in an edited copy of an approved release: the areas they say they
 * change (`changeRequest` in the submission data) and the actual difference against the
 * original. Pure code, shared by the wizard, the submit route and the admin card.
 */

export const RELEASE_CHANGE_AREAS = [
  "cover",
  "metadata",
  "tracks",
  "lyrics",
  "dates",
  "distribution",
  "other"
] as const;

export type ReleaseChangeArea = (typeof RELEASE_CHANGE_AREAS)[number];

export const RELEASE_CHANGE_AREA_LABELS: Record<ReleaseChangeArea, string> = {
  cover: "Обложка",
  metadata: "Название, исполнители, жанр",
  tracks: "Треки и аудио",
  lyrics: "Текст песни",
  dates: "Даты релиза",
  distribution: "Площадки и территории",
  other: "Другое"
};

/** Short lowercase names for one-line summaries ("Повторная модерация · обложка, даты"). */
export const RELEASE_CHANGE_AREA_SHORT_LABELS: Record<ReleaseChangeArea, string> = {
  cover: "обложка",
  metadata: "метаданные",
  tracks: "треки",
  lyrics: "текст",
  dates: "даты",
  distribution: "площадки",
  other: "другое"
};

export interface ReleaseChangeRequest {
  areas: ReleaseChangeArea[];
  comment: string;
}

export interface ReleaseFieldChange {
  area: ReleaseChangeArea;
  /** Stable key, e.g. `title` or `tracks.0.audio`. */
  field: string;
  label: string;
  before: string;
  after: string;
  /** Set for cover changes so the UI can show both images. */
  kind?: "image";
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as AnyRecord;
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function flag(value: unknown): string {
  return value === true ? "Да" : "Нет";
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function isChangeArea(value: unknown): value is ReleaseChangeArea {
  return typeof value === "string" && (RELEASE_CHANGE_AREAS as readonly string[]).includes(value);
}

export function readReleaseChangeRequest(submissionData: unknown): ReleaseChangeRequest | null {
  const request = asRecord(asRecord(submissionData)?.changeRequest);
  if (!request) return null;
  const areas = Array.isArray(request.areas) ? [...new Set(request.areas.filter(isChangeArea))] : [];
  return { areas, comment: text(request.comment) };
}

/** Message for an incomplete change request, or null when it is filled in. */
export function validateReleaseChangeRequest(request: ReleaseChangeRequest | null): string | null {
  if (!request || request.areas.length === 0) return "Отметьте, что вы хотите изменить в релизе.";
  if (!request.comment) return "Коротко напишите модератору, зачем нужны изменения.";
  return null;
}

/** File identity that survives URL rewrites: storage key first, then URL, then file name. */
function fileIdentity(value: unknown): string {
  const file = asRecord(value);
  if (!file) return text(value);
  return text(file.storageKey) || text(file.url) || text(file.fileName);
}

function fileLabel(value: unknown): string {
  const file = asRecord(value);
  if (!file) return text(value);
  return text(file.fileName) || text(file.storageKey).split("/").pop() || text(file.url).split("/").pop() || "";
}

function coverUrl(data: AnyRecord): string {
  const upload = asRecord(data.coverUpload);
  return text(upload?.url) || text(data.cover);
}

function coverIdentity(data: AnyRecord): string {
  const upload = asRecord(data.coverUpload);
  return (upload ? fileIdentity(upload) : "") || text(data.cover);
}

function persons(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      const person = asRecord(item);
      const name = text(person?.name);
      const role = text(person?.role);
      return name ? (role ? `${name} — ${role}` : name) : "";
    })
    .filter(Boolean)
    .join(", ");
}

function territory(data: AnyRecord): string {
  const mode = text(data.territoryMode) || "all";
  const countries = list(data.territoryCountries);
  const modeLabel: Record<string, string> = {
    all: "Весь мир",
    selected: "Только выбранные страны",
    exclude: "Весь мир, кроме",
    cis: "СНГ"
  };
  const label = modeLabel[mode] ?? mode;
  return countries.length > 0 && mode !== "all" ? `${label}: ${countries.join(", ")}` : label;
}

function platforms(data: AnyRecord): string {
  const mode = text(data.platformMode) || "all";
  const selected = list(data.platforms);
  if (mode === "all" || selected.length === 0) return "Все площадки";
  return selected.join(", ");
}

const TRACK_VERSION_FLAGS: Array<[string, string]> = [
  ["versionExplicit", "Explicit"],
  ["versionLive", "Live"],
  ["versionCover", "Кавер"],
  ["versionRemix", "Ремикс"],
  ["versionInstrumental", "Инструментал"],
  ["versionDrugReference", "Упоминание наркотиков"],
  ["focusTrack", "Фокус-трек"],
  ["instantGratification", "Instant gratification"]
];

const TRACK_AI_FLAGS: Array<[string, string]> = [
  ["aiAssistanceUsed", "ИИ использовался"],
  ["aiGeneratedFullTrack", "Трек полностью ИИ"],
  ["aiGeneratedMusicOnly", "Музыка ИИ"],
  ["aiGeneratedLyricsOnly", "Текст ИИ"],
  ["aiProcessedTrackOnly", "Обработка ИИ"]
];

function enabledFlags(track: AnyRecord, flags: Array<[string, string]>): string {
  return flags
    .filter(([key]) => track[key] === true)
    .map(([, label]) => label)
    .join(", ") || "Нет";
}

/**
 * Field-by-field difference between the original release and its edited copy.
 * Fields that do not describe the product (UPC, partner codes, payment, comments) are ignored.
 */
export function diffReleaseSubmissions(originalInput: unknown, copyInput: unknown): ReleaseFieldChange[] {
  const original = asRecord(originalInput) ?? {};
  const copy = asRecord(copyInput) ?? {};
  const changes: ReleaseFieldChange[] = [];
  const push = (
    area: ReleaseChangeArea,
    field: string,
    label: string,
    before: string,
    after: string,
    compare?: [string, string]
  ) => {
    const [left, right] = compare ?? [before, after];
    if (left === right) return;
    changes.push({ area, field, label, before: before || "—", after: after || "—" });
  };

  if (coverIdentity(original) !== coverIdentity(copy)) {
    changes.push({
      area: "cover",
      field: "cover",
      label: "Обложка",
      before: coverUrl(original) || "—",
      after: coverUrl(copy) || "—",
      kind: "image"
    });
  }

  push("metadata", "title", "Название", text(original.title), text(copy.title));
  push("metadata", "subtitle", "Подзаголовок", text(original.subtitle), text(copy.subtitle));
  push("metadata", "persons", "Исполнители и роли", persons(original.persons), persons(copy.persons));
  push("metadata", "genre", "Жанр", text(original.genre), text(copy.genre));
  push("metadata", "subgenre", "Поджанр", text(original.subgenre), text(copy.subgenre));
  push("metadata", "type", "Формат", text(original.type), text(copy.type));
  push("metadata", "label", "Лейбл", text(original.label), text(copy.label));
  push("metadata", "language", "Язык", text(original.language), text(copy.language));
  push("metadata", "rightsYear", "Год прав", text(original.rightsYear), text(copy.rightsYear));

  push("dates", "releaseDate", "Дата релиза", text(original.releaseDate), text(copy.releaseDate));
  push("dates", "startDate", "Дата старта", text(original.startDate), text(copy.startDate));
  push("dates", "preorderDate", "Дата предзаказа", text(original.preorderDate), text(copy.preorderDate));
  push(
    "dates",
    "yandexPreReleaseDate",
    "Яндекс pre-save",
    text(original.yandexPreReleaseDate),
    text(copy.yandexPreReleaseDate)
  );
  push("dates", "vkStartDate", "VK Музыка: дата старта", text(original.vkStartDate), text(copy.vkStartDate));
  push("dates", "vkStartTime", "VK Музыка: час старта", text(original.vkStartTime) || "00:00", text(copy.vkStartTime) || "00:00");
  push(
    "dates",
    "vkPreSave",
    "VK Музыка: pre-save",
    original.vkPreSave === true ? text(original.vkPreSaveDate) || "Да" : "Нет",
    copy.vkPreSave === true ? text(copy.vkPreSaveDate) || "Да" : "Нет"
  );
  push("dates", "earlyRussiaStart", "Ранний старт в России", flag(original.earlyRussiaStart), flag(copy.earlyRussiaStart));

  push("distribution", "territory", "Территории", territory(original), territory(copy));
  push("distribution", "platforms", "Площадки", platforms(original), platforms(copy));
  push("distribution", "realTimeDelivery", "Доставка в реальном времени", flag(original.realTimeDelivery), flag(copy.realTimeDelivery));

  const originalTracks = Array.isArray(original.tracks) ? original.tracks : [];
  const copyTracks = Array.isArray(copy.tracks) ? copy.tracks : [];
  if (originalTracks.length !== copyTracks.length) {
    push("tracks", "tracks.count", "Количество треков", String(originalTracks.length), String(copyTracks.length));
  }
  const trackCount = Math.max(originalTracks.length, copyTracks.length);
  for (let index = 0; index < trackCount; index += 1) {
    const before = asRecord(originalTracks[index]);
    const after = asRecord(copyTracks[index]);
    const prefix = `Трек ${index + 1}`;
    if (!before || !after) {
      push(
        "tracks",
        `tracks.${index}`,
        prefix,
        before ? text(before.title) || "Есть" : "",
        after ? text(after.title) || "Есть" : ""
      );
      continue;
    }
    const key = (name: string) => `tracks.${index}.${name}`;
    push("tracks", key("title"), `${prefix}: название`, text(before.title), text(after.title));
    push("tracks", key("subtitle"), `${prefix}: подзаголовок`, text(before.subtitle), text(after.subtitle));
    push(
      "tracks",
      key("audio"),
      `${prefix}: аудиофайл`,
      fileLabel(before.audioFile) || text(before.fileName),
      fileLabel(after.audioFile) || text(after.fileName),
      [fileIdentity(before.audioFile) || text(before.fileName), fileIdentity(after.audioFile) || text(after.fileName)]
    );
    push("tracks", key("isrc"), `${prefix}: ISRC`, text(before.isrc), text(after.isrc));
    push("tracks", key("persons"), `${prefix}: авторы и роли`, persons(before.trackPersons), persons(after.trackPersons));
    push("tracks", key("copyrightPct"), `${prefix}: авторские права, %`, text(before.copyrightPct), text(after.copyrightPct));
    push(
      "tracks",
      key("relatedRightsPct"),
      `${prefix}: смежные права, %`,
      text(before.relatedRightsPct),
      text(after.relatedRightsPct)
    );
    push("tracks", key("metadataLanguage"), `${prefix}: язык`, text(before.metadataLanguage), text(after.metadataLanguage));
    push("tracks", key("previewStart"), `${prefix}: начало превью`, text(before.previewStart), text(after.previewStart));
    push("tracks", key("versions"), `${prefix}: версии и метки`, enabledFlags(before, TRACK_VERSION_FLAGS), enabledFlags(after, TRACK_VERSION_FLAGS));
    push("tracks", key("ai"), `${prefix}: использование ИИ`, enabledFlags(before, TRACK_AI_FLAGS), enabledFlags(after, TRACK_AI_FLAGS));
    push(
      "tracks",
      key("video"),
      `${prefix}: видео`,
      fileLabel(before.videoFile ?? before.videoShotFile),
      fileLabel(after.videoFile ?? after.videoShotFile),
      [fileIdentity(before.videoFile ?? before.videoShotFile), fileIdentity(after.videoFile ?? after.videoShotFile)]
    );
    push(
      "tracks",
      key("ringtone"),
      `${prefix}: рингтон`,
      fileLabel(before.ringtoneFile ?? before.karaokeFile),
      fileLabel(after.ringtoneFile ?? after.karaokeFile),
      [fileIdentity(before.ringtoneFile ?? before.karaokeFile), fileIdentity(after.ringtoneFile ?? after.karaokeFile)]
    );
    const lyricsBefore = text(before.lyrics);
    const lyricsAfter = text(after.lyrics);
    if (lyricsBefore !== lyricsAfter) {
      changes.push({
        area: "lyrics",
        field: key("lyrics"),
        label: `${prefix}: текст песни`,
        before: lyricsBefore ? `${lyricsBefore.length} символов` : "—",
        after: lyricsAfter ? `${lyricsAfter.length} символов` : "—"
      });
    }
    push(
      "lyrics",
      key("syncedLyrics"),
      `${prefix}: синхронизированный текст`,
      fileLabel(before.syncedLyricsFile ?? before.textFile),
      fileLabel(after.syncedLyricsFile ?? after.textFile),
      [fileIdentity(before.syncedLyricsFile ?? before.textFile), fileIdentity(after.syncedLyricsFile ?? after.textFile)]
    );
  }

  return changes;
}

export function changedReleaseAreas(changes: ReleaseFieldChange[]): ReleaseChangeArea[] {
  const areas = new Set(changes.map((change) => change.area));
  return RELEASE_CHANGE_AREAS.filter((area) => areas.has(area));
}

/** Areas that actually changed but the artist did not mark. */
export function unmarkedReleaseChangeAreas(
  changes: ReleaseFieldChange[],
  request: ReleaseChangeRequest | null
): ReleaseChangeArea[] {
  const marked = new Set(request?.areas ?? []);
  return changedReleaseAreas(changes).filter((area) => !marked.has(area));
}

export function formatReleaseChangeAreas(areas: readonly ReleaseChangeArea[]): string {
  return areas.map((area) => RELEASE_CHANGE_AREA_SHORT_LABELS[area]).join(", ");
}
