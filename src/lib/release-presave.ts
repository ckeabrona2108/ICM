/**
 * Pre-save dates (Яндекс Музыка «Скоро новый релиз», VK Музыка / Одноклассники).
 * Platform rule: by default 7 days before the start date; it can be moved, but must stay
 * at least 2 days before the start; when the start date changes, it is recalculated.
 * Dates are "YYYY-MM-DD" strings, as the wizard date inputs produce them.
 */

export const PRE_SAVE_DEFAULT_DAYS_BEFORE_START = 7;
export const PRE_SAVE_MIN_DAYS_BEFORE_START = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" (wizard) or "DD.MM.YYYY" (older saved data). */
function parseIsoDate(value: string | null | undefined): Date | null {
  const input = (value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(input);
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(input);
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : ru ? [ru[3], ru[2], ru[1]] : [];
  if (!year) return null;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  return date ? formatIsoDate(new Date(date.getTime() + days * DAY_MS)) : "";
}

/** Default pre-save date for a start date, or "" when the start date is not set yet. */
export function defaultPreSaveDate(startDate: string | null | undefined): string {
  return shiftDays(startDate ?? "", -PRE_SAVE_DEFAULT_DAYS_BEFORE_START);
}

/** Latest allowed pre-save date for a start date, or "" when the start date is not set yet. */
export function latestPreSaveDate(startDate: string | null | undefined): string {
  return shiftDays(startDate ?? "", -PRE_SAVE_MIN_DAYS_BEFORE_START);
}

/** Problem with a pre-save date, or null when it is fine. `platform` goes into the message. */
export function validatePreSaveDate(params: {
  preSaveDate: string | null | undefined;
  startDate: string | null | undefined;
  platform: string;
}): string | null {
  const preSave = parseIsoDate(params.preSaveDate);
  if (!preSave) return `Укажите корректную дату pre-save для ${params.platform}.`;
  const start = parseIsoDate(params.startDate);
  if (!start) return null;
  const daysBeforeStart = Math.round((start.getTime() - preSave.getTime()) / DAY_MS);
  if (daysBeforeStart < PRE_SAVE_MIN_DAYS_BEFORE_START) {
    return `Дата pre-save для ${params.platform} должна быть не позднее чем за ${PRE_SAVE_MIN_DAYS_BEFORE_START} дня до даты старта.`;
  }
  return null;
}

/** VK start date: its own date if set, otherwise the common start date. */
export function resolveVkStartDate(data: { vkStartDate?: string | null; startDate?: string | null }): string {
  return (data.vkStartDate ?? "").trim() || (data.startDate ?? "").trim();
}
