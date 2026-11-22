"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Loader2, ShieldCheck, X } from "lucide-react";

import type { CodeChannel, SecurityAction, SecurityCodeChallenge, SendChannel } from "@/lib/security-codes";

// The code window. A protected request answers 428 with the channels the cabinet has; the window
// sends a code, checks what the artist types and lets the caller repeat the request once.

const TITLES: Record<SecurityAction, string> = {
  payout: "Подтвердите выплату",
  password: "Подтвердите смену пароля",
  email: "Подтвердите смену почты",
  unlink: "Подтвердите отключение входа"
};

const SENT_TO: Record<SendChannel, string> = {
  telegram: "в Telegram",
  vk: "в сообщения VK",
  email: "на почту",
  email_confirm: "на почту"
};

const SEND_VIA: Record<CodeChannel, string> = {
  telegram: "Прислать в Telegram",
  vk: "Прислать в VK",
  email: "Прислать на почту"
};

const CHANNEL_NAMES: Record<CodeChannel, string> = {
  telegram: "Telegram",
  vk: "VK",
  email: "Почта"
};

function formatUntil(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export class SecurityCodeCancelledError extends Error {
  constructor() {
    super("Действие не подтверждено кодом.");
  }
}

type Pending = { challenge: SecurityCodeChallenge; resolve: (confirmed: boolean) => void };

/**
 * `guard(run)` runs the request; when the server asks for a code it shows the window and, after a
 * correct code, runs the request again. Cancelling throws SecurityCodeCancelledError.
 */
export function useSecurityCode() {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const guard = React.useCallback(async (run: () => Promise<Response>): Promise<Response> => {
    const response = await run();
    if (response.status !== 428) return response;
    const payload = (await response.clone().json().catch(() => null)) as { securityCode?: SecurityCodeChallenge } | null;
    if (!payload?.securityCode) return response;
    const challenge = payload.securityCode;
    const confirmed = await new Promise<boolean>((resolve) => setPending({ challenge, resolve }));
    setPending(null);
    if (!confirmed) throw new SecurityCodeCancelledError();
    return run();
  }, []);

  const dialog =
    pending && typeof document !== "undefined"
      ? createPortal(
          <SecurityCodeDialog
            challenge={pending.challenge}
            onDone={() => pending.resolve(true)}
            onCancel={() => pending.resolve(false)}
          />,
          document.body
        )
      : null;

  return { guard, dialog };
}

type SendState =
  | { kind: "sending"; channel: SendChannel }
  | { kind: "sent"; channel: SendChannel; challengeId: string; resendAt: number }
  | { kind: "failed"; channel: SendChannel; message: string; retryAt: number | null };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, payload: payload ?? {} };
}

function SecurityCodeDialog({
  challenge,
  onDone,
  onCancel
}: {
  challenge: SecurityCodeChallenge;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [send, setSend] = React.useState<SendState | null>(null);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [showOthers, setShowOthers] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  const inputRef = React.useRef<HTMLInputElement>(null);
  const startedRef = React.useRef(false);

  const sendCode = React.useCallback(
    async (channel: SendChannel) => {
      setSend({ kind: "sending", channel });
      setError(null);
      setCode("");
      setShowOthers(false);
      const { ok, payload } = await postJson("/api/security/codes", { action: challenge.action, channel }).catch(() => ({
        ok: false,
        payload: { error: "Нет связи с сервером. Проверьте интернет." } as Record<string, unknown>
      }));
      if (ok && typeof payload.challengeId === "string") {
        setSend({
          kind: "sent",
          channel,
          challengeId: payload.challengeId,
          resendAt: typeof payload.resendAt === "string" ? Date.parse(payload.resendAt) : Date.now() + 60_000
        });
        return;
      }
      setSend({
        kind: "failed",
        channel,
        message: typeof payload.error === "string" ? payload.error : "Не удалось отправить код.",
        retryAt: typeof payload.retryAt === "string" ? Date.parse(payload.retryAt) : null
      });
    },
    [challenge.action]
  );

  React.useEffect(() => {
    if (startedRef.current || challenge.channels.length === 0) return;
    startedRef.current = true;
    void sendCode(challenge.channels[0]!);
  }, [challenge.channels, sendCode]);

  // The field is enabled only after the code is out, so it takes the focus once it is.
  const sentId = send?.kind === "sent" ? send.challengeId : null;
  React.useEffect(() => {
    if (sentId) inputRef.current?.focus();
  }, [sentId]);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !checking) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checking, onCancel]);

  async function verify(value: string) {
    if (send?.kind !== "sent" || value.length !== 6 || checking) return;
    setChecking(true);
    setError(null);
    const { ok, payload } = await postJson("/api/security/codes/verify", { challengeId: send.challengeId, code: value }).catch(() => ({
      ok: false,
      payload: { error: "Нет связи с сервером. Проверьте интернет." } as Record<string, unknown>
    }));
    setChecking(false);
    if (ok) {
      onDone();
      return;
    }
    setError(typeof payload.error === "string" ? payload.error : "Не удалось проверить код.");
    setCode("");
    inputRef.current?.focus();
  }

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/gu, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  }

  const current: SendChannel | null = send?.channel ?? challenge.channels[0] ?? null;
  const others = challenge.channels.filter((channel) => channel !== current);
  const resendIn = send?.kind === "sent" ? Math.max(0, Math.ceil((send.resendAt - now) / 1000)) : 0;
  // Once a code went to the unconfirmed own email, the window shows the usual code field.
  const noChannel = challenge.channels.length === 0 && !send;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 cursor-default" onClick={checking ? undefined : onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="security-code-title"
        className="relative w-full max-w-[400px] rounded-2xl border border-white/[0.08] bg-[#15161d] p-5 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200">
              <ShieldCheck className="h-[18px] w-[18px]" />
            </span>
            <h2 id="security-code-title" className="text-[17px] font-semibold">
              {TITLES[challenge.action]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={checking}
            aria-label="Закрыть"
            className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {noChannel && challenge.confirmEmail ? (
          <div className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-white/70">
            <p>
              Чтобы вывести деньги, подтвердите почту <span className="font-medium text-white">{challenge.confirmEmail}</span>.
              Мы пришлём на неё код: он подтвердит и почту, и выплату.
            </p>
            <button
              type="button"
              onClick={() => void sendCode("email_confirm")}
              className="w-full rounded-xl bg-violet-500 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-violet-400"
            >
              Подтвердить почту
            </button>
            <p className="text-[12px] text-white/45">
              Это нужно один раз. Дальше коды будут приходить на эту почту сразу.
            </p>
          </div>
        ) : noChannel ? (
          <div className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-white/70">
            <p>
              Выплаты подтверждаются кодом. Чтобы его получить, подключите Telegram или VK, либо подтвердите почту в профиле.
            </p>
            {challenge.held.length > 0 ? (
              <ul className="space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[12.5px] text-white/60">
                {challenge.held.map((hold) => (
                  <li key={hold.channel}>
                    {CHANNEL_NAMES[hold.channel]} подключён недавно. Коды начнут приходить {formatUntil(hold.until)}.
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2 pt-1">
              <Link
                href="/dashboard/profile#linked-accounts"
                onClick={onCancel}
                className="flex-1 rounded-xl bg-violet-500 px-4 py-2.5 text-center text-[14px] font-semibold text-white transition hover:bg-violet-400"
              >
                Открыть профиль
              </Link>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-white/[0.1] px-4 py-2.5 text-[14px] text-white/70 transition hover:bg-white/[0.05]"
              >
                Закрыть
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="min-h-[40px] text-[13.5px] leading-relaxed text-white/70" aria-live="polite">
              {send?.kind === "sending" ? `Отправляем код ${SENT_TO[send.channel]}…` : null}
              {send?.kind === "sent" ? `Мы отправили 6-значный код ${SENT_TO[send.channel]}. Введите его ниже.` : null}
              {send?.kind === "failed" ? <span className="text-rose-200">{send.message}</span> : null}
            </p>

            <input
              ref={inputRef}
              value={code}
              onChange={(event) => onCodeChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void verify(code);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Код из сообщения"
              placeholder="••••••"
              maxLength={6}
              disabled={send?.kind !== "sent" || checking}
              className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-center text-[24px] font-semibold tracking-[0.5em] text-white outline-none transition placeholder:text-white/20 focus:border-violet-400/60 disabled:opacity-50"
            />

            {error ? (
              <p role="alert" className="text-[12.5px] text-rose-200">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void verify(code)}
              disabled={send?.kind !== "sent" || code.length !== 6 || checking}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-violet-400 disabled:opacity-40"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Подтвердить
            </button>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[12.5px]">
              {current ? (
                <button
                  type="button"
                  onClick={() => void sendCode(current)}
                  disabled={send?.kind === "sending" || resendIn > 0 || checking}
                  className="text-white/60 underline-offset-2 transition hover:text-white hover:underline disabled:no-underline disabled:opacity-50"
                >
                  {resendIn > 0 ? `Отправить ещё раз через ${resendIn} с` : "Отправить ещё раз"}
                </button>
              ) : null}
              {others.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowOthers((value) => !value)}
                  className="text-violet-200 underline-offset-2 transition hover:underline"
                >
                  Не приходит код?
                </button>
              ) : null}
            </div>

            {showOthers && others.length > 0 ? (
              <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                <p className="px-1.5 pt-0.5 text-[12px] text-white/50">Получить код другим способом:</p>
                {others.map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => void sendCode(channel)}
                    disabled={send?.kind === "sending" || checking}
                    className="w-full rounded-lg px-2.5 py-2 text-left text-[13.5px] text-white/85 transition hover:bg-white/[0.05] disabled:opacity-50"
                  >
                    {SEND_VIA[channel]}
                  </button>
                ))}
              </div>
            ) : null}

            {challenge.held.length > 0 ? (
              <p className="text-[12px] leading-relaxed text-white/45">
                {challenge.held
                  .map((hold) => `${CHANNEL_NAMES[hold.channel]} начнёт получать коды ${formatUntil(hold.until)}.`)
                  .join(" ")}
              </p>
            ) : null}

            {others.length === 0 && challenge.channels.length > 0 && !challenge.channels.includes("email") && challenge.held.length === 0 ? (
              <p className="text-[12px] leading-relaxed text-white/45">
                Совет: подтвердите почту в{" "}
                <Link href="/dashboard/profile#security" onClick={onCancel} className="text-violet-200 hover:underline">
                  профиле
                </Link>
                , чтобы получать коды запасным способом.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
