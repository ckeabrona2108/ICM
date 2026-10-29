import assert from "node:assert/strict";
import test from "node:test";

import { createSnippetFrameAnalyzer, mixToMono, SNIPPET_ANALYSER_FFT_SIZE } from "@/lib/snippet-audio-frames";

const SAMPLE_RATE = 48000;

function sine(frequency: number, seconds: number, amplitude = 0.8) {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
  }
  return samples;
}

test("silence produces an empty spectrum and a flat waveform", () => {
  const analyzer = createSnippetFrameAnalyzer({ mono: new Float32Array(SAMPLE_RATE), sampleRate: SAMPLE_RATE, fps: 30 });
  const frame = analyzer.frameAt(0.5);
  assert.equal(frame.frequencyData.length, SNIPPET_ANALYSER_FFT_SIZE / 2);
  assert.ok(frame.frequencyData.every((value) => value === 0));
  assert.ok(frame.waveformData.every((value) => value === 128));
});

test("a pure tone peaks in its own frequency bin", () => {
  const binWidth = SAMPLE_RATE / SNIPPET_ANALYSER_FFT_SIZE;
  const targetBin = 10;
  const analyzer = createSnippetFrameAnalyzer({ mono: sine(binWidth * targetBin, 1, 0.005), sampleRate: SAMPLE_RATE, fps: 30 });
  let frame = analyzer.frameAt(0.1);
  for (let time = 0.1; time < 0.8; time += 1 / 30) {
    frame = analyzer.frameAt(time);
  }
  const peakBin = frame.frequencyData.indexOf(Math.max(...frame.frequencyData));
  assert.equal(peakBin, targetBin);
  assert.ok(frame.frequencyData[targetBin] > 100);
  assert.ok(frame.frequencyData[targetBin * 4] < frame.frequencyData[targetBin] - 60);
});

test("smoothing ramps the spectrum up instead of jumping", () => {
  const binWidth = SAMPLE_RATE / SNIPPET_ANALYSER_FFT_SIZE;
  // Quiet enough to stay below the -30 dB ceiling, where the byte value would saturate.
  const analyzer = createSnippetFrameAnalyzer({ mono: sine(binWidth * 8, 1, 0.005), sampleRate: SAMPLE_RATE, fps: 30 });
  const first = analyzer.frameAt(0.2).frequencyData[8];
  const later = analyzer.frameAt(0.2 + 1 / 30).frequencyData[8];
  assert.ok(later > first);
});

test("mixToMono averages channels", () => {
  const mono = mixToMono([new Float32Array([1, 0.5]), new Float32Array([0, 0.5])]);
  assert.deepEqual(Array.from(mono), [0.5, 0.5]);
});
