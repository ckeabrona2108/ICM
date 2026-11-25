import assert from "node:assert/strict";
import test from "node:test";

import {
  buildComebackLetter,
  buildUnsubscribeUrl,
  isComebackCampaign,
  isUnsubscribeTokenShape,
  newUnsubscribeToken
} from "@/lib/comeback-emails";

test("unsubscribe tokens are random and URL-safe", () => {
  const a = newUnsubscribeToken();
  const b = newUnsubscribeToken();
  assert.notEqual(a, b);
  assert.equal(isUnsubscribeTokenShape(a), true);
  assert.equal(isUnsubscribeTokenShape("short"), false);
  assert.equal(isUnsubscribeTokenShape("has spaces and more letters"), false);
});

test("letters carry the soft copy, a marked button link and an unsubscribe link", () => {
  const token = newUnsubscribeToken();
  const released = buildComebackLetter("comeback-released", { unsubscribeToken: token });
  assert.equal(released.subject, "Привет от ICECREAMMUSIC");
  assert.match(released.text, /потому что зарегистрирован/u);
  assert.match(released.text, /Давно не виделись/u);
  assert.match(released.html, /\/dashboard\?utm_source=email&amp;utm_medium=letter&amp;utm_campaign=comeback-released/u);
  assert.match(released.html, /Отписаться/u);
  assert.ok(released.text.includes(buildUnsubscribeUrl(token)));
  assert.equal(released.headers["List-Unsubscribe"], `<https://www.icecreammusic.net/api/unsubscribe?t=${token}>`);
  assert.equal(released.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

  const first = buildComebackLetter("comeback-first-release", { unsubscribeToken: token });
  assert.match(first.text, /первый сингл можно выпустить бесплатно/u);
  assert.match(first.html, /\/dashboard\/releases\/new\?/u);
  // No prices in either letter.
  assert.doesNotMatch(released.text + first.text, /₽/u);
});

test("only the two known campaigns are accepted", () => {
  assert.equal(isComebackCampaign("comeback-released"), true);
  assert.equal(isComebackCampaign("spam"), false);
});
