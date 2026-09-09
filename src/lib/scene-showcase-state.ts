import type { Prisma } from "@prisma/client";

export const SCENE_PREVIEW_MAX_DURATION_SECONDS = 30.5;
export const SCENE_PREVIEW_MAX_SIZE_BYTES = 20 * 1024 * 1024;

export interface ScenePreviewAsset {
  storageKey: string;
  fileName: string;
  contentType: string;
  size: number;
  durationSec: number;
}

export interface SceneShowcaseState {
  enabled: boolean;
  trackIndex: number;
  previewAsset: ScenePreviewAsset | null;
  publishedAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getSceneShowcaseState(roles: unknown): SceneShowcaseState {
  const root = asRecord(roles);
  const state = asRecord(root?.sceneShowcase);
  const asset = asRecord(state?.previewAsset);
  const storageKey = asString(asset?.storageKey);
  const trackIndex = asNumber(state?.trackIndex);

  return {
    enabled: state?.enabled === true,
    trackIndex: trackIndex && trackIndex > 0 ? Math.floor(trackIndex) : 1,
    previewAsset: storageKey
      ? {
          storageKey,
          fileName: asString(asset?.fileName) ?? "preview.mp3",
          contentType: asString(asset?.contentType) ?? "audio/mpeg",
          size: Math.max(0, asNumber(asset?.size) ?? 0),
          durationSec: Math.max(0, asNumber(asset?.durationSec) ?? 0)
        }
      : null,
    publishedAt: asString(state?.publishedAt)
  };
}

export function withSceneShowcaseState(
  roles: unknown,
  state: SceneShowcaseState
): Prisma.InputJsonValue {
  const root = asRecord(roles) ?? {};
  return {
    ...root,
    sceneShowcase: {
      enabled: state.enabled,
      trackIndex: state.trackIndex,
      previewAsset: state.previewAsset,
      publishedAt: state.publishedAt
    }
  } as Prisma.InputJsonValue;
}
