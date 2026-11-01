import assert from "node:assert/strict";
import test from "node:test";

import { calculateReleasePrice } from "@/lib/release-pricing";

test("a release without extras costs the base price", () => {
  const price = calculateReleasePrice([{ text: null }, { text: "   " }]);

  assert.equal(price.totalRub, 350);
  assert.deepEqual(price.lines.map((line) => line.kind), ["base"]);
});

test("extras are charged per track", () => {
  const tracks = Array.from({ length: 10 }, () => ({ text: "Куплет" }));
  const price = calculateReleasePrice(tracks);

  assert.equal(price.totalRub, 350 + 750);
  assert.deepEqual(price.lines[1], { kind: "lyrics", label: "Текст трека", unitRub: 75, count: 10, amountRub: 750 });
});

test("lyrics, karaoke and video add up", () => {
  const price = calculateReleasePrice([
    { text: "Куплет", text_sync: "lyrics/1.ttml", video: "video/1.mp4", video_shot: "video/1.mp4" },
    { text: "Припев" }
  ]);

  assert.equal(price.totalRub, 350 + 2 * 75 + 75 + 150);
});

test("one video per track even when both video columns are filled", () => {
  const price = calculateReleasePrice([{ video: null, video_shot: "video/legacy.mp4" }]);

  assert.equal(price.totalRub, 350 + 150);
  assert.equal(price.lines[1]?.count, 1);
});
