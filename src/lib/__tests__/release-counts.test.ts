import assert from "node:assert/strict";
import test from "node:test";
import { ReleaseStatus } from "@prisma/client";

import {
  buildReleaseSidebarCounts,
  normalizeLifecycleStatus
} from "@/lib/release-counts";

test("draft release is counted only in drafts", () => {
  const counts = buildReleaseSidebarCounts([
    { status: ReleaseStatus.DRAFT, _count: { _all: 1 } }
  ]);

  assert.deepEqual(counts, {
    all: 0,
    draft: 1,
    moderation: 0,
    changes_required: 0
  });
});

test("status transitions move counts between sections without overlap", () => {
  const inModeration = buildReleaseSidebarCounts([
    { status: ReleaseStatus.MODERATION, _count: { _all: 1 } }
  ]);
  assert.deepEqual(inModeration, {
    all: 0,
    draft: 0,
    moderation: 1,
    changes_required: 0
  });

  const needsChanges = buildReleaseSidebarCounts([
    { status: ReleaseStatus.CHANGES_REQUIRED, _count: { _all: 1 } }
  ]);
  assert.deepEqual(needsChanges, {
    all: 0,
    draft: 0,
    moderation: 0,
    changes_required: 1
  });
});

test("rejected is normalized into changes_required section", () => {
  const counts = buildReleaseSidebarCounts([
    { status: ReleaseStatus.REJECTED, _count: { _all: 1 } }
  ]);

  assert.equal(counts.draft, 0);
  assert.equal(counts.moderation, 0);
  assert.equal(counts.changes_required, 1);
  assert.equal(counts.all, 0);
});

test("approved/distributed are counted only in all releases", () => {
  const counts = buildReleaseSidebarCounts([
    { status: ReleaseStatus.APPROVED, _count: { _all: 2 } },
    { status: ReleaseStatus.DISTRIBUTED, _count: { _all: 3 } }
  ]);

  assert.deepEqual(counts, {
    all: 5,
    draft: 0,
    moderation: 0,
    changes_required: 0
  });
});

test("normalizeLifecycleStatus supports legacy aliases", () => {
  assert.equal(normalizeLifecycleStatus("changes_required"), "changes_required");
  assert.equal(normalizeLifecycleStatus("requires_changes"), "changes_required");
  assert.equal(normalizeLifecycleStatus("need_changes"), "changes_required");
  assert.equal(normalizeLifecycleStatus("revision_required"), "changes_required");
  assert.equal(normalizeLifecycleStatus("rejected"), "changes_required");
});
