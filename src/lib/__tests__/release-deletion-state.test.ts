import assert from "node:assert/strict";
import test from "node:test";

import {
  getReleaseDeletionState,
  isReleaseHiddenFromCabinet,
  withReleaseDeletionApproved,
  withReleaseDeletionRequested,
  withReleaseDeletionRestored
} from "@/lib/release-deletion-state";

test("release deletion request preserves roles and hides release from user cabinet", () => {
  const roles = withReleaseDeletionRequested(
    {
      submissionData: {
        title: "Original release"
      }
    },
    {
      userId: "user-1",
      comment: "Удалите релиз с площадок",
      requestedAt: new Date("2026-09-07T08:47:00.000Z")
    }
  );

  assert.deepEqual((roles as { submissionData?: unknown }).submissionData, {
    title: "Original release"
  });
  assert.deepEqual(getReleaseDeletionState(roles), {
    status: "requested",
    comment: "Удалите релиз с площадок",
    requestedAt: "2026-09-07T08:47:00.000Z",
    requestedByUserId: "user-1"
  });
  assert.equal(isReleaseHiddenFromCabinet(roles), true);
});

test("admin approval keeps release hidden and restore makes it visible again", () => {
  const requested = withReleaseDeletionRequested(
    {},
    {
      userId: "user-1",
      comment: "Ошибка в релизе",
      requestedAt: new Date("2026-09-07T08:47:00.000Z")
    }
  );
  const approved = withReleaseDeletionApproved(requested, {
    adminId: "admin-1",
    decidedAt: new Date("2026-09-07T09:00:00.000Z")
  });

  assert.deepEqual(getReleaseDeletionState(approved), {
    status: "deleted",
    comment: "Ошибка в релизе",
    requestedAt: "2026-09-07T08:47:00.000Z",
    requestedByUserId: "user-1",
    decidedAt: "2026-09-07T09:00:00.000Z",
    decidedByAdminId: "admin-1"
  });
  assert.equal(isReleaseHiddenFromCabinet(approved), true);

  const restored = withReleaseDeletionRestored(approved, {
    adminId: "admin-1",
    decidedAt: new Date("2026-09-07T09:30:00.000Z")
  });

  assert.deepEqual(getReleaseDeletionState(restored), {
    status: "restored",
    comment: "Ошибка в релизе",
    requestedAt: "2026-09-07T08:47:00.000Z",
    requestedByUserId: "user-1",
    decidedAt: "2026-09-07T09:30:00.000Z",
    decidedByAdminId: "admin-1"
  });
  assert.equal(isReleaseHiddenFromCabinet(restored), false);
});
