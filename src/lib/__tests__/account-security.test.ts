import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmailChangedNoticeEmail,
  buildPasswordLinkEmail,
  buildPasswordNoticeEmail,
  canReceiveAccountEmail
} from "@/lib/account-security";
import { buildOAuthPlaceholderEmail, isOAuthPlaceholderEmail } from "@/lib/oauth-login";

test("mail never goes to the placeholder addresses of VK sign-ins", () => {
  const placeholder = buildOAuthPlaceholderEmail("vk", "42");
  assert.equal(isOAuthPlaceholderEmail(placeholder), true);
  assert.equal(canReceiveAccountEmail(placeholder), false);
  assert.equal(canReceiveAccountEmail("artist@yandex.ru"), true);
  assert.equal(canReceiveAccountEmail(""), false);
  assert.equal(canReceiveAccountEmail(null), false);
});

test("password link emails name the action and escape the user name", () => {
  const set = buildPasswordLinkEmail({ to: "a@b.ru", name: "<b>Ivan</b>", url: "https://x/reset?token=1", kind: "set" });
  assert.match(set.subject, /Установка пароля/u);
  assert.match(set.text, /установить пароль: https:\/\/x\/reset\?token=1/u);
  assert.doesNotMatch(set.html, /<b>Ivan/u);
  assert.match(set.html, /&lt;b&gt;Ivan/u);

  const reset = buildPasswordLinkEmail({ to: "a@b.ru", name: null, url: "https://x/r", kind: "reset" });
  assert.match(reset.subject, /Восстановление пароля/u);
});

test("password notices say what happened and where to recover", () => {
  for (const kind of ["set", "changed", "reset"] as const) {
    const email = buildPasswordNoticeEmail({ to: "a@b.ru", name: "Иван", kind, resetUrl: "https://x/forgot-password" });
    assert.match(email.text, /https:\/\/x\/forgot-password/u);
    assert.match(email.text, /Если это были не вы/u);
  }
  assert.match(buildPasswordNoticeEmail({ to: "a", name: null, kind: "set", resetUrl: "u" }).subject, /установлен/u);
});

test("email change notice goes to the old address and names the new one", () => {
  const email = buildEmailChangedNoticeEmail({ to: "old@b.ru", name: null, newEmail: "new@b.ru", supportUrl: "https://x/s" });
  assert.equal(email.to, "old@b.ru");
  assert.match(email.text, /new@b\.ru/u);
});
