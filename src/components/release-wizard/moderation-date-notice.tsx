"use client";

import * as React from "react";
import { AlertTriangle, CalendarClock, CalendarX2, History } from "lucide-react";

import {
  firstSafeReleaseDay,
  fitReleaseDate,
  formatMskDayMonth,
  formatMskDayOn,
  moderationPause,
  mskDayOf,
  parseMskDay,
  type MskDay
} from "@/lib/moderation-schedule";
import { areRussianHolidaysEnabled } from "@/lib/russian-holidays";
import { cn } from "@/lib/utils";

const MINUTE_MS = 60_000;

/** "Now", known only after mount (no server/client mismatch) and refreshed every minute. */
export function useMinuteNow(): Date | null {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** The earliest of the release dates the artist set: the release has to be on the platforms by then. */
function earliestDay(dates: string[]): MskDay | null {
  const days = dates.map(parseMskDay).filter((day): day is MskDay => day !== null);
  if (days.length === 0) return null;
  return days.reduce((min, day) => (day.getTime() < min.getTime() ? day : min));
}

/** A date before today (Moscow): nothing to be late for, the release simply goes out with that date. */
function isPastDay(now: Date, day: MskDay): boolean {
  return day.getTime() < mskDayOf(now).getTime();
}

function formatFullDay(day: MskDay): string {
  return `${formatMskDayMonth(day)}.${day.getUTCFullYear()}`;
}

const NEED_TIME = areRussianHolidaysEnabled()
  ? "На неё нужно минимум 1–2 дня, а в выходные и праздничные дни релизы не проверяются."
  : "На неё нужно минимум 1–2 дня, а в выходные дни релизы не проверяются.";

function Notice({
  tone,
  icon: Icon,
  children,
  className
}: {
  tone: "info" | "warn" | "danger";
  icon: typeof AlertTriangle;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className={cn(
        "flex items-start gap-3 rounded-[18px] border px-4 py-3 text-[12.5px] leading-[1.55]",
        tone === "info" && "border-sky-300/22 bg-sky-500/[0.07] text-sky-100/90",
        tone === "warn" && "border-amber-300/25 bg-amber-500/[0.07] text-amber-100/90",
        tone === "danger" && "border-rose-400/25 bg-rose-500/[0.07] text-rose-100/90",
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/** Under the date pickers: the chosen date leaves moderation less than 2 working days. */
export function ModerationDateHint({ dates, className }: { dates: string[]; className?: string }) {
  const now = useMinuteNow();
  const day = earliestDay(dates);
  if (!now || !day) return null;
  const safe = formatMskDayMonth(firstSafeReleaseDay(now));
  if (isPastDay(now, day)) {
    const full = formatFullDay(day);
    return (
      <Notice tone="info" icon={History} className={className}>
        Дата {full} уже прошла. Релиз появится на площадках после модерации, а датой выхода у него будет
        указано {full}. Если нужна новая дата, выберите не раньше {safe}.
      </Notice>
    );
  }
  const fit = fitReleaseDate(now, day);
  if (fit === "ok") return null;
  const date = formatMskDayMonth(day);

  return fit === "tight" ? (
    <Notice tone="warn" icon={AlertTriangle} className={className}>
      Модерация может не успеть до {date}. {NEED_TIME} Чтобы релиз вышел в срок, выберите дату не раньше {safe}.
    </Notice>
  ) : (
    <Notice tone="danger" icon={CalendarX2} className={className}>
      Модерация не успеет до {date}. {NEED_TIME} Выберите дату не раньше {safe}.
    </Notice>
  );
}

/** Above the submit button: days off ahead of the answer, and a date moderation may miss. */
export function ModerationSubmitNotices({
  dates,
  checkDates,
  onChangeDate,
  className
}: {
  dates: string[];
  /** Off for edits of a release that is already out: its dates have passed on purpose. */
  checkDates: boolean;
  onChangeDate: () => void;
  className?: string;
}) {
  const now = useMinuteNow();
  if (!now) return null;
  const pause = moderationPause(now);
  const day = checkDates ? earliestDay(dates) : null;
  const past = day ? isPastDay(now, day) : false;
  const fit = day && !past ? fitReleaseDate(now, day) : "ok";
  if (!pause && !past && fit === "ok") return null;

  const changeDate = (
    <button
      type="button"
      onClick={onChangeDate}
      className="ml-1 font-semibold underline underline-offset-2 hover:text-white"
    >
      Изменить дату
    </button>
  );

  return (
    <div className={cn("grid gap-2", className)}>
      {pause ? (
        <Notice tone="info" icon={CalendarClock}>
          {pause.holiday ? "В праздничные дни" : "В выходные дни"} релизы не проверяются. Проверка релиза начнётся{" "}
          {formatMskDayOn(pause.start)}. Как только модератор ответит, придёт уведомление.
        </Notice>
      ) : null}
      {day && past ? (
        <Notice tone="info" icon={History}>
          Дата {formatFullDay(day)} уже прошла: релиз появится на площадках после модерации, а датой выхода будет
          указано {formatFullDay(day)}.{changeDate}
        </Notice>
      ) : null}
      {day && fit === "tight" ? (
        <Notice tone="warn" icon={AlertTriangle}>
          Модерация может не успеть до даты релиза {formatMskDayMonth(day)}.{changeDate}
        </Notice>
      ) : null}
      {day && fit === "late" ? (
        <Notice tone="danger" icon={CalendarX2}>
          Модерация не успеет до даты релиза {formatMskDayMonth(day)}.{changeDate}
        </Notice>
      ) : null}
    </div>
  );
}
