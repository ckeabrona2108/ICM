"use client";

import * as React from "react";
import Link from "next/link";

import type { SupportTicketResponse, SupportTicketStatusValue } from "@/lib/api/contracts";
import { cn } from "@/lib/utils";
import {
  SUPPORT_STATUS_LABEL,
  formatSupportDate,
  supportStatusBadgeClass
} from "@/lib/support-ui";

export function AdminSupportTicketsList({
  initialTickets
}: {
  initialTickets: SupportTicketResponse[];
}) {
  const [filter, setFilter] = React.useState<"ALL" | SupportTicketStatusValue>("ALL");

  const filtered = React.useMemo(
    () =>
      initialTickets.filter((ticket) => (filter === "ALL" ? true : ticket.status === filter)),
    [filter, initialTickets]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "OPEN", "IN_PROGRESS", "WAITING_USER", "CLOSED"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
              filter === value
                ? "border-[#7b3df5]/40 bg-[#7b3df5]/18 text-white"
                : "border-white/[0.1] bg-white/[0.03] text-white/75 hover:bg-white/[0.05] hover:text-white"
            )}
          >
            {value === "ALL" ? "Все" : SUPPORT_STATUS_LABEL[value]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#161720] px-5 py-6 text-[14px] text-white/65">
          Тикетов по текущему фильтру нет.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/admin/support/tickets/${ticket.id}`}
              className="block rounded-2xl border border-white/[0.08] bg-[#161720] px-5 py-4 transition-colors hover:border-white/[0.16]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[16px] font-semibold text-white">{ticket.subject}</p>
                <span
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[12px] font-medium",
                    supportStatusBadgeClass(ticket.status)
                  )}
                >
                  {SUPPORT_STATUS_LABEL[ticket.status]}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-white/65">
                Пользователь: {ticket.userName} · {ticket.userEmail}
              </p>
              {ticket.lastMessage ? (
                <p className="mt-2 line-clamp-2 text-[14px] text-white/75">{ticket.lastMessage}</p>
              ) : null}
              <p className="mt-2 text-[12.5px] text-white/50">
                Обновлён: {formatSupportDate(ticket.updatedAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
