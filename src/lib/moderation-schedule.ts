import { getRussianHoliday, isRussianDayOff } from "@/lib/russian-holidays";

/**
 * Moderation works on working days (Moscow time, Russian production calendar) and takes 1–2 of
 * them; weekends and public holidays are days off. A release sent on a weekday before MODERATION_EVENING_HOUR counts that day as
 * the first working day; sent later or on a day off, counting starts from the next working day.
 *
 * A release date is safe when at least MODERATION_WORKING_DAYS working days come before it
 * (the release day itself is not counted, and it may be any day of the week).
 */
export const MODERATION_EVENING_HOUR = 18;
export const MODERATION_WORKING_DAYS = 2;
/** A late moderation is reported from this Moscow hour of the working day after the expected answer. */
export const MODERATION_DELAY_NOTICE_HOUR = 12;

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** A Moscow calendar day as a UTC-midnight Date, read with getUTC*. */
export type MskDay = Date;

function shiftToMsk(at: Date): Date {
  return new Date(at.getTime() + MSK_OFFSET_MS);
}

function toMskDay(at: Date): MskDay {
  const msk = shiftToMsk(at);
  return new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()));
}

function addDays(day: MskDay, days: number): MskDay {
  return new Date(day.getTime() + days * DAY_MS);
}

export function isDayOff(day: MskDay): boolean {
  return isRussianDayOff(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
}

function holidayOf(day: MskDay): string | null {
  return getRussianHoliday(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
}

function nextWorkingDay(day: MskDay): MskDay {
  let current = addDays(day, 1);
  while (isDayOff(current)) current = addDays(current, 1);
  return current;
}

/** "2026-11-23" → that Moscow day; null for anything else. */
export function parseMskDay(value: string): MskDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (!match) return null;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(day.getTime()) ? null : day;
}

/** First working day moderators can spend on a release sent at `sentAt`. */
export function firstModerationDay(sentAt: Date): MskDay {
  const day = toMskDay(sentAt);
  const evening = shiftToMsk(sentAt).getUTCHours() >= MODERATION_EVENING_HOUR;
  return isDayOff(day) || evening ? nextWorkingDay(day) : day;
}

/** Working days moderators have between sending and the release day (the release day not counted). */
export function workingDaysBeforeRelease(sentAt: Date, releaseDay: MskDay): number {
  let count = 0;
  for (let day = firstModerationDay(sentAt); day.getTime() < releaseDay.getTime(); day = addDays(day, 1)) {
    if (!isDayOff(day)) count += 1;
  }
  return count;
}

export type ReleaseDateFit = "ok" | "tight" | "late";

/** ok: 2+ working days before the release; tight: 1, moderation may not make it; late: none. */
export function fitReleaseDate(sentAt: Date, releaseDay: MskDay): ReleaseDateFit {
  const days = workingDaysBeforeRelease(sentAt, releaseDay);
  if (days >= MODERATION_WORKING_DAYS) return "ok";
  return days === 1 ? "tight" : "late";
}

export interface ModerationWindow {
  /** The 1st and the 2nd working day of moderation: the answer is expected on one of them. */
  earliest: MskDay;
  latest: MskDay;
}

export function getModerationWindow(sentAt: Date): ModerationWindow {
  const earliest = firstModerationDay(sentAt);
  let latest = earliest;
  for (let i = 1; i < MODERATION_WORKING_DAYS; i += 1) latest = nextWorkingDay(latest);
  return { earliest, latest };
}

export interface ModerationPause {
  /** First working day moderators take a release sent now. */
  start: MskDay;
  /** The days off before it include a public holiday (not only a weekend). */
  holiday: boolean;
}

/**
 * Moderation waits for days off to end: a weekend or holiday lies between now and the first day
 * moderators can take a release sent now. Null when moderators work today or tomorrow as usual.
 */
export function moderationPause(now: Date = new Date()): ModerationPause | null {
  const start = firstModerationDay(now);
  let pause = false;
  let holiday = false;
  for (let day = toMskDay(now); day.getTime() < start.getTime(); day = addDays(day, 1)) {
    if (!isDayOff(day)) continue;
    pause = true;
    if (holidayOf(day)) holiday = true;
  }
  return pause ? { start, holiday } : null;
}

/** First release date with MODERATION_WORKING_DAYS working days before it. */
export function firstSafeReleaseDay(sentAt: Date): MskDay {
  return addDays(getModerationWindow(sentAt).latest, 1);
}

/**
 * Moderation runs late: the expected answer day has passed and the next working day has come
 * (from MODERATION_DELAY_NOTICE_HOUR, so the morning of that day is still given to moderators).
 */
export function isModerationDelayed(sentAt: Date, now: Date = new Date()): boolean {
  const graceDay = nextWorkingDay(getModerationWindow(sentAt).latest);
  const today = toMskDay(now);
  if (today.getTime() > graceDay.getTime()) return true;
  return today.getTime() === graceDay.getTime() && shiftToMsk(now).getUTCHours() >= MODERATION_DELAY_NOTICE_HOUR;
}

export interface HolidayBreak {
  /** First and last day off in a row of days off that has a public holiday in it. */
  start: MskDay;
  end: MskDay;
}

export interface HolidayBreakNotice {
  /** The nearest break, and the one right after it when only a few working days lie between (May). */
  breaks: [HolidayBreak] | [HolidayBreak, HolidayBreak];
  /** Today is inside the first break. */
  during: boolean;
  /** Last moment to send a release so moderation finishes before the break; null when it has passed. */
  sendBefore: Date | null;
  /** First working day after the first break. */
  resume: MskDay;
  /** Days between two linked breaks: moderators work then. */
  workingGap: HolidayBreak | null;
  /** Stable id of the first break, for "do not show again". */
  key: string;
}

/** A long break is announced two weeks ahead, a single holiday five days ahead. */
const LONG_BREAK_DAYS = 3;
const LONG_BREAK_LEAD_DAYS = 14;
const SHORT_BREAK_LEAD_DAYS = 5;
/** Breaks this close (in working days between them) are announced together. */
const LINKED_BREAK_GAP_DAYS = 7;
const BREAK_SCAN_DAYS = 60;

function previousWorkingDay(day: MskDay): MskDay {
  let current = addDays(day, -1);
  while (isDayOff(current)) current = addDays(current, -1);
  return current;
}

function daysApart(from: MskDay, to: MskDay): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** Rows of days off with a holiday in them, from the one that holds or follows `today`. */
function holidayBreaksFrom(today: MskDay): HolidayBreak[] {
  let cursor = today;
  while (isDayOff(addDays(cursor, -1))) cursor = addDays(cursor, -1);
  const result: HolidayBreak[] = [];
  const last = addDays(today, BREAK_SCAN_DAYS);
  while (cursor.getTime() <= last.getTime()) {
    if (!isDayOff(cursor)) {
      cursor = addDays(cursor, 1);
      continue;
    }
    const start = cursor;
    let hasHoliday = false;
    while (isDayOff(cursor)) {
      if (holidayOf(cursor)) hasHoliday = true;
      cursor = addDays(cursor, 1);
    }
    if (hasHoliday) result.push({ start, end: addDays(cursor, -1) });
  }
  return result;
}

/** Holidays ahead that artists should know about now, or null when none are close. */
export function upcomingHolidayBreak(now: Date = new Date()): HolidayBreakNotice | null {
  const today = toMskDay(now);
  const [first, second] = holidayBreaksFrom(today);
  if (!first) return null;
  const during = first.start.getTime() <= today.getTime();
  const length = daysApart(first.start, first.end) + 1;
  const lead = length >= LONG_BREAK_DAYS ? LONG_BREAK_LEAD_DAYS : SHORT_BREAK_LEAD_DAYS;
  if (!during && daysApart(today, first.start) > lead) return null;

  const lastSendDay = previousWorkingDay(previousWorkingDay(first.start));
  const deadline = new Date(lastSendDay.getTime() + MODERATION_EVENING_HOUR * 60 * 60 * 1000 - MSK_OFFSET_MS);
  const linked = second && daysApart(first.end, second.start) <= LINKED_BREAK_GAP_DAYS ? second : null;

  return {
    breaks: linked ? [first, linked] : [first],
    during,
    sendBefore: !during && now.getTime() < deadline.getTime() ? deadline : null,
    resume: addDays(first.end, 1),
    workingGap: linked ? { start: addDays(first.end, 1), end: addDays(linked.start, -1) } : null,
    key: `holiday-break:${first.start.toISOString().slice(0, 10)}`
  };
}

const MONTHS_OF = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
] as const;

/** "4 ноября" */
export function formatMskDayLong(day: MskDay): string {
  return `${day.getUTCDate()} ${MONTHS_OF[day.getUTCMonth()]}`;
}

/** "4 ноября", "1–3 мая", "31 декабря – 10 января" */
export function formatMskDayRange(start: MskDay, end: MskDay): string {
  if (start.getTime() === end.getTime()) return formatMskDayLong(start);
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS_OF[end.getUTCMonth()]}`;
  }
  return `${formatMskDayLong(start)} – ${formatMskDayLong(end)}`;
}

/** The Moscow day of a moment, for formatting. */
export function mskDayOf(at: Date): MskDay {
  return toMskDay(at);
}

const WEEKDAY_ON = [
  "в воскресенье",
  "в понедельник",
  "во вторник",
  "в среду",
  "в четверг",
  "в пятницу",
  "в субботу"
] as const;

function dayMonth(day: MskDay): string {
  return `${String(day.getUTCDate()).padStart(2, "0")}.${String(day.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "23.11" */
export function formatMskDayMonth(day: MskDay): string {
  return dayMonth(day);
}

/** "в понедельник (23.11)" */
export function formatMskDayOn(day: MskDay): string {
  return `${WEEKDAY_ON[day.getUTCDay()]} (${dayMonth(day)})`;
}

