import assert from "node:assert/strict";
import test from "node:test";
import { PayoutRequestStatus } from "@prisma/client";

import {
  canMoveToPaid,
  canMoveToProcessing,
  canMoveToRejected,
  computeAvailableToWithdraw
} from "@/lib/payouts";

test("computeAvailableToWithdraw subtracts pending payout and clamps at 0", () => {
  assert.equal(
    computeAvailableToWithdraw({ agreedBalance: 500, pendingPayout: 120 }),
    380
  );
  assert.equal(
    computeAvailableToWithdraw({ agreedBalance: 100, pendingPayout: 120 }),
    0
  );
});

test("payout status transitions follow manual workflow rules", () => {
  assert.equal(canMoveToProcessing(PayoutRequestStatus.REQUESTED), true);
  assert.equal(canMoveToProcessing(PayoutRequestStatus.PROCESSING), false);

  assert.equal(canMoveToPaid(PayoutRequestStatus.REQUESTED), true);
  assert.equal(canMoveToPaid(PayoutRequestStatus.PROCESSING), true);
  assert.equal(canMoveToPaid(PayoutRequestStatus.PAID), false);
  assert.equal(canMoveToPaid(PayoutRequestStatus.REJECTED), false);

  assert.equal(canMoveToRejected(PayoutRequestStatus.REQUESTED), true);
  assert.equal(canMoveToRejected(PayoutRequestStatus.PROCESSING), true);
  assert.equal(canMoveToRejected(PayoutRequestStatus.PAID), false);
});

