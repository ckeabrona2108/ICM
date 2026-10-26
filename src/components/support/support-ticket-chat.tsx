"use client";

import * as React from "react";
import Image from "next/image";
import {
  CircleDollarSign,
  Disc3,
  FileText,
  Loader2,
  MessageSquarePlus,
  RotateCw,
  Search,
  Send,
  UserCog
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import type {
  SupportTicketResponse,
  SupportTicketListResponse,
  SupportTicketMutationResponse
} from "@/lib/api/contracts";
import { SUPPORT_STATUS_LABEL, formatSupportDate } from "@/lib/support-ui";

const SUPPORT_TOPICS = [
  { title: "Релиз и модерация", hint: "Статусы, правки, UPC", icon: Disc3, tone: "bg-[#7b61ff]/16 text-[#c4b5fd]" },
  { title: "Выплаты и отчёты", hint: "Начисления, вывод", icon: CircleDollarSign, tone: "bg-emerald-500/12 text-emerald-300" },
  { title: "Договор и документы", hint: "Подписание, реквизиты", icon: FileText, tone: "bg-amber-400/12 text-amber-300" },
  { title: "Аккаунт и доступ", hint: "Вход, профиль, тариф", icon: UserCog, tone: "bg-sky-500/14 text-sky-300" }
] as const;

const TICKET_FILTERS = [
  { id: "all", label: "Все" },
  { id: "open", label: "Открытые" },
  { id: "closed", label: "Закрытые" }
] as const;
type TicketFilter = (typeof TICKET_FILTERS)[number]["id"];

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
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<TicketFilter>("all");
  const listEndRef = React.useRef<HTMLDivElement>(null);
  const newBodyRef = React.useRef<HTMLTextAreaElement>(null);

  const active = tickets.find((t) => t.id === activeId) ?? null;
  const openCount = tickets.filter((ticket) => ticket.status !== "CLOSED").length;
  const filterCounts: Record<TicketFilter, number> = {
    all: tickets.length,
    open: openCount,
    closed: tickets.length - openCount
  };
  const normalizedSearch = search.trim().toLowerCase();
  const visibleTickets = tickets.filter((ticket) => {
    if (filter === "open" && ticket.status === "CLOSED") return false;
    if (filter === "closed" && ticket.status !== "CLOSED") return false;
    if (!normalizedSearch) return true;
    return (
      ticket.subject.toLowerCase().includes(normalizedSearch) ||
      (ticket.lastMessage ?? "").toLowerCase().includes(normalizedSearch)
    );
  });

  const startNewTicket = (topic?: string) => {
    setCreating(true);
    setActiveId(null);
    setError(null);
    setRetryMode(null);
    if (topic) {
      setNewSubject(`${topic}: `);
      window.setTimeout(() => newBodyRef.current?.focus(), 50);
    }
  };

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
        description="Напишите нам — команда отвечает прямо здесь, в рабочее время сервиса."
        actions={
          <button
            type="button"
            onClick={() => startNewTicket()}
            className="ux-button-primary inline-flex h-11 items-center gap-2 rounded-[18px] px-4 text-[15px] font-semibold text-white"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Новое обращение
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SUPPORT_TOPICS.map((topic) => {
          const Icon = topic.icon;
          return (
            <button
              key={topic.title}
              type="button"
              onClick={() => startNewTicket(topic.title)}
              className="flex items-center gap-3 rounded-[22px] border border-white/[0.09] bg-[#13151d] px-4 py-3.5 text-left transition hover:-translate-y-0.5 hover:border-white/[0.16]"
            >
              <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", topic.tone)}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold text-white">{topic.title}</span>
                <span className="block text-[12.5px] text-white/45">{topic.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

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

      <section className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-stretch">
        <aside className="ux-surface flex min-h-[260px] flex-col rounded-[28px] p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-white/45 focus-within:border-[#7b61ff]/50">
              <Search className="h-4 w-4 shrink-0" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по обращениям"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/40"
              />
            </label>
            <button
              type="button"
              onClick={() => void loadTickets()}
              className="ux-control-compact inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/70 transition hover:text-white"
              aria-label="Обновить список тикетов"
            >
              <RotateCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            {TICKET_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors",
                  filter === item.id ? "bg-white/10 text-white" : "text-white/55 hover:text-white"
                )}
              >
                {item.label} <span className="text-white/45">{filterCounts[item.id]}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="ux-loading flex items-center gap-2 rounded-[22px] px-4 py-4 text-[14px] font-medium text-white/65">
                <Loader2 className="h-4 w-4 animate-spin text-[#a78bfa]" />
                Загружаем тикеты...
              </div>
            ) : visibleTickets.length === 0 ? (
              <div className="ux-empty rounded-[22px] border-dashed px-4 py-5 text-[14px] leading-6 text-white/52">
                {tickets.length === 0
                  ? "Обращений пока нет. Выберите тему выше или создайте новое обращение."
                  : "Ничего не нашлось. Попробуйте другой запрос или фильтр."}
              </div>
            ) : (
              visibleTickets.map((ticket) => {
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
                      <p className="min-w-0 truncate text-[14.5px] font-semibold text-white">{ticket.subject}</p>
                      <span className="shrink-0 text-[12px] text-white/45">{formatSupportDate(ticket.updatedAt)}</span>
                    </div>
                    {ticket.lastMessage ? (
                      <p className="mt-1 truncate text-[13px] text-white/55">{ticket.lastMessage}</p>
                    ) : null}
                    <div className="mt-2">
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
                    ref={newBodyRef}
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
                  {saving ? "Создаём..." : "Отправить обращение"}
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
                    <h2 className="truncate text-[22px] font-semibold tracking-[-0.02em] text-white">{active.subject}</h2>
                    <p className="mt-1 text-[13px] text-white/50">
                      Обращение №{active.id.slice(0, 8)} · обновлено {formatSupportDate(active.updatedAt)}
                    </p>
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
                          "flex items-end gap-2.5",
                          message.senderType === "USER" ? "justify-end" : "justify-start"
                        )}
                      >
                        {message.senderType === "USER" ? null : (
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-[#1d1f2a]">
                            <Image src="/brand/logo.png" alt="" width={317} height={400} className="h-5 w-auto" />
                          </span>
                        )}
                        <div className="max-w-[min(100%,620px)]">
                          <div
                            className={cn(
                              "rounded-[20px] px-4 py-3 text-[15px] leading-6",
                              message.senderType === "USER"
                                ? "rounded-br-[6px] bg-[#7b61ff] text-white"
                                : "rounded-bl-[6px] border border-white/[0.07] bg-[#1c1e29] text-white/88"
                            )}
                          >
                            <p className="whitespace-pre-wrap">{message.body}</p>
                          </div>
                          <p
                            className={cn(
                              "mt-1.5 text-[11.5px] font-medium text-white/42",
                              message.senderType === "USER" && "text-right"
                            )}
                          >
                            {message.senderType === "USER" ? "Вы" : "Поддержка ICECREAMMUSIC"} · {formatSupportDate(message.createdAt)}
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
                      className="ux-control flex items-end gap-2 rounded-[20px] p-2"
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
                        placeholder="Напишите сообщение…"
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
                  {active.status === "CLOSED" ? null : (
                    <p className="mt-2 flex items-center gap-1.5 text-[12px] text-white/45">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Команда на связи · Enter — отправить, Shift+Enter — новая строка
                    </p>
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
        "inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-semibold",
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
