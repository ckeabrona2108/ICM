"use client";

import * as React from "react";

import type {
  SupportTicketMutationResponse,
  SupportTicketResponse,
  SupportTicketStatusValue
} from "@/lib/api/contracts";
import { cn } from "@/lib/utils";
import {
  SUPPORT_STATUS_LABEL,
  formatSupportDate,
  supportStatusBadgeClass
} from "@/lib/support-ui";

export function AdminSupportTicketDetail({
  initialTicket
}: {
  initialTicket: SupportTicketResponse;
}) {
  const [ticket, setTicket] = React.useState(initialTicket);
  const [status, setStatus] = React.useState<SupportTicketStatusValue>(initialTicket.status);
  const [reply, setReply] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function updateStatus(nextStatus: SupportTicketStatusValue) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticket.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = (await response.json().catch(() => null)) as
        | SupportTicketMutationResponse
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("ticket" in payload)) {
        throw new Error((payload && "error" in payload && payload.error) || "Не удалось обновить статус.");
      }
      setTicket(payload.ticket);
      setStatus(payload.ticket.status);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Не удалось обновить статус.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    const body = reply.trim();
    if (!body || busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticket.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body })
      });
      const payload = (await response.json().catch(() => null)) as
        | SupportTicketMutationResponse
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("ticket" in payload)) {
        throw new Error((payload && "error" in payload && payload.error) || "Не удалось отправить ответ.");
      }
      setTicket(payload.ticket);
      setStatus(payload.ticket.status);
      setReply("");
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : "Не удалось отправить ответ.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.08] bg-[#161720] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-semibold text-white">{ticket.subject}</h2>
            <p className="mt-1 text-[14px] text-white/65">
              Пользователь: {ticket.userName} · {ticket.userEmail}
            </p>
          </div>
          <span
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[12px] font-medium",
              supportStatusBadgeClass(ticket.status)
            )}
          >
            {SUPPORT_STATUS_LABEL[ticket.status]}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="text-[13px] text-white/65" htmlFor="ticket-status">
            Статус:
          </label>
          <select
            id="ticket-status"
            value={status}
            onChange={(event) => {
              const value = event.target.value as SupportTicketStatusValue;
              setStatus(value);
            }}
            className="h-10 rounded-lg border border-white/[0.12] bg-[#11131b] px-3 text-[14px] text-white outline-none"
            disabled={busy}
          >
            {(["OPEN", "IN_PROGRESS", "WAITING_USER", "CLOSED"] as const).map((value) => (
              <option key={value} value={value}>
                {SUPPORT_STATUS_LABEL[value]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              void updateStatus(status);
            }}
            disabled={busy || status === ticket.status}
            className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-2 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Сохранить статус
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-[#161720] p-4">
        <div className="space-y-3">
          {ticket.messages?.map((message) => (
            <div
              key={message.id}
              className={cn("flex", message.senderType === "ADMIN" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[min(100%,640px)] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed",
                  message.senderType === "ADMIN"
                    ? "rounded-br-md bg-[#7b3df5]/90 text-white"
                    : "rounded-bl-md border border-white/[0.08] bg-white/[0.05] text-white/90"
                )}
              >
                <p>{message.body}</p>
                <p className="mt-1.5 text-[11px] text-white/50">
                  {message.senderType === "ADMIN" ? "Администратор" : "Пользователь"} ·{" "}
                  {formatSupportDate(message.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-white/[0.08] pt-4">
          <label className="block text-[13px] text-white/65">Ответ админа</label>
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={4}
            className="mt-2 w-full resize-none rounded-xl border border-white/[0.12] bg-[#11131b] px-3 py-2 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            placeholder="Введите ответ пользователю..."
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void sendReply();
              }}
              disabled={busy || !reply.trim()}
              className="rounded-lg bg-[#7b3df5] px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[#8b4ff7] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Отправить ответ
            </button>
            <span className="text-[12px] text-white/50">
              После ответа статус автоматически станет «Ожидает пользователя».
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}
