import type { FinanceReportStatus } from "@/lib/finance-policy";

export interface FinanceReportClientItem {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: FinanceReportStatus;
  quarter: number | null;
  year: number | null;
  quarterLabel: string;
  adminComment: string | null;
  userComment: string | null;
  items: Array<{
    id: string;
    platformName: string;
    upc: string;
    releaseTitle: string;
    amount: number;
    artistName?: string | null;
    labelName?: string | null;
    usagePeriod?: string | null;
    rightsType?: string | null;
    territory?: string | null;
    contentType?: string | null;
    usageType?: string | null;
    quantity?: number | null;
    streams?: number | null;
    paidStreams?: number | null;
    authorAmount?: number | null;
    relatedAmount?: number | null;
    albumTitle?: string | null;
    lyricsAuthor?: string | null;
    musicAuthor?: string | null;
    authorRightsShare?: number | null;
    relatedRightsShare?: number | null;
    isrc?: string | null;
    licenseeCode?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    /** "Ваша доля" of the line: set only when every line of the report has an exact public share. */
    sharePercent?: import("@/lib/release-share").ReleaseSharePercent | null;
  }>;
  platformTotals: Array<{
    platformName: string;
    amount: number;
  }>;
}

type ReportRightsLine = Pick<FinanceReportClientItem["items"][number], "amount" | "authorAmount" | "relatedAmount">;

function toFiniteAmount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * A report line amount is already net of the platform commission. Source rights
 * values are gross, so scale them to the net line total for a consistent report.
 */
export function resolveNetReportRightsAmounts(item: ReportRightsLine): {
  authorAmount: number | null;
  relatedAmount: number | null;
} {
  const authorAmount = toFiniteAmount(item.authorAmount);
  const relatedAmount = toFiniteAmount(item.relatedAmount);
  const netAmount = toFiniteAmount(item.amount);
  const grossRightsAmount = (authorAmount ?? 0) + (relatedAmount ?? 0);

  if (netAmount === null || grossRightsAmount <= 0) {
    return { authorAmount, relatedAmount };
  }

  if (authorAmount !== null && relatedAmount !== null) {
    const netAuthorAmount = Number((authorAmount * netAmount / grossRightsAmount).toFixed(2));
    return {
      authorAmount: netAuthorAmount,
      relatedAmount: Number((netAmount - netAuthorAmount).toFixed(2))
    };
  }

  return authorAmount !== null
    ? { authorAmount: netAmount, relatedAmount: null }
    : { authorAmount: null, relatedAmount: netAmount };
}

/**
 * A report line as an artist may see it: the gross source rights amounts are replaced by their
 * net share, so the platform commission cannot be derived from the statement. Server-side only
 * callers that build artist-facing data must use this; admin views keep the source values.
 */
export function withNetReportRights<T extends ReportRightsLine>(item: T): T {
  const net = resolveNetReportRightsAmounts(item);
  return { ...item, authorAmount: net.authorAmount, relatedAmount: net.relatedAmount };
}

export function mapReportStatusToLabel(
  status: FinanceReportStatus
): "Согласовать" | "Согласован" | "Требуются изменения" {
  if (status === "agreed") return "Согласован";
  if (status === "changes_requested") return "Требуются изменения";
  return "Согласовать";
}

export function mapReportLabelToStatus(label: string): FinanceReportStatus {
  if (label === "Согласован") return "agreed";
  if (label === "Требуются изменения") return "changes_requested";
  return "ready_to_confirm";
}
