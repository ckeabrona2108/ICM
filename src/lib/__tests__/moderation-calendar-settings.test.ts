import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { setRussianHolidaysEnabled } from "@/lib/russian-holidays";

import {
  applyModerationCalendarChange,
  EMPTY_MODERATION_CALENDAR,
  parseModerationCalendar,
  validateModerationCalendarChange
} from "@/lib/moderation-calendar-settings";
import { fitReleaseDate, parseMskDay, upcomingHolidayBreak, formatMskDayRange } from "@/lib/moderation-schedule";
import { getRussianHoliday, isRussianDayOff, setModerationCalendarOverrides } from "@/lib/russian-holidays";

// The holiday calendar is switched off in the product for now; these tests cover it switched on.
before(() => setRussianHolidaysEnabled(true));
after(() => setRussianHolidaysEnabled(false));

const msk = (value: string) => new Date(`${value}:00+03:00`);

test("admin changes are validated and applied", () => {
  assert.equal(validateModerationCalendarChange({ action: "add", date: "2026-12-30", kind: "day_off" }), "Укажите название праздника — его увидят артисты.");
  assert.equal(validateModerationCalendarChange({ action: "add", date: "2026-02-30", kind: "day_off", name: "x" }), "Укажите дату.");
  const change = validateModerationCalendarChange({ action: "add", date: "2026-12-30", kind: "day_off", name: " Отдых модерации " });
  assert.ok(typeof change !== "string");
  const withDayOff = applyModerationCalendarChange(EMPTY_MODERATION_CALENDAR, change);
  assert.deepEqual(withDayOff, { daysOff: { "2026-12-30": "Отдых модерации" }, workingDays: [] });

  // The same date switched to a working day replaces the day off.
  const working = applyModerationCalendarChange(withDayOff, { action: "add", date: "2026-12-30", kind: "working_day" });
  assert.deepEqual(working, { daysOff: {}, workingDays: ["2026-12-30"] });
  assert.deepEqual(applyModerationCalendarChange(working, { action: "remove", date: "2026-12-30" }), EMPTY_MODERATION_CALENDAR);

  assert.deepEqual(parseModerationCalendar({ daysOff: { bad: "x", "2026-12-30": "Отдых" }, workingDays: ["2026-12-30", "2027-01-11"] }), {
    daysOff: { "2026-12-30": "Отдых" },
    workingDays: ["2027-01-11"]
  });
  assert.deepEqual(parseModerationCalendar(null), EMPTY_MODERATION_CALENDAR);
});

test("admin days change what artists see", () => {
  try {
    setModerationCalendarOverrides({ daysOff: { "2026-12-30": "Отдых модерации" }, workingDays: ["2026-11-04"] });
    assert.equal(getRussianHoliday(2026, 11, 30), "Отдых модерации");
    assert.equal(isRussianDayOff(2026, 10, 4), false); // 4 ноября модерация работает

    const newYear = upcomingHolidayBreak(msk("2026-12-20T12:00"));
    assert.equal(newYear && formatMskDayRange(newYear.breaks[0].start, newYear.breaks[0].end), "30 декабря – 10 января");
    assert.equal(newYear?.sendBefore?.toISOString(), msk("2026-12-28T18:00").toISOString());

    const day = parseMskDay("2026-11-05");
    assert.ok(day);
    assert.equal(fitReleaseDate(msk("2026-11-03T12:00"), day), "ok"); // вт и ср — рабочие
  } finally {
    setModerationCalendarOverrides(null);
  }
});
