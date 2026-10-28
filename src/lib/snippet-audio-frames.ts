/**
 * Offline equivalent of the preview's AnalyserNode (fftSize 512, smoothing 0.82,
 * -100..-30 dB). Exported videos are rendered frame by frame from the decoded
 * PCM, so every frame gets the same spectrum the live preview would have shown
 * at that moment — no dropped frames, no dependency on playback timing.
 */

export const SNIPPET_ANALYSER_FFT_SIZE = 512;
export const SNIPPET_ANALYSER_SMOOTHING = 0.82;
export const SNIPPET_ANALYSER_MIN_DB = -100;
export const SNIPPET_ANALYSER_MAX_DB = -30;

// The preview reads the analyser once per animation frame (~60 Hz).
const PREVIEW_READS_PER_SECOND = 60;

export interface SnippetAudioFrame {
  frequencyData: Uint8Array<ArrayBuffer>;
  waveformData: Uint8Array<ArrayBuffer>;
}

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (const channel of channels) {
    for (let index = 0; index < length; index += 1) {
      mono[index] += channel[index] ?? 0;
    }
  }
  const scale = 1 / channels.length;
  for (let index = 0; index < length; index += 1) {
    mono[index] *= scale;
  }
  return mono;
}

function createBlackmanWindow(size: number) {
  const alpha = 0.16;
  const a0 = 0.5 * (1 - alpha);
  const a1 = 0.5;
  const a2 = 0.5 * alpha;
  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    const phase = (2 * Math.PI * index) / size;
    window[index] = a0 - a1 * Math.cos(phase) + a2 * Math.cos(2 * phase);
  }
  return window;
}

function createBitReversal(size: number) {
  const bits = Math.log2(size);
  const table = new Uint32Array(size);
  for (let index = 0; index < size; index += 1) {
    let reversed = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      reversed = (reversed << 1) | ((index >> bit) & 1);
    }
    table[index] = reversed;
  }
  return table;
}

function fftInPlace(real: Float32Array, imag: Float32Array, reversal: Uint32Array) {
  const size = real.length;
  for (let index = 0; index < size; index += 1) {
    const target = reversal[index];
    if (target > index) {
      [real[index], real[target]] = [real[target], real[index]];
      [imag[index], imag[target]] = [imag[target], imag[index]];
    }
  }
  for (let span = 2; span <= size; span *= 2) {
    const half = span / 2;
    const step = (-2 * Math.PI) / span;
    for (let start = 0; start < size; start += span) {
      for (let offset = 0; offset < half; offset += 1) {
        const angle = step * offset;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const evenIndex = start + offset;
        const oddIndex = evenIndex + half;
        const oddReal = real[oddIndex] * cos - imag[oddIndex] * sin;
        const oddImag = real[oddIndex] * sin + imag[oddIndex] * cos;
        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;
      }
    }
  }
}

/**
 * Returns a sequential reader: call `frameAt` with increasing times (seconds into
 * the track). Smoothing carries over between calls exactly like the live analyser.
 */
export function createSnippetFrameAnalyzer(params: { mono: Float32Array; sampleRate: number; fps: number }) {
  const { mono, sampleRate, fps } = params;
  const size = SNIPPET_ANALYSER_FFT_SIZE;
  const binCount = size / 2;
  const window = createBlackmanWindow(size);
  const reversal = createBitReversal(size);
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  const smoothed = new Float32Array(binCount);
  // Keep the visual inertia of the 60 Hz preview at any export frame rate.
  const smoothing = Math.pow(SNIPPET_ANALYSER_SMOOTHING, PREVIEW_READS_PER_SECOND / Math.max(1, fps));
  const dbRange = SNIPPET_ANALYSER_MAX_DB - SNIPPET_ANALYSER_MIN_DB;

  function frameAt(timeSeconds: number): SnippetAudioFrame {
    const end = Math.round(timeSeconds * sampleRate);
    const start = end - size;

    for (let index = 0; index < size; index += 1) {
      const sampleIndex = start + index;
      const sample = sampleIndex >= 0 && sampleIndex < mono.length ? mono[sampleIndex] : 0;
      real[index] = sample * window[index];
      imag[index] = 0;
    }

    const waveformData = new Uint8Array(binCount);
    for (let index = 0; index < binCount; index += 1) {
      const sampleIndex = start + index;
      const sample = sampleIndex >= 0 && sampleIndex < mono.length ? mono[sampleIndex] : 0;
      waveformData[index] = Math.max(0, Math.min(255, Math.floor(128 * (1 + sample))));
    }

    fftInPlace(real, imag, reversal);

    const frequencyData = new Uint8Array(binCount);
    for (let bin = 0; bin < binCount; bin += 1) {
      const magnitude = Math.hypot(real[bin], imag[bin]) / size;
      smoothed[bin] = smoothing * smoothed[bin] + (1 - smoothing) * magnitude;
      const db = smoothed[bin] > 0 ? 20 * Math.log10(smoothed[bin]) : -Infinity;
      const scaled = (255 / dbRange) * (db - SNIPPET_ANALYSER_MIN_DB);
      frequencyData[bin] = Number.isFinite(scaled) ? Math.max(0, Math.min(255, Math.floor(scaled))) : 0;
    }

    return { frequencyData, waveformData };
  }

  return { frameAt };
}
