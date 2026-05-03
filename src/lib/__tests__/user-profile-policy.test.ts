import test from "node:test";
import assert from "node:assert/strict";

import {
  getInitials,
  userProfileNameSchema,
  validateAvatarDataUrl
} from "@/lib/user-profile-policy";

test("userProfileNameSchema rejects empty name", () => {
  const parsed = userProfileNameSchema.safeParse("   ");
  assert.equal(parsed.success, false);
});

test("userProfileNameSchema accepts valid name", () => {
  const parsed = userProfileNameSchema.safeParse("Nova Echo");
  assert.equal(parsed.success, true);
});

test("getInitials returns initials for two words", () => {
  assert.equal(getInitials("Nova Echo"), "NE");
});

test("validateAvatarDataUrl rejects unsupported mime", () => {
  const payload = Buffer.from("avatar", "utf8").toString("base64");
  const result = validateAvatarDataUrl(`data:image/gif;base64,${payload}`);
  assert.equal(result.ok, false);
});

test("validateAvatarDataUrl rejects too large payload", () => {
  const payload = Buffer.from("x".repeat(3 * 1024 * 1024), "utf8").toString("base64");
  const result = validateAvatarDataUrl(`data:image/png;base64,${payload}`, 100 * 1024);
  assert.equal(result.ok, false);
});

test("validateAvatarDataUrl accepts valid png", () => {
  const payload = Buffer.from("small-png", "utf8").toString("base64");
  const result = validateAvatarDataUrl(`data:image/png;base64,${payload}`);
  assert.equal(result.ok, true);
});
