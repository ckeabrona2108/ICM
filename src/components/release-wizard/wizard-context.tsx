"use client";

import * as React from "react";

export type ReleaseType = "single" | "ep" | "album";
export type ReleaseKind = "standard" | "single_maxi" | "mixtape" | "audiobook";

export interface CoverMeta {
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  dpi?: number;
}

export interface UploadedFileRef {
  storageKey: string;
  url: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface UploadedCoverRef extends UploadedFileRef {
  width?: number;
  height?: number;
}

export interface PersonRole {
  id: string;
  name: string;
  role: string;
}

/** Строка текста с таймкодами (синхронизация), при необходимости */
export interface SyncedLine {
  begin: number;
  end: number;
  text: string;
}

/** Метаданные одного трека (площадки / отчётность) */
export interface TrackMeta {
  title: string;
  subtitle: string;
  isrc: string;
  partnerCode: string;
  trackPersons: PersonRole[];
  copyrightPct: string;
  relatedRightsPct: string;
  previewStart: string;
  instantGratification: boolean;
  focusTrack: boolean;
  versionExplicit: boolean;
  versionLive: boolean;
  versionCover: boolean;
  versionRemix: boolean;
  versionInstrumental: boolean;
  versionDrugReference: boolean;
  aiAssistanceUsed: boolean;
  aiGeneratedFullTrack: boolean;
  aiGeneratedMusicOnly: boolean;
  aiGeneratedLyricsOnly: boolean;
  aiProcessedTrackOnly: boolean;
  metadataLanguage: string;
  lyrics: string;
  ringtoneDurationSec: string;
  syncedLyricsFile: UploadedFileRef | null;
  ringtoneFile: UploadedFileRef | null;
  videoFile: UploadedFileRef | null;
  /** Синхронизированные строки (удержание Play → отпускание) */
  syncedLyrics: SyncedLine[];
}

export function emptyTrackMeta(): TrackMeta {
  return {
    title: "",
    subtitle: "",
    isrc: "",
    partnerCode: "",
    trackPersons: [],
    copyrightPct: "0",
    relatedRightsPct: "100",
    previewStart: "00:00",
    instantGratification: false,
    focusTrack: false,
    versionExplicit: false,
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
    metadataLanguage: "",
    lyrics: "",
    ringtoneDurationSec: "",
    syncedLyricsFile: null,
    ringtoneFile: null,
    videoFile: null,
    syncedLyrics: []
  };
}

/** Совместимость со старыми черновиками без syncedLyrics и др. полей */
export function normalizeTrackMeta(partial: Partial<TrackMeta>): TrackMeta {
  const base = emptyTrackMeta();
  return {
    ...base,
    ...partial,
    trackPersons: partial.trackPersons ?? base.trackPersons,
    syncedLyrics: partial.syncedLyrics ?? base.syncedLyrics
  };
}

export interface TrackFile {
  id: string;
  name: string;
  size: number;
  hasAudio: boolean;
  durationSec?: number;
  durationLabel?: string;
  meta: TrackMeta;
  /** Blob URL загруженного аудио */
  audioUrl?: string;
  /** Ссылка на загруженный аудиофайл в хранилище */
  audioUpload?: UploadedFileRef | null;
}

export type TerritoryMode = "all" | "selected" | "exclude" | "cis";
export type PlatformMode = "all" | "selected";

export interface WizardData {
  // step 1
  cover: string | null;
  coverUpload: UploadedCoverRef | null;
  coverMeta: CoverMeta | null;
  language: string;
  title: string;
  subtitle: string;
  genre: string;
  subgenre: string;
  type: ReleaseType | null;
  releaseKind: ReleaseKind | null;
  label: string;
  customLabel: boolean;
  persons: PersonRole[];
  upc: string;
  partnerCode: string;
  rightsYear: string;
  preorderDate: string;
  startDate: string;
  releaseDate: string;
  territoryMode: TerritoryMode;
  territoryCountries: string[];
  platformMode: PlatformMode;
  platforms: string[];
  // step 2
  tracks: TrackFile[];
  // step 3
  earlyRussiaStart: boolean;
  realTimeDelivery: boolean;
  yandexPreReleaseDate: string;
  moderatorComment: string;
  priorityRelease: boolean;
}

const initial: WizardData = {
  cover: null,
  coverUpload: null,
  coverMeta: null,
  language: "",
  title: "",
  subtitle: "",
  genre: "",
  subgenre: "",
  type: null,
  releaseKind: null,
  label: "ICECREAMMUSIC",
  customLabel: false,
  persons: [],
  upc: "",
  partnerCode: "",
  rightsYear: String(new Date().getUTCFullYear()),
  preorderDate: "",
  startDate: "",
  releaseDate: "",
  territoryMode: "all",
  territoryCountries: [],
  platformMode: "all",
  platforms: [],
  tracks: [],
  earlyRussiaStart: false,
  realTimeDelivery: false,
  yandexPreReleaseDate: "",
  moderatorComment: "",
  priorityRelease: false
};

export type StepId = "info" | "tracks" | "extras" | "review" | "upload";

export type WizardSubmissionMode = "new" | "edit";

interface Ctx {
  data: WizardData;
  set: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
  patch: (patch: Partial<WizardData>) => void;
  step: StepId;
  setStep: (s: StepId) => void;
  reset: () => void;
  submissionMode: WizardSubmissionMode;
}

const WizardCtx = React.createContext<Ctx | null>(null);

function revokeBlobUrl(url: string | undefined) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function normalizeWizardSeed(seed?: Partial<WizardData>): WizardData {
  const merged = { ...initial, ...seed };
  return {
    ...merged,
    coverUpload: merged.coverUpload ?? null,
    tracks: merged.tracks.map((t) => ({
      ...t,
      hasAudio: t.hasAudio ?? true,
      audioUpload: t.audioUpload ?? null,
      meta: normalizeTrackMeta(t.meta as Partial<TrackMeta>)
    }))
  };
}

export function WizardProvider({
  children,
  seed,
  submissionMode = "new"
}: {
  children: React.ReactNode;
  seed?: Partial<WizardData>;
  submissionMode?: WizardSubmissionMode;
}) {
  const seedSignature = React.useMemo(() => JSON.stringify(seed ?? {}), [seed]);
  const [data, setData] = React.useState<WizardData>(() => normalizeWizardSeed(seed));
  const [step, setStep] = React.useState<StepId>("info");

  const set = React.useCallback(
    <K extends keyof WizardData>(key: K, value: WizardData[K]) => {
      setData((d) => ({ ...d, [key]: value }));
    },
    []
  );

  const patch = React.useCallback((patch: Partial<WizardData>) => {
    setData((d) => ({ ...d, ...patch }));
  }, []);

  const reset = React.useCallback(() => {
    setData((prev) => {
      for (const t of prev.tracks) revokeBlobUrl(t.audioUrl);
      return normalizeWizardSeed(seed);
    });
    setStep("info");
  }, [seed]);

  React.useEffect(() => {
    setData((prev) => {
      for (const t of prev.tracks) revokeBlobUrl(t.audioUrl);
      return normalizeWizardSeed(seed);
    });
    setStep("info");
  }, [seedSignature, submissionMode]);

  return (
    <WizardCtx.Provider
      value={{ data, set, patch, step, setStep, reset, submissionMode }}
    >
      {children}
    </WizardCtx.Provider>
  );
}

export function useWizard() {
  const ctx = React.useContext(WizardCtx);
  if (!ctx) throw new Error("useWizard must be used inside WizardProvider");
  return ctx;
}
