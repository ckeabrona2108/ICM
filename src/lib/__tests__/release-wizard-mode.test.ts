import assert from "node:assert/strict";
import test from "node:test";

import { resolveDraftReleaseId } from "@/lib/release-wizard-mode";

test("resolveDraftReleaseId does not bind new release flow to an existing draft", () => {
  assert.equal(resolveDraftReleaseId("new", "rel_123"), undefined);
  assert.equal(resolveDraftReleaseId("new", undefined), undefined);
});

test("resolveDraftReleaseId keeps source release id in edit mode", () => {
  assert.equal(resolveDraftReleaseId("edit", "rel_123"), "rel_123");
});
