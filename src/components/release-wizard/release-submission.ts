import type { ReleaseSubmissionData } from "@/lib/release-policy";

import type { WizardData } from "./wizard-context";

function normalizeUploadedUrl(url: string): string {
  const normalized = url.trim();
  if (/^https?:\/\//iu.test(normalized)) {
    return normalized;
  }

  if (typeof window !== "undefined") {
    return new URL(normalized, window.location.origin).toString();
  }

  return normalized;
}

function normalizeUploadedFileRef<T extends { url: string } | null | undefined>(value: T): T {
  if (!value) return value;
  return {
    ...value,
    url: normalizeUploadedUrl(value.url)
  };
}

export function buildReleaseSubmissionData(data: WizardData): ReleaseSubmissionData {
  return {
    cover: data.cover,
    coverUpload: normalizeUploadedFileRef(data.coverUpload),
    coverMeta: data.coverMeta,
    language: data.language,
    title: data.title,
    subtitle: data.subtitle,
    genre: data.genre,
    subgenre: data.subgenre,
    type: data.type,
    releaseKind: data.releaseKind,
    label: data.label,
    persons: data.persons.map((person) => ({
      name: person.name,
      role: person.role
    })),
    upc: data.upc,
    partnerCode: data.partnerCode,
    rightsYear: data.rightsYear,
    preorderDate: data.preorderDate,
    startDate: data.startDate,
    releaseDate: data.releaseDate,
    territoryMode: data.territoryMode,
    territoryCountries: data.territoryCountries,
    platformMode: data.platformMode,
    platforms: data.platforms,
    tracks: data.tracks.map((track) => ({
      fileName: track.name,
      hasAudio: track.hasAudio,
      audioFile: normalizeUploadedFileRef(track.audioUpload) ?? undefined,
      durationSec: track.durationSec,
      title: track.meta.title,
      subtitle: track.meta.subtitle,
      isrc: track.meta.isrc,
      metadataLanguage: track.meta.metadataLanguage,
      trackPersons: track.meta.trackPersons.map((person) => ({
        name: person.name,
        role: person.role
      })),
      copyrightPct: track.meta.copyrightPct,
      relatedRightsPct: track.meta.relatedRightsPct,
      previewStart: track.meta.previewStart,
      instantGratification: track.meta.instantGratification,
      focusTrack: track.meta.focusTrack,
      versionExplicit: track.meta.versionExplicit,
      versionLive: track.meta.versionLive,
      versionCover: track.meta.versionCover,
      versionRemix: track.meta.versionRemix,
      versionInstrumental: track.meta.versionInstrumental,
      versionDrugReference: track.meta.versionDrugReference,
      aiAssistanceUsed: track.meta.aiAssistanceUsed,
      aiGeneratedFullTrack: track.meta.aiGeneratedFullTrack,
      aiGeneratedMusicOnly: track.meta.aiGeneratedMusicOnly,
      aiGeneratedLyricsOnly: track.meta.aiGeneratedLyricsOnly,
      aiProcessedTrackOnly: track.meta.aiProcessedTrackOnly,
      lyrics: track.meta.lyrics,
      ringtoneDurationSec: track.meta.ringtoneDurationSec,
      syncedLyricsFile: normalizeUploadedFileRef(track.meta.syncedLyricsFile) ?? undefined,
      ringtoneFile: normalizeUploadedFileRef(track.meta.ringtoneFile) ?? undefined,
      videoFile: normalizeUploadedFileRef(track.meta.videoFile) ?? undefined,
      // Legacy aliases for current admin download resolver.
      textFile: normalizeUploadedFileRef(track.meta.syncedLyricsFile) ?? undefined,
      karaokeFile: normalizeUploadedFileRef(track.meta.ringtoneFile) ?? undefined,
      videoShotFile: normalizeUploadedFileRef(track.meta.videoFile) ?? undefined
    })),
    moderatorComment: data.moderatorComment,
    earlyRussiaStart: data.earlyRussiaStart,
    realTimeDelivery: data.realTimeDelivery,
    yandexPreReleaseDate: data.yandexPreReleaseDate,
    priorityRelease: data.priorityRelease
  };
}
