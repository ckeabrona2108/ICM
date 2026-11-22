import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-api-auth";
import { saveModerationCalendarChange, validateModerationCalendarChange } from "@/lib/moderation-calendar-settings";
import { prisma } from "@/lib/prisma";
import { areRussianHolidaysEnabled } from "@/lib/russian-holidays";

export const dynamic = "force-dynamic";

/**
 * { action: "add", date: "YYYY-MM-DD", kind: "day_off", name } — moderation does not work that day;
 * { action: "add", date, kind: "working_day" } — moderation works although the calendar says day off;
 * { action: "remove", date } — back to the production calendar.
 */
export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;
  if (!areRussianHolidaysEnabled()) return NextResponse.json({ error: "Праздничный календарь выключен." }, { status: 404 });

  const change = validateModerationCalendarChange(await request.json().catch(() => null));
  if (typeof change === "string") return NextResponse.json({ error: change }, { status: 400 });

  const calendar = await saveModerationCalendarChange({ prisma, adminId: auth.session.user.id, change });
  return NextResponse.json({ ok: true, calendar });
}
