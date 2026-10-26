"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, RefreshCw } from "lucide-react";

type PaymentReturnState =
  | { kind: "none" }
  | { kind: "pending" }
  | { kind: "failed"; message: string };

export function ReleasePaymentPanel({
  releaseId,
  autoStart = false,
  returnState
}: {
  releaseId: string;
  autoStart?: boolean;
  returnState: PaymentReturnState;
}) {
  const router = useRouter();
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const autoStartedRef = React.useRef(false);

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

  React.useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startPayment();
  }, [autoStart, startPayment]);

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
      {error ? <p className="mt-2 text-rose-200">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={paying}
          onClick={() => {
            void startPayment();
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#7b3df5] px-3 text-[13px] font-semibold text-white transition hover:bg-[#8f5bf7] disabled:opacity-60"
        >
          {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
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
    </div>
  );
}
