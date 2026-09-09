// @ts-nocheck
"use client";

import * as React from "react";

import type { PayoutScheduleSettings, PayoutWindowState } from "@/lib/payout-schedule";
import { cn } from "@/lib/utils";

function parsePeriodLabel(label?: string | null) {
  const match = label?.match(/^([1-4]) квартал (\d{4})$/);
  return {
    quarter: match?.[1] ?? "",
    year: match?.[2] ?? ""
  };
}

export function AdminPayoutScheduleClient({
  initialState
}: {
  initialState: PayoutWindowState;
}) {
  const initialWindow = initialState.currentWindow ?? initialState.nextWindow;
  const initialPeriod = parsePeriodLabel(initialWindow?.periodLabel);
  const [enabled, setEnabled] = React.useState(initialState.settings.enabled);
  const [startDay, setStartDay] = React.useState(String(initialState.settings.startDay));
  const [durationDays, setDurationDays] = React.useState(String(initialState.settings.durationDays));
  const [periodQuarter, setPeriodQuarter] = React.useState(String(initialState.settings.periodQuarter ?? initialPeriod.quarter));
  const [periodYear, setPeriodYear] = React.useState(String(initialState.settings.periodYear ?? initialPeriod.year));
  const [windowStartsAt, setWindowStartsAt] = React.useState(initialState.settings.windowStartsAt ?? initialWindow?.startsAt ?? "");
  const [windowEndsAt, setWindowEndsAt] = React.useState(initialState.settings.windowEndsAt ?? initialWindow?.endsAt ?? "");
  const [state, setState] = React.useState(initialState);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  async function saveSettings() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    const settings: PayoutScheduleSettings = {
      enabled,
      startDay: Number(startDay),
      durationDays: Number(durationDays),
      periodQuarter: periodQuarter ? Number(periodQuarter) : null,
      periodYear: periodYear ? Number(periodYear) : null,
      windowStartsAt: windowStartsAt || null,
      windowEndsAt: windowEndsAt || null
    };

    try {
      const response = await fetch("/api/admin/finance/payout-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const parsed = (await response.json().catch(() => null)) as
        | { ok?: boolean; state?: PayoutWindowState; error?: string }
        | null;

      if (!response.ok || !parsed?.ok || !parsed.state) {
        setError(parsed?.error ?? "Не удалось сохранить периоды выплат.");
        return;
      }

      setState(parsed.state);
      setStartDay(String(parsed.state.settings.startDay));
      setDurationDays(String(parsed.state.settings.durationDays));
      setPeriodQuarter(String(parsed.state.settings.periodQuarter ?? ""));
      setPeriodYear(String(parsed.state.settings.periodYear ?? ""));
      setWindowStartsAt(parsed.state.settings.windowStartsAt ?? "");
      setWindowEndsAt(parsed.state.settings.windowEndsAt ?? "");
      setSuccess("Периоды выплат обновлены.");
    } catch {
      setError("Сервис настроек временно недоступен.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border border-white/[0.06] bg-[#161720] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-white">Квартальные окна выплат</h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-white/52">
              Пользователь сможет создать заявку только в разрешённые даты. Сервер проверяет это правило при отправке заявки.
            </p>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] font-semibold",
              state.isOpen
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                : "border-sky-400/25 bg-sky-400/10 text-sky-100"
            )}
          >
            {state.isOpen ? "Окно открыто" : "Окно закрыто"}
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-[14px] font-semibold text-white/76">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="h-4 w-4 accent-[#7b3df5]"
            />
            Приём заявок включён
          </label>

          <label className="text-[13px] font-semibold text-white/70">
            Квартал отчета
            <select
              value={periodQuarter}
              onChange={(event) => setPeriodQuarter(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white outline-none transition-colors focus:border-[#7b3df5]/60"
            >
              <option value="">Выбрать квартал</option>
              <option value="1">1 квартал</option>
              <option value="2">2 квартал</option>
              <option value="3">3 квартал</option>
              <option value="4">4 квартал</option>
            </select>
          </label>

          <label className="text-[13px] font-semibold text-white/70">
            Год отчета
            <input
              type="number"
              min={2000}
              max={2100}
              value={periodYear}
              onChange={(event) => setPeriodYear(event.target.value)}
              placeholder="2026"
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white outline-none transition-colors focus:border-[#7b3df5]/60"
            />
          </label>

          <div className="hidden xl:block" />

          <label className="text-[13px] font-semibold text-white/70">
            Дата начала окна
            <input
              type="date"
              value={windowStartsAt}
              onChange={(event) => setWindowStartsAt(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white outline-none transition-colors focus:border-[#7b3df5]/60"
            />
          </label>

          <label className="text-[13px] font-semibold text-white/70">
            Дата окончания окна
            <input
              type="date"
              value={windowEndsAt}
              onChange={(event) => setWindowEndsAt(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white outline-none transition-colors focus:border-[#7b3df5]/60"
            />
          </label>

          <label className="text-[13px] font-semibold text-white/70">
            День начала окна по умолчанию
            <input
              type="number"
              min={1}
              max={28}
              value={startDay}
              onChange={(event) => setStartDay(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white outline-none transition-colors focus:border-[#7b3df5]/60"
            />
          </label>

          <label className="text-[13px] font-semibold text-white/70">
            Длительность по умолчанию, дней
            <input
              type="number"
              min={1}
              max={31}
              value={durationDays}
              onChange={(event) => setDurationDays(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white outline-none transition-colors focus:border-[#7b3df5]/60"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-[13px] font-semibold text-rose-100">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-[13px] font-semibold text-emerald-100">
            {success}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={busy}
          className="mt-5 rounded-xl border border-[#7b3df5]/45 bg-[#7b3df5]/20 px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#7b3df5]/30 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Сохранение..." : "Сохранить периоды выплат"}
        </button>
      </section>

      <aside className="rounded-2xl border border-white/[0.06] bg-[#10121b] p-5">
        <h3 className="text-[16px] font-semibold text-white">Текущее состояние</h3>
        <p className="mt-3 text-[14px] font-medium leading-relaxed text-white/70">{state.message}</p>
        {state.currentWindow ? (
          <p className="mt-3 text-[13px] text-white/55">
            Текущий период: <span className="text-white/85">{state.currentWindow.periodLabel}</span>
          </p>
        ) : null}
        {state.nextWindow ? (
          <p className="mt-3 text-[13px] text-white/55">
            Следующий период:{" "}
            <span className="text-white/85">
              {state.nextWindow.periodLabel} · {state.nextWindow.label}
            </span>
          </p>
        ) : null}
      </aside>
    </div>
  );
}
