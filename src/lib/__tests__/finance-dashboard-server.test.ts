import assert from "node:assert/strict";
import test from "node:test";

import { readMinimumPayoutAmount } from "@/lib/finance-dashboard-server";

test("readMinimumPayoutAmount defaults to 10000 RUB", () => {
  const previous = process.env.FINANCE_MIN_PAYOUT_AMOUNT;
  delete process.env.FINANCE_MIN_PAYOUT_AMOUNT;

  try {
    assert.equal(readMinimumPayoutAmount(), 10000);
  } finally {
    if (previous === undefined) {
      delete process.env.FINANCE_MIN_PAYOUT_AMOUNT;
    } else {
      process.env.FINANCE_MIN_PAYOUT_AMOUNT = previous;
    }
  }
});

test("readMinimumPayoutAmount respects env override", () => {
  const previous = process.env.FINANCE_MIN_PAYOUT_AMOUNT;
  process.env.FINANCE_MIN_PAYOUT_AMOUNT = "25000";

  try {
    assert.equal(readMinimumPayoutAmount(), 25000);
  } finally {
    if (previous === undefined) {
      delete process.env.FINANCE_MIN_PAYOUT_AMOUNT;
    } else {
      process.env.FINANCE_MIN_PAYOUT_AMOUNT = previous;
    }
  }
});
