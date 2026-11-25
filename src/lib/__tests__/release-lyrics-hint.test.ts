import assert from "node:assert/strict";
import test from "node:test";

import { findTracksWithoutLyrics } from "@/lib/release-lyrics-hint";

const track = (title: string, lyrics = "", versionInstrumental = false, syncedLyrics: unknown[] = []) => ({
  name: `${title}.wav`,
  meta: { title, lyrics, versionInstrumental, syncedLyrics }
});

test("findTracksWithoutLyrics lists sung tracks with no text", () => {
  assert.deepEqual(
    findTracksWithoutLyrics([
      track("Аня - моя звезда"),
      track("С текстом", "Куплет"),
      track("Инструментал", "", true),
      track("Синхронный", "", false, [{ time: 0, text: "строка" }]),
      track("  ", "   ")
    ]),
    [
      { index: 0, title: "Аня - моя звезда" },
      { index: 4, title: ".wav" }
    ]
  );
});
