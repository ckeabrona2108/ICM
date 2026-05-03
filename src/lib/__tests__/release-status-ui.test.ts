import assert from "node:assert/strict";
import test from "node:test";

import { getPriorityBadgeDescriptor } from "@/lib/release-status-ui";

test("priority release badge is shown only when release.priority is true", () => {
  assert.equal(getPriorityBadgeDescriptor(false), null);
  const badge = getPriorityBadgeDescriptor(true);
  assert.ok(badge);
  assert.equal(badge?.label, "Приоритетный");
});
