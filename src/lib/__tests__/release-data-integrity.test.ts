// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { looksLikePersonName, mapAdminReleaseDetails } from "@/lib/admin-release-details";
import { planTrackSync } from "@/lib/release-submit-tracks";

test("lyrics author names in the formats artists use are kept", () => {
  for (const name of [
    "Andrey Shvedov/Андрей Шведов",
    "Andrey Shvedov/ Андрей Шведов",
    "WhiteFluffy / Попов Павел Алексеевич",
    "А. С. Пушкин",
    "Andrey Shvedov Андрей Шведов"
  ]) {
    assert.equal(looksLikePersonName(name), true, name);
  }
});

test("lyrics text pasted into the author field is still filtered out", () => {
  assert.equal(looksLikePersonName("Пускай идёт дождь\nпускай поёт"), false);
  assert.equal(looksLikePersonName("Пускай идёт дождь, пускай гремит гроза над нами всеми опять и опять"), false);
  assert.equal(looksLikePersonName("Зачем ты ушла?"), false);
});

test("admin details show the lyrics author of a track submitted as Latin/Cyrillic", () => {
  const details = mapAdminReleaseDetails({
    id: "rel_1",
    title: "ПУСКАЙ",
    performer: "Andrey Shvedov/Андрей Шведов",
    status: "moderating",
    roles: {},
    track: [
      {
        id: "trk_1",
        title: "Пускай",
        index: 1,
        roles: {
          trackPersons: [
            { name: "Andrey Shvedov/Андрей Шведов", role: "Исполнитель" },
            { name: "Andrey Shvedov/Андрей Шведов", role: "Автор слов" },
            { name: "Andrey Shvedov/Андрей Шведов", role: "Автор музыки" }
          ]
        }
      }
    ]
  });
  const roles = details.tracks[0].track_roles;
  assert.deepEqual(roles.lyricsAuthors, ["Andrey Shvedov/Андрей Шведов"]);
  assert.deepEqual(roles.musicAuthors, ["Andrey Shvedov/Андрей Шведов"]);
  assert.deepEqual(roles.performers, ["Andrey Shvedov/Андрей Шведов"]);
});

test("an admin edit of track persons replaces the artist's list", () => {
  const details = mapAdminReleaseDetails({
    id: "rel_1",
    status: "moderating",
    roles: {},
    track: [
      {
        id: "trk_1",
        title: "Song",
        index: 1,
        roles: {
          trackPersons: [{ name: "Old Author", role: "Автор слов" }],
          persons: { performers: ["Artist"], lyricsAuthors: ["New Author"], musicAuthors: [] }
        }
      }
    ]
  });
  assert.deepEqual(details.tracks[0].track_roles.lyricsAuthors, ["New Author"]);
  assert.deepEqual(details.tracks[0].track_roles.performers, ["Artist"]);
});

test("legacy role «Автор текста» is shown as lyrics author", () => {
  const details = mapAdminReleaseDetails({
    id: "rel_1",
    status: "moderating",
    roles: {},
    track: [{ id: "trk_1", title: "Song", index: 1, roles: { trackPersons: [{ name: "Иван Иванов", role: "Автор текста" }] } }]
  });
  assert.deepEqual(details.tracks[0].track_roles.lyricsAuthors, ["Иван Иванов"]);
});

const row = (title, index, extra = {}) => ({ releaseId: "rel", title, index, roles: {}, ...extra });

test("an edited release keeps its track ids", () => {
  const plan = planTrackSync(
    [
      { id: "a", title: "First", isrc: null, index: 1, roles: { audioFile: { storageKey: "k1" } } },
      { id: "b", title: "Second", isrc: "RUA1X2400001", index: 2, roles: {} }
    ],
    [
      row("Second (edit)", 1, { isrc: "RUA1X2400001" }),
      row("First renamed", 2, { roles: { audioFile: { storageKey: "k1" } } })
    ]
  );
  assert.deepEqual(plan.updates.map((u) => u.id), ["b", "a"]);
  assert.equal(plan.creates.length, 0);
  assert.deepEqual(plan.deleteIds, []);
});

test("added tracks are created and removed tracks are deleted", () => {
  const plan = planTrackSync(
    [
      { id: "a", title: "One", isrc: null, index: 1, roles: {} },
      { id: "b", title: "Two", isrc: null, index: 2, roles: {} },
      { id: "c", title: "Three", isrc: null, index: 3, roles: {} }
    ],
    [row("One", 1), row("Brand new", 2)]
  );
  assert.deepEqual(plan.updates.map((u) => u.id), ["a", "b"]);
  assert.deepEqual(plan.deleteIds, ["c"]);
});
