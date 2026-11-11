// Support works Monday to Friday, 09:00–18:00 Moscow time (UTC+3, no DST). Weekends are days off.

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SUPPORT_OPEN_HOUR = 9;
export const SUPPORT_CLOSE_HOUR = 18;

/** Moscow wall-clock parts of a moment: day of week (0 = Sunday), hour, and the Moscow midnight as UTC ms. */
function moscowParts(date: Date) {
  const shifted = new Date(date.getTime() + MOSCOW_OFFSET_MS);
  const midnightShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return {
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60,
    midnight: midnightShifted - MOSCOW_OFFSET_MS
  };
}

const isWorkday = (weekday: number) => weekday >= 1 && weekday <= 5;

export function isSupportWorkingTime(date: Date): boolean {
  const { weekday, hour } = moscowParts(date);
  return isWorkday(weekday) && hour >= SUPPORT_OPEN_HOUR && hour < SUPPORT_CLOSE_HOUR;
}

/** When support last closed before `date` (the start of the current off-hours stretch). */
export function lastSupportClose(date: Date): Date {
  const { midnight } = moscowParts(date);
  for (let back = 0; back < 8; back += 1) {
    const dayMidnight = midnight - back * DAY_MS;
    const close = dayMidnight + SUPPORT_CLOSE_HOUR * 60 * 60 * 1000;
    if (isWorkday(moscowParts(new Date(dayMidnight)).weekday) && close <= date.getTime()) return new Date(close);
  }
  return new Date(midnight - 7 * DAY_MS);
}

/** When support opens next after `date`. */
export function nextSupportOpen(date: Date): Date {
  const { midnight } = moscowParts(date);
  for (let ahead = 0; ahead < 8; ahead += 1) {
    const dayMidnight = midnight + ahead * DAY_MS;
    const open = dayMidnight + SUPPORT_OPEN_HOUR * 60 * 60 * 1000;
    if (isWorkday(moscowParts(new Date(dayMidnight)).weekday) && open > date.getTime()) return new Date(open);
  }
  return new Date(midnight + DAY_MS);
}

/** Auto-reply for a message that came in outside working hours. */
export function buildSupportAutoReply(now: Date): string {
  const weekend = !isWorkday(moscowParts(now).weekday);
  const reason = weekend
    ? "Сегодня выходной, поэтому обращение может обрабатываться дольше обычного."
    : "Сейчас нерабочее время, поэтому обращение может обрабатываться дольше обычного.";
  return [
    "Здравствуйте!",
    `${reason} Поддержка работает по будням с ${SUPPORT_OPEN_HOUR}:00 до ${SUPPORT_CLOSE_HOUR}:00 по московскому времени.`,
    "Ваша заявка сохранена. Писать повторно не нужно."
  ].join("\n\n");
}
