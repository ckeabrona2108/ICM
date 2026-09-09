import type { Prisma } from "@prisma/client";

import { getReleaseLifecycleStatus } from "@/lib/release-counts";

export const DRAFT_RETENTION_DAYS = 180;

interface DraftRetentionRelease {
  status: string | null | undefined;
  confirmed?: boolean | null;
  upc?: string | null;
  roles?: unknown;
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

export function getDraftLastChangedAt(roles: unknown): Date | null {
  const root = asRecord(roles);
  const raw = asString(root?.draftUpdatedAt) ?? asString(root?.draftLastChangedAt);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function withDraftLastChangedAt(roles: unknown, date = new Date()): Prisma.InputJsonValue {
  const root = asRecord(roles) ? structuredClone(roles as Record<string, unknown>) : {};
  root.draftUpdatedAt = date.toISOString();
  return root as Prisma.InputJsonValue;
}

export function isReleaseDraftExpired(
  release: DraftRetentionRelease,
  now = new Date()
): boolean {
  const lifecycle = getReleaseLifecycleStatus(release.status, release.roles);
  if (lifecycle !== "draft") return false;
  if (release.confirmed || release.upc) return false;

  const lastChangedAt = getDraftLastChangedAt(release.roles);
  if (!lastChangedAt) return false;

  const expiresAt = lastChangedAt.getTime() + DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return expiresAt <= now.getTime();
}
