import assert from "node:assert/strict";
import test from "node:test";

import { ClientMutationKeyStore, socialCommentFingerprint, socialCommentMutationSlot } from "@/lib/social-client-idempotency";

test("mutation keys survive same-draft retries and rotate after material changes", () => {
  let sequence = 0;
  const store = new ClientMutationKeyStore(() => `key-${++sequence}`);
  const slot = socialCommentMutationSlot("post", "post-1", null);
  const first = store.acquire(slot, socialCommentFingerprint("  hello  "));
  assert.equal(store.acquire(slot, socialCommentFingerprint("hello")), first);
  store.invalidateIfChanged(slot, socialCommentFingerprint("hello again"));
  assert.notEqual(store.acquire(slot, socialCommentFingerprint("hello again")), first);
});

test("authoritative success clears only the matching in-flight key", () => {
  let sequence = 0;
  const store = new ClientMutationKeyStore(() => `key-${++sequence}`);
  const slot = socialCommentMutationSlot("release", "release-1", "parent-1");
  const first = store.acquire(slot, "reply");
  store.complete(slot, "stale-key");
  assert.equal(store.acquire(slot, "reply"), first);
  store.complete(slot, first);
  assert.notEqual(store.acquire(slot, "reply"), first);
});

test("root comments and replies use independent mutation slots", () => {
  assert.notEqual(
    socialCommentMutationSlot("post", "post-1", null),
    socialCommentMutationSlot("post", "post-1", "comment-1")
  );
});
