import assert from "node:assert/strict";
import test from "node:test";

import {
  describeTrackPerformerMismatch,
  findTrackPerformerMismatches,
  inheritReleasePersonsForTrack
} from "@/lib/release-performer-check";

test("a track performer who is not a release performer is reported", () => {
  const mismatches = findTrackPerformerMismatches({
    persons: [{ name: "Олег", role: "Исполнитель" }],
    tracks: [
      {
        title: "впипуи",
        trackPersons: [
          { name: "пвиа", role: "Исполнитель" },
          { name: "Иван Петров", role: "Автор музыки" }
        ]
      },
      { title: "Второй", trackPersons: [{ name: " олег ", role: "Исполнитель" }] },
      { title: "Без исполнителя", trackPersons: [{ name: "Иван Петров", role: "Автор слов" }] }
    ]
  });
  assert.equal(mismatches.length, 1);
  assert.equal(
    describeTrackPerformerMismatch(mismatches[0]),
    "Трек 1 «впипуи»: исполнитель «пвиа» не совпадает с исполнителем релиза «Олег»."
  );
});

test("names match regardless of case, spaces and ё", () => {
  assert.deepEqual(
    findTrackPerformerMismatches({
      persons: [{ name: "Алёна  Звёздная", role: "Исполнитель" }],
      tracks: [{ title: "a", trackPersons: [{ name: "алена звездная", role: "исполнитель" }] }]
    }),
    []
  );
});

test("nothing is reported when the release has no performer", () => {
  assert.deepEqual(
    findTrackPerformerMismatches({ persons: [], tracks: [{ trackPersons: [{ name: "x", role: "Исполнитель" }] }] }),
    []
  );
});

test("a new track inherits the main release roles only", () => {
  assert.deepEqual(
    inheritReleasePersonsForTrack([
      { id: "1", name: "Олег", role: "Исполнитель" },
      { id: "2", name: "Маша", role: "feat." },
      { id: "3", name: "", role: "Исполнитель" },
      { id: "4", name: "Старый автор", role: "Автор" }
    ]),
    [
      { name: "Олег", role: "Исполнитель" },
      { name: "Маша", role: "feat." }
    ]
  );
});
