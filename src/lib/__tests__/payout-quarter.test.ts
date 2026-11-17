import assert from "node:assert/strict";
import test from "node:test";

import { computeQuarterPayoutStates } from "@/lib/payout-quarter";

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
