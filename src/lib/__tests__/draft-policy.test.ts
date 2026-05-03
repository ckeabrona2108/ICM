import test from "node:test";
import assert from "node:assert/strict";

import {
  canDeleteDraft,
  canDeleteDraftForStatus,
  canSaveDraft,
  canSaveDraftForStatus
} from "@/lib/draft-policy";

test("canSaveDraftForStatus allows draft and changes_required", () => {
  assert.equal(canSaveDraftForStatus("DRAFT"), true);
  assert.equal(canSaveDraftForStatus("CHANGES_REQUIRED"), true);
});

test("canSaveDraftForStatus blocks moderation status", () => {
  assert.equal(canSaveDraftForStatus("MODERATION"), false);
});

test("canSaveDraft blocks non-owner", () => {
  const result = canSaveDraft({
    status: "DRAFT",
    isOwner: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden_owner");
});

test("canSaveDraft blocks forbidden status", () => {
  const result = canSaveDraft({
    status: "APPROVED",
    isOwner: true
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden_status");
});

test("canSaveDraft allows owner with allowed status", () => {
  const result = canSaveDraft({
    status: "CHANGES_REQUIRED",
    isOwner: true
  });
  assert.equal(result.allowed, true);
});

test("canDeleteDraftForStatus allows only draft", () => {
  assert.equal(canDeleteDraftForStatus("DRAFT"), true);
  assert.equal(canDeleteDraftForStatus("CHANGES_REQUIRED"), false);
});

test("canDeleteDraft blocks non-owner", () => {
  const result = canDeleteDraft({
    status: "DRAFT",
    isOwner: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden_owner");
});

test("canDeleteDraft blocks forbidden status", () => {
  const result = canDeleteDraft({
    status: "MODERATION",
    isOwner: true
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden_status");
});

test("canDeleteDraft allows owner for draft status", () => {
  const result = canDeleteDraft({
    status: "DRAFT",
    isOwner: true
  });
  assert.equal(result.allowed, true);
});
