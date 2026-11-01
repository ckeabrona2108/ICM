import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOAuthPlaceholderEmail,
  isOAuthProvider,
  normalizeOAuthEmail,
  normalizeOAuthName
} from "@/lib/oauth-login";

test("placeholder email is unique per provider account and never routable", () => {
  assert.equal(buildOAuthPlaceholderEmail("vk", "42"), "vk-42@oauth.icecreammusic.invalid");
  assert.notEqual(buildOAuthPlaceholderEmail("vk", "42"), buildOAuthPlaceholderEmail("yandex", "42"));
});

test("only real emails are used to join existing cabinets", () => {
  assert.equal(normalizeOAuthEmail(" Artist@Yandex.RU "), "artist@yandex.ru");
  assert.equal(normalizeOAuthEmail(""), null);
  assert.equal(normalizeOAuthEmail("not-an-email"), null);
  assert.equal(normalizeOAuthEmail(null), null);
});

test("names are trimmed and fall back when the provider gives none", () => {
  assert.equal(normalizeOAuthName("  Иван   Петров "), "Иван Петров");
  assert.equal(normalizeOAuthName(""), "Артист");
  assert.equal(normalizeOAuthName(undefined), "Артист");
  assert.equal(normalizeOAuthName("x".repeat(200)).length, 120);
});

test("credentials sign-in is not treated as an OAuth provider", () => {
  assert.equal(isOAuthProvider("yandex"), true);
  assert.equal(isOAuthProvider("vk"), true);
  assert.equal(isOAuthProvider("credentials"), false);
});
