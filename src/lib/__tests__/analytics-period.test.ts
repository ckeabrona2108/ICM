import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAnalyticsPeriodVariant,
  buildAnalyticsPeriodStorageTag,
  getAnalyticsPeriodLabel,
  extractAnalyticsPeriodDaysFromStoragePath,
  normalizeAnalyticsPeriodDays
} from "@/lib/analytics-period";

test("analytics period helpers normalize and persist supported presets", () => {
  assert.equal(normalizeAnalyticsPeriodDays(7), 7);
  assert.equal(normalizeAnalyticsPeriodDays("180"), 180);
  assert.equal(normalizeAnalyticsPeriodDays("60"), 60);
  assert.equal(normalizeAnalyticsPeriodDays("999"), 30);
  assert.equal(buildAnalyticsPeriodStorageTag(365), "p365d");
  assert.equal(
    extractAnalyticsPeriodDaysFromStoragePath("/private/tmp/172-p180d-report_summary.csv"),
    180
  );
  assert.equal(
    extractAnalyticsPeriodDaysFromStoragePath("/private/tmp/172-p60d-report_summary.csv"),
    60
  );
  assert.equal(getAnalyticsPeriodLabel(180), "6 месяцев");
});

test("analytics period variants keep calendar date but split timestamps by preset", () => {
  const base = new Date("2026-07-12T00:00:00.000Z");
  const week = applyAnalyticsPeriodVariant(base, 7);
  const month = applyAnalyticsPeriodVariant(base, 30);
  const halfYear = applyAnalyticsPeriodVariant(base, 180);
  const year = applyAnalyticsPeriodVariant(base, 365);

  assert.equal(week.toISOString().slice(0, 10), "2026-07-12");
  assert.equal(month.toISOString().slice(0, 10), "2026-07-12");
  assert.equal(halfYear.toISOString().slice(0, 10), "2026-07-12");
  assert.equal(year.toISOString().slice(0, 10), "2026-07-12");
  assert.notEqual(week.toISOString(), month.toISOString());
  assert.notEqual(month.toISOString(), halfYear.toISOString());
  assert.notEqual(halfYear.toISOString(), year.toISOString());
  assert.notEqual(month.toISOString(), year.toISOString());
});
