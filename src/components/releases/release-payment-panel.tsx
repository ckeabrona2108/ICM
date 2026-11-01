"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, RefreshCw, X } from "lucide-react";

import type { ReleasePrice, ReleasePriceLine } from "@/lib/release-pricing";

const LINE_HINTS: Record<ReleasePriceLine["kind"], string> = {
  base: "Отправка на площадки и модерация",
  lyrics: "Текст песни на площадках, за каждый трек",
  karaoke: "Синхронизированный текст (TTML), за каждый трек",
  video: "Видео к треку, за каждый трек"
};

type PaymentReturnState =
  | { kind: "none" }
  | { kind: "pending" }
  | { kind: "failed"; message: string };

export function ReleasePaymentPanel({
  releaseId,
  price,
  autoStart = false,
  returnState
}: {
  releaseId: string;
  price: ReleasePrice | null;
  autoStart?: boolean;
  returnState: PaymentReturnState;
}) {
  const router = useRouter();
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const autoStartedRef = React.useRef(false);
  const [breakdownOpen, setBreakdownOpen] = React.useState(false);
  // Extras change the sum, so it is shown before leaving for the checkout; a bare release goes straight there.
  const hasExtras = Boolean(price && price.lines.length > 1);

  const startPayment = React.useCallback(async () => {
    setError(null);
    setPaying(true);
    try {
      const response = await fetch(`/api/releases/${releaseId}/pay`, { method: "POST" });
      const parsed = (await response.json().catch(() => null)) as
        | { error?: string; confirmationUrl?: string }
        | null;
      const confirmationUrl = parsed?.confirmationUrl?.trim();
      if (!response.ok || !confirmationUrl) {
        setError(parsed?.error ?? "Не удалось создать платёж. Попробуйте ещё раз.");
        setPaying(false);
        return;
      }
      window.location.href = confirmationUrl;
    } catch {
      setError("Сервис оплаты временно недоступен. Попробуйте ещё раз через минуту.");
      setPaying(false);
    }
  }, [releaseId]);

  const requestPayment = React.useCallback(() => {
    if (hasExtras) {
      setError(null);
      setBreakdownOpen(true);
      return;
    }
    void startPayment();
  }, [hasExtras, startPayment]);

  React.useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    requestPayment();
  }, [autoStart, requestPayment]);

  React.useEffect(() => {
    if (!breakdownOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !paying) setBreakdownOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [breakdownOpen, paying]);

  const message =
    returnState.kind === "failed"
      ? returnState.message
      : returnState.kind === "pending"
        ? "Платёж ещё обрабатывается YooKassa. Если деньги уже списались, проверьте статус через несколько секунд."
        : "Релиз отправлен, но не оплачен. Модерация начнётся сразу после оплаты.";

  return (
    <div
      className={
        returnState.kind === "failed"
          ? "rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-3 text-rose-100"
          : "rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-3 text-amber-100"
      }
    >
      <p>{message}</p>
      {error && !breakdownOpen ? <p className="mt-2 text-rose-200">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={paying}
          onClick={requestPayment}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#7b3df5] px-3 text-[13px] font-semibold text-white transition hover:bg-[#8f5bf7] disabled:opacity-60"
        >
          {paying && !breakdownOpen ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          {returnState.kind === "failed" ? "Попробовать снова" : "Оплатить релиз"}
        </button>
        {returnState.kind === "pending" ? (
          <button
            type="button"
            disabled={paying}
            onClick={() => router.refresh()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-[13px] font-semibold text-white transition hover:bg-white/[0.09] disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            Проверить статус
          </button>
        ) : null}
      </div>
      {breakdownOpen && price
        ? createPortal(
            <PriceBreakdownDialog
              price={price}
              paying={paying}
              error={error}
              onPay={() => void startPayment()}
              onClose={() => setBreakdownOpen(false)}
            />,
            document.body
          )
        : null}
    </div>
  );
}

function PriceBreakdownDialog({
  price,
  paying,
  error,
  onPay,
  onClose
}: {
  price: ReleasePrice;
  paying: boolean;
  error: string | null;
  onPay: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 cursor-default" onClick={paying ? undefined : onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-price-title"
        className="relative w-full max-w-[420px] rounded-2xl border border-white/[0.08] bg-[#15161d] p-5 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="release-price-title" className="text-[17px] font-semibold">Оплата релиза</h2>
            <p className="mt-1 text-[12.5px] text-white/50">Из чего складывается сумма</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            aria-label="Закрыть"
            className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="mt-4 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-white/[0.02]">
          {price.lines.map((line) => (
            <li key={line.kind} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium">
                  {line.label}
                  {line.count > 1 ? <span className="text-white/45">{` × ${line.count}`}</span> : null}
                </p>
                <p className="mt-0.5 text-[11.5px] text-white/45">
                  {LINE_HINTS[line.kind]}
                  {line.count > 1 ? ` · ${line.unitRub} ₽` : ""}
                </p>
              </div>
              <span className="shrink-0 text-[13.5px] tabular-nums text-white/85">{line.amountRub} ₽</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-baseline justify-between px-1">
          <span className="text-[13px] text-white/60">Итого</span>
          <span className="text-[20px] font-semibold tabular-nums">{price.totalRub} ₽</span>
        </div>

        <p className="mt-2 px-1 text-[11.5px] text-white/40">
          С подпиской текст, караоке и видео входят в тариф.{" "}
          <Link href="/dashboard/subscription" className="text-[#c4b5fd] transition hover:text-white">
            Тарифы
          </Link>
        </p>

        {error ? <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-200">{error}</p> : null}

        <button
          type="button"
          onClick={onPay}
          disabled={paying}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#7b3df5] text-[14px] font-semibold text-white transition hover:bg-[#8f5bf7] disabled:opacity-60"
        >
          {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Перейти к оплате {price.totalRub} ₽
        </button>
      </div>
    </div>
  );
}
