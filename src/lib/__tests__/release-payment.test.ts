import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReleasePaymentDisplay,
  buildReleasePaymentSnapshotFromLimitDecision,
  parseReleasePaymentSnapshot
} from "@/lib/release-payment";
import type { LimitDecision } from "@/lib/subscription-limits";

test("subscription snapshot creates plan usage label", () => {
  const decision: LimitDecision = {
    allowed: true,
    plan: "PRO",
    limits: {
      releasesLimit: 6,
      aiDayLimit: 3,
      aiMonthLimit: 100,
      aiEnabled: true
    },
    usage: {
      releasesUsed: 0,
      aiDayUsed: 0,
      aiMonthUsed: 0
    }
  };

  const snapshot = buildReleasePaymentSnapshotFromLimitDecision(decision);
  assert.deepEqual(snapshot, {
    version: 1,
    kind: "subscription_included",
    plan: "PRO",
    releasesUsedAfterSubmit: 1,
    releasesLimit: 6
  });

  const parsed = parseReleasePaymentSnapshot(snapshot);
  assert.ok(parsed);

  const view = buildReleasePaymentDisplay({
    paid: false,
    snapshot: parsed
  });
  assert.equal(view.kind, "subscription");
  assert.equal(view.label, "PRO 1/6");
});

test("zero-limit standard does not create subscription snapshot", () => {
  const decision: LimitDecision = {
    allowed: false,
    plan: "STANDARD",
    code: "release_limit_reached",
    limits: {
      releasesLimit: 0,
      aiDayLimit: 0,
      aiMonthLimit: 0,
      aiEnabled: false
    },
    usage: {
      releasesUsed: 0,
      aiDayUsed: 0,
      aiMonthUsed: 0
    }
  };

  const snapshot = buildReleasePaymentSnapshotFromLimitDecision(decision);
  assert.equal(snapshot, null);

  const view = buildReleasePaymentDisplay({
    paid: false,
    snapshot: null
  });
  assert.equal(view.kind, "unpaid");
  assert.equal(view.label, "Не оплачен");
});
