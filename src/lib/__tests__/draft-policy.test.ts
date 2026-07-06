import test from "node:test";
import assert from "node:assert/strict";

import {
  canDeleteDraft,
  canDeleteDraftForStatus,
  canSaveDraft,
  canSaveDraftForStatus
} from "@/lib/draft-policy";
import { withReleaseLifecycleState } from "@/lib/release-counts";

test("canSaveDraftForStatus allows draft and changes_required", () => {
  assert.equal(
    canSaveDraftForStatus({
      status: "moderating",
      confirmed: false,
      roles: withReleaseLifecycleState({}, "draft")
    }),
    true
  );
  assert.equal(
    canSaveDraftForStatus({
      status: "rejected",
      confirmed: true
    }),
    true
  );
});

test("canSaveDraftForStatus blocks moderation status", () => {
  assert.equal(
    canSaveDraftForStatus({
      status: "moderating",
      confirmed: true,
      roles: { submittedToModeration: true }
    }),
    false
  );
});

test("canSaveDraftForStatus blocks explicit moderation lifecycle from roles", () => {
  assert.equal(
    canSaveDraftForStatus({
      status: "moderating",
      confirmed: false,
      roles: withReleaseLifecycleState({}, "moderation")
    }),
    false
  );
});

test("canSaveDraft blocks non-owner", () => {
  const result = canSaveDraft({
    status: "moderating",
    confirmed: false,
    isOwner: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden_owner");
});

test("canSaveDraft blocks forbidden status", () => {
  const result = canSaveDraft({
    status: "approved",
    confirmed: true,
    upc: "123456789012",
    isOwner: true
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden_status");
});

test("canSaveDraft allows owner with allowed status", () => {
  const result = canSaveDraft({
    status: "rejected",
    confirmed: true,
    isOwner: true
  });
  assert.equal(result.allowed, true);
});

test("canDeleteDraftForStatus allows only draft", () => {
  assert.equal(
    canDeleteDraftForStatus({
      status: "moderating",
      confirmed: false,
      roles: withReleaseLifecycleState({}, "draft")
    }),
    true
  );
  assert.equal(
    canDeleteDraftForStatus({
      status: "rejected",
      confirmed: true
    }),
    false
  );
});

test("canDeleteDraft blocks non-owner", () => {
  const result = canDeleteDraft({
    status: "moderating",
    confirmed: false,
    isOwner: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden_owner");
});

test("canDeleteDraft blocks forbidden status", () => {
  const result = canDeleteDraft({
    status: "moderating",
    confirmed: true,
    roles: { submittedToModeration: true },
    isOwner: true
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden_status");
});

test("canDeleteDraft blocks explicit moderation lifecycle from roles", () => {
  const result = canDeleteDraft({
    status: "moderating",
    confirmed: false,
    roles: withReleaseLifecycleState({}, "moderation"),
    isOwner: true
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden_status");
});

test("canDeleteDraft allows owner for draft status", () => {
  const result = canDeleteDraft({
    status: "moderating",
    confirmed: false,
    roles: withReleaseLifecycleState({}, "draft"),
    isOwner: true
  });
  assert.equal(result.allowed, true);
});
