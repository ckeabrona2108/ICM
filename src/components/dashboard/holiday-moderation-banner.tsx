"use client";

import * as React from "react";
import { CalendarHeart, X } from "lucide-react";

import { useMinuteNow } from "@/components/release-wizard/moderation-date-notice";
import {
  formatMskDayLong,
  formatMskDayRange,
  mskDayOf,
  upcomingHolidayBreak,
  type HolidayBreakNotice
} from "@/lib/moderation-schedule";

const DISMISS_PREFIX = "icm:dismissed:";

function texts(notice: HolidayBreakNotice): { title: string; lines: string[] } {
  const [first, second] = notice.breaks;
  const ranges = notice.breaks.map((item) => formatMskDayRange(item.start, item.end)).join(" и ");
  const resume = formatMskDayLong(notice.resume);
  const gap = notice.workingGap ? formatMskDayRange(notice.workingGap.start, notice.workingGap.end) : null;
  const lines: string[] = [];

  if (notice.during) {
    lines.push(`Модерация не работает до ${formatMskDayLong(first.end)}, проверка релизов продолжится с ${resume}.`);
    if (second && gap) {
      lines.push(`${gap} — рабочие дни, затем снова выходные: ${formatMskDayRange(second.start, second.end)}.`);
    }
  } else {
    if (notice.sendBefore) {
      lines.push(
        `Чтобы релиз проверили до праздников, отправьте его на модерацию до ${formatMskDayLong(
          mskDayOf(notice.sendBefore)
        )}, 18:00. Отправленные позже релизы проверим с ${resume}.`
      );
    } else {
      lines.push(`Релизы, отправленные сейчас, проверим с ${resume}.`);
    }
    if (gap) lines.push(`${gap} — рабочие дни, модерация работает в обычном режиме.`);
  }
  lines.push("Правки и удаление релизов в праздничные дни тоже не обрабатываются.");

  return {
    title: notice.during
      ? "Сейчас праздничные дни"
      : `Праздничные дни: модерация не работает ${ranges}`,
    lines
  };
}

/**
 * Banner on every cabinet page before and during public holidays: when moderation stops, until
 * when to send a release to have it checked before them, and when it works again. Closing it hides
 * this holiday for good in this browser; the next holiday shows again.
 */
export function HolidayModerationBanner({ at }: { at?: Date } = {}) {
  const clock = useMinuteNow();
  const now = at ?? clock;
  const notice = now ? upcomingHolidayBreak(now) : null;
  const [dismissedKey, setDismissedKey] = React.useState<string | null>(null);
  const [checkedKey, setCheckedKey] = React.useState<string | null>(null);
  const key = notice?.key ?? null;

  React.useEffect(() => {
    if (!key) return;
    try {
      setDismissedKey(window.localStorage.getItem(DISMISS_PREFIX + key) ? key : null);
    } catch {
      setDismissedKey(null);
    }
    setCheckedKey(key);
  }, [key]);

  if (!notice || checkedKey !== notice.key || dismissedKey === notice.key) return null;
  const { title, lines } = texts(notice);

  return (
    <div className="relative mb-5 mt-1 flex gap-3 overflow-hidden rounded-[22px] border border-rose-300/20 bg-[linear-gradient(110deg,rgba(244,114,182,0.11),rgba(123,97,255,0.10)_70%)] p-4 pr-12 sm:gap-4 sm:p-5 sm:pr-14">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-300/15 text-rose-200">
        <CalendarHeart className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-white">{title}</p>
        {lines.map((line) => (
          <p key={line} className="mt-1 text-[13px] leading-5 text-white/60">
            {line}
          </p>
        ))}
      </div>
      <button
        type="button"
        aria-label="Скрыть"
        onClick={() => {
          setDismissedKey(notice.key);
          try {
            window.localStorage.setItem(DISMISS_PREFIX + notice.key, "1");
          } catch {
            // Nothing to remember without storage: the banner is back on the next page.
          }
        }}
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
