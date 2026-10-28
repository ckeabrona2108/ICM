"use client";

import * as React from "react";

type OrphanAccrualSource = {
  source: string;
  rows: number;
  users: number;
  amount: number;
};

const rub = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });

/** Warns about accruals left by deleted finance imports and lets the admin remove them. */
export function FinanceOrphanAccrualsPanel() {
  const [sources, setSources] = React.useState<OrphanAccrualSource[]>([]);
  const [cleaning, setCleaning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const response = await fetch("/api/admin/finance/orphan-accruals", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { sources?: OrphanAccrualSource[] } | null;
    if (response.ok && payload?.sources) setSources(payload.sources);
  }, []);

  React.useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const totalRows = sources.reduce((sum, item) => sum + item.rows, 0);

  async function cleanup() {
    const confirmed = window.confirm(
      `Удалить ${totalRows} начислений из удалённых финансовых отчётов? Баланс артистов не изменится, но действие нельзя отменить.`
    );
    if (!confirmed) return;

    setCleaning(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/finance/orphan-accruals", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { royalties?: number; ledgerEntries?: number; error?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error ?? "Не удалось удалить начисления");
      setDone(`Удалено начислений: ${payload?.royalties ?? 0}, записей в истории: ${payload?.ledgerEntries ?? 0}.`);
      await load();
    } catch (cleanupError) {
      setError(cleanupError instanceof Error ? cleanupError.message : "Не удалось удалить начисления");
    } finally {
      setCleaning(false);
    }
  }

  if (sources.length === 0) {
    return done ? (
      <p className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-100">{done}</p>
    ) : null;
  }

  return (
    <section className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-amber-100">
            Начисления из удалённых финансовых отчётов: {totalRows}
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-amber-100/75">
            Отчёты удалены, а их начисления остались в базе без связи с отчётом. Артисты их больше не видят в истории
            операций, на баланс они не влияют. Кнопка удалит эти записи из базы.
          </p>
        </div>
        <button
          type="button"
          disabled={cleaning}
          onClick={() => {
            void cleanup();
          }}
          className="rounded-lg border border-amber-300/40 bg-amber-400/15 px-3.5 py-2 text-[13px] font-semibold text-amber-50 hover:bg-amber-400/25 disabled:opacity-50"
        >
          {cleaning ? "Удаляем..." : "Удалить эти начисления"}
        </button>
      </div>
      <ul className="mt-3 space-y-1 text-[12.5px] text-amber-50/80">
        {sources.map((item) => (
          <li key={item.source} className="truncate">
            {item.source} · {item.rows} начисл. · {item.users} артист. · {rub.format(item.amount)}
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-[12.5px] text-rose-300">{error}</p> : null}
    </section>
  );
}
