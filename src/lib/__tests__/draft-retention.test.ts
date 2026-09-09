import assert from "node:assert/strict";
import test from "node:test";

import {
  DRAFT_RETENTION_DAYS,
  getDraftLastChangedAt,
  isReleaseDraftExpired,
  withDraftLastChangedAt
} from "@/lib/draft-retention";
import { withReleaseLifecycleState } from "@/lib/release-counts";

test("draft retention stores the latest draft change timestamp", () => {
  const changedAt = new Date("2026-09-07T09:00:00.000Z");
  const roles = withDraftLastChangedAt(
    {
      submissionData: {
        title: "Draft"
      }
    },
    changedAt
  );

  assert.equal(getDraftLastChangedAt(roles)?.toISOString(), changedAt.toISOString());
  assert.deepEqual((roles as { submissionData?: unknown }).submissionData, {
    title: "Draft"
  });
});

test("draft retention expires only draft releases after 180 days", () => {
  const changedAt = new Date("2026-01-01T00:00:00.000Z");
  const expiredAt = new Date(
    changedAt.getTime() + DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const draftRoles = withReleaseLifecycleState(withDraftLastChangedAt({}, changedAt), "draft");

  assert.equal(
    isReleaseDraftExpired(
      {
        status: "moderating",
        confirmed: false,
        upc: null,
        roles: draftRoles
      },
      new Date(expiredAt.getTime() - 1)
    ),
    false
  );
  assert.equal(
    isReleaseDraftExpired(
      {
        status: "moderating",
        confirmed: false,
        upc: null,
        roles: draftRoles
      },
      expiredAt
    ),
    true
  );
  assert.equal(
    isReleaseDraftExpired(
      {
        status: "moderating",
        confirmed: false,
        upc: null,
        roles: withReleaseLifecycleState(withDraftLastChangedAt({}, changedAt), "moderation")
      },
      expiredAt
    ),
    false
  );
});
