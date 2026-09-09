"use client";

export const AUDIO_CLIP_MIN_SECONDS = 5;
export const AUDIO_CLIP_MAX_SECONDS = 30;

export interface AudioClipRange {
  startSec: number;
  durationSec: number;
}

export function normalizeAudioClipRange(
  input: AudioClipRange,
  sourceDurationSec: number
): AudioClipRange {
  const sourceDuration = Math.max(0, sourceDurationSec);
  const maxStart = Math.max(0, sourceDuration - AUDIO_CLIP_MIN_SECONDS);
  const startSec = Math.min(Math.max(0, input.startSec), maxStart);
  const remaining = Math.max(0, sourceDuration - startSec);
  const durationSec = Math.min(
    Math.max(AUDIO_CLIP_MIN_SECONDS, input.durationSec),
    AUDIO_CLIP_MAX_SECONDS,
    remaining
  );

  return { startSec, durationSec };
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeAudioBufferAsWav(
  source: AudioBuffer,
  range: AudioClipRange
): Blob {
  const sampleRate = source.sampleRate;
  const channelCount = Math.min(Math.max(source.numberOfChannels, 1), 2);
  const startFrame = Math.floor(range.startSec * sampleRate);
  const frameCount = Math.max(1, Math.floor(range.durationSec * sampleRate));
  const bytesPerSample = 2;
  const dataSize = frameCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: channelCount }, (_, index) =>
    source.getChannelData(index)
  );
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = channels[channel]?.[startFrame + frame] ?? 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  try {
    return await context.decodeAudioData(data.slice(0));
  } finally {
    await context.close().catch(() => undefined);
  }
}

function buildWaveformPeaks(source: AudioBuffer, barCount: number): number[] {
  const count = Math.min(Math.max(Math.floor(barCount), 48), 240);
  const framesPerBar = Math.max(1, Math.floor(source.length / count));
  const channels = Array.from({ length: source.numberOfChannels }, (_, index) =>
    source.getChannelData(index)
  );
  const peaks = Array.from({ length: count }, (_, barIndex) => {
    const start = barIndex * framesPerBar;
    const end = Math.min(source.length, start + framesPerBar);
    let peak = 0;
    for (let frame = start; frame < end; frame += 1) {
      for (const channel of channels) {
        peak = Math.max(peak, Math.abs(channel[frame] ?? 0));
      }
    }
    return peak;
  });
  const maxPeak = Math.max(...peaks, 0.001);
  return peaks.map((peak) => Math.max(0.06, peak / maxPeak));
}

export async function loadAudioWaveformFromUrl(
  url: string,
  barCount = 144
): Promise<{ blob: Blob; durationSec: number; peaks: number[] }> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить исходный трек.");
  const blob = await response.blob();
  const decoded = await decodeAudio(await blob.arrayBuffer());
  return {
    blob,
    durationSec: decoded.duration,
    peaks: buildWaveformPeaks(decoded, barCount)
  };
}

export async function createWavClipFromBlob(
  blob: Blob,
  requestedRange: AudioClipRange
): Promise<{ blob: Blob; durationSec: number; sourceDurationSec: number }> {
  const decoded = await decodeAudio(await blob.arrayBuffer());
  const range = normalizeAudioClipRange(requestedRange, decoded.duration);
  if (range.durationSec < AUDIO_CLIP_MIN_SECONDS) {
    throw new Error("Аудиофайл должен быть длиннее 5 секунд.");
  }

  return {
    blob: encodeAudioBufferAsWav(decoded, range),
    durationSec: range.durationSec,
    sourceDurationSec: decoded.duration
  };
}

export async function createWavClipFromUrl(
  url: string,
  requestedRange: AudioClipRange
): Promise<{ blob: Blob; durationSec: number; sourceDurationSec: number }> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Не удалось загрузить исходный трек.");
  }
  return createWavClipFromBlob(await response.blob(), requestedRange);
}
