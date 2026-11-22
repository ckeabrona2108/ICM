import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { setRussianHolidaysEnabled } from "@/lib/russian-holidays";

import { getRussianHoliday, isRussianDayOff } from "@/lib/russian-holidays";

// The holiday calendar is switched off in the product for now; these tests cover it switched on.
before(() => setRussianHolidaysEnabled(true));
after(() => setRussianHolidaysEnabled(false));

test("2026 follows the decree: New Year 1–11 January, transfers, 31 December", () => {
  for (let day = 1; day <= 11; day += 1) assert.equal(isRussianDayOff(2026, 0, day), true, `01.${day}`);
  assert.equal(isRussianDayOff(2026, 0, 12), false);
  assert.equal(getRussianHoliday(2026, 1, 23), "День защитника Отечества");
  assert.equal(isRussianDayOff(2026, 2, 9), true);
  assert.equal(isRussianDayOff(2026, 4, 11), true);
  assert.equal(getRussianHoliday(2026, 5, 12), "День России");
  assert.equal(getRussianHoliday(2026, 10, 4), "День народного единства");
  assert.equal(isRussianDayOff(2026, 11, 31), true);
  assert.equal(isRussianDayOff(2026, 10, 23), false);
  assert.equal(isRussianDayOff(2026, 10, 21), true); // суббота
});

test("2027 follows decree № 1187: 247 working days, 118 days off", () => {
  let off = 0;
  for (let month = 0; month < 12; month += 1) {
    const days = new Date(Date.UTC(2027, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= days; day += 1) if (isRussianDayOff(2027, month, day)) off += 1;
  }
  assert.equal(off, 118);
  assert.equal(isRussianDayOff(2027, 1, 20), false); // рабочая суббота
  assert.equal(isRussianDayOff(2027, 1, 22), true);
  assert.equal(isRussianDayOff(2027, 4, 3), true);
  assert.equal(isRussianDayOff(2027, 4, 10), true);
  assert.equal(isRussianDayOff(2027, 5, 14), true);
  assert.equal(isRussianDayOff(2027, 10, 5), true);
  assert.equal(isRussianDayOff(2027, 11, 31), true);
  assert.equal(isRussianDayOff(2027, 0, 11), false);
});

test("2026 has 118 days off too", () => {
  let off = 0;
  for (let month = 0; month < 12; month += 1) {
    const days = new Date(Date.UTC(2026, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= days; day += 1) if (isRussianDayOff(2026, month, day)) off += 1;
  }
  assert.equal(off, 118);
});

test("years without a decree move a weekend holiday to the next working day", () => {
  assert.equal(isRussianDayOff(2028, 4, 1), true);
  assert.equal(isRussianDayOff(2028, 2, 8), true);
});
