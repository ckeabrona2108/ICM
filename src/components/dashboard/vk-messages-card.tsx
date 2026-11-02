"use client";

import * as React from "react";
import { Loader2, MessageCircle, X } from "lucide-react";

import type { VkMessagesStatus } from "@/app/api/vk/messages/route";

const VK_COMMUNITY_CHAT_URL = "https://vk.me/icecreammusicru";
const DISMISS_KEY = "icm:vk-messages-card-dismissed";

// The VK link flow returns to the cabinet with ?vk=… or ?vk_error=….
const VK_LINK_RESULTS: Record<string, { tone: "ok" | "warn"; text: string }> = {
  linked: { tone: "ok", text: "ВКонтакте привязан. Осталось разрешить сообщения от сообщества." },
  linked_not_member: { tone: "ok", text: "ВКонтакте привязан. Осталось разрешить сообщения от сообщества." },
  taken: {
    tone: "warn",
    text: "Этот аккаунт ВКонтакте уже привязан к другому кабинету. Войдите в тот кабинет или привяжите другой аккаунт."
  },
  cancelled: { tone: "warn", text: "Привязка ВКонтакте отменена." },
  expired: { tone: "warn", text: "Ссылка привязки устарела. Попробуйте ещё раз." },
  failed: { tone: "warn", text: "ВКонтакте не подтвердил вход. Попробуйте ещё раз." },
  unavailable: { tone: "warn", text: "Привязка ВКонтакте временно недоступна." }
};

function readVkLinkResult(): { tone: "ok" | "warn"; text: string } | null {
  const params = new URLSearchParams(window.location.search);
  const key = params.get("vk") ?? params.get("vk_error");
  return key ? VK_LINK_RESULTS[key] ?? null : null;
}

// Offers account events in VK direct messages from the community. The artist opens the chat
// with the community and allows messages; the permission is re-checked when they come back.
export function VkMessagesCard() {
  const [status, setStatus] = React.useState<VkMessagesStatus | null>(null);
  const [dismissed, setDismissed] = React.useState(true);
  const [checking, setChecking] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [linkResult, setLinkResult] = React.useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const awaitingReturnRef = React.useRef(false);

  React.useEffect(() => {
    const result = readVkLinkResult();
    setLinkResult(result);
    try {
      // Coming back from VK always shows the outcome, even if the card was hidden before.
      setDismissed(!result && window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
    void fetch("/api/vk/messages", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: VkMessagesStatus | null) => setStatus(payload))
      .catch(() => undefined);
  }, []);

  const check = React.useCallback(async (quiet: boolean) => {
    setChecking(true);
    if (!quiet) setMessage(null);
    try {
      const response = await fetch("/api/vk/messages", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { allowed?: boolean; error?: string } | null;
      if (payload?.allowed) {
        setStatus((current) => (current ? { ...current, allowed: true } : current));
        return;
      }
      if (quiet) return;
      setMessage(
        response.ok
          ? "Сообщения пока не разрешены. Откройте чат с сообществом и нажмите «Разрешить сообщения»."
          : payload?.error ?? "Не удалось проверить."
      );
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    const onFocus = () => {
      if (!awaitingReturnRef.current) return;
      awaitingReturnRef.current = false;
      void check(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [check]);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // The card simply comes back on the next visit.
    }
  };

  if (!status?.available || status.allowed || dismissed) return null;

  return (
    <section className="relative flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 sm:px-5">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#0077ff]/15 text-[#7cb6ff] ring-1 ring-[#0077ff]/25">
        <MessageCircle className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold tracking-[-0.01em] text-white">Уведомления во ВКонтакте</p>
        <p className="text-[12.5px] text-white/55">
          {status.linked
            ? "Статусы релизов, отчёты и начисления — в личные сообщения от сообщества ICE CREAM MUSIC."
            : "Привяжите ВКонтакте, чтобы получать статусы релизов, отчёты и начисления в личные сообщения."}
        </p>
        {linkResult && !message ? (
          <p className={linkResult.tone === "ok" ? "mt-1 text-[12.5px] text-[#9ccaff]" : "mt-1 text-[12.5px] text-amber-200"}>
            {linkResult.text}
          </p>
        ) : null}
        {message ? <p className="mt-1 text-[12.5px] text-amber-200">{message}</p> : null}
      </div>

      {status.linked ? (
        <span className="flex flex-wrap gap-2">
          <a
            href={VK_COMMUNITY_CHAT_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              awaitingReturnRef.current = true;
            }}
            className={ACTION}
          >
            Разрешить сообщения
          </a>
          <button type="button" onClick={() => void check(false)} disabled={checking} className={ACTION}>
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Проверить
          </button>
        </span>
      ) : (
        <a href="/api/vk/link/start" className={ACTION}>
          Привязать ВКонтакте
        </a>
      )}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Скрыть"
        className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}

const ACTION =
  "inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.12] bg-white/[0.06] px-3 text-[12.5px] font-semibold text-white transition-colors hover:border-white/[0.24] hover:bg-white/[0.1] disabled:opacity-60";
