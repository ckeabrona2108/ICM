import test from "node:test";
import assert from "node:assert/strict";

import { shouldGuardUnsavedChanges } from "@/lib/wizard-dirty";

test("shouldGuardUnsavedChanges returns false when snapshots match", () => {
  const result = shouldGuardUnsavedChanges({
    initialSnapshot: '{"a":1}',
    currentSnapshot: '{"a":1}',
    hasSubmittedToModeration: false
  });
  assert.equal(result, false);
});

test("shouldGuardUnsavedChanges returns true when data changed", () => {
  const result = shouldGuardUnsavedChanges({
    initialSnapshot: '{"a":1}',
    currentSnapshot: '{"a":2}',
    hasSubmittedToModeration: false
  });
  assert.equal(result, true);
});

test("shouldGuardUnsavedChanges returns false after moderation submit", () => {
  const result = shouldGuardUnsavedChanges({
    initialSnapshot: '{"a":1}',
    currentSnapshot: '{"a":2}',
    hasSubmittedToModeration: true
  });
  assert.equal(result, false);
});
