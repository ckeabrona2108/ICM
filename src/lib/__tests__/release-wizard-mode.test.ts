import assert from "node:assert/strict";
import test from "node:test";

import { resolveDraftReleaseId, resolveReleaseSubmitMode } from "@/lib/release-wizard-mode";

test("resolveDraftReleaseId does not bind new release flow to an existing draft", () => {
  assert.equal(resolveDraftReleaseId("new", "rel_123"), undefined);
  assert.equal(resolveDraftReleaseId("new", undefined), undefined);
});

test("resolveDraftReleaseId keeps source release id in edit mode", () => {
  assert.equal(resolveDraftReleaseId("edit", "rel_123"), "rel_123");
});

test("resolveReleaseSubmitMode submits drafts through the new release flow", () => {
  assert.equal(resolveReleaseSubmitMode("new"), "new");
  assert.equal(resolveReleaseSubmitMode("edit", "draft"), "new");
});

test("resolveReleaseSubmitMode preserves edit flow for already submitted releases", () => {
  assert.equal(resolveReleaseSubmitMode("edit", "moderation"), "edit");
  assert.equal(resolveReleaseSubmitMode("edit", "changes_required"), "edit");
  assert.equal(resolveReleaseSubmitMode("edit", "approved"), "edit");
});
