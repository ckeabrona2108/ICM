"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

type PaymentStatus =
  | "success"
  | "pending"
  | "waiting_for_capture"
  | "succeeded"
  | "canceled"
  | "already_confirmed"
  | "preparing"
  | "not_found"
  | null;

export function SubscriptionPaymentStatusNotice({
  status,
  applied,
  tokensSummary
}: {
  status: PaymentStatus;
  applied: boolean;
  tokensSummary?: string | null;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);
  const shouldPoll = !applied && (status === "pending" || status === "waiting_for_capture" || status === "succeeded");

  const refresh = React.useCallback(() => {
    setRefreshing(true);
    router.refresh();
  }, [router]);

  React.useEffect(() => {
    if (!refreshing) return;
    const timeout = window.setTimeout(() => setRefreshing(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [refreshing]);

  React.useEffect(() => {
    if (!shouldPoll) return;
    const interval = window.setInterval(() => {
      router.refresh();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [router, shouldPoll]);

  if (applied) {
    return (
      <p className="mb-3 rounded-[18px] border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-emerald-100">
        Подписка активна.{tokensSummary ? ` ${tokensSummary}` : ""}
      </p>
    );
  }

  if (status === "already_confirmed") {
    return (
      <p className="mb-3 rounded-[18px] border border-emerald-400/22 bg-emerald-500/8 px-3 py-2 text-emerald-100/92">
        Подписка уже активирована и доступна в аккаунте.
      </p>
    );
  }

  if (status === "preparing") {
    return (
      <div className="mb-3 rounded-[18px] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-amber-100">
        <p>Платёж подтверждён. AI-бонусы и финальная активация завершаются автоматически.</p>
        <StatusAction refreshing={refreshing} onRefresh={refresh} />
      </div>
    );
  }

  if (status === "pending" || status === "waiting_for_capture" || status === "succeeded") {
    return (
      <div className="mb-3 rounded-[18px] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-amber-100">
        <p>Платёж подтверждается. Обычно это занимает несколько секунд.</p>
        <p className="mt-1 text-amber-100/80">Если деньги уже списались, entitlement будет активирован без повторной оплаты.</p>
        <StatusAction refreshing={refreshing} onRefresh={refresh} />
      </div>
    );
  }

  if (status === "canceled" || status === "not_found") {
    return (
      <div className="mb-3 rounded-[18px] border border-rose-400/22 bg-rose-500/10 px-3 py-2 text-rose-100">
        <p>{status === "not_found" ? "Платёж найден, но связанная запись ещё не синхронизирована." : "Платёж не завершён или был отменён."}</p>
        <StatusAction refreshing={refreshing} onRefresh={refresh} />
      </div>
    );
  }

  return null;
}

function StatusAction({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-sm font-medium text-white/88 transition hover:border-white/20 hover:bg-white/10"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      Проверить статус
    </button>
  );
}
