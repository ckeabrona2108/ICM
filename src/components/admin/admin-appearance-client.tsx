"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function AdminAppearanceClient({
  initialNewYearTheme,
  envOverride
}: {
  initialNewYearTheme: boolean;
  envOverride: "on" | "off" | null;
}) {
  const [enabled, setEnabled] = React.useState(initialNewYearTheme);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/appearance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newYearTheme: !enabled })
      });
      const parsed = (await response.json().catch(() => null)) as { newYearTheme?: boolean; error?: string } | null;
      if (!response.ok || typeof parsed?.newYearTheme !== "boolean") {
        setError(parsed?.error ?? "Не удалось сохранить.");
        return;
      }
      setEnabled(parsed.newYearTheme);
    } catch {
      setError("Сервис настроек временно недоступен.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 max-w-2xl rounded-2xl border border-white/[0.06] bg-[#161720] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold text-white">Новогодняя тема</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-white/52">
            Лёгкий снег и гирлянда на главной, праздничное оформление смарт-ссылок. Артист может выключить
            оформление своей ссылки в её настройках.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Новогодняя тема"
          disabled={busy || envOverride !== null}
          onClick={() => void toggle()}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-50",
            enabled ? "border-[#7b3df5]/60 bg-[#7b3df5]" : "border-white/15 bg-white/10"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white transition-all",
              enabled ? "left-[22px]" : "left-0.5"
            )}
          />
        </button>
      </div>
      <p className="mt-4 text-[13px] font-semibold text-white/70">{enabled ? "Включена" : "Выключена"}</p>
      {envOverride ? (
        <p className="mt-2 text-[12.5px] text-amber-200">
          Сейчас тема задана переменной окружения NEW_YEAR_THEME={envOverride}, переключатель не действует.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-[13px] font-semibold text-rose-200">{error}</p> : null}
    </section>
  );
}
