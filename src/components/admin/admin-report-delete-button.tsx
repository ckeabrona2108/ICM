"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { formatRubCurrency } from "@/lib/currency-format";

export function AdminReportDeleteButton({
  userId,
  reportId,
  quarterLabel,
  amount,
  isAgreed = false
}: {
  userId: string;
  reportId: string;
  quarterLabel: string;
  amount: number;
  isAgreed?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function deleteReport() {
    const balanceNote = isAgreed
      ? ` Так как отчёт согласован, ${formatRubCurrency(amount)} будет списано с баланса пользователя.`
      : "";
    const confirmed = window.confirm(`Удалить отчёт "${quarterLabel}" у пользователя?${balanceNote}`);
    if (!confirmed) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}/reports/${reportId}`, {
        method: "DELETE"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Не удалось удалить отчёт.");
      }
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить отчёт.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void deleteReport();
        }}
        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-300/24 bg-rose-500/10 px-4 py-2.5 text-[13px] font-semibold text-rose-100 transition-colors hover:bg-rose-500/18 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {busy ? "Удаляем..." : "Удалить"}
      </button>
      {error ? <p className="max-w-[260px] text-[12.5px] font-medium text-rose-200">{error}</p> : null}
    </div>
  );
}
