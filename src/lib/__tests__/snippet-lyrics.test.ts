import assert from "node:assert/strict";
import test from "node:test";

import { activeLyricLine, distributeLyrics } from "@/components/snippet-studio/scene/lyrics";

const lines = [
  { text: "первая", start: 10 },
  { text: "вторая", start: 13 },
  { text: "третья", start: 16 }
];

test("picks the line being sung and how far through it we are", () => {
  const active = activeLyricLine(lines, 14.5);
  assert.equal(active?.line.text, "вторая");
  assert.equal(active?.next?.text, "третья");
  assert.equal(active?.progress, 0.5);
});

test("nothing before the first line or long after the last", () => {
  assert.equal(activeLyricLine(lines, 9), null);
  assert.equal(activeLyricLine(lines, 30), null);
  assert.equal(activeLyricLine(lines, 17)?.line.text, "третья");
});

test("ignores empty lines and unsorted input", () => {
  const active = activeLyricLine([{ text: "b", start: 5 }, { text: " ", start: 3 }, { text: "a", start: 1 }], 2);
  assert.equal(active?.line.text, "a");
  assert.equal(active?.next?.text, "b");
});

test("spreads lines evenly over the clip", () => {
  assert.deepEqual(distributeLyrics(["a", "", "b", "c"], 60, 15), [
    { text: "a", start: 60 },
    { text: "b", start: 65 },
    { text: "c", start: 70 }
  ]);
});
