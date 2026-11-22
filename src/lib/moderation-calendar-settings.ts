import type { Prisma, PrismaClient } from "@prisma/client";

import { createAdminLog } from "@/lib/admin-log-service";
import {
  areRussianHolidaysEnabled,
  setModerationCalendarOverrides,
  type ModerationCalendarOverrides
} from "@/lib/russian-holidays";

// Days an admin sets by hand on top of the production calendar: extra days off (with the
// holiday's name, shown to artists) and extra working days. Kept in platform_settings.

export const MODERATION_CALENDAR_SETTING_KEY = "moderation_calendar";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_NAME = 80;

export const EMPTY_MODERATION_CALENDAR: ModerationCalendarOverrides = { daysOff: {}, workingDays: [] };

function isValidDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseModerationCalendar(value: unknown): ModerationCalendarOverrides {
  const root = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const daysOff: Record<string, string> = {};
  const rawDaysOff = root.daysOff && typeof root.daysOff === "object" ? (root.daysOff as Record<string, unknown>) : {};
  for (const [day, name] of Object.entries(rawDaysOff)) {
    if (isValidDay(day) && typeof name === "string" && name.trim()) daysOff[day] = name.trim().slice(0, MAX_NAME);
  }
  const workingDays = Array.isArray(root.workingDays)
    ? [...new Set(root.workingDays.filter(isValidDay))].filter((day) => !daysOff[day]).sort()
    : [];
  return { daysOff, workingDays };
}

/** Reads the admin's days and applies them to the calendar of this server process. */
export async function loadModerationCalendar(prisma: PrismaClient): Promise<ModerationCalendarOverrides> {
  // While the holiday calendar is switched off the admin's days are not read or used.
  if (!areRussianHolidaysEnabled()) return EMPTY_MODERATION_CALENDAR;
  try {
    const setting = await prisma.platform_settings.findUnique({ where: { key: MODERATION_CALENDAR_SETTING_KEY } });
    const calendar = parseModerationCalendar(setting?.value_json);
    setModerationCalendarOverrides(calendar);
    return calendar;
  } catch (error) {
    // The production calendar still works without the admin's days.
    console.error("[moderation-calendar] failed to read setting", error);
    return EMPTY_MODERATION_CALENDAR;
  }
}

export type ModerationCalendarChange =
  | { action: "add"; date: string; kind: "day_off"; name: string }
  | { action: "add"; date: string; kind: "working_day" }
  | { action: "remove"; date: string };

export function validateModerationCalendarChange(body: unknown): ModerationCalendarChange | string {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!isValidDay(input.date)) return "Укажите дату.";
  if (input.action === "remove") return { action: "remove", date: input.date };
  if (input.action !== "add") return "Неизвестное действие.";
  if (input.kind === "working_day") return { action: "add", date: input.date, kind: "working_day" };
  if (input.kind !== "day_off") return "Выберите, выходной это день или рабочий.";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return "Укажите название праздника — его увидят артисты.";
  if (name.length > MAX_NAME) return `Название — не длиннее ${MAX_NAME} символов.`;
  return { action: "add", date: input.date, kind: "day_off", name };
}

export function applyModerationCalendarChange(
  calendar: ModerationCalendarOverrides,
  change: ModerationCalendarChange
): ModerationCalendarOverrides {
  const daysOff = { ...calendar.daysOff };
  let workingDays = calendar.workingDays.filter((day) => day !== change.date);
  delete daysOff[change.date];
  if (change.action === "add" && change.kind === "day_off") daysOff[change.date] = change.name;
  if (change.action === "add" && change.kind === "working_day") workingDays = [...workingDays, change.date].sort();
  return { daysOff, workingDays };
}

export async function saveModerationCalendarChange(params: {
  prisma: PrismaClient;
  adminId: string;
  change: ModerationCalendarChange;
}): Promise<ModerationCalendarOverrides> {
  const setting = await params.prisma.platform_settings.findUnique({ where: { key: MODERATION_CALENDAR_SETTING_KEY } });
  const before = parseModerationCalendar(setting?.value_json);
  const after = applyModerationCalendarChange(before, params.change);
  const value = after as unknown as Prisma.InputJsonValue;
  await params.prisma.platform_settings.upsert({
    where: { key: MODERATION_CALENDAR_SETTING_KEY },
    create: { key: MODERATION_CALENDAR_SETTING_KEY, value_json: value, updated_by_id: params.adminId },
    update: { value_json: value, updated_by_id: params.adminId }
  });
  await createAdminLog(params.prisma, {
    adminId: params.adminId,
    action: "moderation_calendar.change",
    targetType: "platform_settings",
    targetId: MODERATION_CALENDAR_SETTING_KEY,
    newValue: params.change
  });
  setModerationCalendarOverrides(after);
  return after;
}
