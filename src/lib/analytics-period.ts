const ANALYTICS_PERIOD_PRESETS = [7, 30, 180, 365] as const;
const ANALYTICS_PERIOD_LEGACY_PRESETS = [60] as const;

export type AnalyticsPeriodDays = (typeof ANALYTICS_PERIOD_PRESETS)[number];
export type AnalyticsStoredPeriodDays = AnalyticsPeriodDays | (typeof ANALYTICS_PERIOD_LEGACY_PRESETS)[number];

export const ANALYTICS_PERIOD_OPTIONS: Array<{
  days: AnalyticsPeriodDays;
  label: string;
}> = [
  { days: 7, label: "Последняя неделя" },
  { days: 30, label: "Последние 30 дней" },
  { days: 180, label: "Последние 6 месяцев" },
  { days: 365, label: "Год" }
];

const ANALYTICS_PERIOD_STORED_SET = new Set<number>([
  ...ANALYTICS_PERIOD_PRESETS,
  ...ANALYTICS_PERIOD_LEGACY_PRESETS
]);

export function normalizeAnalyticsPeriodDays(
  value: number | string | null | undefined,
  fallback: AnalyticsStoredPeriodDays = 30
): AnalyticsStoredPeriodDays {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (Number.isFinite(parsed) && ANALYTICS_PERIOD_STORED_SET.has(parsed)) {
    return parsed as AnalyticsStoredPeriodDays;
  }

  return fallback;
}

export function buildAnalyticsPeriodStorageTag(value: number | string | null | undefined): string {
  return `p${normalizeAnalyticsPeriodDays(value)}d`;
}

export function extractAnalyticsPeriodDaysFromStoragePath(
  value: string | null | undefined,
  fallback: AnalyticsStoredPeriodDays = 30
): AnalyticsStoredPeriodDays {
  if (!value) return fallback;
  const match = value.match(/(?:^|[-_/])p(7|30|60|180|365)d(?:[-_.]|$)/i);
  return normalizeAnalyticsPeriodDays(match?.[1], fallback);
}

export function getAnalyticsPeriodLabel(value: number | string | null | undefined): string {
  const periodDays = normalizeAnalyticsPeriodDays(value);
  if (periodDays === 7) return "1 неделя";
  if (periodDays === 30) return "30 дней";
  if (periodDays === 60) return "60 дней";
  if (periodDays === 180) return "6 месяцев";
  return "Год";
}

export function getAnalyticsPeriodVariantHour(
  value: number | string | null | undefined
): number {
  const periodDays = normalizeAnalyticsPeriodDays(value);
  if (periodDays === 7) return 1;
  if (periodDays === 30) return 6;
  if (periodDays === 60) return 12;
  if (periodDays === 180) return 15;
  return 18;
}

export function applyAnalyticsPeriodVariant(
  date: Date,
  value: number | string | null | undefined
): Date {
  const next = new Date(date);
  next.setUTCHours(getAnalyticsPeriodVariantHour(value), 0, 0, 0);
  return next;
}
