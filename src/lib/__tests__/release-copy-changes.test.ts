import assert from "node:assert/strict";
import test from "node:test";

import {
  changedReleaseAreas,
  diffReleaseSubmissions,
  formatReleaseChangeAreas,
  readReleaseChangeRequest,
  unmarkedReleaseChangeAreas,
  validateReleaseChangeRequest
} from "@/lib/release-copy-changes";
import { releaseSubmissionDataSchema } from "@/lib/release-policy";

const original = {
  cover: "https://cdn.example/cover-old.jpg",
  coverUpload: { url: "https://cdn.example/cover-old.jpg", storageKey: "covers/old.jpg" },
  title: "Ночью",
  subtitle: "",
  genre: "Хип-хоп",
  label: "ICECREAMMUSIC",
  language: "Русский",
  persons: [{ name: "Red Prodos", role: "Исполнитель" }],
  upc: "5064133307028",
  releaseDate: "2026-11-20",
  startDate: "2026-11-20",
  preorderDate: "2026-11-20",
  territoryMode: "all",
  territoryCountries: [],
  platformMode: "all",
  platforms: [],
  tracks: [
    {
      fileName: "nochyu.wav",
      title: "Ночью",
      isrc: "RU1",
      metadataLanguage: "Русский",
      trackPersons: [{ name: "Red Prodos", role: "Автор музыки" }],
      audioFile: { url: "/api/uploads/object/audio/nochyu.wav", storageKey: "audio/nochyu.wav", fileName: "nochyu.wav" },
      lyrics: "Ночью город"
    }
  ]
};

test("an unchanged copy has no differences, even with rewritten URLs and a cleared UPC", () => {
  const copy = {
    ...original,
    upc: "",
    moderatorComment: "Спасибо",
    coverUpload: { url: "http://localhost:3000/cover-old.jpg", storageKey: "covers/old.jpg" },
    tracks: [{ ...original.tracks[0], audioFile: { ...original.tracks[0].audioFile, url: "https://host/x" }, versionLive: false }],
    changeRequest: { areas: ["cover"], comment: "Новая обложка" }
  };
  assert.deepEqual(diffReleaseSubmissions(original, copy), []);
});

test("a new cover and release date are reported in their areas", () => {
  const copy = {
    ...original,
    cover: "https://cdn.example/cover-new.jpg",
    coverUpload: { url: "https://cdn.example/cover-new.jpg", storageKey: "covers/new.jpg" },
    releaseDate: "2026-12-01"
  };
  const changes = diffReleaseSubmissions(original, copy);
  assert.deepEqual(changedReleaseAreas(changes), ["cover", "dates"]);
  const cover = changes.find((change) => change.area === "cover");
  assert.equal(cover?.kind, "image");
  assert.equal(cover?.before, "https://cdn.example/cover-old.jpg");
  assert.equal(cover?.after, "https://cdn.example/cover-new.jpg");
  assert.deepEqual(
    changes.find((change) => change.field === "releaseDate"),
    { area: "dates", field: "releaseDate", label: "Дата релиза", before: "2026-11-20", after: "2026-12-01" }
  );
  assert.deepEqual(unmarkedReleaseChangeAreas(changes, { areas: ["cover"], comment: "x" }), ["dates"]);
  assert.equal(formatReleaseChangeAreas(changedReleaseAreas(changes)), "обложка, даты");
});

test("track audio, lyrics and added tracks are detected", () => {
  const copy = {
    ...original,
    tracks: [
      {
        ...original.tracks[0],
        audioFile: { url: "/x", storageKey: "audio/nochyu-v2.wav", fileName: "nochyu-v2.wav" },
        lyrics: "Ночью город спит"
      },
      { fileName: "bonus.wav", title: "Бонус", metadataLanguage: "Русский", trackPersons: [] }
    ]
  };
  const changes = diffReleaseSubmissions(original, copy);
  assert.deepEqual(changedReleaseAreas(changes), ["tracks", "lyrics"]);
  assert.ok(changes.some((change) => change.field === "tracks.0.audio" && change.after === "nochyu-v2.wav"));
  assert.ok(changes.some((change) => change.field === "tracks.count" && change.after === "2"));
  assert.ok(changes.some((change) => change.field === "tracks.1" && change.after === "Бонус"));
});

test("a change request needs at least one area and a comment", () => {
  assert.equal(validateReleaseChangeRequest(null), "Отметьте, что вы хотите изменить в релизе.");
  assert.equal(validateReleaseChangeRequest({ areas: [], comment: "x" }), "Отметьте, что вы хотите изменить в релизе.");
  assert.equal(validateReleaseChangeRequest({ areas: ["cover"], comment: "" }), "Коротко напишите модератору, зачем нужны изменения.");
  assert.equal(validateReleaseChangeRequest({ areas: ["cover"], comment: "Ошибка в имени" }), null);
  assert.deepEqual(
    readReleaseChangeRequest({ changeRequest: { areas: ["cover", "bogus", "cover"], comment: " Ошибка " } }),
    { areas: ["cover"], comment: "Ошибка" }
  );
  assert.equal(readReleaseChangeRequest({}), null);
});

test("submission schema accepts a change request and rejects unknown areas", () => {
  const base = {
    ...original,
    type: "single",
    tracks: original.tracks.map((track) => ({ ...track, audioFile: undefined }))
  };
  const accepted = releaseSubmissionDataSchema.safeParse({ ...base, changeRequest: { areas: ["cover"], comment: "ok" } });
  assert.equal(accepted.success, true);
  const rejected = releaseSubmissionDataSchema.safeParse({ ...base, changeRequest: { areas: ["bogus"], comment: "ok" } });
  assert.equal(rejected.success, false);
});

test("VK start and pre-save changes count as date changes; defaults compare equal", () => {
  assert.deepEqual(diffReleaseSubmissions(original, { ...original, vkStartTime: "00:00", vkPreSave: false }), []);
  const changes = diffReleaseSubmissions(original, { ...original, vkStartDate: "2026-11-27", vkStartTime: "12:00", vkPreSave: true });
  assert.deepEqual(changes.map((change) => change.field), ["vkStartDate", "vkStartTime", "vkPreSave"]);
  assert.deepEqual(changedReleaseAreas(changes), ["dates"]);
});
