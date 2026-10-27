import assert from "node:assert/strict";
import test from "node:test";

import { detectSmartLinkPlatform } from "@/lib/smart-link-platforms";

test("detectSmartLinkPlatform recognizes main platforms", () => {
  assert.equal(detectSmartLinkPlatform("https://music.yandex.ru/album/31337001"), "yandex_music");
  assert.equal(detectSmartLinkPlatform("https://vk.com/music/album/-2000123_456"), "vk_music");
  assert.equal(detectSmartLinkPlatform("https://zvuk.com/release/38451122"), "zvuk_wink_music");
  assert.equal(detectSmartLinkPlatform("https://open.spotify.com/album/5Xy0aB"), "spotify");
  assert.equal(detectSmartLinkPlatform("https://music.apple.com/ru/album/x/123"), "apple_music");
  assert.equal(detectSmartLinkPlatform("https://music.youtube.com/playlist?list=1"), "youtube_music");
  assert.equal(detectSmartLinkPlatform("https://music.amazon.de/albums/B0"), "amazon_music");
});

test("detectSmartLinkPlatform recognizes every VK Music link shape on vk.com and vk.ru", () => {
  assert.equal(detectSmartLinkPlatform("https://vk.ru/audio438835689_456244409_6bea82e9cc14d4014c"), "vk_music");
  assert.equal(detectSmartLinkPlatform("https://vk.com/audio-2001_456"), "vk_music");
  assert.equal(detectSmartLinkPlatform("https://vk.ru/music/album/-2000123_456"), "vk_music");
  assert.equal(detectSmartLinkPlatform("https://m.vk.com/music/playlist/-1_2"), "vk_music");
  assert.equal(detectSmartLinkPlatform("https://vk.com/artist/sometrack"), "vk_music");
  assert.equal(detectSmartLinkPlatform("https://vk.ru/playlist-1_2"), "vk_music");
});

test("detectSmartLinkPlatform accepts links without scheme or with www", () => {
  assert.equal(detectSmartLinkPlatform("music.yandex.ru/album/1"), "yandex_music");
  assert.equal(detectSmartLinkPlatform("www.deezer.com/album/1"), "deezer");
});

test("detectSmartLinkPlatform rejects unknown and unsafe links", () => {
  assert.equal(detectSmartLinkPlatform("https://vk.com/artistname"), null);
  assert.equal(detectSmartLinkPlatform("https://vk.ru/audiophile"), null);
  assert.equal(detectSmartLinkPlatform("https://youtube.com/watch?v=1"), null);
  assert.equal(detectSmartLinkPlatform("https://evil-music.yandex.ru.example.com/x"), null);
  assert.equal(detectSmartLinkPlatform("javascript:alert(1)"), null);
  assert.equal(detectSmartLinkPlatform("просто текст"), null);
  assert.equal(detectSmartLinkPlatform(""), null);
});
