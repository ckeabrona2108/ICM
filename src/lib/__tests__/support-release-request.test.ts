import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSupportReleaseMessage,
  encodeSupportDescription,
  parseSupportDescription,
  pickSupportPlatformLinks,
  supportReleaseRequestSchema,
  type SupportReleaseContext
} from "../support-release-request";

const releaseId = "00000000-0000-4000-8000-000000000001";

test("move to card needs a card link for every selected platform", () => {
  const result = supportReleaseRequestSchema.safeParse({
    releaseId,
    requestType: "move_to_card",
    platforms: ["Яндекс Музыка", "VK Музыка"],
    platformLinks: [{ platform: "Яндекс Музыка", cardUrl: "https://music.yandex.ru/artist/1" }]
  });
  assert.equal(result.success, false);
  assert.match(result.error!.issues[0].message, /VK Музыка/);
});

test("remove from card needs release links; missing on store needs none", () => {
  const remove = supportReleaseRequestSchema.safeParse({
    releaseId,
    requestType: "remove_from_card",
    platforms: ["Spotify"],
    platformLinks: [{ platform: "Spotify", cardUrl: "https://open.spotify.com/artist/1" }]
  });
  assert.equal(remove.success, false);

  const missing = supportReleaseRequestSchema.safeParse({
    releaseId,
    requestType: "missing_on_store",
    platforms: ["Звук"]
  });
  assert.equal(missing.success, true);
  assert.deepEqual(pickSupportPlatformLinks(missing.data!), []);
});

test("links are kept only for selected platforms, in selection order", () => {
  const parsed = supportReleaseRequestSchema.parse({
    releaseId,
    requestType: "move_to_card",
    platforms: ["VK Музыка", "Яндекс Музыка"],
    platformLinks: [
      { platform: "Яндекс Музыка", cardUrl: "https://music.yandex.ru/artist/1" },
      { platform: "Spotify", cardUrl: "https://open.spotify.com/artist/9" },
      { platform: "VK Музыка", cardUrl: "https://vk.com/artist/2", releaseUrls: ["https://vk.com/music/album/3"] }
    ]
  });
  assert.deepEqual(pickSupportPlatformLinks(parsed).map((item) => item.platform), ["VK Музыка", "Яндекс Музыка"]);
});

test("description round-trips the context and plain descriptions stay plain", () => {
  const context: SupportReleaseContext = {
    v: 1,
    requestType: "move_to_card",
    release: { id: releaseId, title: "Лёд на шее", artist: "Олег", upc: "4062548811203", status: "approved", coverUrl: null },
    platforms: ["Яндекс Музыка"],
    platformLinks: [{ platform: "Яндекс Музыка", cardUrl: "https://music.yandex.ru/artist/1", releaseUrls: [] }]
  };
  const body = buildSupportReleaseMessage(context, "Перенесите, пожалуйста");
  assert.match(body, /UPC: 4062548811203/);
  assert.match(body, /Яндекс Музыка:\nНужная карточка: https:\/\/music\.yandex\.ru\/artist\/1/);
  assert.deepEqual(parseSupportDescription(encodeSupportDescription(context, body)), context);
  assert.equal(parseSupportDescription("обычный текст обращения"), null);
});
