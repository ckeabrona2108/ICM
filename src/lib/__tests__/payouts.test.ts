// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { PayoutRequestStatus } from "@prisma/client";

import {
  canMoveToPaid,
  canMoveToProcessing,
  canMoveToRejected,
  computeAvailableToWithdraw
} from "@/lib/payouts";
import { mapPayoutSummary } from "@/lib/payout-request";

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

test("payout summary exposes the administrator rejection reason", () => {
  const summary = mapPayoutSummary({
    id: "payout-1",
    amount: 12000,
    status: "REJECTED",
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
    requisites: { rejectionReason: "Прикрепите читаемый чек на сумму выплаты." }
  });
  assert.equal(summary.rejectionReason, "Прикрепите читаемый чек на сумму выплаты.");
});

test("payout summary preserves the signed contract number", () => {
  const summary = mapPayoutSummary({
    id: "payout-contract",
    amount: 12000,
    status: "REQUESTED",
    createdAt: new Date("2026-09-22T00:00:00.000Z"),
    requisites: { contractNumber: 1534 }
  });

  assert.equal(summary.contractNumber, 1534);
});
