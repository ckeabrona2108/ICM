import type { Prisma } from "@prisma/client";

import type { ReleaseSubmissionData, ReleaseType } from "@/lib/release-policy";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toDurationLabel(value: number | null | undefined): string {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return "00:00";
  const safe = Math.max(0, Math.floor(value ?? 0));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function resolveStoredFilePointer(value: unknown): string | null {
  const record = asRecord(value);
  if (record) {
    return (
      asString(record.storageKey) ??
      asString(record.url) ??
      asString(record.path) ??
      asString(record.key)
    );
  }
  return asString(value);
}

function buildTrackRoles(
  track: ReleaseSubmissionData["tracks"][number]
): Prisma.InputJsonValue {
  return {
    fileName: track.fileName,
    hasAudio: track.hasAudio ?? true,
    audioFile: track.audioFile ?? null,
    durationSec: track.durationSec ?? null,
    metadataLanguage: track.metadataLanguage,
    trackPersons: track.trackPersons,
    relatedRightsPct: track.relatedRightsPct ?? null,
    syncedLyricsFile: track.syncedLyricsFile ?? track.textFile ?? null,
    ringtoneFile: track.ringtoneFile ?? track.karaokeFile ?? null,
    videoFile: track.videoFile ?? track.videoClipFile ?? null,
    textFile: track.textFile ?? track.syncedLyricsFile ?? null,
    karaokeFile: track.karaokeFile ?? track.ringtoneFile ?? null,
    videoShotFile: track.videoShotFile ?? null,
    videoClipFile: track.videoClipFile ?? track.videoFile ?? null
  } satisfies Record<string, unknown>;
}

export function readReleaseTypeFromSubmissionData(
  data: Record<string, unknown>
): ReleaseType {
  const rawType = asString(data.type) ?? asString(data.releaseType);
  if (rawType === "album") return "album";
  if (rawType === "ep") return "ep";
  return "single";
}

export function buildSubmitTrackDiagnostics(params: {
  releaseId: string;
  payloadData: Record<string, unknown>;
  submissionData: ReleaseSubmissionData;
  createdTracksCount: number;
}) {
  const payloadTracks = Array.isArray(params.payloadData.tracks)
    ? params.payloadData.tracks
    : [];
  const trackAudioKeys = params.submissionData.tracks
    .map((track) => resolveStoredFilePointer(track.audioFile))
    .filter((value): value is string => Boolean(value));

  return {
    releaseId: params.releaseId,
    payloadTracksCount: payloadTracks.length,
    submissionDataTracksCount: params.submissionData.tracks.length,
    createdTracksCount: params.createdTracksCount,
    trackAudioKeys
  };
}

export function buildTrackCreateManyInput(params: {
  releaseId: string;
  releaseLanguage: string;
  startDate: Date;
  tracks: ReleaseSubmissionData["tracks"];
}): Prisma.trackCreateManyInput[] {
  return params.tracks.map((track, index) => ({
    releaseId: params.releaseId,
    title: asString(track.title) ?? asString(track.fileName) ?? `Трек ${index + 1}`,
    subtitle: asString(track.subtitle),
    isrc: asString(track.isrc),
    partner_code: asString(track.partnerCode),
    roles: buildTrackRoles(track),
    preview_start: asString(track.previewStart) ?? "00:00",
    instant_gratification_date: track.instantGratification ? params.startDate : null,
    focus: Boolean(track.focusTrack),
    explicit: Boolean(track.versionExplicit),
    live: Boolean(track.versionLive),
    cover: Boolean(track.versionCover),
    remix: Boolean(track.versionRemix),
    instrumental: Boolean(track.versionInstrumental),
    language: asString(track.metadataLanguage) ?? params.releaseLanguage,
    text: asString(track.lyrics),
    track: toDurationLabel(track.durationSec),
    text_sync: resolveStoredFilePointer(track.syncedLyricsFile ?? track.textFile),
    ringtone: resolveStoredFilePointer(track.ringtoneFile ?? track.karaokeFile),
    video: resolveStoredFilePointer(track.videoFile ?? track.videoClipFile),
    author_rights: asString(track.copyrightPct) ?? "0",
    video_shot: resolveStoredFilePointer(track.videoShotFile),
    index: index + 1
  }));
}
