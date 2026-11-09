import type { PrismaClient } from "@prisma/client";

import { toNotificationStorageId } from "@/lib/notification-storage-id";

/**
 * Real moments in a release's life. The `release` table has no created/updated columns and its
 * `date` is the planned release date, so these are kept in `roles.timeline` from now on and,
 * for older releases, recovered from what was recorded at the time (see readReleaseTimeline).
 */
export type ReleaseTimelineKey = "createdAt" | "submittedAt" | "approvedAt" | "rejectedAt" | "changesRequestedAt";

export interface ReleaseTimeline {
  createdAt: Date | null;
  updatedAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  changesRequestedAt: Date | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Returns roles with `timeline[key]` set. `createdAt` is written only once. */
export function withReleaseTimelineStamp(
  roles: unknown,
  key: ReleaseTimelineKey,
  at: Date = new Date()
): Record<string, unknown> {
  const root: Record<string, unknown> = { ...(asRecord(roles) ?? {}) };
  const timeline: Record<string, unknown> = { ...(asRecord(root.timeline) ?? {}) };
  if (key === "createdAt" && asDate(timeline.createdAt)) return root;
  timeline[key] = at.toISOString();
  root.timeline = timeline;
  return root;
}

/** A resubmitted copy that was merged into the original release: not a release of its own any more. */
export function isMergedResubmissionCopy(roles: unknown): boolean {
  const mergedInto = asRecord(roles)?.mergedIntoReleaseId;
  return typeof mergedInto === "string" && mergedInto.length > 0;
}

export function readReleaseTimeline(
  roles: unknown,
  extra: { moderationStartedAt?: Date | null; decisions?: ReleaseDecisionDates } = {}
): ReleaseTimeline {
  const root = asRecord(roles) ?? {};
  const timeline = asRecord(root.timeline) ?? {};
  const resubmission = asRecord(root.resubmission);
  const paymentReminders = asRecord(root.paymentReminders);
  const updatedAt = asDate(root.draftUpdatedAt) ?? asDate(root.draftLastChangedAt);

  return {
    createdAt: asDate(timeline.createdAt),
    updatedAt,
    submittedAt:
      asDate(timeline.submittedAt) ??
      asDate(resubmission?.submittedAt) ??
      extra.moderationStartedAt ??
      asDate(paymentReminders?.waitingSince),
    approvedAt: asDate(timeline.approvedAt) ?? extra.decisions?.approvedAt ?? null,
    rejectedAt: asDate(timeline.rejectedAt) ?? extra.decisions?.rejectedAt ?? null,
    changesRequestedAt: asDate(timeline.changesRequestedAt) ?? extra.decisions?.changesRequestedAt ?? null
  };
}

export interface ReleaseDecisionDates {
  approvedAt: Date | null;
  rejectedAt: Date | null;
  changesRequestedAt: Date | null;
}

const DECISION_EVENTS: Array<{ prefix: string; key: keyof ReleaseDecisionDates }> = [
  { prefix: "release-approved-", key: "approvedAt" },
  { prefix: "release-rejected-", key: "rejectedAt" },
  { prefix: "release-changes-", key: "changesRequestedAt" }
];

/**
 * Moderation decisions of releases decided before `roles.timeline` existed, recovered from the
 * notification the artist got at that moment (its id is derived from the release id).
 */
export async function loadReleaseDecisionDates(
  prisma: PrismaClient,
  releaseIds: string[]
): Promise<Map<string, ReleaseDecisionDates>> {
  const result = new Map<string, ReleaseDecisionDates>();
  if (releaseIds.length === 0) return result;

  const lookup = new Map<string, { releaseId: string; key: keyof ReleaseDecisionDates }>();
  for (const releaseId of releaseIds) {
    for (const event of DECISION_EVENTS) {
      lookup.set(toNotificationStorageId(`${event.prefix}${releaseId}`), { releaseId, key: event.key });
    }
  }

  try {
    const rows = await prisma.ai_user_notifications.findMany({
      where: { id: { in: [...lookup.keys()] } },
      select: { id: true, created_at: true }
    });
    for (const row of rows) {
      const target = lookup.get(row.id);
      if (!target) continue;
      const dates = result.get(target.releaseId) ?? { approvedAt: null, rejectedAt: null, changesRequestedAt: null };
      dates[target.key] = row.created_at;
      result.set(target.releaseId, dates);
    }
  } catch (error) {
    console.error("[release-timeline] failed to load decision dates", error);
  }
  return result;
}

const MOSCOW_DATE_TIME = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

/** "14.11.2026, 18:05" in Moscow time. */
export function formatMoscowDateTime(value: Date | string | null | undefined): string {
  const date = value instanceof Date ? value : asDate(value);
  return date ? MOSCOW_DATE_TIME.format(date) : "";
}
