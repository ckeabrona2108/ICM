import assert from "node:assert/strict";
import test from "node:test";

import { allocatePayoutAcrossQuarters, computeQuarterPayoutStates, formatPayoutPeriods } from "@/lib/payout-quarter";
import { getPayoutPeriods } from "@/lib/payout-request";

test("the rest of a partly paid quarter can still be withdrawn", () => {
  const states = computeQuarterPayoutStates(
    [{ quarter: 3, year: 2026, amount: 8000, agreed: true }],
    [{ quarter: 3, year: 2026, amount: 5000, status: "PAID", confirmed: true }]
  );
  assert.deepEqual(states.get("2026-3"), { agreed: 8000, taken: 5000, remaining: 3000, hasOpenRequest: false });
});

test("a supplement added to a paid quarter becomes withdrawable", () => {
  const states = computeQuarterPayoutStates(
    [
      { quarter: 2, year: 2026, amount: 4000, agreed: true },
      { quarter: 2, year: 2026, amount: 650.5, agreed: true },
      { quarter: 2, year: 2026, amount: 999, agreed: false }
    ],
    [
      { quarter: 2, year: 2026, amount: 4000, status: "PAID" },
      { quarter: 2, year: 2026, amount: 300, status: "REJECTED", confirmed: null }
    ]
  );
  assert.equal(states.get("2026-2")?.remaining, 650.5);
  assert.equal(states.get("2026-2")?.hasOpenRequest, false);
});

test("an open request locks the quarter and counts against it", () => {
  const states = computeQuarterPayoutStates(
    [{ quarter: 1, year: 2026, amount: 1000, agreed: true }],
    [{ quarter: 1, year: 2026, amount: 400, status: "PROCESSING" }]
  );
  assert.deepEqual(states.get("2026-1"), { agreed: 1000, taken: 400, remaining: 600, hasOpenRequest: true });
});

// 1st quarter 100 ₽, 2nd 1 900 ₽, 3rd 1 000 ₽: with a 2 000 ₽ minimum the first quarter alone can
// never be withdrawn, but all three together make one 3 000 ₽ request.
const threeQuarters = [
  { quarter: 3, year: 2026, remaining: 1000, reportId: "r3" },
  { quarter: 1, year: 2026, remaining: 100, reportId: "r1" },
  { quarter: 2, year: 2026, remaining: 1900, reportId: "r2" }
];

test("one request withdraws several quarters, oldest first", () => {
  assert.deepEqual(allocatePayoutAcrossQuarters(3000, threeQuarters), [
    { quarter: 1, year: 2026, amount: 100, reportId: "r1" },
    { quarter: 2, year: 2026, amount: 1900, reportId: "r2" },
    { quarter: 3, year: 2026, amount: 1000, reportId: "r3" }
  ]);
  // A smaller amount stops early: the third quarter keeps the rest.
  assert.deepEqual(allocatePayoutAcrossQuarters(2500, threeQuarters), [
    { quarter: 1, year: 2026, amount: 100, reportId: "r1" },
    { quarter: 2, year: 2026, amount: 1900, reportId: "r2" },
    { quarter: 3, year: 2026, amount: 500, reportId: "r3" }
  ]);
  assert.equal(allocatePayoutAcrossQuarters(3000.01, threeQuarters), null);
});

test("a multi-quarter request counts against each of its quarters and locks them", () => {
  const requisites = {
    quarter: 1,
    year: 2026,
    reportId: "r1",
    periods: allocatePayoutAcrossQuarters(2500, threeQuarters)
  };
  const states = computeQuarterPayoutStates(
    [
      { quarter: 1, year: 2026, amount: 100, agreed: true },
      { quarter: 2, year: 2026, amount: 1900, agreed: true },
      { quarter: 3, year: 2026, amount: 1000, agreed: true }
    ],
    [{ quarter: 1, year: 2026, amount: 2500, status: "REQUESTED", periods: getPayoutPeriods(requisites, 2500) }]
  );
  assert.equal(states.get("2026-1")?.remaining, 0);
  assert.equal(states.get("2026-2")?.remaining, 0);
  assert.equal(states.get("2026-3")?.remaining, 500);
  assert.equal(states.get("2026-3")?.hasOpenRequest, true);
});

test("an older single-quarter request keeps its whole amount on its quarter", () => {
  assert.deepEqual(getPayoutPeriods({ quarter: 2, year: 2026, reportId: "r2" }, 1500), [
    { quarter: 2, year: 2026, amount: 1500, reportId: "r2" }
  ]);
  assert.deepEqual(getPayoutPeriods({}, 1500), []);
});

test("quarters of one request are named together", () => {
  assert.equal(formatPayoutPeriods([{ quarter: 2, year: 2026 }]), "2 квартал 2026");
  assert.equal(formatPayoutPeriods([{ quarter: 3, year: 2026 }, { quarter: 1, year: 2026 }, { quarter: 2, year: 2026 }]), "1, 2 и 3 квартал 2026");
  assert.equal(formatPayoutPeriods([{ quarter: 1, year: 2026 }, { quarter: 4, year: 2025 }]), "4 квартал 2025, 1 квартал 2026");
});
