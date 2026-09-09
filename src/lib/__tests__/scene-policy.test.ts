import assert from "node:assert/strict";
import test from "node:test";

import { isReleaseVisibleOnScene, normalizeSceneGenre } from "@/lib/scene-policy";
import { withReleaseLifecycleState } from "@/lib/release-counts";

const NOW = new Date("2026-07-17T12:00:00.000Z");

test("approved released item is visible on scene", () => {
  assert.equal(
    isReleaseVisibleOnScene(
      {
        status: "moderating",
        confirmed: true,
        upc: "5060000000001",
        roles: withReleaseLifecycleState({}, "approved"),
        releaseDate: "2026-07-16T00:00:00.000Z"
      },
      NOW
    ),
    true
  );
});

test("future release is not visible before its release date", () => {
  assert.equal(
    isReleaseVisibleOnScene(
      {
        status: "approved",
        confirmed: true,
        upc: "5060000000002",
        roles: withReleaseLifecycleState({}, "approved"),
        releaseDate: "2026-07-18T00:00:00.000Z"
      },
      NOW
    ),
    false
  );
});

test("scene only includes releases from the latest 45 days", () => {
  const approvedRelease = {
    status: "approved",
    confirmed: true,
    upc: "5060000000005",
    roles: withReleaseLifecycleState({}, "approved")
  };

  assert.equal(
    isReleaseVisibleOnScene(
      { ...approvedRelease, releaseDate: "2026-06-03T12:00:00.000Z" },
      NOW
    ),
    true
  );
  assert.equal(
    isReleaseVisibleOnScene(
      { ...approvedRelease, releaseDate: "2026-06-01T12:00:00.000Z" },
      NOW
    ),
    false
  );
});

test("moderation and changes-required releases stay private even when UPC exists", () => {
  for (const lifecycle of ["moderation", "changes_required"] as const) {
    assert.equal(
      isReleaseVisibleOnScene(
        {
          status: "moderating",
          confirmed: true,
          upc: "5060000000003",
          roles: withReleaseLifecycleState({}, lifecycle),
          releaseDate: "2026-07-16T00:00:00.000Z"
        },
        NOW
      ),
      false
    );
  }
});

test("archived release is not visible on scene", () => {
  assert.equal(
    isReleaseVisibleOnScene(
      {
        status: "approved",
        confirmed: true,
        upc: "5060000000004",
        roles: withReleaseLifecycleState({}, "archived"),
        releaseDate: "2026-07-16T00:00:00.000Z"
      },
      NOW
    ),
    false
  );
});

test("genre normalization keeps the filter stable", () => {
  assert.equal(normalizeSceneGenre("  Hip-Hop  "), "Hip-Hop");
  assert.equal(normalizeSceneGenre(""), "Другое");
  assert.equal(normalizeSceneGenre(null), "Другое");
});
