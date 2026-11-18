import assert from "node:assert/strict";
import test from "node:test";

import { planReleaseTips, type ReleaseTipCandidate } from "@/lib/release-tips";

const approvedAt = new Date("2026-11-10T09:00:00.000Z");
const day = (n: number) => new Date(approvedAt.getTime() + n * 24 * 60 * 60 * 1000);
const release = (overrides: Partial<ReleaseTipCandidate> = {}): ReleaseTipCandidate => ({
  id: "rel1",
  userId: "u1",
  title: "Ночью",
  status: "approved",
  roles: { lifecycleState: "approved", timeline: { approvedAt: approvedAt.toISOString() } },
  tracks: [{ text: null, text_sync: null, instrumental: false }],
  ...overrides
});

test("the snippet tip comes on day 2 and the lyrics tip on day 5", () => {
  assert.deepEqual(planReleaseTips([release()], day(1)).map((event) => event.kind), []);
  assert.deepEqual(planReleaseTips([release()], day(2)).map((event) => event.kind), ["release_tip_snippet"]);
  assert.deepEqual(
    planReleaseTips([release()], day(5)).map((event) => event.kind),
    ["release_tip_snippet", "release_tip_lyrics"]
  );
  // Long after approval nothing is sent: old releases are never messaged.
  assert.deepEqual(planReleaseTips([release()], day(40)), []);
});

test("the lyrics tip is skipped when every vocal track has lyrics and karaoke", () => {
  const done = release({
    tracks: [
      { text: "слова", text_sync: "<tt/>", instrumental: false },
      { text: null, text_sync: null, instrumental: true }
    ]
  });
  assert.deepEqual(planReleaseTips([done], day(6)).map((event) => event.kind), ["release_tip_snippet"]);
  const lyricsOnly = release({ tracks: [{ text: "слова", text_sync: null, instrumental: false }] });
  const tip = planReleaseTips([lyricsOnly], day(6)).find((event) => event.kind === "release_tip_lyrics");
  assert.equal(tip?.title, "Добавьте караоке");
  assert.equal(tip?.href, "/dashboard/releases/rel1/edit");
});

test("the snippet tip also asks for the showcase fragment when it is missing", () => {
  const [withoutFragment] = planReleaseTips([release()], day(2));
  assert.match(withoutFragment.message, /30-секундный фрагмент/u);
  const withFragment = release({
    roles: {
      lifecycleState: "approved",
      timeline: { approvedAt: approvedAt.toISOString() },
      sceneShowcase: { previewAsset: { storageKey: "k", fileName: "a.mp3", contentType: "audio/mpeg", size: 1, durationSec: 30 } }
    }
  });
  assert.doesNotMatch(planReleaseTips([withFragment], day(2))[0].message, /фрагмент/u);
});

test("unapproved, merged and deleted releases get no tips", () => {
  const base = release();
  const roles = base.roles as Record<string, unknown>;
  assert.deepEqual(planReleaseTips([release({ roles: { ...roles, lifecycleState: "changes_required" }, status: "rejected" })], day(5)), []);
  assert.deepEqual(planReleaseTips([release({ roles: { ...roles, mergedIntoReleaseId: "src" } })], day(5)), []);
  assert.deepEqual(planReleaseTips([release({ roles: { ...roles, deletionRequest: { status: "deleted" } } })], day(5)), []);
});
