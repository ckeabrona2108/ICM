import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMoscowDateTime,
  isMergedResubmissionCopy,
  readReleaseTimeline,
  withReleaseTimelineStamp
} from "@/lib/release-timeline";

test("createdAt is written once and never moved by later saves", () => {
  const first = withReleaseTimelineStamp({}, "createdAt", new Date("2026-11-01T10:00:00Z"));
  const again = withReleaseTimelineStamp(first, "createdAt", new Date("2026-11-05T10:00:00Z"));
  assert.equal(readReleaseTimeline(again).createdAt?.toISOString(), "2026-11-01T10:00:00.000Z");
});

test("a stamp keeps the rest of roles", () => {
  const roles = withReleaseTimelineStamp({ submissionData: { title: "A" } }, "approvedAt", new Date("2026-11-02T00:00:00Z"));
  assert.deepEqual(roles.submissionData, { title: "A" });
});

test("older releases fall back to what was recorded at the time", () => {
  const timeline = readReleaseTimeline(
    { draftUpdatedAt: "2026-10-01T09:00:00Z", paymentReminders: { waitingSince: "2026-10-02T09:00:00Z" } },
    { decisions: { approvedAt: new Date("2026-10-03T12:30:00Z"), rejectedAt: null, changesRequestedAt: null } }
  );
  assert.equal(timeline.createdAt, null);
  assert.equal(timeline.updatedAt?.toISOString(), "2026-10-01T09:00:00.000Z");
  assert.equal(timeline.submittedAt?.toISOString(), "2026-10-02T09:00:00.000Z");
  assert.equal(timeline.approvedAt?.toISOString(), "2026-10-03T12:30:00.000Z");
});

test("a merged resubmission copy is recognised", () => {
  assert.equal(isMergedResubmissionCopy({ mergedIntoReleaseId: "rel_1" }), true);
  assert.equal(isMergedResubmissionCopy({}), false);
});

test("times are shown in Moscow time", () => {
  assert.equal(formatMoscowDateTime(new Date("2026-10-01T09:05:00Z")), "01.10.2026, 12:05");
  assert.equal(formatMoscowDateTime(null), "");
});
