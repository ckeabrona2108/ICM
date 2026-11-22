"use client";

import { CalendarClock, Hourglass } from "lucide-react";

import { useMinuteNow } from "@/components/release-wizard/moderation-date-notice";
import { formatMskDayOn, isModerationDelayed, moderationPause } from "@/lib/moderation-schedule";

/**
 * On a release that is being moderated: days off before moderators start, or a moderation that
 * runs late. Gone as soon as the release leaves moderation (the caller renders it only then).
 */
export function ModerationTimingNotice({ sentAt }: { sentAt?: string }) {
  const now = useMinuteNow();
  const sent = sentAt ? new Date(sentAt) : null;
  if (!now || !sent || Number.isNaN(sent.getTime())) return null;

  if (isModerationDelayed(sent, now)) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/18 bg-amber-500/[0.05] px-2.5 py-2">
        <Hourglass className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/90" strokeWidth={2} aria-hidden />
        <p className="text-[10px] leading-snug text-amber-100/85 sm:text-[11px]">
          Модерация задерживается. Мы уже разбираемся и постараемся проверить релиз как можно скорее.
        </p>
      </div>
    );
  }

  // Only while moderators wait for days off to end; on working days the card stays quiet.
  const pause = moderationPause(now);
  if (!pause) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-sky-400/18 bg-sky-500/[0.06] px-2.5 py-2">
      <CalendarClock className="mt-0.5 h-3 w-3 shrink-0 text-sky-300/90" strokeWidth={2} aria-hidden />
      <p className="text-[10px] leading-snug text-sky-100/85 sm:text-[11px]">
        {pause.holiday ? "В праздничные дни" : "В выходные дни"} релизы не проверяются. Проверка релиза начнётся{" "}
        {formatMskDayOn(pause.start)}.
      </p>
    </div>
  );
}
