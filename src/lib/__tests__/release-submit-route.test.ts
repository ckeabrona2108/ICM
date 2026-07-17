// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { ReleaseStatus } from "@/lib/legacy-business-enums";

import { isInitialReleaseSubmission } from "@/lib/release-submission-state";

test("isInitialReleaseSubmission treats draft and missing status as first submission", () => {
  assert.equal(isInitialReleaseSubmission(undefined), true);
  assert.equal(isInitialReleaseSubmission(null), true);
  assert.equal(isInitialReleaseSubmission(ReleaseStatus.DRAFT), true);
});

test("isInitialReleaseSubmission blocks duplicate notification for non-draft statuses", () => {
  assert.equal(isInitialReleaseSubmission(ReleaseStatus.MODERATION), false);
  assert.equal(isInitialReleaseSubmission(ReleaseStatus.CHANGES_REQUIRED), false);
  assert.equal(isInitialReleaseSubmission(ReleaseStatus.PENDING_VERIFICATION), false);
  assert.equal(isInitialReleaseSubmission(ReleaseStatus.APPROVED), false);
});
