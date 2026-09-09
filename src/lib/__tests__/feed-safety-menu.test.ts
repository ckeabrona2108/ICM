import assert from "node:assert/strict";
import test from "node:test";

import { buildFeedSafetyRequest } from "@/components/feed/feed-safety-menu";

test("feed safety actions use stable report, block and preference contracts", () => {
  const id = "11111111-1111-4111-8111-111111111111";
	  assert.deepEqual(buildFeedSafetyRequest({ kind: "report", targetType: "post", targetId: id }), {
	    url: "/api/social/reports",
	    method: "POST",
	    body: { targetType: "post", targetId: id, reason: "other", details: "" }
	  });
	  assert.deepEqual(buildFeedSafetyRequest({
	    kind: "report",
	    targetType: "user",
	    targetId: id,
	    reason: "spam",
	    details: "fake account"
	  }).body, {
	    targetType: "user",
	    targetId: id,
	    reason: "spam",
	    details: "fake account"
	  });
  assert.deepEqual(buildFeedSafetyRequest({ kind: "block", authorId: id }), {
    url: `/api/social/blocks/${id}`,
    method: "POST",
    body: undefined
  });
  assert.deepEqual(buildFeedSafetyRequest({ kind: "mute", authorId: id }).body, {
    action: "mute",
    targetType: "user",
    targetId: id
  });
});
