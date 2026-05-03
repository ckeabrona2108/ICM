"use client";

import * as React from "react";
import { Loader2, MessageSquarePlus, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  SupportTicketResponse,
  SupportTicketListResponse,
  SupportTicketMutationResponse
} from "@/lib/api/contracts";
import { SUPPORT_STATUS_LABEL, formatSupportDate } from "@/lib/support-ui";

export function SupportTicketChat() {
  const [tickets, setTickets] = React.useState<SupportTicketResponse[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [composer, setComposer] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [newSubject, setNewSubject] = React.useState("");
  const [newBody, setNewBody] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const listEndRef = React.useRef<HTMLDivElement>(null);

  const active = tickets.find((t) => t.id === activeId) ?? null;

  const refreshUnreadCount = React.useCallback(async () => {
    try {
      const response = await fetch("/api/support/unread-count", { method: "GET" });
      const payload = (await response.json().catch(() => null)) as
        | { count?: number }
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("count" in payload) || typeof payload.count !== "number") return;
      window.dispatchEvent(
        new CustomEvent("dashboard:support-unread-count", {
          detail: { count: Math.max(0, Math.floor(payload.count)) }
        })
      );
    } catch {
      // ignore transient failures
    }
  }, []);

  const loadTickets = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/support/tickets", { method: "GET" });
      const payload = (await response.json().catch(() => null)) as
        | SupportTicketListResponse
        | { error?: string }
        | null;

      if (!response.ok || !payload || !("tickets" in payload)) {
        throw new Error(
          (payload && "error" in payload && payload.error) ||
            "Не удалось загрузить тикеты."
        );
      }

      setTickets(payload.tickets);
      setActiveId((prev) => prev ?? payload.tickets[0]?.id ?? null);
      void refreshUnreadCount();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить тикеты.");
    } finally {
      setLoading(false);
    }
  }, [refreshUnreadCount]);

  React.useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  React.useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages?.length, activeId]);

  const loadTicketDetails = React.useCallback(async (ticketId: string) => {
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}`, { method: "GET" });
      const payload = (await response.json().catch(() => null)) as
        | SupportTicketMutationResponse
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("ticket" in payload)) {
        throw new Error(
          (payload && "error" in payload && payload.error) ||
            "Не удалось загрузить переписку."
        );
      }
      setTickets((prev) => prev.map((item) => (item.id === ticketId ? payload.ticket : item)));
      void refreshUnreadCount();
    } catch (detailsError) {
      setError(
        detailsError instanceof Error ? detailsError.message : "Не удалось загрузить переписку."
      );
    }
  }, [refreshUnreadCount]);

  React.useEffect(() => {
    if (!activeId || creating) return;
    const interval = setInterval(() => {
      void loadTicketDetails(activeId);
    }, 15000);
    return () => clearInterval(interval);
  }, [activeId, creating, loadTicketDetails]);

  const openNewTicket = async () => {
    const subject = newSubject.trim();
    const body = newBody.trim();
    if (!subject || !body || saving) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body })
      });
      const payload = (await response.json().catch(() => null)) as
        | SupportTicketMutationResponse
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("ticket" in payload)) {
        throw new Error(
          (payload && "error" in payload && payload.error) || "Не удалось создать тикет."
        );
      }

      setTickets((prev) => [payload.ticket, ...prev.filter((item) => item.id !== payload.ticket.id)]);
      setActiveId(payload.ticket.id);
      setNewSubject("");
      setNewBody("");
      setCreating(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать тикет.");
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async () => {
    const text = composer.trim();
    if (!text || !active || saving) return;
    if (active.status === "CLOSED") return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/support/tickets/${active.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text })
      });
      const payload = (await response.json().catch(() => null)) as
        | SupportTicketMutationResponse
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("ticket" in payload)) {
        throw new Error(
          (payload && "error" in payload && payload.error) ||
            "Не удалось отправить сообщение."
        );
      }

      setTickets((prev) =>
        prev.map((item) => (item.id === payload.ticket.id ? payload.ticket : item))
      );
      setComposer("");
      void refreshUnreadCount();
    } catch (messageError) {
      setError(
        messageError instanceof Error ? messageError.message : "Не удалось отправить сообщение."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col gap-4 pb-8 lg:flex-row lg:gap-0">
      <aside className="flex w-full shrink-0 flex-col border-white/[0.08] lg:w-[320px] lg:border-r lg:pr-4">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-[30px] font-bold tracking-tight text-white sm:text-[34px]">
              Поддержка
            </h1>
            <p className="mt-2 text-[15px] font-medium text-white/68">
              Создавайте обращения и получайте ответы от администратора.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setActiveId(null);
          }}
          className="mb-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#7b3df5] px-4 text-[15px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(123,61,245,0.45)] transition-colors hover:bg-[#8b4ff7]"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Новый тикет
        </button>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-4 text-[14px] font-medium text-white/65">
              <Loader2 className="h-4 w-4 animate-spin text-[#a78bfa]" />
              Загружаем тикеты...
            </div>
          ) : tickets.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/[0.12] px-3 py-4 text-[14px] text-white/58">
              Тикетов пока нет.
            </p>
          ) : (
            tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => {
                  setActiveId(ticket.id);
                  setCreating(false);
                  void loadTicketDetails(ticket.id);
                }}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  activeId === ticket.id && !creating
                    ? "border-[#7b3df5]/40 bg-[#7b3df5]/[0.12] text-white"
                    : "border-transparent bg-white/[0.02] text-white/75 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white"
                )}
              >
                <p className="truncate text-[14px] font-semibold">{ticket.subject}</p>
                <p className="mt-0.5 text-[12px] font-medium text-white/52">
                  {SUPPORT_STATUS_LABEL[ticket.status] ?? ticket.status} · {formatSupportDate(ticket.updatedAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-h-[420px] flex-1 flex-col rounded-2xl border border-white/[0.08] bg-[#13151d]/85 shadow-[0_16px_44px_-28px_rgba(11,14,24,0.95)] backdrop-blur-xl lg:ml-4">
        {creating ? (
          <div className="flex flex-1 flex-col p-5 sm:p-6">
            <h2 className="text-[22px] font-semibold text-white">Новое обращение</h2>
            <p className="mt-1 text-[15px] font-medium text-white/68">
              После отправки тикет появится у администратора в панели поддержки.
            </p>
            <label className="mt-5 block text-[14px] font-medium text-white/72">Тема</label>
            <input
              value={newSubject}
              onChange={(event) => setNewSubject(event.target.value)}
              placeholder="Кратко о проблеме"
              className="mt-1.5 h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white placeholder:text-white/45 outline-none focus:border-[#7b3df5]/60"
            />
            <label className="mt-4 block text-[14px] font-medium text-white/72">Сообщение</label>
            <textarea
              value={newBody}
              onChange={(event) => setNewBody(event.target.value)}
              placeholder="Опишите вопрос максимально подробно"
              rows={5}
              className="mt-1.5 resize-none rounded-xl border border-white/[0.12] bg-black/25 px-3.5 py-2.5 text-[15px] font-medium text-white placeholder:text-white/45 outline-none focus:border-[#7b3df5]/60"
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void openNewTicket();
                }}
                disabled={!newSubject.trim() || !newBody.trim() || saving}
                className="rounded-xl bg-[#7b3df5] px-5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#8b4ff7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Создаём..." : "Открыть тикет"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setActiveId(tickets[0]?.id ?? null);
                }}
                className="rounded-xl border border-white/[0.12] bg-transparent px-5 py-2.5 text-[15px] font-medium text-white/78 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : active ? (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <h2 className="min-w-0 truncate text-[18px] font-semibold text-white sm:text-[20px]">
                {active.subject}
              </h2>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wide",
                  active.status === "OPEN" &&
                    "bg-amber-500/15 text-amber-200/95 ring-1 ring-amber-400/25",
                  active.status === "IN_PROGRESS" &&
                    "bg-sky-500/15 text-sky-200/95 ring-1 ring-sky-400/25",
                  active.status === "WAITING_USER" &&
                    "bg-violet-500/15 text-violet-200/95 ring-1 ring-violet-400/25",
                  active.status === "CLOSED" &&
                    "bg-white/[0.06] text-white/50 ring-1 ring-white/[0.08]"
                )}
              >
                {SUPPORT_STATUS_LABEL[active.status] ?? active.status}
              </span>
            </header>

            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
                {active.messages?.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.senderType === "USER" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[min(100%,520px)] rounded-2xl px-3.5 py-2.5 text-[15px] font-medium leading-relaxed",
                        message.senderType === "USER"
                          ? "rounded-br-md bg-[#7b3df5]/90 text-white shadow-sm"
                          : "rounded-bl-md border border-white/[0.08] bg-white/[0.05] text-white/90"
                      )}
                    >
                      <p>{message.body}</p>
                      <p
                        className={cn(
                          "mt-1.5 text-[11px]",
                          message.senderType === "USER" ? "text-white/55" : "text-white/40"
                        )}
                      >
                        {message.senderType === "ADMIN" ? "Администратор" : "Вы"} ·{" "}
                        {formatSupportDate(message.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={listEndRef} />
              </div>

              <div className="border-t border-white/[0.06] p-3 sm:p-4">
                {active.status === "CLOSED" ? (
                  <p className="text-center text-[14px] font-medium text-white/58">
                    Тикет закрыт. Если вопрос остался, создайте новый.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={composer}
                      onChange={(event) => setComposer(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder="Написать сообщение..."
                      className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white placeholder:text-white/45 outline-none focus:border-[#7b3df5]/60"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void sendMessage();
                      }}
                      disabled={!composer.trim() || saving}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#7b3df5] text-white transition-colors hover:bg-[#8b4ff7] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Отправить"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-[15px] font-medium text-white/62">
              Выберите тикет слева или создайте новый.
            </p>
          </div>
        )}
      </section>

      {error ? (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-[14px] font-medium text-rose-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}
