import type { FinanceReportStatus } from "@/lib/finance-policy";

export interface FinanceReportClientItem {
  id: string;
  period: string;
  amount: number;
  status: FinanceReportStatus;
}

export function mapReportStatusToLabel(status: FinanceReportStatus): "Согласовать" | "Согласован" {
  return status === "agreed" ? "Согласован" : "Согласовать";
}

export function mapReportLabelToStatus(label: string): FinanceReportStatus {
  return label === "Согласован" ? "agreed" : "ready_to_confirm";
}
