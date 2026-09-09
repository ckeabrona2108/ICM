"use client";

import * as React from "react";
import { Loader2, MessageSquarePlus, RotateCw, Send } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import type {
  SupportTicketResponse,
  SupportTicketListResponse,
  SupportTicketMutationResponse
} from "@/lib/api/contracts";
import { SUPPORT_STATUS_LABEL, formatSupportDate } from "@/lib/support-ui";

function publishSupportUnreadCount(count: number) {
  window.dispatchEvent(
    new CustomEvent("dashboard:support-unread-count", {
      detail: { count: Math.max(0, Math.floor(count)) }
    })
  );
}

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
  const [retryMode, setRetryMode] = React.useState<"load" | "details" | "create" | "message" | null>(null);
  const listEndRef = React.useRef<HTMLDivElement>(null);

  const active = tickets.find((t) => t.id === activeId) ?? null;

  const refreshUnreadCount = React.useCallback(async () => {
    try {
      const response = await fetch("/api/support/unread-count", {
        method: "GET",
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => null)) as
        | { count?: number }
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("count" in payload) || typeof payload.count !== "number") return;
      publishSupportUnreadCount(payload.count);
    } catch {
      // ignore transient failures
    }
  }, []);

  const loadTickets = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setRetryMode(null);
    try {
      const response = await fetch("/api/support/tickets", { method: "GET", cache: "no-store" });
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
      publishSupportUnreadCount(0);
      void refreshUnreadCount();
    } catch (loadError) {
      setRetryMode("load");
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить тикеты.");
    } finally {
      setLoading(false);
    }
  }, [refreshUnreadCount]);

  React.useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  React.useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.messages?.length, activeId]);

  const loadTicketDetails = React.useCallback(async (ticketId: string) => {
    try {
      setError(null);
      setRetryMode(null);
      const response = await fetch(`/api/support/tickets/${ticketId}`, { method: "GET", cache: "no-store" });
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
      setRetryMode("details");
      setError(
        detailsError instanceof Error ? detailsError.message : "Не удалось загрузить переписку."
      );
    }
  }, [refreshUnreadCount]);

  React.useEffect(() => {
    if (!activeId || creating) return;
    const activeTicket = tickets.find((ticket) => ticket.id === activeId);
    if (!activeTicket || activeTicket.messages !== undefined) return;
    void loadTicketDetails(activeId);
  }, [activeId, creating, loadTicketDetails, tickets]);

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
    setRetryMode(null);
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
      setRetryMode("create");
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
    setRetryMode(null);
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
      setRetryMode("message");
      setError(
        messageError instanceof Error ? messageError.message : "Не удалось отправить сообщение."
      );
    } finally {
      setSaving(false);
    }
  };

  const retryCurrentAction = React.useCallback(() => {
    if (retryMode === "load") {
      void loadTickets();
      return;
    }
    if (retryMode === "details" && activeId) {
      void loadTicketDetails(activeId);
      return;
    }
    if (retryMode === "create") {
      void openNewTicket();
      return;
    }
    if (retryMode === "message") {
      void sendMessage();
    }
  }, [activeId, loadTicketDetails, loadTickets, retryMode]);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Поддержка"
        description="Создавайте обращения, следите за ответами администратора и продолжайте переписку без перезагрузки страницы."
        actions={
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setActiveId(null);
              setError(null);
              setRetryMode(null);
            }}
            className="ux-button-primary inline-flex h-11 items-center gap-2 rounded-[18px] px-4 text-[15px] font-semibold text-white"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Новый тикет
          </button>
        }
      />

      {error ? (
        <div className="ux-error flex flex-wrap items-center justify-between gap-3 rounded-[22px] px-4 py-3 text-sm text-rose-100" role="alert" aria-live="assertive">
          <span>{error}</span>
          {retryMode ? (
            <button
              type="button"
              onClick={retryCurrentAction}
              className="ux-control-compact inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-rose-50 transition hover:bg-rose-200/10"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-stretch">
        <aside className="ux-surface flex min-h-[260px] flex-col rounded-[28px] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c7bcff]">Ваши обращения</p>
              <p className="mt-2 text-sm leading-6 text-white/60">Все тикеты и статусы поддержки в одном месте.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadTickets()}
              className="ux-control-compact inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/70 transition hover:text-white"
              aria-label="Обновить список тикетов"
            >
              <RotateCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
            </button>
          </div>

          <div className="mt-4 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="ux-loading flex items-center gap-2 rounded-[22px] px-4 py-4 text-[14px] font-medium text-white/65">
                <Loader2 className="h-4 w-4 animate-spin text-[#a78bfa]" />
                Загружаем тикеты...
              </div>
            ) : tickets.length === 0 ? (
              <div className="ux-empty rounded-[22px] border-dashed px-4 py-5 text-[14px] leading-6 text-white/52">
                Тикетов пока нет. Создайте первое обращение, и переписка появится здесь.
              </div>
            ) : (
              tickets.map((ticket) => {
                const activeTicket = activeId === ticket.id && !creating;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => {
                      setActiveId(ticket.id);
                      setCreating(false);
                      void loadTicketDetails(ticket.id);
                    }}
                    className={cn(
                      "rounded-[22px] border p-3 text-left transition",
                      activeTicket
                        ? "ux-pill-active border-[#7b61ff]/40 text-white"
                        : "ux-surface-soft text-white/74 hover:border-white/[0.14] hover:bg-white/[0.055] hover:text-white"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-white">{ticket.subject}</p>
                        <p className="mt-1 text-[12px] text-white/48">{formatSupportDate(ticket.updatedAt)}</p>
                      </div>
                      <SupportStatusPill status={ticket.status} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="ux-surface flex min-h-[520px] flex-col overflow-hidden rounded-[28px]">
          {creating ? (
            <div className="flex flex-1 flex-col p-5 sm:p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c7bcff]">Новое обращение</p>
                <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-white">Опишите вопрос</h2>
                <p className="mt-2 text-[15px] leading-6 text-white/62">
                  После отправки обращение сразу появится в панели поддержки администратора.
                </p>
              </div>

              <div className="mt-6 grid gap-4">
                <Field label="Тема">
                  <input
                    value={newSubject}
                    onChange={(event) => setNewSubject(event.target.value)}
                    placeholder="Кратко о проблеме"
                    className="ux-control h-12 w-full rounded-[18px] px-4 text-[15px] font-medium text-white placeholder:text-white/35 outline-none focus:border-[#7b61ff]/60 focus:bg-white/[0.055]"
                  />
                </Field>

                <Field label="Сообщение">
                  <textarea
                    value={newBody}
                    onChange={(event) => setNewBody(event.target.value)}
                    placeholder="Опишите вопрос максимально подробно"
                    rows={7}
                    className="ux-control min-h-[176px] w-full resize-none rounded-[22px] px-4 py-3 text-[15px] leading-6 text-white placeholder:text-white/35 outline-none focus:border-[#7b61ff]/60 focus:bg-white/[0.055]"
                  />
                </Field>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void openNewTicket();
                  }}
                  disabled={!newSubject.trim() || !newBody.trim() || saving}
                  className="ux-button-primary inline-flex h-11 items-center rounded-[18px] px-5 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {saving ? "Создаём..." : "Открыть тикет"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setActiveId(tickets[0]?.id ?? null);
                    setError(null);
                    setRetryMode(null);
                  }}
                  className="ux-control-compact inline-flex h-11 items-center rounded-[18px] px-5 text-[15px] font-semibold text-white/78 transition hover:text-white"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : active ? (
            <>
              <header className="border-b border-white/[0.08] px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c7bcff]">Переписка по тикету</p>
                    <h2 className="mt-3 truncate text-[26px] font-semibold tracking-[-0.03em] text-white sm:text-[30px]">{active.subject}</h2>
                    <p className="mt-2 text-[14px] text-white/54">Последнее обновление {formatSupportDate(active.updatedAt)}</p>
                  </div>
                  <SupportStatusPill status={active.status} />
                </div>
              </header>

              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
                  {active.messages?.length ? (
                    active.messages.map((message) => (
                      <article
                        key={message.id}
                        className={cn(
                          "flex",
                          message.senderType === "USER" ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[min(100%,620px)] rounded-[22px] px-4 py-3 text-[15px] leading-6",
                            message.senderType === "USER"
                              ? "ux-pill-active rounded-br-[10px] text-white"
                              : "ux-surface-soft rounded-bl-[10px] text-white/86"
                          )}
                        >
                          <p className="whitespace-pre-wrap">{message.body}</p>
                          <p className={cn("mt-2 text-[11px] font-medium", message.senderType === "USER" ? "text-white/56" : "text-white/42")}>
                            {message.senderType === "ADMIN" ? "Администратор" : "Вы"} · {formatSupportDate(message.createdAt)}
                          </p>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="ux-empty rounded-[22px] border-dashed px-4 py-5 text-[14px] leading-6 text-white/50">
                      Сообщений пока нет. Первым сообщением станет ваше описание проблемы.
                    </div>
                  )}
                  <div ref={listEndRef} />
                </div>

                <div className="border-t border-white/[0.08] px-4 py-4 sm:px-6">
                  {active.status === "CLOSED" ? (
                    <div className="ux-empty rounded-[22px] px-4 py-4 text-center text-[14px] font-medium text-white/54">
                      Тикет закрыт. Если вопрос остался, создайте новый.
                    </div>
                  ) : (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void sendMessage();
                      }}
                      className="ux-control flex items-end gap-2 rounded-[24px] p-2"
                    >
                      <textarea
                        value={composer}
                        onChange={(event) => setComposer(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void sendMessage();
                          }
                        }}
                        rows={1}
                        placeholder="Написать сообщение..."
                        className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-white outline-none placeholder:text-white/30"
                      />
                      <button
                        type="submit"
                        disabled={!composer.trim() || saving}
                        className="ux-button-primary inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] text-white disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Отправить"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
              <div className="ux-empty max-w-xl rounded-[24px] border-dashed px-6 py-8 text-sm leading-6 text-white/48">
                Выберите тикет слева или создайте новый. Все сообщения сохраняются и остаются доступными после обновления страницы.
              </div>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">{label}</span>
      {children}
    </label>
  );
}

function SupportStatusPill({ status }: { status: SupportTicketResponse["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.16em]",
        status === "OPEN" && "border border-amber-400/24 bg-amber-500/10 text-amber-100",
        status === "IN_PROGRESS" && "border border-sky-400/24 bg-sky-500/10 text-sky-100",
        status === "WAITING_USER" && "border border-violet-400/24 bg-violet-500/10 text-violet-100",
        status === "CLOSED" && "ux-pill text-white/55"
      )}
    >
      {SUPPORT_STATUS_LABEL[status] ?? status}
    </span>
  );
}
