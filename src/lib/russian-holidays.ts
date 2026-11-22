/**
 * Russian public holidays and non-working days (production calendar). Moderation does not work
 * on them, and the release date picker marks them.
 *
 * Years with a government decree list their exact non-working days, transfers included. Other
 * years fall back to the Labor Code (art. 112): the fixed holidays, and a holiday that falls on
 * Saturday or Sunday moves to the next working day (except the New Year holidays, which only a
 * decree moves). When the decree for a new year is published, add it to DECREE_YEARS.
 *
 * On top of the calendar an admin can mark extra days off (with the holiday's name) and extra
 * working days in the admin "Праздники" page; setModerationCalendarOverrides applies them.
 *
 * Switched off for now (HOLIDAYS_ENABLED): only Saturday and Sunday are days off, no holiday is
 * named or marked anywhere, and the admin page is hidden. Set it to true to bring it all back.
 */
export const HOLIDAYS_ENABLED = false;

let holidaysEnabled = HOLIDAYS_ENABLED;

/** For tests: turns the holiday calendar on or off in this process. */
export function setRussianHolidaysEnabled(enabled: boolean): void {
  holidaysEnabled = enabled;
}

export function areRussianHolidaysEnabled(): boolean {
  return holidaysEnabled;
}

type DayList = Record<string, string>; // "MM-DD" → name

const NEW_YEAR = "Новогодние каникулы";
const TRANSFER = "Перенесённый выходной";

const FIXED_HOLIDAYS: DayList = {
  "01-01": NEW_YEAR,
  "01-02": NEW_YEAR,
  "01-03": NEW_YEAR,
  "01-04": NEW_YEAR,
  "01-05": NEW_YEAR,
  "01-06": NEW_YEAR,
  "01-07": "Рождество Христово",
  "01-08": NEW_YEAR,
  "02-23": "День защитника Отечества",
  "03-08": "Международный женский день",
  "05-01": "Праздник Весны и Труда",
  "05-09": "День Победы",
  "06-12": "День России",
  "11-04": "День народного единства"
};

interface DecreeYear {
  /** Days off beyond the fixed holidays: transfers and holidays moved from a weekend. */
  extraDaysOff: DayList;
  /** Saturdays or Sundays that are working days. */
  workingWeekends: string[];
}

// Постановление Правительства РФ о переносе выходных дней в 2026 году.
const DECREE_YEARS: Record<number, DecreeYear> = {
  2026: {
    extraDaysOff: {
      "01-09": TRANSFER, // с 3 января
      "03-09": TRANSFER, // 8 марта — воскресенье
      "05-11": TRANSFER, // 9 мая — суббота
      "12-31": TRANSFER // с 4 января
    },
    workingWeekends: []
  },
  // Постановление Правительства РФ от 17.09.2026 № 1187 «О переносе выходных дней в 2027 году».
  2027: {
    extraDaysOff: {
      "02-22": TRANSFER, // с субботы 20 февраля
      "05-03": TRANSFER, // 1 мая — суббота
      "05-10": TRANSFER, // 9 мая — воскресенье
      "06-14": TRANSFER, // 12 июня — суббота
      "11-05": TRANSFER, // с субботы 2 января
      "12-31": TRANSFER // с воскресенья 3 января
    },
    workingWeekends: ["02-20"]
  }
};

/** Days an admin set by hand, by "YYYY-MM-DD". */
export interface ModerationCalendarOverrides {
  daysOff: Record<string, string>;
  workingDays: string[];
}

let overrides: ModerationCalendarOverrides = { daysOff: {}, workingDays: [] };

/** Applies the admin's days; called with what the server loaded (server runs and the cabinet). */
export function setModerationCalendarOverrides(next: ModerationCalendarOverrides | null | undefined): void {
  overrides = next ?? { daysOff: {}, workingDays: [] };
}

function isoDay(year: number, month: number, day: number): string {
  return `${year}-${key(month, day)}`;
}

function key(month: number, day: number): string {
  return `${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function weekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

function isWeekend(year: number, month: number, day: number): boolean {
  const value = weekday(year, month, day);
  return value === 0 || value === 6;
}

/** Labor Code fallback: a non-January holiday on a weekend moves to the next weekday. */
function fallbackTransfers(year: number): DayList {
  const result: DayList = {};
  for (const [monthDay] of Object.entries(FIXED_HOLIDAYS)) {
    const [month, day] = monthDay.split("-").map(Number);
    if (month === 1 || !isWeekend(year, month - 1, day)) continue;
    let cursor = new Date(Date.UTC(year, month - 1, day));
    do {
      cursor = new Date(cursor.getTime() + 86_400_000);
    } while (
      isWeekend(year, cursor.getUTCMonth(), cursor.getUTCDate()) ||
      FIXED_HOLIDAYS[key(cursor.getUTCMonth(), cursor.getUTCDate())] ||
      result[key(cursor.getUTCMonth(), cursor.getUTCDate())]
    );
    result[key(cursor.getUTCMonth(), cursor.getUTCDate())] = TRANSFER;
  }
  return result;
}

/** Name of the holiday or non-working day (month is 0-based), or null for an ordinary day. */
export function getRussianHoliday(year: number, month: number, day: number): string | null {
  if (!holidaysEnabled) return null;
  const iso = isoDay(year, month, day);
  if (overrides.workingDays.includes(iso)) return null;
  const custom = overrides.daysOff[iso];
  if (custom) return custom;
  const dayKey = key(month, day);
  const fixed = FIXED_HOLIDAYS[dayKey];
  if (fixed) return fixed;
  const decree = DECREE_YEARS[year];
  const extra = decree ? decree.extraDaysOff : fallbackTransfers(year);
  return extra[dayKey] ?? null;
}

/** Nobody works that day: a weekend that is not a working Saturday/Sunday, or a holiday. */
export function isRussianDayOff(year: number, month: number, day: number): boolean {
  if (!holidaysEnabled) return isWeekend(year, month, day);
  if (overrides.workingDays.includes(isoDay(year, month, day))) return false;
  if (getRussianHoliday(year, month, day)) return true;
  if (!isWeekend(year, month, day)) return false;
  return !(DECREE_YEARS[year]?.workingWeekends ?? []).includes(key(month, day));
}
