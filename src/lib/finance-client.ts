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
    usageType?: string | null;
    quantity?: number | null;
    authorAmount?: number | null;
    relatedAmount?: number | null;
    periodStart?: string | null;
    periodEnd?: string | null;
  }>;
  platformTotals: Array<{
    platformName: string;
    amount: number;
  }>;
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
