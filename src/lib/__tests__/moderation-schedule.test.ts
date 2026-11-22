import assert from "node:assert/strict";
import test from "node:test";

import {
  firstSafeReleaseDay,
  fitReleaseDate,
  formatMskDayMonth,
  formatMskDayOn,
  isModerationDelayed,
  moderationPause,
  parseMskDay
} from "@/lib/moderation-schedule";
import * as lib from "@/lib/moderation-schedule";
import { setRussianHolidaysEnabled } from "@/lib/russian-holidays";

// 16.11.2026 is a Monday.
const msk = (value: string) => new Date(`${value}:00+03:00`);
const day = (value: string) => {
  const parsed = parseMskDay(value);
  assert.ok(parsed);
  return parsed;
};

test("artist examples: what fits a release date", () => {
  assert.equal(fitReleaseDate(msk("2026-11-16T12:00"), day("2026-11-20")), "ok"); // пн → пт
  assert.equal(fitReleaseDate(msk("2026-11-17T12:00"), day("2026-11-20")), "ok"); // вт → пт
  assert.equal(fitReleaseDate(msk("2026-11-18T12:00"), day("2026-11-20")), "ok"); // ср днём → пт
  assert.equal(fitReleaseDate(msk("2026-11-18T20:00"), day("2026-11-20")), "tight"); // ср вечером → пт
  assert.equal(fitReleaseDate(msk("2026-11-19T20:00"), day("2026-11-23")), "tight"); // чт вечером → пн
  assert.equal(fitReleaseDate(msk("2026-11-20T10:00"), day("2026-11-23")), "tight"); // пт утром → пн
  assert.equal(fitReleaseDate(msk("2026-11-20T19:00"), day("2026-11-23")), "late"); // пт вечером → пн
  assert.equal(fitReleaseDate(msk("2026-11-21T12:00"), day("2026-11-27")), "ok"); // сб → пт
  assert.equal(fitReleaseDate(msk("2026-11-22T23:00"), day("2026-11-27")), "ok"); // вс → пт
  assert.equal(fitReleaseDate(msk("2026-11-19T12:00"), day("2026-11-19")), "late"); // в день релиза
});

test("first safe release day", () => {
  assert.equal(formatMskDayMonth(firstSafeReleaseDay(msk("2026-11-19T20:30"))), "24.11");
  assert.equal(formatMskDayMonth(firstSafeReleaseDay(msk("2026-11-20T19:00"))), "25.11");
  assert.equal(formatMskDayMonth(firstSafeReleaseDay(msk("2026-11-16T10:00"))), "18.11");
  // a release date on a day off is fine
  assert.equal(formatMskDayMonth(firstSafeReleaseDay(msk("2026-11-19T10:00"))), "21.11");
});

test("moderation starts after the weekend", () => {
  const saturday = moderationPause(msk("2026-11-21T12:00"));
  assert.ok(saturday);
  assert.equal(formatMskDayOn(saturday.start), "в понедельник (23.11)");
  assert.equal(saturday.holiday, false);

  const fridayEvening = moderationPause(msk("2026-11-20T19:00"));
  assert.equal(fridayEvening && formatMskDayOn(fridayEvening.start), "в понедельник (23.11)");

  assert.equal(moderationPause(msk("2026-11-20T12:00")), null); // пт днём: проверяют сегодня
  assert.equal(moderationPause(msk("2026-11-19T20:30")), null); // чт вечером: начнут в пятницу
  assert.equal(moderationPause(msk("2026-11-17T12:00")), null);
});

test("holidays are days off: New Year, 4 November, transfers", () => {
  setRussianHolidaysEnabled(true);
  try {
    const newYear = moderationPause(msk("2026-12-30T20:00"));
    assert.ok(newYear);
    assert.equal(formatMskDayOn(newYear.start), "в понедельник (11.01)");
    assert.equal(newYear.holiday, true);
  
    const unity = moderationPause(msk("2026-11-03T20:00"));
    assert.ok(unity);
    assert.equal(formatMskDayOn(unity.start), "в четверг (05.11)");
    assert.equal(unity.holiday, true);
  
    assert.equal(fitReleaseDate(msk("2026-11-02T12:00"), day("2026-11-05")), "ok"); // пн, вт
    assert.equal(fitReleaseDate(msk("2026-11-03T12:00"), day("2026-11-05")), "tight"); // вт, 4.11 выходной
    assert.equal(fitReleaseDate(msk("2026-03-06T12:00"), day("2026-03-10")), "tight"); // 9 марта — перенос
  } finally {
    setRussianHolidaysEnabled(false);
  }
});

test("moderation is late from noon of the working day after the expected answer", () => {
  const sent = msk("2026-11-19T20:30"); // answer пт or пн, grace вт
  assert.equal(isModerationDelayed(sent, msk("2026-11-23T20:00")), false);
  assert.equal(isModerationDelayed(sent, msk("2026-11-24T11:00")), false);
  assert.equal(isModerationDelayed(sent, msk("2026-11-24T12:00")), true);
  assert.equal(isModerationDelayed(sent, msk("2026-11-26T09:00")), true);

  const wednesday = msk("2026-11-18T12:00"); // answer ср or чт, grace пт
  assert.equal(isModerationDelayed(wednesday, msk("2026-11-20T13:00")), true);
});

test("holiday breaks are announced ahead with the last moment to send", () => {
  setRussianHolidaysEnabled(true);
  try {
    const { formatMskDayRange, upcomingHolidayBreak } = lib;
    const range = (notice: ReturnType<typeof upcomingHolidayBreak>) =>
      notice?.breaks.map((item) => formatMskDayRange(item.start, item.end));
  
    assert.equal(upcomingHolidayBreak(msk("2026-11-21T12:00")), null); // до Нового года ещё 40 дней
    assert.equal(upcomingHolidayBreak(msk("2026-10-28T12:00")), null); // 4 ноября — за 5 дней
  
    const unity = upcomingHolidayBreak(msk("2026-10-30T12:00"));
    assert.deepEqual(range(unity), ["4 ноября"]);
    assert.equal(unity?.sendBefore?.toISOString(), msk("2026-11-02T18:00").toISOString());
    assert.equal(formatMskDayOn(unity!.resume), "в четверг (05.11)");
    assert.equal(upcomingHolidayBreak(msk("2026-11-03T10:00"))?.sendBefore, null); // уже не успеть
  
    const may = upcomingHolidayBreak(msk("2026-04-20T12:00"));
    assert.deepEqual(range(may), ["1–3 мая", "9–11 мая"]);
    assert.equal(may?.sendBefore?.toISOString(), msk("2026-04-29T18:00").toISOString());
    assert.equal(may?.during, false);
  
    const inMay = upcomingHolidayBreak(msk("2026-05-02T12:00"));
    assert.equal(inMay?.during, true);
    assert.equal(inMay?.sendBefore, null);
    assert.equal(formatMskDayOn(inMay!.resume), "в понедельник (04.05)");
  
    const newYear = upcomingHolidayBreak(msk("2026-12-20T12:00"));
    assert.deepEqual(range(newYear), ["31 декабря – 10 января"]);
    assert.equal(newYear?.sendBefore?.toISOString(), msk("2026-12-29T18:00").toISOString());
  } finally {
    setRussianHolidaysEnabled(false);
  }
});

test("with the holiday calendar switched off only weekends count", () => {
  assert.equal(fitReleaseDate(msk("2026-11-03T12:00"), day("2026-11-05")), "ok"); // 4 ноября — рабочий
  assert.equal(moderationPause(msk("2026-11-03T20:00")), null);
  assert.equal(lib.upcomingHolidayBreak(msk("2026-12-20T12:00")), null); // плашки о праздниках нет
  const newYear = moderationPause(msk("2026-12-30T20:00"));
  assert.equal(newYear, null); // 31 декабря — обычный четверг
});
