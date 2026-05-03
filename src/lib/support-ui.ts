import type { SupportTicketStatusValue } from "@/lib/api/contracts";

export const SUPPORT_STATUS_LABEL: Record<SupportTicketStatusValue, string> = {
  OPEN: "Открыт",
  IN_PROGRESS: "В работе",
  WAITING_USER: "Ожидает пользователя",
  CLOSED: "Закрыт"
};

export function supportStatusBadgeClass(status: SupportTicketStatusValue): string {
  if (status === "OPEN") {
    return "border-amber-400/25 bg-amber-500/10 text-amber-200";
  }
  if (status === "IN_PROGRESS") {
    return "border-sky-400/25 bg-sky-500/10 text-sky-200";
  }
  if (status === "WAITING_USER") {
    return "border-violet-400/25 bg-violet-500/10 text-violet-200";
  }
  return "border-white/[0.12] bg-white/[0.04] text-white/70";
}

export function formatSupportDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
