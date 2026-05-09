import { addMonths } from "date-fns";

import type { EffectivePlan } from "@/lib/subscription-limits";
import type { ReleasePaymentSnapshot } from "@/lib/release-payment";

export interface BackfillReleaseRecord {
  id: string;
  userId: string;
  status: string;
  createdAt: Date;
  updatedAt?: Date | null;
  moderationStartedAt: Date | null;
  submissionData: unknown;
}

export interface BackfillSubscriptionPaymentRecord {
  userId: string;
  tariffId: string;
  paidAt: Date | null;
  createdAt: Date;
}

interface CoverageWindow {
  userId: string;
  plan: EffectivePlan;
  start: Date;
  end: Date;
}

const SUPPORTED_STATUSES = new Set([
  "PENDING_VERIFICATION",
  "MODERATION",
  "CHANGES_REQUIRED",
  "REJECTED",
  "APPROVED",
  "DISTRIBUTED",
  "ARCHIVED"
]);

function toPlan(tariffId: string): EffectivePlan | null {
  const normalized = tariffId.trim().toLowerCase();
  if (normalized === "pro") return "PRO";
  if (normalized === "enterprise") return "ENTERPRISE";
  if (normalized === "standard") return "STANDARD";
  return null;
}

function planReleaseLimit(plan: EffectivePlan): number | null {
  if (plan === "ENTERPRISE") return null;
  if (plan === "PRO") return 6;
  return 1;
}

function readSubmissionData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasPaymentSnapshot(value: unknown): boolean {
  const submission = readSubmissionData(value);
  if (!submission) return false;
  if (!submission.paymentSnapshot || typeof submission.paymentSnapshot !== "object") return false;
  const snapshot = submission.paymentSnapshot as Record<string, unknown>;
  return snapshot.kind === "subscription_included" && snapshot.version === 1;
}

function resolveSubmitMoment(release: BackfillReleaseRecord): Date {
  return release.moderationStartedAt ?? release.updatedAt ?? release.createdAt;
}

function resolveSubmitMomentInWindow(
  release: BackfillReleaseRecord,
  window: CoverageWindow
): Date {
  if (release.moderationStartedAt) return release.moderationStartedAt;

  const createdAt = release.createdAt;
  const updatedAt = release.updatedAt ?? release.createdAt;
  const start = window.start.getTime();
  const end = window.end.getTime();
  const createdTs = createdAt.getTime();
  const updatedTs = updatedAt.getTime();

  if (createdTs >= start && createdTs < end) return createdAt;
  if (updatedTs >= start && updatedTs < end) return updatedAt;
  if (createdTs < start && updatedTs >= start) return new Date(start);

  return resolveSubmitMoment(release);
}

function buildCoverageWindows(
  payments: BackfillSubscriptionPaymentRecord[]
): CoverageWindow[] {
  const byUser = new Map<string, BackfillSubscriptionPaymentRecord[]>();
  for (const payment of payments) {
    const plan = toPlan(payment.tariffId);
    if (!plan) continue;
    const list = byUser.get(payment.userId) ?? [];
    list.push(payment);
    byUser.set(payment.userId, list);
  }

  const windows: CoverageWindow[] = [];
  for (const [userId, list] of byUser) {
    const sorted = list
      .slice()
      .sort(
        (a, b) =>
          (a.paidAt ?? a.createdAt).getTime() - (b.paidAt ?? b.createdAt).getTime()
      );

    let currentEnd: Date | null = null;
    for (const payment of sorted) {
      const plan = toPlan(payment.tariffId);
      if (!plan) continue;
      const paidMoment = payment.paidAt ?? payment.createdAt;
      const end: Date =
        currentEnd && paidMoment.getTime() < currentEnd.getTime()
          ? addMonths(currentEnd, 1)
          : addMonths(paidMoment, 1);
      windows.push({
        userId,
        plan,
        start: paidMoment,
        end
      });
      currentEnd = end;
    }
  }

  return windows;
}

function buildSnapshot(params: {
  plan: EffectivePlan;
  usedAfterSubmit: number;
}): ReleasePaymentSnapshot {
  return {
    version: 1,
    kind: "subscription_included",
    plan: params.plan,
    releasesUsedAfterSubmit: params.usedAfterSubmit,
    releasesLimit: planReleaseLimit(params.plan)
  };
}

export interface BackfillResultItem {
  releaseId: string;
  snapshot: ReleasePaymentSnapshot;
}

export function buildReleasePaymentBackfill(params: {
  releases: BackfillReleaseRecord[];
  successfulSubscriptionPayments: BackfillSubscriptionPaymentRecord[];
  oneTimePaidReleaseIds: Set<string>;
}): BackfillResultItem[] {
  const coverageWindows = buildCoverageWindows(params.successfulSubscriptionPayments);
  if (coverageWindows.length === 0) return [];

  const candidates = params.releases.filter((release) => {
    if (!SUPPORTED_STATUSES.has(release.status)) return false;
    if (params.oneTimePaidReleaseIds.has(release.id)) return false;
    if (hasPaymentSnapshot(release.submissionData)) return false;
    return true;
  });

  const byUser = new Map<string, BackfillReleaseRecord[]>();
  for (const release of candidates) {
    const list = byUser.get(release.userId) ?? [];
    list.push(release);
    byUser.set(release.userId, list);
  }

  const result: BackfillResultItem[] = [];

  for (const [userId, userReleases] of byUser) {
    const userWindows = coverageWindows
      .filter((window) => window.userId === userId)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    if (userWindows.length === 0) continue;
    const assignedReleaseIds = new Set<string>();

    for (const window of userWindows) {
      const inWindow = userReleases
        .filter((release) => {
          if (assignedReleaseIds.has(release.id)) return false;
          const submitAt = resolveSubmitMomentInWindow(release, window).getTime();
          return submitAt >= window.start.getTime() && submitAt < window.end.getTime();
        })
        .sort((a, b) => {
          const left = resolveSubmitMomentInWindow(a, window).getTime();
          const right = resolveSubmitMomentInWindow(b, window).getTime();
          return left - right;
        });

      const limit = planReleaseLimit(window.plan);
      const included =
        limit == null ? inWindow : inWindow.slice(0, Math.max(0, limit));

      included.forEach((release, index) => {
        assignedReleaseIds.add(release.id);
        result.push({
          releaseId: release.id,
          snapshot: buildSnapshot({
            plan: window.plan,
            usedAfterSubmit: index + 1
          })
        });
      });
    }
  }

  return result;
}

export function mergeSubmissionDataWithSnapshot(
  submissionData: unknown,
  snapshot: ReleasePaymentSnapshot
): Record<string, unknown> {
  const source = readSubmissionData(submissionData) ?? {};
  return {
    ...source,
    paymentSnapshot: snapshot
  };
}
