"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";

import {
  getRussianHoliday,
  setModerationCalendarOverrides,
  type ModerationCalendarOverrides
} from "@/lib/russian-holidays";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const UPCOMING_DAYS = 120;

function formatDay(iso: string): string {
  const [year, month, day] = iso.split("-");
  const weekday = WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${day}.${month}.${year}, ${weekday}`;
}

/** Holidays of the next months as artists see them: the calendar plus the admin's days. */
function upcomingHolidays(calendar: ModerationCalendarOverrides): Array<{ date: string; name: string; custom: boolean }> {
  const result: Array<{ date: string; name: string; custom: boolean }> = [];
  const start = new Date();
  for (let i = 0; i < UPCOMING_DAYS; i += 1) {
    const day = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate() + i));
    const iso = day.toISOString().slice(0, 10);
    const name = getRussianHoliday(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    if (name) result.push({ date: iso, name, custom: Boolean(calendar.daysOff[iso]) });
  }
  return result;
}

export function AdminModerationCalendarClient({ initialCalendar }: { initialCalendar: ModerationCalendarOverrides }) {
  const [calendar, setCalendar] = React.useState(initialCalendar);
  const [date, setDate] = React.useState("");
  const [kind, setKind] = React.useState<"day_off" | "working_day">("day_off");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  setModerationCalendarOverrides(calendar);
  const custom = [
    ...Object.entries(calendar.daysOff).map(([day, label]) => ({ date: day, kind: "day_off" as const, label })),
    ...calendar.workingDays.map((day) => ({ date: day, kind: "working_day" as const, label: "Модерация работает" }))
  ].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = upcomingHolidays(calendar);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/moderation-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const parsed = (await response.json().catch(() => null)) as
        | { calendar?: ModerationCalendarOverrides; error?: string }
        | null;
      if (!response.ok || !parsed?.calendar) {
        setError(parsed?.error ?? "Не удалось сохранить.");
        return false;
      }
      setCalendar(parsed.calendar);
      return true;
    } catch {
      setError("Сервис настроек временно недоступен.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!date) {
      setError("Укажите дату.");
      return;
    }
    if (kind === "day_off" && !name.trim()) {
      setError("Укажите название праздника — его увидят артисты.");
      return;
    }
    const ok = await send({ action: "add", date, kind, name: kind === "day_off" ? name.trim() : undefined });
    if (ok) {
      setDate("");
      setName("");
    }
  }

  return (
    <div className="mt-6 grid max-w-3xl gap-5">
      <section className="rounded-2xl border border-white/[0.06] bg-[#161720] p-5">
        <h2 className="text-[18px] font-semibold text-white">Добавить день</h2>
        <form onSubmit={(event) => void add(event)} className="mt-4 grid gap-3 sm:grid-cols-[160px_200px_1fr]">
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setError(null);
            }}
            className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-[14px] text-white [color-scheme:dark]"
            aria-label="Дата"
          />
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as "day_off" | "working_day")}
            className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-[14px] text-white"
            aria-label="Тип дня"
          >
            <option value="day_off">Модерация не работает</option>
            <option value="working_day">Модерация работает</option>
          </select>
          {kind === "day_off" ? (
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              maxLength={80}
              placeholder="Название: например, «Новогодние каникулы»"
              className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-[14px] text-white placeholder:text-white/30"
              aria-label="Название праздника"
            />
          ) : (
            <p className="self-center text-[12.5px] text-white/45">День станет рабочим, даже если это выходной или праздник.</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-xl bg-[#7b3df5] px-5 text-[14px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50 sm:col-span-3 sm:justify-self-start"
          >
            {busy ? "Сохраняем…" : "Добавить"}
          </button>
        </form>
        {error ? <p className="mt-3 text-[13px] font-semibold text-rose-200">{error}</p> : null}
      </section>

      <section className="rounded-2xl border border-white/[0.06] bg-[#161720] p-5">
        <h2 className="text-[18px] font-semibold text-white">Добавленные вручную</h2>
        {custom.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-white/45">Пока нет — работает обычный производственный календарь.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {custom.map((item) => (
              <li key={item.date} className="flex items-center gap-3 py-2.5">
                <span className="w-[150px] shrink-0 text-[13.5px] tabular-nums text-white/80">{formatDay(item.date)}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
                    item.kind === "day_off" ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/15 text-emerald-200"
                  )}
                >
                  {item.kind === "day_off" ? "Не работает" : "Работает"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-white">{item.label}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void send({ action: "remove", date: item.date })}
                  aria-label={`Убрать ${formatDay(item.date)}`}
                  className="grid h-8 w-8 place-items-center rounded-lg text-white/45 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/[0.06] bg-[#161720] p-5">
        <h2 className="text-[18px] font-semibold text-white">Ближайшие праздники</h2>
        <p className="mt-1 text-[13px] text-white/45">Так их увидят артисты в ближайшие 4 месяца.</p>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-white/45">Праздников нет.</p>
        ) : (
          <ul className="mt-3 grid gap-1.5">
            {upcoming.map((item) => (
              <li key={item.date} className="flex items-center gap-3 text-[13.5px]">
                <span className="w-[150px] shrink-0 tabular-nums text-white/70">{formatDay(item.date)}</span>
                <span className="text-rose-200">{item.name}</span>
                {item.custom ? <span className="text-[11.5px] text-white/40">добавлен вручную</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
