import assert from "node:assert/strict";
import test from "node:test";

import { getSceneShowcaseState, withSceneShowcaseState } from "@/lib/scene-showcase-state";

test("scene showcase state is stored in roles without changing lifecycle data", () => {
  const roles = withSceneShowcaseState(
    { lifecycleState: "approved", paymentUsage: { plan: "PRO" } },
    {
      enabled: true,
      trackIndex: 2,
      previewAsset: {
        storageKey: "uploads/user-id/preview.mp3",
        fileName: "preview.mp3",
        contentType: "audio/mpeg",
        size: 1024,
        durationSec: 29.8
      },
      publishedAt: "2026-07-18T10:00:00.000Z"
    }
  ) as Record<string, unknown>;

  assert.equal(roles.lifecycleState, "approved");
  assert.deepEqual(roles.paymentUsage, { plan: "PRO" });
  assert.deepEqual(getSceneShowcaseState(roles), {
    enabled: true,
    trackIndex: 2,
    previewAsset: {
      storageKey: "uploads/user-id/preview.mp3",
      fileName: "preview.mp3",
      contentType: "audio/mpeg",
      size: 1024,
      durationSec: 29.8
    },
    publishedAt: "2026-07-18T10:00:00.000Z"
  });
});

test("scene showcase state safely defaults for legacy releases", () => {
  assert.deepEqual(getSceneShowcaseState({ lifecycleState: "approved" }), {
    enabled: false,
    trackIndex: 1,
    previewAsset: null,
    publishedAt: null
  });
});
