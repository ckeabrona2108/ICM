import assert from "node:assert/strict";
import test from "node:test";

import { detectPlaylistPlatform, parsePlaylistReportRow, placementTrackKey } from "@/lib/playlist-import";

const zvonkoRow = {
  Артист: "Phil Mahart",
  "Наименование трека": "Портреты",
  Позиция: 245,
  Плейлист: "Русский рейв",
  "Ссылка на плейлист": "https://music.yandex.ru/users/yandexmusic/playlists/1131"
};

test("a Zvonko Yandex row without UPC is read", () => {
  assert.deepEqual(parsePlaylistReportRow(zvonkoRow), {
    upc: "",
    artistName: "Phil Mahart",
    trackTitle: "Портреты",
    position: "245",
    playlistName: "Русский рейв",
    playlistUrl: "https://music.yandex.ru/users/yandexmusic/playlists/1131"
  });
});

test("a row with neither UPC nor artist and title is skipped", () => {
  assert.equal(parsePlaylistReportRow({ ...zvonkoRow, Артист: "" }), null);
});

test("the platform comes from the playlist link", () => {
  assert.equal(detectPlaylistPlatform(zvonkoRow["Ссылка на плейлист"]), "YANDEX");
  assert.equal(detectPlaylistPlatform("not a link"), null);
});

test("re-uploading the same track gives the same key, whatever the letter case", () => {
  const first = placementTrackKey({ upc: "", artistName: "Phil Mahart", trackTitle: "Портреты" });
  const again = placementTrackKey({ upc: "", artistName: "phil  mahart", trackTitle: "ПОРТРЕТЫ" });
  assert.equal(first, again);
  assert.equal(placementTrackKey({ upc: "5063635044004", artistName: "A", trackTitle: "B" }), "5063635044004");
});
