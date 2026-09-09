import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_CLIP_MAX_SECONDS,
  AUDIO_CLIP_MIN_SECONDS,
  normalizeAudioClipRange
} from "../browser-audio-clip";

test("audio clip range never exceeds 30 seconds", () => {
  assert.deepEqual(
    normalizeAudioClipRange({ startSec: 12, durationSec: 90 }, 180),
    { startSec: 12, durationSec: AUDIO_CLIP_MAX_SECONDS }
  );
});

test("audio clip range stays inside the source duration", () => {
  assert.deepEqual(
    normalizeAudioClipRange({ startSec: 58, durationSec: 30 }, 60),
    { startSec: 55, durationSec: AUDIO_CLIP_MIN_SECONDS }
  );
});

test("audio clip range supports a shorter source", () => {
  assert.deepEqual(
    normalizeAudioClipRange({ startSec: 0, durationSec: 30 }, 12.5),
    { startSec: 0, durationSec: 12.5 }
  );
});
