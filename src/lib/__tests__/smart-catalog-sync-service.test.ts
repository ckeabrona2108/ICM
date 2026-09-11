// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { resolveSelectedReportQuarterPeriod } from "@/lib/smart-catalog-sync-service";

test("selected finance report quarter resolves to quarter date range", () => {
  const period = resolveSelectedReportQuarterPeriod({
    quarter: 2,
    year: 2026
  });

  assert.equal(period?.periodStart.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(period?.periodEnd.toISOString(), "2026-06-30T23:59:59.999Z");
});

test("invalid finance report quarter selection returns null", () => {
  assert.equal(resolveSelectedReportQuarterPeriod({ quarter: 5, year: 2026 }), null);
  assert.equal(resolveSelectedReportQuarterPeriod({ quarter: 2, year: 1999 }), null);
});
