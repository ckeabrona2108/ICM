"use client";

import * as React from "react";
import { Loader2, Search, Send, Trash2 } from "lucide-react";

import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import type {
  DirectConversationListResponse,
  DirectConversationResponse,
  SendDirectMessageResponse
} from "@/lib/api/contracts";
import type { GlobalSearchPayload } from "@/lib/global-search-service";

type Recipient = {
  slug: string;
  name: string;
  avatarUrl: string | null;
  subtitle: string;
};

function profileTypeLabel(value: "artist" | "producer" | "group" | "label") {
  return value === "producer" ? "Продюсер" : value === "label" ? "Лейбл" : value === "group" ? "Группа" : "Артист";
}

function formatMessageClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatMessageDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

function isSameMessageDay(left: string, right: string) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return false;
  return leftDate.toDateString() === rightDate.toDateString();
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-[#211a42] text-sm font-bold text-white/70">
      <img src={src || DEFAULT_USER_AVATAR_URL} alt={name} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.src = DEFAULT_USER_AVATAR_URL; }} />
    </span>
  );
}

function conversationMatches(conversation: DirectConversationResponse, id: string | null) {
  return Boolean(id && conversation.id === id);
}

export function parseCollaborationResponseMessage(body: string) {
  const lines = body.split(/\r?\n/u);
  if (lines[0]?.trim() !== "Отклик на объявление") return null;
  const postLineIndex = lines.findIndex((line) => line.trim().startsWith("Пост: "));
  if (postLineIndex < 0) return null;
  const emptyLineIndex = lines.findIndex((line, index) => index > postLineIndex && !line.trim());
  const messageStartIndex = emptyLineIndex >= 0 ? emptyLineIndex + 1 : postLineIndex + 1;
  return {
    summary: lines[1]?.trim() || "Отклик на объявление",
    announcement: lines.find((line) => line.trim().startsWith("Объявление: "))?.replace(/^Объявление:\s*/u, "").trim() || "",
    release: lines.find((line) => line.trim().startsWith("Релиз в портфолио: "))?.replace(/^Релиз в портфолио:\s*/u, "").trim() || "",
    href: lines[postLineIndex]?.replace(/^Пост:\s*/u, "").trim() || "",
    message: lines.slice(messageStartIndex).join("\n").trim()
  };
}

function normalizeAnnouncementHref(href: string) {
  if (!href) return "";
  const publicPostMatch = href.match(/^\/feed\/post_(.+)$/u);
  if (publicPostMatch?.[1]) {
    return `/dashboard/community?view=collaborations&post=${encodeURIComponent(publicPostMatch[1])}`;
  }
  return href;
}

function getCollaborationContext(conversation: DirectConversationResponse | null) {
  if (!conversation) return null;
  const fromMessages = conversation.messages
    .map((item) => item.deletedForEveryone ? null : parseCollaborationResponseMessage(item.body))
    .find(Boolean);
  const parsed = fromMessages ?? (conversation.lastMessage ? parseCollaborationResponseMessage(conversation.lastMessage) : null);
  return parsed ? { ...parsed, href: normalizeAnnouncementHref(parsed.href) } : null;
}

function messagePreview(body: string | null) {
  if (!body) return "Пока нет сообщений";
  const parsed = parseCollaborationResponseMessage(body);
  const text = (parsed?.message || body)
    .replace(/^Пост:\s*\S+\s*$/gimu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return text || "Отклик на объявление";
}

function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+|\/dashboard\/[^\s]+)/giu);
  return (
    <>
      {parts.map((part, index) => {
        if (/^(https?:\/\/|\/dashboard\/)/iu.test(part)) {
          return (
            <a key={`${part}-${index}`} href={part} className="font-semibold underline decoration-white/30 underline-offset-4 hover:decoration-white" target={part.startsWith("http") ? "_blank" : undefined} rel={part.startsWith("http") ? "noreferrer" : undefined}>
              {part}
            </a>
          );
        }
        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
      })}
    </>
  );
}

export function getDirectConversationReadKey(conversation: DirectConversationResponse | null): string | null {
  if (!conversation || conversation.unreadCount < 1) return null;
  const latestUnreadIncoming = [...conversation.messages]
    .reverse()
    .find((item) => !item.isOwn && !item.readAt && !item.deletedForEveryone);
  return `${conversation.id}:${latestUnreadIncoming?.id ?? conversation.unreadCount}`;
}

export function DirectMessagesPanel() {
  const [conversations, setConversations] = React.useState<DirectConversationResponse[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<Recipient[]>([]);
  const [selectedRecipient, setSelectedRecipient] = React.useState<Recipient | null>(null);
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [searching, setSearching] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [deletingConversationId, setDeletingConversationId] = React.useState<string | null>(null);
  const [deletingMessageKey, setDeletingMessageKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const listEndRef = React.useRef<HTMLDivElement>(null);
  const messageInputRef = React.useRef<HTMLTextAreaElement>(null);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? null;
  const activeCollaborationContext = getCollaborationContext(activeConversation);
  const activeRecipient = selectedRecipient ?? (activeConversation ? {
    slug: activeConversation.participant.id,
    name: activeConversation.participant.name,
    avatarUrl: activeConversation.participant.avatarUrl,
    subtitle: profileTypeLabel(activeConversation.participant.profileType)
  } : null);

  const ensureConversationBySlug = React.useCallback(async (recipientSlug: string, current: DirectConversationResponse[] = []) => {
    setError(null);
    try {
      const response = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientSlug })
      });
      const payload = (await response.json().catch(() => null)) as SendDirectMessageResponse | { error?: string } | null;
      if (!response.ok || !payload || !("conversation" in payload)) {
        throw new Error((payload && "error" in payload && payload.error) || "Не удалось открыть диалог.");
      }
      setConversations([payload.conversation, ...current.filter((item) => item.id !== payload.conversation.id)]);
      setActiveId(payload.conversation.id);
      setSelectedRecipient(null);
      window.history.replaceState(null, "", `/dashboard/messages?conversationId=${encodeURIComponent(payload.conversation.id)}`);
      window.requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Не удалось открыть диалог.");
    }
  }, []);

  const loadConversations = React.useCallback(async (options?: {
    silent?: boolean;
    messageConversationId?: string | null;
  }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const requestedConversationId = options?.messageConversationId ?? params.get("conversationId");
      const requestUrl = requestedConversationId
        ? `/api/messages?conversationId=${encodeURIComponent(requestedConversationId)}`
        : "/api/messages";
      const response = await fetch(requestUrl, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as DirectConversationListResponse | { error?: string } | null;
      if (!response.ok || !payload || !("conversations" in payload)) {
        throw new Error((payload && "error" in payload && payload.error) || "Не удалось загрузить сообщения.");
      }
      const hydratedConversationId = payload.conversations.some((item) => item.id === requestedConversationId)
        ? requestedConversationId
        : payload.conversations[0]?.id ?? null;
      setConversations((current) => payload.conversations.map((conversation) => {
        if (conversation.id === hydratedConversationId) return conversation;
        const existing = current.find((item) => item.id === conversation.id);
        return existing ? { ...conversation, messages: existing.messages } : conversation;
      }));
      const urlId = params.get("conversationId");
      const recipientSlug = params.get("recipientSlug");
      const preferred = payload.conversations.find((item) => conversationMatches(item, urlId))?.id ?? payload.conversations[0]?.id ?? null;
      setActiveId((prev) => {
        if (prev && payload.conversations.some((item) => item.id === prev)) return prev;
        return preferred;
      });
      if (recipientSlug && !options?.silent) {
        await ensureConversationBySlug(recipientSlug, payload.conversations);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить сообщения.");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [ensureConversationBySlug]);

  React.useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  React.useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeConversation?.messages.length, activeId]);

  const activeConversationReadKey = getDirectConversationReadKey(activeConversation);
  React.useEffect(() => {
    if (!activeId || !activeConversationReadKey) return;
    void fetch(`/api/messages/${activeId}/read`, { method: "POST" })
      .then((response) => {
        if (!response.ok) return;
        const readAt = new Date().toISOString();
        setConversations((current) => current.map((conversation) => conversation.id === activeId
          ? {
              ...conversation,
              unreadCount: 0,
              messages: conversation.messages.map((item) => item.isOwn || item.readAt
                ? item
                : { ...item, readAt })
            }
          : conversation));
      })
      .catch(() => null);
  }, [activeConversationReadKey, activeId]);

  React.useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      void loadConversations({ silent: true, messageConversationId: activeId });
    };
    const intervalId = window.setInterval(refresh, 12000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [activeId, loadConversations]);

  React.useEffect(() => {
    const trimmed = query.trim();
    setSelectedRecipient(null);
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=8`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as GlobalSearchPayload | null;
        if (!response.ok || !payload || cancelled) return;
        const rows = [
          ...payload.entities.artists,
          ...payload.entities.producers,
          ...payload.entities.groups,
          ...payload.entities.labels
        ].map((entity) => ({
          slug: entity.slug,
          name: entity.displayName,
          avatarUrl: entity.avatarUrl,
          subtitle: entity.secondary || profileTypeLabel(entity.profileType)
        }));
        setSearchResults(rows);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const openConversation = (conversation: DirectConversationResponse) => {
    setActiveId(conversation.id);
    setSelectedRecipient(null);
    setQuery("");
    window.history.replaceState(null, "", `/dashboard/messages?conversationId=${encodeURIComponent(conversation.id)}`);
    void loadConversations({ silent: true, messageConversationId: conversation.id });
  };

  const chooseRecipient = (recipient: Recipient) => {
    const existing = conversations.find((item) => item.participant.id === recipient.slug);
    setSelectedRecipient(recipient);
    setSearchResults([]);
    setQuery(recipient.name);
    if (existing) setActiveId(existing.id);
  };

  const send = async () => {
    const text = message.trim();
    if (!text || !activeRecipient || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientSlug: activeRecipient.slug, body: text })
      });
      const payload = (await response.json().catch(() => null)) as SendDirectMessageResponse | { error?: string } | null;
      if (!response.ok || !payload || !("conversation" in payload)) {
        throw new Error((payload && "error" in payload && payload.error) || "Не удалось отправить сообщение.");
      }
      setConversations((prev) => [payload.conversation, ...prev.filter((item) => item.id !== payload.conversation.id)]);
      setActiveId(payload.conversation.id);
      setSelectedRecipient(null);
      setMessage("");
      window.history.replaceState(null, "", `/dashboard/messages?conversationId=${encodeURIComponent(payload.conversation.id)}`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Не удалось отправить сообщение.");
    } finally {
      setSending(false);
    }
  };

  const removeConversation = async (conversationId: string) => {
    if (!window.confirm("Скрыть этот диалог только у вас?")) return;
    setDeletingConversationId(conversationId);
    setError(null);
    try {
      const response = await fetch(`/api/messages/${conversationId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Не удалось удалить диалог.");
      setConversations((prev) => {
        const next = prev.filter((item) => item.id !== conversationId);
        const nextActive = activeId === conversationId ? (next[0]?.id ?? null) : activeId;
        setActiveId(nextActive);
        if (nextActive) {
          window.history.replaceState(null, "", `/dashboard/messages?conversationId=${encodeURIComponent(nextActive)}`);
        } else {
          window.history.replaceState(null, "", "/dashboard/messages");
        }
        return next;
      });
      setSelectedRecipient(null);
      setMessage("");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить диалог.");
    } finally {
      setDeletingConversationId(null);
    }
  };

  const removeMessage = async (conversationId: string, messageId: string, mode: "self" | "everyone") => {
    const confirmed = window.confirm(
      mode === "everyone"
        ? "Удалить сообщение для всех участников? Вместо текста останется пометка об удалении."
        : "Скрыть это сообщение только у вас?"
    );
    if (!confirmed) return;
    setDeletingMessageKey(`${messageId}:${mode}`);
    setError(null);
    try {
      const response = await fetch(`/api/messages/${conversationId}?messageId=${encodeURIComponent(messageId)}&mode=${mode}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { error?: string; mode?: "self" | "everyone" } | null;
      if (!response.ok) throw new Error(payload?.error || "Не удалось удалить сообщение.");
      setConversations((prev) => prev.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const nextMessages = (payload?.mode === "everyone"
          ? conversation.messages.map((item) => item.id === messageId
            ? { ...item, body: "Сообщение удалено", deletedForEveryone: true }
            : item)
          : conversation.messages.filter((item) => item.id !== messageId)
        );
        return {
          ...conversation,
          messages: nextMessages,
          lastMessage: nextMessages.at(-1)?.body ?? null
        };
      }));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить сообщение.");
    } finally {
      setDeletingMessageKey(null);
    }
  };

  return (
    <section className="feed-skin ux-surface flex h-[calc(100dvh-180px)] min-h-[560px] flex-col overflow-hidden rounded-[28px] p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[24px] font-bold tracking-tight text-white">Личные сообщения</h2>
          <p className="mt-1 text-sm font-medium text-white/55">История диалогов синхронизируется между участниками и обновляется автоматически.</p>
        </div>
      </div>

      {error ? <div className="ux-error mb-3 rounded-2xl px-4 py-3 text-sm font-semibold text-rose-100">{error}</div> : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_1fr]">
        <aside className="min-h-0 space-y-3 overflow-y-auto pr-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/42" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти артиста, продюсера, группу или лейбл"
              className="ux-control h-12 w-full rounded-full pl-11 pr-4 text-sm font-semibold outline-none placeholder:text-white/36 focus:border-[#8b5cf6]/45 focus:bg-white/[0.055]"
            />
            {searching ? <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/42" /> : null}
            {searchResults.length ? (
              <div className="ux-floating absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-80 overflow-y-auto rounded-3xl p-2">
                {searchResults.map((recipient) => (
                  <button key={recipient.slug} type="button" onClick={() => chooseRecipient(recipient)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[0.06]">
                    <Avatar name={recipient.name} src={recipient.avatarUrl} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-white">{recipient.name}</span>
                      <span className="block truncate text-xs font-semibold text-white/42">{recipient.subtitle}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            {loading ? <div className="ux-loading rounded-2xl p-4 text-sm text-white/50">Загрузка...</div> : null}
            {!loading && !conversations.length ? <div className="ux-empty rounded-2xl p-4 text-sm text-white/50">Диалогов пока нет. Найдите артиста выше и отправьте первое сообщение.</div> : null}
            {conversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => openConversation(conversation)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${conversation.id === activeId ? "border-[#8b5cf6]/40 bg-[#8b5cf6]/14" : "border-white/8 bg-white/[0.035] hover:bg-white/[0.06]"}`}>
                {(() => {
                  const context = getCollaborationContext(conversation);
                  return (
                    <>
                      <Avatar name={conversation.participant.name} src={conversation.participant.avatarUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-white">{conversation.participant.name}</span>
                          {conversation.unreadCount > 0 ? <span className="rounded-full bg-[#8b5cf6] px-2 py-0.5 text-[11px] font-bold text-white">{conversation.unreadCount}</span> : null}
                        </span>
                        {context ? <span className="mt-1 block truncate text-[11px] font-black uppercase tracking-[0.12em] text-[#b9a8ff]">{context.summary}</span> : null}
                        <span className="mt-0.5 line-clamp-2 text-xs font-medium leading-4 text-white/45">{messagePreview(conversation.lastMessage)}</span>
                      </span>
                    </>
                  );
                })()}
              </button>
            ))}
          </div>
        </aside>

        <div className="ux-surface-soft flex min-h-0 flex-col overflow-hidden rounded-[24px]">
          <div className="border-b border-white/8 p-4">
            <div className="flex items-center gap-3">
              {activeRecipient ? <Avatar name={activeRecipient.name} src={activeRecipient.avatarUrl} /> : null}
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white">{activeRecipient?.name ?? "Выберите диалог"}</p>
                <p className="truncate text-xs font-semibold text-white/42">{activeRecipient?.subtitle ?? "Выберите диалог для переписки"}</p>
              </div>
              {activeConversation ? (
                <button
                  type="button"
                  onClick={() => void removeConversation(activeConversation.id)}
                  disabled={deletingConversationId === activeConversation.id}
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/55 transition hover:text-rose-200 disabled:opacity-45"
                  aria-label="Удалить диалог"
                >
                  {deletingConversationId === activeConversation.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              ) : null}
            </div>
            {activeCollaborationContext ? (
              <div className="mt-4 flex min-h-[64px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3.5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-[#b9a8ff]">Отклик на объявление</span>
                  <span className="mt-1 block truncate text-sm font-extrabold text-white">{activeCollaborationContext.summary}</span>
                  {activeCollaborationContext.announcement ? <span className="mt-0.5 block truncate text-xs font-medium text-white/46">{activeCollaborationContext.announcement}</span> : null}
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {activeConversation?.messages.map((item, index) => {
                const previous = activeConversation.messages[index - 1];
                const parsedResponse = item.deletedForEveryone ? null : parseCollaborationResponseMessage(item.body);
                const body = parsedResponse?.message || item.body;
                const showDate = !previous || !isSameMessageDay(previous.createdAt, item.createdAt);
                const groupedWithPrevious = Boolean(previous && previous.isOwn === item.isOwn && isSameMessageDay(previous.createdAt, item.createdAt));
                return (
                  <React.Fragment key={item.id}>
                    {showDate ? (
                      <div className="flex justify-center py-3">
                        <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/42">{formatMessageDay(item.createdAt)}</span>
                      </div>
                    ) : null}
                    <div className={`flex ${item.isOwn ? "justify-end" : "justify-start"} ${groupedWithPrevious ? "mt-1" : "mt-3"}`}>
                      <div className={`group max-w-[65%] rounded-3xl px-4 py-2.5 shadow-[0_18px_45px_-34px_rgba(0,0,0,0.9)] ${item.isOwn ? "rounded-br-lg bg-[#7b3df5] text-white" : "rounded-bl-lg bg-white/[0.07] text-white/88"}`}>
                        <p className={`whitespace-pre-wrap break-words text-sm font-medium leading-relaxed ${item.deletedForEveryone ? "italic opacity-70" : ""}`}>
                          <LinkifiedText text={body} />
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-3">
                          <p className={`text-[11px] font-semibold ${item.isOwn ? "text-white/58" : "text-white/38"}`}>
                            {formatMessageClock(item.createdAt)}
                            {item.isOwn ? <span className="ml-2">{item.readAt ? "Прочитано" : "Отправлено"}</span> : null}
                          </p>
                          {item.isOwn && !item.deletedForEveryone ? (
                            <div className="flex items-center gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => activeConversation ? void removeMessage(activeConversation.id, item.id, "self") : null}
                                disabled={deletingMessageKey === `${item.id}:self` || deletingMessageKey === `${item.id}:everyone`}
                                className="text-[11px] font-semibold text-white/68 hover:text-white disabled:opacity-45"
                              >
                                {deletingMessageKey === `${item.id}:self` ? "..." : "У меня"}
                              </button>
                              <button
                                type="button"
                                onClick={() => activeConversation ? void removeMessage(activeConversation.id, item.id, "everyone") : null}
                                disabled={deletingMessageKey === `${item.id}:self` || deletingMessageKey === `${item.id}:everyone`}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/68 hover:text-rose-100 disabled:opacity-45"
                                aria-label="Удалить сообщение у всех"
                              >
                                {deletingMessageKey === `${item.id}:everyone` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                У всех
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              {!activeConversation && !selectedRecipient ? <p className="pt-16 text-center text-sm font-medium text-white/42">Выберите существующий диалог или найдите профиль для нового сообщения.</p> : null}
              <div ref={listEndRef} />
            </div>
          </div>

          <div className="border-t border-white/8 p-4">
            <div className="flex items-end gap-3">
              <textarea
                ref={messageInputRef}
                rows={1}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                disabled={!activeRecipient || sending}
                placeholder={activeRecipient ? "Введите сообщение" : "Сначала выберите получателя"}
                className="min-h-12 max-h-32 min-w-0 flex-1 resize-none rounded-[24px] border border-white/8 bg-white/[0.04] px-5 py-3 text-sm font-semibold leading-6 text-white outline-none placeholder:text-white/35 transition focus:border-[#7b61ff]/55 disabled:cursor-not-allowed disabled:opacity-55"
              />
              <button type="button" onClick={() => void send()} disabled={!activeRecipient || !message.trim() || sending} className="ux-button-primary grid h-12 w-12 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-45">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
