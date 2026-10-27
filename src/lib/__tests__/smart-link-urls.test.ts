import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSmartLinkHref,
  parseSmartLinkPixelIds,
  readSmartLinkGeo,
  decodeSmartLinkSlug,
  safeSmartLinkHref
} from "@/lib/smart-link-urls";

test("normalizeSmartLinkHref keeps http(s) links", () => {
  assert.equal(normalizeSmartLinkHref("https://music.yandex.ru/album/1"), "https://music.yandex.ru/album/1");
  assert.equal(normalizeSmartLinkHref(" http://vk.com/artist "), "http://vk.com/artist");
});

test("normalizeSmartLinkHref adds https to bare domains", () => {
  assert.equal(normalizeSmartLinkHref("t.me/artist"), "https://t.me/artist");
  assert.equal(normalizeSmartLinkHref("//open.spotify.com/album/x"), "https://open.spotify.com/album/x");
});

test("normalizeSmartLinkHref drops dangerous schemes and junk", () => {
  assert.equal(normalizeSmartLinkHref("javascript:alert(1)"), "");
  assert.equal(normalizeSmartLinkHref("JaVaScRiPt:alert(1)"), "");
  assert.equal(normalizeSmartLinkHref("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(normalizeSmartLinkHref("просто текст"), "");
  assert.equal(normalizeSmartLinkHref(""), "");
  assert.equal(normalizeSmartLinkHref(null), "");
});

test("safeSmartLinkHref returns null for unsafe values", () => {
  assert.equal(safeSmartLinkHref("javascript:alert(1)"), null);
  assert.equal(safeSmartLinkHref("https://zvuk.com/release/1"), "https://zvuk.com/release/1");
});

test("parseSmartLinkPixelIds accepts only well-formed ids", () => {
  const ids = parseSmartLinkPixelIds([
    { label: "Meta Pixel", value: "123456789012345", enabled: true },
    { label: "VK Pixel", value: "3412345", enabled: true },
    { label: "VK Pixel", value: "VK-RTRG-123456-AbCdE", enabled: true },
    { label: "Meta Pixel", value: "');alert(1);//", enabled: true },
    { label: "Meta Pixel", value: "999999999", enabled: false }
  ]);
  assert.deepEqual(ids, {
    meta: ["123456789012345"],
    vkRetargeting: ["VK-RTRG-123456-AbCdE"],
    topMailRu: ["3412345"]
  });
});

test("readSmartLinkGeo reads Vercel and Cloudflare headers", () => {
  assert.deepEqual(
    readSmartLinkGeo(new Headers({ "x-vercel-ip-country": "RU", "x-vercel-ip-city": "Saint%20Petersburg" })),
    { country: "RU", city: "Saint Petersburg" }
  );
  assert.deepEqual(readSmartLinkGeo(new Headers({ "cf-ipcountry": "KZ" })), { country: "KZ", city: null });
  assert.deepEqual(readSmartLinkGeo(new Headers({ "cf-ipcountry": "XX" })), { country: null, city: null });
});

test("decodeSmartLinkSlug decodes percent-encoded Cyrillic slugs", () => {
  assert.equal(decodeSmartLinkSlug("%D0%BE%D0%BB%D0%B5%D0%B3-jijo"), "олег-jijo");
  assert.equal(decodeSmartLinkSlug("nosleep"), "nosleep");
  assert.equal(decodeSmartLinkSlug("олег-jijo"), "олег-jijo");
  assert.equal(decodeSmartLinkSlug("bad%E0%A4%A"), "bad%E0%A4%A");
});
