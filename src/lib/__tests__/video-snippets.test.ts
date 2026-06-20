import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeEnergyTimeline,
  buildSpectralProfile,
  getEffectiveSegment,
  getLayout,
  getVideoSnippetCompositionSize,
  getVideoSnippetLayout,
  normalizeVideoSnippetStyle,
  VIDEO_SNIPPET_DROP_EFFECTS,
  VIDEO_SNIPPET_FORMATS
} from "@/lib/video-snippets";

test("analyzeEnergyTimeline detects a later energy spike as the drop", () => {
  const energies = [
    0.04, 0.05, 0.06, 0.05, 0.07, 0.06, 0.08, 0.09, 0.08, 0.07,
    0.12, 0.13, 0.15, 0.16, 0.18, 0.2, 0.24, 0.28, 0.35, 0.42,
    0.5, 0.58, 0.62, 0.76, 0.92, 0.84, 0.7, 0.55, 0.46, 0.4
  ];

  const result = analyzeEnergyTimeline(energies, 60);

  assert.ok(result.introEnd >= 0);
  assert.ok(result.chorusStart > result.introEnd);
  assert.ok(result.dropAt >= result.chorusStart);
  assert.ok(result.peakAt >= result.dropAt);
  assert.ok(result.confidence > 0.4);
});

test("buildSpectralProfile averages frequency data into bands", () => {
  const samples = new Uint8Array([0, 32, 64, 96, 128, 160, 192, 224, 255]);
  const bands = buildSpectralProfile(samples, 3);

  assert.equal(bands.length, 3);
  assert.ok(bands[0] < bands[2]);
  assert.ok(bands.every((band) => band >= 0 && band <= 1));
});

test("story composition uses vertical export dimensions", () => {
  const size = getVideoSnippetCompositionSize("story");

  assert.deepEqual(size, { width: 1080, height: 1920 });
});

test("format list is limited to story and square canvases", () => {
  assert.deepEqual(
    VIDEO_SNIPPET_FORMATS.map((entry) => entry.value),
    ["story", "square"]
  );
  assert.deepEqual(getVideoSnippetCompositionSize("square"), { width: 1080, height: 1080 });
});

test("default story layout keeps title artist and platforms separated", () => {
  const layout = getVideoSnippetLayout("story", "classic", {
    platformText: "Available on: Apple Music • Spotify"
  });

  assert.equal(layout.coverX, 180);
  assert.equal(layout.coverY, 308);
  assert.equal(layout.coverWidth, 720);
  assert.equal(layout.coverHeight, 720);
  assert.ok(layout.titleY < layout.artistY);
  assert.ok(layout.artistY < layout.platformsY);
  assert.ok(layout.spectrumY > layout.artistY);
  assert.equal(layout.titleMaxLines, 2);
  assert.equal(layout.artistMaxLines, 2);
  assert.ok(layout.platformsY > layout.spectrumY);
});

test("layout engine returns rects and safe area for shared renderer", () => {
  const layout = getLayout({
    format: "story",
    style: "classic",
    width: 1080,
    height: 1920,
    platformText: "Available on: Apple Music • Spotify"
  });

  assert.equal(layout.safeArea.top, 120);
  assert.equal(layout.coverRect.width, 720);
  assert.ok(layout.titleRect.y > layout.coverRect.y + layout.coverRect.height);
  assert.ok(layout.visualizerRect.y > layout.artistRect.y);
  assert.ok(layout.platformRect.y > layout.visualizerRect.y);
});

test("split story layout expands cover to full-width hero area", () => {
  const layout = getVideoSnippetLayout("story", "poster-split", {
    platformText: "Available on: Apple Music • Spotify"
  });

  assert.equal(layout.coverX, 0);
  assert.equal(layout.coverWidth, 1080);
  assert.equal(layout.align, "center");
  assert.ok(layout.titleY > layout.coverY + layout.coverHeight);
  assert.ok(layout.spectrumWidth > 800);
});

test("effective segment clamps short tracks to real duration", () => {
  const segment = getEffectiveSegment({
    audioDuration: 9.5,
    startTime: 0,
    requestedDuration: 15
  });

  assert.deepEqual(segment, {
    startTime: 0,
    endTime: 9.5,
    durationSeconds: 9.5
  });
});

test("effective segment shifts start back when requested range would overflow", () => {
  const segment = getEffectiveSegment({
    audioDuration: 42,
    startTime: 36,
    requestedDuration: 15
  });

  assert.deepEqual(segment, {
    startTime: 27,
    endTime: 42,
    durationSeconds: 15
  });
});

test("style normalization preserves new presets and maps legacy aliases", () => {
  assert.equal(normalizeVideoSnippetStyle("default"), "classic");
  assert.equal(normalizeVideoSnippetStyle("split"), "poster-split");
  assert.equal(normalizeVideoSnippetStyle("glass"), "glass-card");
  assert.equal(normalizeVideoSnippetStyle("neon-wave"), "neon-wave");
});

test("drop effect options expose the expanded reactive visualizer presets", () => {
  assert.deepEqual(
    VIDEO_SNIPPET_DROP_EFFECTS.map((entry) => entry.value),
    [
      "auto",
      "bass-hit",
      "zoom-pulse",
      "glow-burst",
      "camera-shake",
      "flash",
      "wave-explosion",
      "orb-expansion",
      "beat-bounce"
    ]
  );
});
