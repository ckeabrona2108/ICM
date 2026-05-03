import type { ReleaseSubmissionData } from "@/lib/release-policy";

import type { WizardData } from "./wizard-context";

export function buildReleaseSubmissionData(data: WizardData): ReleaseSubmissionData {
  return {
    cover: data.cover,
    coverUpload: data.coverUpload,
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
      audioFile: track.audioUpload ?? undefined,
      durationSec: track.durationSec,
      title: track.meta.title,
      subtitle: track.meta.subtitle,
      isrc: track.meta.isrc,
      partnerCode: track.meta.partnerCode,
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
      lyrics: track.meta.lyrics,
      ringtoneDurationSec: track.meta.ringtoneDurationSec
    })),
    moderatorComment: data.moderatorComment,
    realTimeDelivery: data.realTimeDelivery,
    yandexPreReleaseDate: data.yandexPreReleaseDate,
    priorityRelease: data.priorityRelease
  };
}
