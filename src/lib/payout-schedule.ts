// @ts-nocheck
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

export const PAYOUT_SCHEDULE_SETTINGS_KEY = "finance.payout_schedule";

export interface PayoutScheduleSettings {
  enabled: boolean;
  startDay: number;
  durationDays: number;
  periodQuarter?: number | null;
  periodYear?: number | null;
  windowStartsAt?: string | null;
  windowEndsAt?: string | null;
}

export interface PayoutWindowInfo {
  label: string;
  periodLabel: string;
  startsAt: string;
  endsAt: string;
}

export interface PayoutWindowState {
  settings: PayoutScheduleSettings;
  isOpen: boolean;
  currentWindow: PayoutWindowInfo | null;
  nextWindow: PayoutWindowInfo | null;
  message: string;
}

const DEFAULT_PAYOUT_SCHEDULE_SETTINGS: PayoutScheduleSettings = {
  enabled: true,
  startDay: 1,
  durationDays: 7
};

const PAYOUT_WINDOW_MONTHS = [0, 3, 6, 9] as const;
const RU_MONTH_GENITIVE = [
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

function getSettingsRepo(prisma: PrismaClient) {
  return (prisma as PrismaClient & {
    platform_settings?: {
      findUnique?: (args: unknown) => Promise<unknown>;
      upsert?: (args: unknown) => Promise<unknown>;
    };
  }).platform_settings;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function optionalInteger(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return null;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}

export function normalizePayoutScheduleSettings(input: unknown): PayoutScheduleSettings {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Partial<PayoutScheduleSettings>
    : {};

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_PAYOUT_SCHEDULE_SETTINGS.enabled,
    startDay: clampInteger(source.startDay, 1, 28, DEFAULT_PAYOUT_SCHEDULE_SETTINGS.startDay),
    durationDays: clampInteger(source.durationDays, 1, 31, DEFAULT_PAYOUT_SCHEDULE_SETTINGS.durationDays),
    periodQuarter: optionalInteger(source.periodQuarter, 1, 4),
    periodYear: optionalInteger(source.periodYear, 2000, 2100),
    windowStartsAt: normalizeDateKey(source.windowStartsAt),
    windowEndsAt: normalizeDateKey(source.windowEndsAt)
  };
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatWindowLabel(start: Date, endExclusive: Date): string {
  const end = new Date(endExclusive.getTime() - 1);
  const formatFull = (date: Date) =>
    `${date.getUTCDate()} ${RU_MONTH_GENITIVE[date.getUTCMonth()]} ${date.getUTCFullYear()} г.`;

  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    const monthYear = `${RU_MONTH_GENITIVE[start.getUTCMonth()]} ${start.getUTCFullYear()} г.`;
    return `${start.getUTCDate()}-${end.getUTCDate()} ${monthYear}`;
  }

  return `${formatFull(start)} - ${formatFull(end)}`;
}

function reportPeriodForWindowStart(start: Date): { quarter: number; year: number; label: string } {
  const month = start.getUTCMonth();
  if (month === 0) {
    const year = start.getUTCFullYear() - 1;
    return { quarter: 4, year, label: `4 квартал ${year}` };
  }

  const quarter = month / 3;
  const year = start.getUTCFullYear();
  return { quarter, year, label: `${quarter} квартал ${year}` };
}

function buildWindow(start: Date, settings: PayoutScheduleSettings): PayoutWindowInfo {
  const endExclusive = new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate() + settings.durationDays
  ));
  const period = reportPeriodForWindowStart(start);

  return {
    label: formatWindowLabel(start, endExclusive),
    periodLabel: period.label,
    startsAt: toDateKey(start),
    endsAt: toDateKey(new Date(endExclusive.getTime() - 1))
  };
}

function parseDateKey(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function buildManualWindow(settings: PayoutScheduleSettings): {
  start: Date;
  endExclusive: Date;
  info: PayoutWindowInfo;
} | null {
  if (!settings.windowStartsAt || !settings.windowEndsAt) return null;

  const start = parseDateKey(settings.windowStartsAt);
  const endInclusive = parseDateKey(settings.windowEndsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endInclusive.getTime())) return null;
  if (endInclusive < start) return null;

  const endExclusive = new Date(Date.UTC(
    endInclusive.getUTCFullYear(),
    endInclusive.getUTCMonth(),
    endInclusive.getUTCDate() + 1
  ));
  const inferredPeriod = reportPeriodForWindowStart(start);
  const quarter = settings.periodQuarter ?? inferredPeriod.quarter;
  const year = settings.periodYear ?? inferredPeriod.year;

  return {
    start,
    endExclusive,
    info: {
      label: formatWindowLabel(start, endExclusive),
      periodLabel: `${quarter} квартал ${year}`,
      startsAt: toDateKey(start),
      endsAt: toDateKey(endInclusive)
    }
  };
}

function buildWindowCandidates(now: Date, settings: PayoutScheduleSettings): Array<{
  start: Date;
  endExclusive: Date;
  info: PayoutWindowInfo;
}> {
  const years = [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1];
  return years.flatMap((year) =>
    PAYOUT_WINDOW_MONTHS.map((month) => {
      const start = new Date(Date.UTC(year, month, settings.startDay, 0, 0, 0, 0));
      const endExclusive = new Date(Date.UTC(year, month, settings.startDay + settings.durationDays, 0, 0, 0, 0));
      return {
        start,
        endExclusive,
        info: buildWindow(start, settings)
      };
    })
  ).sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function getPayoutWindowState(
  settingsInput: unknown,
  nowInput: Date = new Date()
): PayoutWindowState {
  const settings = normalizePayoutScheduleSettings(settingsInput);
  const now = Number.isNaN(nowInput.getTime()) ? new Date() : nowInput;

  if (!settings.enabled) {
    return {
      settings,
      isOpen: false,
      currentWindow: null,
      nextWindow: null,
      message: "Приём заявок на выплату временно закрыт."
    };
  }

  const manualWindow = buildManualWindow(settings);
  if (manualWindow) {
    if (now >= manualWindow.start && now < manualWindow.endExclusive) {
      return {
        settings,
        isOpen: true,
        currentWindow: manualWindow.info,
        nextWindow: null,
        message: `Окно выплат открыто: ${manualWindow.info.label}.`
      };
    }

    if (manualWindow.start > now) {
      return {
        settings,
        isOpen: false,
        currentWindow: null,
        nextWindow: manualWindow.info,
        message: `Следующее окно выплат: ${manualWindow.info.label}.`
      };
    }

    return {
      settings,
      isOpen: false,
      currentWindow: null,
      nextWindow: null,
      message: "Окно выплат сейчас закрыто."
    };
  }

  const candidates = buildWindowCandidates(now, settings);
  const current = candidates.find((candidate) =>
    now >= candidate.start && now < candidate.endExclusive
  );
  const next = candidates.find((candidate) => candidate.start > now) ?? null;

  if (current) {
    return {
      settings,
      isOpen: true,
      currentWindow: current.info,
      nextWindow: next?.info ?? null,
      message: `Окно выплат открыто: ${current.info.label}.`
    };
  }

  return {
    settings,
    isOpen: false,
    currentWindow: null,
    nextWindow: next?.info ?? null,
    message: next ? `Следующее окно выплат: ${next.info.label}.` : "Окно выплат сейчас закрыто."
  };
}

export async function readPayoutScheduleSettings(prisma: PrismaClient): Promise<PayoutScheduleSettings> {
  const repo = getSettingsRepo(prisma);
  if (typeof repo?.findUnique !== "function") {
    return DEFAULT_PAYOUT_SCHEDULE_SETTINGS;
  }

  try {
    const item = await repo.findUnique({
      where: { key: PAYOUT_SCHEDULE_SETTINGS_KEY },
      select: { value_json: true }
    }) as { value_json?: unknown } | null;
    return normalizePayoutScheduleSettings(item?.value_json);
  } catch {
    return DEFAULT_PAYOUT_SCHEDULE_SETTINGS;
  }
}

export async function writePayoutScheduleSettings(params: {
  prisma: PrismaClient;
  adminId: string;
  settings: unknown;
}): Promise<PayoutScheduleSettings> {
  const repo = getSettingsRepo(params.prisma);
  if (typeof repo?.upsert !== "function") {
    throw new Error("Настройки платформы временно недоступны.");
  }

  const settings = normalizePayoutScheduleSettings(params.settings);
  await repo.upsert({
    where: { key: PAYOUT_SCHEDULE_SETTINGS_KEY },
    create: {
      id: randomUUID(),
      key: PAYOUT_SCHEDULE_SETTINGS_KEY,
      value_json: settings as unknown as Prisma.InputJsonValue,
      updated_by_id: params.adminId
    },
    update: {
      value_json: settings as unknown as Prisma.InputJsonValue,
      updated_by_id: params.adminId
    }
  });

  return settings;
}

export async function getCurrentPayoutWindowState(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<PayoutWindowState> {
  const settings = await readPayoutScheduleSettings(prisma);
  return getPayoutWindowState(settings, now);
}
