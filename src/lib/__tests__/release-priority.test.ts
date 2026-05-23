import assert from "node:assert/strict";
import test from "node:test";

import {
  canUsePriorityRelease,
  getReleasePriorityFromRoles,
  sanitizePriorityReleaseFlag
} from "@/lib/release-priority";

test("priority release is available only for active PRO and ENTERPRISE plans", () => {
  assert.equal(canUsePriorityRelease({ plan: "PRO", isActive: true }), true);
  assert.equal(canUsePriorityRelease({ plan: "ENTERPRISE", isActive: true }), true);
  assert.equal(canUsePriorityRelease({ plan: "STANDARD", isActive: true }), false);
  assert.equal(canUsePriorityRelease({ plan: "PRO", isActive: false }), false);
});

test("sanitizePriorityReleaseFlag ignores forged priority requests from unavailable plans", () => {
  assert.equal(
    sanitizePriorityReleaseFlag({ requested: true, plan: "STANDARD", isActive: true }),
    false
  );
  assert.equal(
    sanitizePriorityReleaseFlag({ requested: true, plan: "PRO", isActive: true }),
    true
  );
  assert.equal(
    sanitizePriorityReleaseFlag({ requested: false, plan: "ENTERPRISE", isActive: true }),
    false
  );
});

test("getReleasePriorityFromRoles reads priority from submitted release data", () => {
  assert.equal(
    getReleasePriorityFromRoles({
      submissionData: {
        priorityRelease: true
      }
    }),
    true
  );
  assert.equal(getReleasePriorityFromRoles({ submissionData: { priorityRelease: false } }), false);
  assert.equal(getReleasePriorityFromRoles(null, true), true);
});
