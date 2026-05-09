import assert from "node:assert/strict";
import test from "node:test";

import { buildReleasePaymentBackfill } from "@/lib/release-payment-backfill";

test("backfill assigns snapshots by plan window and release order", () => {
  const updates = buildReleasePaymentBackfill({
    releases: [
      {
        id: "r1",
        userId: "u1",
        status: "MODERATION",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        moderationStartedAt: new Date("2026-01-02T00:00:00.000Z"),
        submissionData: {}
      },
      {
        id: "r2",
        userId: "u1",
        status: "MODERATION",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        moderationStartedAt: new Date("2026-01-03T00:00:00.000Z"),
        submissionData: {}
      }
    ],
    successfulSubscriptionPayments: [
      {
        userId: "u1",
        tariffId: "standard",
        paidAt: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z")
      }
    ],
    oneTimePaidReleaseIds: new Set()
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.releaseId, "r1");
  assert.equal(updates[0]?.snapshot.plan, "STANDARD");
  assert.equal(updates[0]?.snapshot.releasesUsedAfterSubmit, 1);
  assert.equal(updates[0]?.snapshot.releasesLimit, 1);
});

test("backfill skips one-time paid releases and keeps next included", () => {
  const updates = buildReleasePaymentBackfill({
    releases: [
      {
        id: "r1",
        userId: "u1",
        status: "MODERATION",
        createdAt: new Date("2026-02-02T00:00:00.000Z"),
        moderationStartedAt: new Date("2026-02-02T00:00:00.000Z"),
        submissionData: {}
      },
      {
        id: "r2",
        userId: "u1",
        status: "MODERATION",
        createdAt: new Date("2026-02-03T00:00:00.000Z"),
        moderationStartedAt: new Date("2026-02-03T00:00:00.000Z"),
        submissionData: {}
      }
    ],
    successfulSubscriptionPayments: [
      {
        userId: "u1",
        tariffId: "standard",
        paidAt: new Date("2026-02-01T00:00:00.000Z"),
        createdAt: new Date("2026-02-01T00:00:00.000Z")
      }
    ],
    oneTimePaidReleaseIds: new Set(["r1"])
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.releaseId, "r2");
});

test("backfill infers submit moment inside subscription window for legacy releases", () => {
  const updates = buildReleasePaymentBackfill({
    releases: [
      {
        id: "legacy-r1",
        userId: "u1",
        status: "APPROVED",
        // Draft created before subscription window:
        createdAt: new Date("2026-03-25T00:00:00.000Z"),
        // Edited after window started; old rows may miss moderationStartedAt:
        updatedAt: new Date("2026-04-02T00:00:00.000Z"),
        moderationStartedAt: null,
        submissionData: {}
      }
    ],
    successfulSubscriptionPayments: [
      {
        userId: "u1",
        tariffId: "pro",
        paidAt: new Date("2026-04-01T00:00:00.000Z"),
        createdAt: new Date("2026-04-01T00:00:00.000Z")
      }
    ],
    oneTimePaidReleaseIds: new Set()
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.releaseId, "legacy-r1");
  assert.equal(updates[0]?.snapshot.plan, "PRO");
});
