import assert from "node:assert/strict";
import test from "node:test";

import { getPriorityBadgeDescriptor, getReleaseStatusDescriptor } from "@/lib/release-status-ui";

test("priority release badge is shown only when release.priority is true", () => {
  assert.equal(getPriorityBadgeDescriptor(false), null);
  const badge = getPriorityBadgeDescriptor(true);
  assert.ok(badge);
  assert.equal(badge?.label, "Приоритетный");
});

test("pending verification release has dedicated badge", () => {
  const badge = getReleaseStatusDescriptor("pending_verification");
  assert.ok(badge);
  assert.equal(badge?.label, "Ожидает верификацию");
  assert.equal(badge?.variant, "warning");
});
