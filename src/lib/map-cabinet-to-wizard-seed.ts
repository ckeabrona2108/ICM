import type { CabinetRelease } from "@/lib/cabinet-types";
import type { WizardData } from "@/components/release-wizard/wizard-context";
import {
  releaseSubmissionDataSchema,
  type ReleaseSubmissionData
} from "@/lib/release-policy";

function resolveUploadedAudioUrl(input: {
  url?: string | null;
  storageKey?: string | null;
}): string | undefined {
  const directUrl = input.url?.trim();
  if (directUrl) return directUrl;

  const storageKey = input.storageKey?.trim();
  if (!storageKey) return undefined;

  const encoded = storageKey
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return encoded ? `/api/uploads/object/${encoded}` : undefined;
}

function formatDuration(seconds?: number | null): string | undefined {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return undefined;
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/** Данные релиза из кабинета → черновик в мастере «Новый релиз» */
export function mapCabinetReleaseToWizardSeed(r: CabinetRelease): Partial<WizardData> {
  const dash = (s: string) => (s === "—" ? "" : s);
  const releaseYear = String(new Date().getUTCFullYear());
  const parsedSubmission = releaseSubmissionDataSchema.safeParse(r.submissionData);
  const submission: ReleaseSubmissionData | null = parsedSubmission.success
    ? parsedSubmission.data
    : null;

  if (submission) {
    return {
      cover: submission.cover,
      coverUpload: submission.coverUpload ?? null,
      coverMeta: submission.coverMeta ?? null,
      title: submission.title,
      subtitle: submission.subtitle ?? "",
      genre: submission.genre,
      subgenre: submission.subgenre ?? "",
      type: submission.type,
      releaseKind: submission.releaseKind ?? "standard",
      label: submission.label,
      customLabel: submission.label !== "ICECREAMMUSIC",
      persons: submission.persons.map((person) => ({
        id: crypto.randomUUID(),
        name: person.name,
        role: person.role
      })),
      upc: submission.upc?.trim() || "",
      partnerCode: submission.partnerCode?.trim() || "",
      rightsYear: submission.rightsYear?.trim() || releaseYear,
      preorderDate: submission.preorderDate,
      releaseDate: submission.releaseDate,
      startDate: submission.startDate,
      territoryMode: submission.territoryMode,
      territoryCountries: submission.territoryCountries,
      platformMode: submission.platformMode ?? "all",
      platforms: submission.platforms ?? [],
      language: submission.language,
      tracks: submission.tracks.map((track, index) => ({
        id: crypto.randomUUID(),
        name: track.fileName || `track-${String(index + 1).padStart(2, "0")}`,
        size: track.audioFile?.sizeBytes ?? 0,
        hasAudio: track.hasAudio ?? true,
        audioUrl:
          resolveUploadedAudioUrl({
            url: track.audioFile?.url ?? null,
            storageKey: track.audioFile?.storageKey ?? null
          }) ??
          r.tracks[index]?.audioUrl ??
          undefined,
        audioUpload: track.audioFile ?? null,
        durationSec: track.durationSec ?? undefined,
        durationLabel: formatDuration(track.durationSec ?? undefined),
        meta: {
          title: track.title,
          subtitle: track.subtitle ?? "",
          isrc: track.isrc ?? "",
          partnerCode: track.partnerCode ?? "",
          trackPersons: track.trackPersons.map((person) => ({
            id: crypto.randomUUID(),
            name: person.name,
            role: person.role
          })),
          copyrightPct: track.copyrightPct ?? "",
          relatedRightsPct: track.relatedRightsPct ?? "100",
          previewStart: track.previewStart ?? "",
          instantGratification: Boolean(track.instantGratification),
          focusTrack: Boolean(track.focusTrack),
          versionExplicit: Boolean(track.versionExplicit),
          versionLive: Boolean(track.versionLive),
          versionCover: Boolean(track.versionCover),
          versionRemix: Boolean(track.versionRemix),
          versionInstrumental: Boolean(track.versionInstrumental),
          versionDrugReference: Boolean(track.versionDrugReference),
          aiAssistanceUsed: Boolean(track.aiAssistanceUsed),
          aiGeneratedFullTrack: Boolean(track.aiGeneratedFullTrack),
          aiGeneratedMusicOnly: Boolean(track.aiGeneratedMusicOnly),
          aiGeneratedLyricsOnly: Boolean(track.aiGeneratedLyricsOnly),
          aiProcessedTrackOnly: Boolean(track.aiProcessedTrackOnly),
          metadataLanguage: track.metadataLanguage,
          lyrics: track.lyrics ?? "",
          ringtoneDurationSec: track.ringtoneDurationSec ?? "",
          syncedLyricsFile: track.syncedLyricsFile ?? track.textFile ?? null,
          ringtoneFile: track.ringtoneFile ?? track.karaokeFile ?? null,
          videoFile:
            track.videoFile ??
            track.videoShotFile ??
            track.videoClipFile ??
            null,
          syncedLyrics: []
        }
      })),
      earlyRussiaStart: Boolean(submission.earlyRussiaStart ?? r.earlyRussiaStart),
      realTimeDelivery: Boolean(submission.realTimeDelivery),
      yandexPreReleaseDate: submission.yandexPreReleaseDate ?? "",
      moderatorComment: submission.moderatorComment ?? "",
      priorityRelease: Boolean(submission.priorityRelease)
    };
  }

  return {
    cover: r.coverUrl || r.cover || null,
    coverUpload: null,
    coverMeta: {
      mimeType: "image/jpeg",
      sizeBytes: 1024 * 1024,
      width: 3000,
      height: 3000,
      dpi: 72
    },
    title: r.title ?? "",
    subtitle: "",
    genre: r.genre,
    subgenre: "",
    type: null,
    releaseKind: "standard",
    label: r.label,
    customLabel: r.label !== "ICECREAMMUSIC",
    persons: r.artist
      ? [{ id: "seed-artist", name: r.artist, role: "Исполнитель" }]
      : [],
    upc: r.upc?.trim() ? r.upc : "",
    partnerCode: "",
    rightsYear: releaseYear,
    preorderDate: dash(r.preorderDate),
    releaseDate: dash(r.releaseDate),
    startDate: dash(r.startDate),
    territoryMode: "all",
    territoryCountries: [],
    platformMode: "all",
    platforms: [],
    language: "Русский",
    tracks: r.tracks.map((track, index) => ({
      id: crypto.randomUUID(),
      name: track.title?.trim() || `track-${String(index + 1).padStart(2, "0")}`,
      size: 0,
      hasAudio: Boolean(track.audioUrl),
      audioUrl: track.audioUrl ?? undefined,
      audioUpload: null,
      durationSec: track.durationSec ?? undefined,
      durationLabel: formatDuration(track.durationSec ?? undefined),
      meta: {
        title: track.title ?? "",
        subtitle: track.subtitle ?? "",
        isrc: track.isrc ?? "",
        partnerCode: track.partnerCode ?? "",
        trackPersons: (track.trackPersons ?? []).map((person) => ({
          id: crypto.randomUUID(),
          name: person.name,
          role: person.role
        })),
        copyrightPct: track.copyrightPct ?? "",
        relatedRightsPct: track.relatedRightsPct ?? "100",
        previewStart: track.previewStart ?? "",
        instantGratification: false,
        focusTrack: Boolean(track.focusTrack),
        versionExplicit: Boolean(track.versionExplicit),
        versionLive: false,
        versionCover: false,
        versionRemix: false,
        versionInstrumental: false,
        versionDrugReference: false,
        aiAssistanceUsed: false,
        aiGeneratedFullTrack: false,
        aiGeneratedMusicOnly: false,
        aiGeneratedLyricsOnly: false,
        aiProcessedTrackOnly: false,
        metadataLanguage: track.metadataLanguage ?? "Русский",
        lyrics: "",
        ringtoneDurationSec: "",
        syncedLyricsFile: null,
        ringtoneFile: null,
        videoFile: null,
        syncedLyrics: []
      }
    })),
    earlyRussiaStart: Boolean(r.earlyRussiaStart),
    realTimeDelivery: false,
    yandexPreReleaseDate: "",
    moderatorComment: "",
    priorityRelease: Boolean(r.priority)
  };
}
