"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { buildMonthWeeks, daysBetween, isPromoReleaseDate, parseIsoDay, toIsoDay } from "@/lib/release-promo-dates";
import { getRussianHoliday } from "@/lib/russian-holidays";

function monthHasHolidays(year: number, month: number): boolean {
  const days = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= days; day += 1) if (getRussianHoliday(year, month, day)) return true;
  return false;
}

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatRu(value: string): string {
  const date = parseIsoDay(value);
  if (!date) return "";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function MonthGrid({
  year,
  month,
  today,
  selected,
  onPick,
  showPromo,
  max
}: {
  year: number;
  month: number;
  today: Date;
  selected: string;
  onPick: (value: string) => void;
  showPromo: boolean;
  /** Last day that can be picked, YYYY-MM-DD. */
  max?: string;
}) {
  const weeks = React.useMemo(() => buildMonthWeeks(year, month), [year, month]);
  return (
    <div className="min-w-0">
      <p className="mb-3 text-center text-[19px] font-black tracking-[-0.02em] text-white">
        {MONTHS[month]} <span className="text-white/35">{year}</span>
      </p>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((day) => (
          <span key={day} className="pb-1.5 text-[12px] font-medium text-white/40">
            {day}
          </span>
        ))}
        {weeks.flat().map((day, index) => {
          if (!day) return <span key={`pad-${index}`} />;
          const iso = toIsoDay(day);
          const past = daysBetween(today, day) < 0 || Boolean(max && iso > max);
          const promo = showPromo && !past && isPromoReleaseDate(day, today);
          const isSelected = iso === selected;
          const holiday = getRussianHoliday(day.getFullYear(), day.getMonth(), day.getDate());
          return (
            <button
              key={iso}
              type="button"
              disabled={past}
              onClick={() => onPick(iso)}
              aria-pressed={isSelected}
              title={holiday ? `${holiday}: модерация не работает` : undefined}
              aria-label={`${formatRu(iso)}${holiday ? `, ${holiday.toLowerCase()}` : ""}${promo ? ", можно подать на промо" : ""}`}
              className={cn(
                "mx-auto flex h-[50px] w-full max-w-[52px] flex-col items-center justify-center rounded-[14px] transition-colors",
                past && "cursor-not-allowed text-white/20",
                !past && !isSelected && (holiday ? "text-rose-300 hover:bg-rose-500/[0.10]" : "text-white hover:bg-white/[0.07]"),
                past && holiday && "text-rose-300/25",
                isSelected && "bg-[var(--ux-accent,#7b61ff)] text-white shadow-[0_8px_22px_-10px_rgba(123,97,255,0.9)]"
              )}
            >
              <span className="text-[15px] font-semibold tabular-nums leading-none">{day.getDate()}</span>
              <span
                className={cn(
                  showPromo ? "mt-1 h-[11px]" : "hidden",
                  "text-[10px] leading-none",
                  isSelected ? "text-white/85" : "text-emerald-300/80"
                )}
              >
                {promo ? "промо" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Drafts may keep a date as DD.MM.YYYY or as a full ISO timestamp. */
function normalizeDay(value: string): string {
  const trimmed = (value ?? "").trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/u.exec(trimmed);
  if (iso) return iso[1]!;
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(trimmed);
  return ru ? `${ru[3]}-${ru[2]}-${ru[1]}` : "";
}

/**
 * Date field of the release wizard. For the release date (`promo`) the calendar marks dates still
 * open for playlist pitching; the preorder and start dates use the same field without the marks.
 */
export function ReleaseDatePicker({
  value: rawValue,
  onChange,
  className,
  promo = true,
  label = "Дата релиза",
  max
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  promo?: boolean;
  label?: string;
  /** Last day that can be picked, YYYY-MM-DD. */
  max?: string;
}) {
  const value = normalizeDay(rawValue);
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [pending, setPending] = React.useState(value);
  const today = React.useMemo(() => new Date(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const initialMonth = React.useMemo(() => {
    // A date already in the past opens on this month: past days cannot be picked.
    const picked = parseIsoDay(value);
    const base = picked && daysBetween(today, picked) >= 0 ? picked : today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  }, [value, today]);
  const [anchor, setAnchor] = React.useState(initialMonth);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    if (!open) return;
    setPending(value);
    setAnchor(initialMonth);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const canGoBack =
    anchor.getFullYear() > today.getFullYear() ||
    (anchor.getFullYear() === today.getFullYear() && anchor.getMonth() > today.getMonth());
  const display = formatRu(value);
  const showsHolidays =
    monthHasHolidays(anchor.getFullYear(), anchor.getMonth()) || monthHasHolidays(next.getFullYear(), next.getMonth());

  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-[52px] w-full min-w-0 items-center justify-center overflow-hidden rounded-[18px] border border-white/[0.12] bg-black/25 px-4 text-[14px] font-medium tabular-nums text-[var(--ux-text)] outline-none transition-colors hover:border-white/25 focus-visible:border-[var(--ux-accent)]/60",
          className
        )}
      >
        {display ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {display}
            {promo && parseIsoDay(value) && isPromoReleaseDate(parseIsoDay(value)!) ? (
              <span className="rounded-full bg-emerald-400/10 px-1.5 py-px text-[9.5px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-emerald-300/90">промо</span>
            ) : null}
          </span>
        ) : (
          <span className="inline-flex items-center gap-3 whitespace-nowrap text-white/40">
            <span className="text-white/38">Выбрать дату</span>
            <CalendarDays className="h-[18px] w-[18px] shrink-0 text-white/40" />
          </span>
        )}
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] grid place-items-center bg-black/65 px-4 py-6 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={label}
                onClick={(event) => event.stopPropagation()}
                className="max-h-full w-full max-w-[760px] overflow-y-auto rounded-[28px] border border-white/10 bg-[#14151f] p-5 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)] sm:p-7"
              >
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
                    disabled={!canGoBack}
                    aria-label="Предыдущий месяц"
                    className="absolute left-0 top-0 grid h-8 w-10 place-items-center rounded-full bg-white/[0.06] text-white/70 transition hover:bg-white/[0.12] disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnchor(next)}
                    aria-label="Следующий месяц"
                    className="absolute right-0 top-0 grid h-8 w-10 place-items-center rounded-full bg-white/[0.06] text-white/70 transition hover:bg-white/[0.12]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <div className="grid gap-8 sm:grid-cols-2">
                    <MonthGrid year={anchor.getFullYear()} month={anchor.getMonth()} today={today} selected={pending} onPick={setPending} showPromo={promo} max={max} />
                    <div className="hidden sm:block">
                      <MonthGrid year={next.getFullYear()} month={next.getMonth()} today={today} selected={pending} onPick={setPending} showPromo={promo} max={max} />
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-1">
                    {promo ? (
                      <p className="text-[13px] leading-5 text-white/55">
                        Для питчинга в плейлисты выбирайте даты с пометкой{" "}
                        <span className="font-semibold text-emerald-300">«промо»</span>.
                      </p>
                    ) : (
                      <p className="text-[13px] leading-5 text-white/55">{label}</p>
                    )}
                    {showsHolidays ? (
                      <p className="text-[13px] leading-5 text-white/55">
                        <span className="font-semibold text-rose-300">Красным</span> отмечены праздники: в эти дни
                        модерация не работает.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={!pending}
                    onClick={() => {
                      onChange(pending);
                      setOpen(false);
                    }}
                    className="h-12 shrink-0 rounded-2xl bg-[var(--ux-accent,#7b61ff)] px-10 text-[14px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                  >
                    Выбрать
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
