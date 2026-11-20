import assert from "node:assert/strict";
import test from "node:test";

import { buildMonthWeeks, firstPromoReleaseDate, isPromoReleaseDate, parseIsoDay, toIsoDay } from "@/lib/release-promo-dates";

test("picking on the 1st, the 14th is the first promo date", () => {
  const today = new Date(2026, 3, 1, 15, 30);
  assert.equal(isPromoReleaseDate(new Date(2026, 3, 13), today), false);
  assert.equal(isPromoReleaseDate(new Date(2026, 3, 14), today), true);
  assert.equal(toIsoDay(firstPromoReleaseDate(today)), "2026-04-14");
});

test("month grid starts on Monday", () => {
  const weeks = buildMonthWeeks(2026, 3); // April 2026 starts on Wednesday
  assert.equal(weeks[0]?.[0], null);
  assert.equal(weeks[0]?.[2]?.getDate(), 1);
  assert.equal(weeks.flat().filter(Boolean).length, 30);
});

test("ISO days round-trip", () => {
  assert.equal(toIsoDay(parseIsoDay("2026-11-20")!), "2026-11-20");
  assert.equal(parseIsoDay("20.11.2026"), null);
});
