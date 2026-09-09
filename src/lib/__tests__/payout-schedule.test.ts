import assert from "node:assert/strict";
import test from "node:test";

import {
  getPayoutWindowState,
  normalizePayoutScheduleSettings
} from "@/lib/payout-schedule";

test("payout schedule opens during configured first week of quarter", () => {
  const state = getPayoutWindowState(
    { enabled: true, startDay: 1, durationDays: 7 },
    new Date("2026-04-03T12:00:00.000Z")
  );

  assert.equal(state.isOpen, true);
  assert.equal(state.currentWindow?.label, "1-7 апреля 2026 г.");
  assert.equal(state.currentWindow?.periodLabel, "1 квартал 2026");
});

test("payout schedule exposes next quarterly window when closed", () => {
  const state = getPayoutWindowState(
    { enabled: true, startDay: 1, durationDays: 7 },
    new Date("2026-09-09T12:00:00.000Z")
  );

  assert.equal(state.isOpen, false);
  assert.equal(state.nextWindow?.label, "1-7 октября 2026 г.");
  assert.equal(state.nextWindow?.periodLabel, "3 квартал 2026");
});

test("payout schedule supports explicit admin dates and report quarter", () => {
  const state = getPayoutWindowState(
    {
      enabled: true,
      startDay: 1,
      durationDays: 7,
      periodQuarter: 2,
      periodYear: 2026,
      windowStartsAt: "2026-07-08",
      windowEndsAt: "2026-07-12"
    },
    new Date("2026-07-09T12:00:00.000Z")
  );

  assert.equal(state.isOpen, true);
  assert.equal(state.currentWindow?.label, "8-12 июля 2026 г.");
  assert.equal(state.currentWindow?.periodLabel, "2 квартал 2026");
  assert.equal(state.currentWindow?.startsAt, "2026-07-08");
  assert.equal(state.currentWindow?.endsAt, "2026-07-12");
});

test("payout schedule clamps unsafe admin input", () => {
  const settings = normalizePayoutScheduleSettings({
    enabled: true,
    startDay: 42,
    durationDays: -5,
    periodQuarter: 8,
    periodYear: 3026,
    windowStartsAt: "2026-02-31",
    windowEndsAt: "not-a-date"
  });

  assert.deepEqual(settings, {
    enabled: true,
    startDay: 28,
    durationDays: 1,
    periodQuarter: 4,
    periodYear: 2100,
    windowStartsAt: null,
    windowEndsAt: null
  });
});
