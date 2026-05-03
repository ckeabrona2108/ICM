import assert from "node:assert/strict";
import test from "node:test";

import {
  releasePersonRoleOptions,
  trackPersonRoleOptions,
  isAllowedReleasePersonRole,
  isAllowedTrackPersonRole
} from "@/lib/person-roles";

test("main release person roles include only artist, feat and remixer", () => {
  assert.deepEqual(
    releasePersonRoleOptions.map((role) => role.value),
    ["Исполнитель", "feat.", "Remixer"]
  );
});

test("track metadata roles keep extended author/producer set", () => {
  const values = trackPersonRoleOptions.map((role) => role.value);
  assert.ok(values.includes("Исполнитель"));
  assert.ok(values.includes("feat."));
  assert.ok(values.includes("Remixer"));
  assert.ok(values.includes("Соисполнитель"));
  assert.ok(values.includes("Продюсер"));
  assert.ok(values.includes("Автор музыки"));
  assert.ok(values.includes("Автор слов"));
  assert.equal(values.includes("Автор"), false);
  assert.equal(values.includes("Автор текста"), false);
});

test("release role validation keeps compatibility for legacy saved roles", () => {
  assert.equal(isAllowedReleasePersonRole("Автор текста"), true);
  assert.equal(isAllowedReleasePersonRole("Продюсер"), true);
  assert.equal(isAllowedTrackPersonRole("Автор слов"), true);
});
