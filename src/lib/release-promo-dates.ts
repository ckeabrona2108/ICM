/**
 * Release dates that leave time for playlist pitching ("промо" in the release date picker).
 * Editors need the release about two weeks ahead: picking on the 1st, the 14th is the first
 * promo date, so a date at least PROMO_MIN_LEAD_DAYS days after today counts.
 */
export const PROMO_MIN_LEAD_DAYS = 13;

/** Local calendar day as YYYY-MM-DD. */
export function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseIsoDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole days from `today` to `day` (local calendar days). */
export function daysBetween(today: Date, day: Date): number {
  return Math.round((startOfDay(day).getTime() - startOfDay(today).getTime()) / 86_400_000);
}

export function isPromoReleaseDate(day: Date, today: Date = new Date()): boolean {
  return daysBetween(today, day) >= PROMO_MIN_LEAD_DAYS;
}

export function firstPromoReleaseDate(today: Date = new Date()): Date {
  const start = startOfDay(today);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + PROMO_MIN_LEAD_DAYS);
}

/** Weeks of a month, Monday first; null cells pad the first and last week. */
export function buildMonthWeeks(year: number, month: number): Array<Array<Date | null>> {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: Array<Date | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
