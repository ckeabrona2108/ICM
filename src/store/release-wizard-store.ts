"use client";

import { create } from "zustand";

type PlatformKey =
  | "Spotify"
  | "Apple Music"
  | "Yandex Music"
  | "VK Music"
  | "YouTube Music"
  | "Deezer"
  | "TikTok / Reels";

export interface ReleaseWizardState {
  step: number;
  title: string;
  artist: string;
  genre: string;
  language: string;
  releaseDate: string;
  type: "single" | "ep" | "album";
  audioFile?: File;
  coverFile?: File;
  authors: string;
  composers: string;
  explicitContent: boolean;
  isrc: string;
  upc: string;
  lyrics: string;
  platforms: Record<PlatformKey, boolean>;
  moderationNotes: string;
  setField: <K extends keyof ReleaseWizardState>(key: K, value: ReleaseWizardState[K]) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

const initialPlatforms: Record<PlatformKey, boolean> = {
  Spotify: true,
  "Apple Music": true,
  "Yandex Music": false,
  "VK Music": false,
  "YouTube Music": true,
  Deezer: true,
  "TikTok / Reels": true
};

const initialState = {
  step: 1,
  title: "",
  artist: "",
  genre: "",
  language: "English",
  releaseDate: "",
  type: "single" as const,
  audioFile: undefined,
  coverFile: undefined,
  authors: "",
  composers: "",
  explicitContent: false,
  isrc: "",
  upc: "",
  lyrics: "",
  platforms: initialPlatforms,
  moderationNotes: ""
};

export const useReleaseWizardStore = create<ReleaseWizardState>((set) => ({
  ...initialState,
  setField: (key, value) => set(() => ({ [key]: value })),
  nextStep: () => set((state) => ({ step: Math.min(5, state.step + 1) })),
  prevStep: () => set((state) => ({ step: Math.max(1, state.step - 1) })),
  reset: () =>
    set(() => ({
      ...initialState,
      platforms: { ...initialPlatforms }
    }))
}));
