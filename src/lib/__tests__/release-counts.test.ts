import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReleaseSidebarCounts,
  getReleaseSidebarCountsForUser,
  normalizeLifecycleStatus,
  withReleaseLifecycleState
} from "@/lib/release-counts";

test("draft release is counted only in drafts", () => {
  const counts = buildReleaseSidebarCounts([
    { status: "draft", _count: { _all: 1 } }
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
    { status: "moderation", _count: { _all: 1 } }
  ]);
  assert.deepEqual(inModeration, {
    all: 0,
    draft: 0,
    moderation: 1,
    changes_required: 0
  });

  const dbModerating = buildReleaseSidebarCounts([
    { status: "moderating", confirmed: true, _count: { _all: 2 } }
  ]);
  assert.deepEqual(dbModerating, {
    all: 0,
    draft: 0,
    moderation: 2,
    changes_required: 0
  });

  const awaitingVerification = buildReleaseSidebarCounts([
    { status: "pending_verification", _count: { _all: 2 } }
  ]);
  assert.deepEqual(awaitingVerification, {
    all: 0,
    draft: 0,
    moderation: 2,
    changes_required: 0
  });

  const needsChanges = buildReleaseSidebarCounts([
    { status: "changes_required", _count: { _all: 1 } }
  ]);
  assert.deepEqual(needsChanges, {
    all: 0,
    draft: 0,
    moderation: 0,
    changes_required: 1
  });
});

test("unpaid submitted release is counted in moderation, not drafts", () => {
  const counts = buildReleaseSidebarCounts([
    {
      status: "moderating",
      confirmed: false,
      submittedToModeration: true,
      _count: { _all: 1 }
    }
  ]);

  assert.deepEqual(counts, {
    all: 0,
    draft: 0,
    moderation: 1,
    changes_required: 0
  });
});

test("legacy unpaid moderating release is still counted in moderation", () => {
  const counts = buildReleaseSidebarCounts([
    {
      status: "moderating",
      confirmed: false,
      _count: { _all: 1 }
    }
  ]);

  assert.deepEqual(counts, {
    all: 0,
    draft: 0,
    moderation: 1,
    changes_required: 0
  });
});

test("rejected is normalized into changes_required section", () => {
  const counts = buildReleaseSidebarCounts([
    { status: "rejected", _count: { _all: 1 } }
  ]);

  assert.equal(counts.draft, 0);
  assert.equal(counts.moderation, 0);
  assert.equal(counts.changes_required, 1);
  assert.equal(counts.all, 0);
});

test("approved/distributed are counted only in all releases", () => {
  const counts = buildReleaseSidebarCounts([
    { status: "approved", _count: { _all: 2 } },
    { status: "distributed", _count: { _all: 3 } }
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
  assert.equal(normalizeLifecycleStatus("pending_verification"), "pending_verification");
  assert.equal(normalizeLifecycleStatus("waiting_verification"), "pending_verification");
  assert.equal(normalizeLifecycleStatus("moderating"), "moderation");
  assert.equal(normalizeLifecycleStatus("requires_changes"), "changes_required");
  assert.equal(normalizeLifecycleStatus("need_changes"), "changes_required");
  assert.equal(normalizeLifecycleStatus("revision_required"), "changes_required");
  assert.equal(normalizeLifecycleStatus("rejected"), "changes_required");
});

test("explicit lifecycle in roles controls sidebar counts for moderating records", async () => {
  const counts = await getReleaseSidebarCountsForUser({
    userId: "user_1",
    prisma: {
      release: {
        findMany: async () => [
          {
            status: "moderating",
            confirmed: false,
            upc: null,
            roles: withReleaseLifecycleState({}, "draft")
          },
          {
            status: "moderating",
            confirmed: false,
            upc: null,
            roles: withReleaseLifecycleState({}, "moderation")
          },
          {
            status: "moderating",
            confirmed: false,
            upc: null,
            roles: withReleaseLifecycleState({}, "changes_required")
          }
        ]
      }
    }
  });

  assert.deepEqual(counts, {
    all: 0,
    draft: 1,
    moderation: 1,
    changes_required: 1
  });
});

test("submitting a draft moves the count from drafts to moderation", async () => {
  const draftRoles = withReleaseLifecycleState({}, "draft");
  const moderationRoles = withReleaseLifecycleState({}, "moderation");

  const beforeSubmit = await getReleaseSidebarCountsForUser({
    userId: "user_1",
    prisma: {
      release: {
        findMany: async () => [
          {
            status: "moderating",
            confirmed: false,
            upc: null,
            roles: draftRoles
          }
        ]
      }
    }
  });

  const afterSubmit = await getReleaseSidebarCountsForUser({
    userId: "user_1",
    prisma: {
      release: {
        findMany: async () => [
          {
            status: "moderating",
            confirmed: false,
            upc: null,
            roles: moderationRoles
          }
        ]
      }
    }
  });

  assert.deepEqual(beforeSubmit, {
    all: 0,
    draft: 1,
    moderation: 0,
    changes_required: 0
  });
  assert.deepEqual(afterSubmit, {
    all: 0,
    draft: 0,
    moderation: 1,
    changes_required: 0
  });
});

test("expired drafts are not counted and are deleted lazily", async () => {
  let deletedIds: string[] = [];
  const counts = await getReleaseSidebarCountsForUser({
    userId: "user_1",
    prisma: {
      release: {
        findMany: async () => [
          {
            id: "expired_draft",
            status: "moderating",
            confirmed: false,
            upc: null,
            roles: withReleaseLifecycleState(
              {
                draftUpdatedAt: "2026-01-01T00:00:00.000Z"
              },
              "draft"
            )
          },
          {
            id: "fresh_draft",
            status: "moderating",
            confirmed: false,
            upc: null,
            roles: withReleaseLifecycleState(
              {
                draftUpdatedAt: new Date().toISOString()
              },
              "draft"
            )
          }
        ],
        deleteMany: async (args) => {
          deletedIds = args.where.id.in;
          return { count: deletedIds.length };
        }
      }
    }
  });

  assert.deepEqual(counts, {
    all: 0,
    draft: 1,
    moderation: 0,
    changes_required: 0
  });
  assert.deepEqual(deletedIds, ["expired_draft"]);
});

test("missing release table returns empty sidebar counts instead of crashing", async () => {
  const counts = await getReleaseSidebarCountsForUser({
    userId: "user_1",
    prisma: {
      release: {
        findMany: async () => {
          throw new Error("The table `icecream.release` does not exist in the current database.");
        }
      }
    }
  });

  assert.deepEqual(counts, {
    all: 0,
    draft: 0,
    moderation: 0,
    changes_required: 0
  });
});
