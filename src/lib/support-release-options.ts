import type { SupportReleaseOption } from "@/lib/api/contracts";
import { summarizeCabinetRelease, type CabinetReleaseSummary } from "@/lib/cabinet-release-server";
import type { CabinetReleaseStatus } from "@/lib/cabinet-types";
import { prisma } from "@/lib/prisma";
import { isReleaseHiddenFromCabinet } from "@/lib/release-deletion-state";

const ACCEPTED: CabinetReleaseStatus[] = ["approved", "distributed", "dsp_confirmed"];
const ON_MODERATION: CabinetReleaseStatus[] = ["pending_verification", "moderation", "changes_required"];

const STATUS_LABEL: Partial<Record<CabinetReleaseStatus, string>> = {
  approved: "Принят",
  distributed: "Отгружен",
  dsp_confirmed: "На площадках",
  pending_verification: "На модерации",
  moderation: "На модерации",
  changes_required: "Нужны правки"
};

const summarySelect = {
  id: true,
  title: true,
  upc: true,
  status: true,
  confirmed: true,
  preview: true,
  performer: true,
  roles: true,
  date: true
} as const;

function isSupportable(status: CabinetReleaseStatus): boolean {
  return ACCEPTED.includes(status) || ON_MODERATION.includes(status);
}

/**
 * The user's releases a support request can be about (accepted first, then on moderation).
 * One light query: no tracks, no S3 checks — the picker must open instantly.
 */
export async function listSupportReleaseOptions(userId: string): Promise<SupportReleaseOption[]> {
  const rows = await prisma.release.findMany({
    where: { userId, status: { not: "rejected" } },
    orderBy: { date: "desc" },
    select: summarySelect
  });

  const options: SupportReleaseOption[] = [];
  for (const row of rows) {
    if (isReleaseHiddenFromCabinet(row.roles)) continue;
    const summary = summarizeCabinetRelease(row);
    if (!isSupportable(summary.status)) continue;
    options.push({
      id: summary.id,
      title: summary.title,
      artist: summary.artist,
      upc: summary.upc,
      coverUrl: summary.coverUrl,
      releaseDate: row.date ? row.date.toISOString().slice(0, 10) : null,
      group: ACCEPTED.includes(summary.status) ? "accepted" : "moderation",
      statusLabel: STATUS_LABEL[summary.status] ?? summary.status
    });
  }
  // Stable: keeps date order inside each group.
  return options.sort((a, b) => (a.group === b.group ? 0 : a.group === "accepted" ? -1 : 1));
}

/** One of the user's releases for a new ticket, or null if it is not theirs / not supportable. */
export async function getSupportReleaseForUser(
  userId: string,
  releaseId: string
): Promise<CabinetReleaseSummary | null> {
  const row = await prisma.release.findFirst({
    where: { id: releaseId, userId },
    select: summarySelect
  });
  if (!row || isReleaseHiddenFromCabinet(row.roles)) return null;
  const summary = summarizeCabinetRelease(row);
  return isSupportable(summary.status) ? summary : null;
}
