const MOSCOW_TIME_ZONE = "Europe/Moscow";
const WORK_START_MINUTES = 8 * 60;
const WORK_END_MINUTES = 21 * 60;

export interface ServiceStatus {
  isWorking: boolean;
  label: string;
  description: string;
  nextChangeAt: Date;
  minutesUntilChange: number;
}

const moscowPartsFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MOSCOW_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function getMoscowHourMinute(now: Date): { hour: number; minute: number } {
  const parts = moscowPartsFormatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour ?? "0");
  const minute = Number(values.minute ?? "0");
  return { hour, minute };
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (restMinutes === 0) return `${hours} ч`;
  return `${hours} ч ${restMinutes} мин`;
}

export function getServiceStatus(now: Date = new Date()): ServiceStatus {
  const { hour, minute } = getMoscowHourMinute(now);
  const currentMinutes = hour * 60 + minute;
  const isWorking = currentMinutes >= WORK_START_MINUTES && currentMinutes < WORK_END_MINUTES;

  const minutesUntilChange = isWorking
    ? WORK_END_MINUTES - currentMinutes
    : currentMinutes < WORK_START_MINUTES
      ? WORK_START_MINUTES - currentMinutes
      : 24 * 60 - currentMinutes + WORK_START_MINUTES;

  const nextChangeAt = new Date(now.getTime() + minutesUntilChange * 60_000);

  if (isWorking) {
    return {
      isWorking: true,
      label: "Сервис работает",
      description: `До окончания работы: ${formatDuration(minutesUntilChange)}`,
      nextChangeAt,
      minutesUntilChange
    };
  }

  const closedDescription =
    minutesUntilChange === 11 * 60
      ? "Начнет работу завтра в 08:00"
      : `Начнет работу через ${formatDuration(minutesUntilChange)}`;

  return {
    isWorking: false,
    label: "Сервис не работает",
    description: closedDescription,
    nextChangeAt,
    minutesUntilChange
  };
}

