// Releases go live on the stores at 00:00 Moscow time of the release date.
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function getMoscowDateKey(now: Date = new Date()): string {
  return new Date(now.getTime() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" release date → the moment it goes live (00:00 MSK). */
export function getSmartLinkReleaseMoment(releaseDate: string): Date {
  return new Date(`${releaseDate}T00:00:00+03:00`);
}

/** True while the release date is still ahead: the smart link shows the countdown and pre-save button. */
export function isSmartLinkPrerelease(releaseDate: string, now: Date = new Date()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(releaseDate) && releaseDate > getMoscowDateKey(now);
}

export function formatSmartLinkReleaseDate(releaseDate: string): string {
  const moment = getSmartLinkReleaseMoment(releaseDate);
  if (Number.isNaN(moment.getTime())) return releaseDate;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }).format(moment);
}
