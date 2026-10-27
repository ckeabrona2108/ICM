import assert from "node:assert/strict";
import test from "node:test";

import { findSmartLinkPlatformLinksByUpc, mapOdesliLinks, normalizeSmartLinkUpc } from "@/lib/smart-link-autofill";
import { getMoscowDateKey, isSmartLinkPrerelease } from "@/lib/smart-link-release-date";

test("normalizeSmartLinkUpc keeps 12-14 digit codes only", () => {
  assert.equal(normalizeSmartLinkUpc(" 4601234 567890 "), "4601234567890");
  assert.equal(normalizeSmartLinkUpc("123"), null);
  assert.equal(normalizeSmartLinkUpc(null), null);
});

test("mapOdesliLinks keeps only links that really point to their platform", () => {
  const links = mapOdesliLinks({
    linksByPlatform: {
      spotify: { url: "https://open.spotify.com/album/abc" },
      yandex: { url: "https://music.yandex.ru/album/1" },
      youtubeMusic: { url: "https://music.youtube.com/playlist?list=OLAK" },
      tidal: { url: "javascript:alert(1)" },
      deezer: { url: "https://evil.example.com/deezer" },
      napster: { url: "https://napster.com/x" }
    }
  });
  assert.deepEqual(links, {
    spotify: "https://open.spotify.com/album/abc",
    yandex_music: "https://music.yandex.ru/album/1",
    youtube_music: "https://music.youtube.com/playlist?list=OLAK"
  });
});

test("findSmartLinkPlatformLinksByUpc combines direct lookups with song.link", async (t) => {
  process.env.ODESLI_API_KEY = "test-key";
  t.after(() => {
    delete process.env.ODESLI_API_KEY;
  });
  const responses: Record<string, unknown> = {
    "api.deezer.com": { id: 1, link: "https://www.deezer.com/album/1" },
    "itunes.apple.com": { results: [{ collectionViewUrl: "https://music.apple.com/ru/album/x/2?uo=4" }] },
    "api.song.link": {
      linksByPlatform: {
        appleMusic: { url: "https://music.apple.com/ru/album/x/2" },
        yandex: { url: "https://music.yandex.ru/album/3" }
      }
    }
  };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const host = new URL(String(input)).hostname;
    const body = responses[host];
    return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 });
  });

  const found = await findSmartLinkPlatformLinksByUpc("4601234567890");
  assert.deepEqual(found, {
    deezer: "https://www.deezer.com/album/1",
    apple_music: "https://music.apple.com/ru/album/x/2",
    yandex_music: "https://music.yandex.ru/album/3"
  });
});

test("findSmartLinkPlatformLinksByUpc skips the network for invalid UPC", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("{}"));
  assert.deepEqual(await findSmartLinkPlatformLinksByUpc("12"), {});
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("isSmartLinkPrerelease compares release date with the Moscow calendar day", () => {
  const now = new Date("2026-11-11T22:30:00Z"); // already 12 November 01:30 in Moscow
  assert.equal(getMoscowDateKey(now), "2026-11-12");
  assert.equal(isSmartLinkPrerelease("2026-11-12", now), false);
  assert.equal(isSmartLinkPrerelease("2026-11-13", now), true);
  assert.equal(isSmartLinkPrerelease("garbage", now), false);
});
