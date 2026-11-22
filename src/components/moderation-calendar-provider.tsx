"use client";

import * as React from "react";

import { setModerationCalendarOverrides, type ModerationCalendarOverrides } from "@/lib/russian-holidays";

/**
 * Hands the admin's extra days off and working days to the calendar in the browser. Set during
 * render, before the children render, so every notice and the date picker see them at once.
 */
export function ModerationCalendarProvider({
  calendar,
  children
}: {
  calendar: ModerationCalendarOverrides;
  children: React.ReactNode;
}) {
  setModerationCalendarOverrides(calendar);
  return <>{children}</>;
}
