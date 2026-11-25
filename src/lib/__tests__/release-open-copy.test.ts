import assert from "node:assert/strict";
import test from "node:test";

import { pickOpenReleaseCopy } from "@/lib/release-resubmission";

const source = { timeline: { approvedAt: "2026-11-10T00:00:00.000Z" } };
const copy = (id: string, lifecycleState: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "moderating",
  roles: { lifecycleState, copyOfReleaseId: "src", timeline: { createdAt }, ...extra }
});

test("no copies: a new copy is made", () => {
  assert.equal(pickOpenReleaseCopy([], source), null);
});

test("an unsent draft copy is reused, newest first", () => {
  const picked = pickOpenReleaseCopy(
    [copy("old", "draft", "2026-11-12T00:00:00.000Z"), copy("new", "draft", "2026-11-13T00:00:00.000Z")],
    source
  );
  assert.deepEqual(picked, { id: "new", kind: "draft", stale: false });
});

test("a copy on moderation wins over drafts", () => {
  const picked = pickOpenReleaseCopy(
    [copy("d", "draft", "2026-11-13T00:00:00.000Z"), copy("m", "moderation", "2026-11-11T00:00:00.000Z")],
    source
  );
  assert.equal(picked?.id, "m");
  assert.equal(picked?.kind, "moderation");
});

test("a returned copy is open; merged and deleted copies are not", () => {
  const picked = pickOpenReleaseCopy(
    [
      copy("merged", "moderation", "2026-11-12T00:00:00.000Z", { mergedIntoReleaseId: "src" }),
      copy("deleted", "draft", "2026-11-12T00:00:00.000Z", { deletionRequest: { status: "deleted" } }),
      copy("returned", "changes_required", "2026-11-12T00:00:00.000Z")
    ],
    source
  );
  assert.deepEqual(picked, { id: "returned", kind: "changes_required", stale: false });
});

test("a copy started before the original was last approved is stale", () => {
  const picked = pickOpenReleaseCopy([copy("d", "draft", "2026-11-01T00:00:00.000Z")], source);
  assert.deepEqual(picked, { id: "d", kind: "draft", stale: true });
});
