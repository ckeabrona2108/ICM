import {
  getExplicitReleaseLifecycleStatus,
  shouldTreatReleaseAsApproved
} from "@/lib/release-counts";

export interface SceneReleaseEligibilityInput {
  status: string | null | undefined;
  confirmed?: boolean | null;
  upc?: string | null;
  roles?: unknown;
  releaseDate: Date | string | null | undefined;
}

export const SCENE_RELEASE_WINDOW_DAYS = 45;

export function isReleaseVisibleOnScene(
  release: SceneReleaseEligibilityInput,
  now = new Date()
): boolean {
  const explicitLifecycle = getExplicitReleaseLifecycleStatus(release.roles);
  if (explicitLifecycle === "archived") return false;

  const releaseDate = release.releaseDate ? new Date(release.releaseDate) : null;
  if (!releaseDate || Number.isNaN(releaseDate.getTime()) || releaseDate > now) {
    return false;
  }

  const oldestVisibleDate = new Date(now);
  oldestVisibleDate.setUTCDate(oldestVisibleDate.getUTCDate() - SCENE_RELEASE_WINDOW_DAYS);
  if (releaseDate < oldestVisibleDate) return false;

  return shouldTreatReleaseAsApproved(release);
}

export function normalizeSceneGenre(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized || "Другое";
}
