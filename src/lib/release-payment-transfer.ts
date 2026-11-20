import type { Prisma, PrismaClient } from "@prisma/client";

import { getReleaseLifecycleStatus } from "@/lib/release-counts";
import { getReleaseDeletionState, withReleaseDeletionApproved } from "@/lib/release-deletion-state";
import { getReleasePaymentUsageFromRoles } from "@/lib/release-quota";
import { readReleaseUpc } from "@/lib/release-resubmission";

/**
 * A paid release sent back for changes, and a new release the artist made instead of fixing it.
 *
 * Artists sometimes start a new release with the same title and UPC instead of pressing
 * "Исправить" on the paid one. The new release then asks for a second payment. The payment
 * moves to the new release and the old one is closed as replaced, so nobody pays twice.
 * A UPC alone is not proof of payment for an approved release (see findPaidPredecessorRelease);
 * here the old release was never published, so its payment has not been used.
 */

export interface PaidTwinCandidate {
  id: string;
  title: string | null;
  status: string | null;
  confirmed: boolean | null;
  upc: string | null;
  roles: unknown;
}

export interface PaidTwin {
  id: string;
  title: string;
  /** "upc" moves the payment automatically; "title" only warns the artist. */
  match: "upc" | "title";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/gu, " ");
}

/** A paid release waiting for the artist's changes, whose payment can still move. */
export function isPaidReleaseAwaitingChanges(candidate: PaidTwinCandidate): boolean {
  if (!candidate.confirmed) return false;
  const roles = asRecord(candidate.roles);
  if (getReleaseDeletionState(roles)?.status === "deleted") return false;
  if (typeof roles?.mergedIntoReleaseId === "string" || typeof roles?.paymentMovedToReleaseId === "string") return false;
  const usage = getReleasePaymentUsageFromRoles(roles)?.type;
  // The free single is tied to its release by its own claim; it is fixed in place.
  if (usage !== "standalone_payment" && usage !== "subscription" && usage !== "partner_code") return false;
  const lifecycle = getReleaseLifecycleStatus(candidate.status as never, roles);
  return lifecycle === "changes_required" || candidate.status === "rejected";
}

export function pickPaidTwin(
  candidates: readonly PaidTwinCandidate[],
  release: { id: string; title: string | null; upc: string | null }
): PaidTwin | null {
  const upc = release.upc?.trim() || null;
  const title = normalizeTitle(release.title);
  const open = candidates.filter((candidate) => candidate.id !== release.id && isPaidReleaseAwaitingChanges(candidate));
  const byUpc = upc ? open.find((candidate) => readReleaseUpc(candidate) === upc) : undefined;
  if (byUpc) return { id: byUpc.id, title: byUpc.title?.trim() || "Без названия", match: "upc" };
  const byTitle = title ? open.find((candidate) => normalizeTitle(candidate.title) === title) : undefined;
  if (byTitle) return { id: byTitle.id, title: byTitle.title?.trim() || "Без названия", match: "title" };
  return null;
}

type TwinDb = { release: Pick<PrismaClient["release"], "findMany"> };

export async function findPaidTwin(
  db: TwinDb,
  params: { userId: string; releaseId: string; title: string | null; upc: string | null }
): Promise<PaidTwin | null> {
  const candidates = await db.release.findMany({
    where: { userId: params.userId, confirmed: true, id: { not: params.releaseId } },
    select: { id: true, title: true, status: true, confirmed: true, upc: true, roles: true }
  });
  return pickPaidTwin(candidates, { id: params.releaseId, title: params.title, upc: params.upc });
}

/** Key in `release.roles` of the new release: where its payment came from. */
export const PAYMENT_TRANSFER_KEY = "paymentTransferredFrom";

/** Roles of the new release once it carries the old release's payment. */
export function withTransferredPayment(
  roles: unknown,
  source: { id: string; title: string; roles: unknown },
  params: { by: string; at?: Date }
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(asRecord(roles) ?? {}) };
  const usage = asRecord(asRecord(source.roles)?.paymentUsage);
  if (usage) next.paymentUsage = usage;
  next[PAYMENT_TRANSFER_KEY] = {
    releaseId: source.id,
    title: source.title,
    at: (params.at ?? new Date()).toISOString(),
    by: params.by
  };
  delete next.paymentReminders;
  return next;
}

/** Roles of the old release once its payment moved: hidden like a merged copy. */
export function withPaymentMovedAway(
  roles: unknown,
  target: { id: string; title: string },
  params: { adminId: string | null; at?: Date }
): Record<string, unknown> {
  const next = withReleaseDeletionApproved(roles, { adminId: params.adminId ?? "system", decidedAt: params.at }) as Record<
    string,
    unknown
  >;
  next.deletionRequest = {
    ...(asRecord(next.deletionRequest) ?? {}),
    comment: `Оплата перенесена в новый релиз «${target.title}»: артист отправил исправленную версию отдельным релизом.`
  };
  next.paymentMovedToReleaseId = target.id;
  return next;
}

type TransferDb = Pick<Prisma.TransactionClient, "release">;

/**
 * Moves the payment of `fromReleaseId` to `toReleaseId` and closes the old release.
 * Returns null when the old release is not a paid release awaiting changes of the same artist.
 */
export async function transferReleasePayment(
  db: TransferDb,
  params: { fromReleaseId: string; toReleaseId: string; adminId: string | null; at?: Date }
): Promise<{ fromTitle: string; toTitle: string } | null> {
  const [from, to] = await Promise.all([
    db.release.findUnique({
      where: { id: params.fromReleaseId },
      select: { id: true, title: true, status: true, confirmed: true, upc: true, roles: true, userId: true }
    }),
    db.release.findUnique({
      where: { id: params.toReleaseId },
      select: { id: true, title: true, confirmed: true, roles: true, userId: true }
    })
  ]);
  if (!from || !to || from.userId !== to.userId || from.id === to.id) return null;
  if (!isPaidReleaseAwaitingChanges(from)) return null;

  const fromTitle = from.title?.trim() || "Без названия";
  const toTitle = to.title?.trim() || "Без названия";
  await db.release.update({
    where: { id: to.id },
    data: {
      confirmed: true,
      roles: withTransferredPayment(to.roles, { id: from.id, title: fromTitle, roles: from.roles }, {
        by: params.adminId ?? "auto",
        at: params.at
      }) as Prisma.InputJsonValue
    }
  });
  await db.release.update({
    where: { id: from.id },
    data: {
      roles: withPaymentMovedAway(from.roles, { id: to.id, title: toTitle }, { adminId: params.adminId, at: params.at }) as Prisma.InputJsonValue
    }
  });
  return { fromTitle, toTitle };
}
