import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCopyWizardSteps,
  resolveDraftReleaseId,
  resolveReleaseSubmitMode,
  shouldResubmitEditedRelease
} from "@/lib/release-wizard-mode";

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
  assert.equal(resolveReleaseSubmitMode("edit", "rejected"), "edit");
  assert.equal(resolveReleaseSubmitMode("edit", "approved"), "edit");
});

test("shouldResubmitEditedRelease sends approved edits through moderation again", () => {
  assert.equal(shouldResubmitEditedRelease("changes_required"), true);
  assert.equal(shouldResubmitEditedRelease("rejected"), true);
  assert.equal(shouldResubmitEditedRelease("approved"), true);
  assert.equal(shouldResubmitEditedRelease("distributed"), true);
  assert.equal(shouldResubmitEditedRelease("moderation"), false);
  assert.equal(shouldResubmitEditedRelease("draft"), false);
});

test("an edited copy opens only the screens for the marked changes", () => {
  assert.deepEqual(resolveCopyWizardSteps(["cover"]), ["changes", "cover", "review", "upload"]);
  assert.deepEqual(resolveCopyWizardSteps(["lyrics"]), ["changes", "lyrics", "review", "upload"]);
  assert.deepEqual(resolveCopyWizardSteps(["dates", "distribution"]), ["changes", "codes", "stores", "review", "upload"]);
  // The release info screen already has the cover, track forms already have lyrics.
  assert.deepEqual(resolveCopyWizardSteps(["cover", "metadata"]), ["changes", "info", "persons", "review", "upload"]);
  assert.deepEqual(resolveCopyWizardSteps(["tracks", "lyrics"]), ["changes", "tracks", "review", "upload"]);
  assert.deepEqual(resolveCopyWizardSteps([]), ["changes", "review", "upload"]);
});

test("\"other\" opens the full release form", () => {
  assert.deepEqual(resolveCopyWizardSteps(["other", "cover"]), [
    "changes", "intro", "info", "persons", "codes", "stores", "tracks", "extras", "review", "upload"
  ]);
});

test("a step the artist was sent to from review stays in the route", () => {
  assert.deepEqual(resolveCopyWizardSteps(["cover"], "tracks"), ["changes", "cover", "tracks", "review", "upload"]);
});
