import type { AudioFeatures } from "./types";

const SPECTRUM_BANDS = 48;

function averageRange(data: Uint8Array, from: number, to: number) {
  const start = Math.max(0, Math.floor(from));
  const end = Math.min(data.length, Math.max(start + 1, Math.floor(to)));
  let sum = 0;
  for (let index = start; index < end; index += 1) sum += data[index] ?? 0;
  return sum / Math.max(1, end - start) / 255;
}

function approach(current: number, target: number, attack: number, release: number, dt: number) {
  const rate = target > current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Turns raw analyser bytes into stable 0..1 features. State carries between
 * calls, so the same frame sequence always yields the same values — the live
 * preview and the offline export animate identically.
 */
export class AudioFeatureTracker {
  private bass = 0;
  private mid = 0;
  private treble = 0;
  private energy = 0;
  private kick = 0;
  private bassFloor = 0;
  private spectrum = new Float32Array(SPECTRUM_BANDS);

  reset() {
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.energy = 0;
    this.kick = 0;
    this.bassFloor = 0;
    this.spectrum = new Float32Array(SPECTRUM_BANDS);
  }

  update(frequencyData: Uint8Array | null, dt: number): AudioFeatures {
    const step = Math.min(0.1, Math.max(1 / 240, dt));
    const data = frequencyData ?? new Uint8Array(0);
    const bins = data.length;

    const rawBass = bins ? averageRange(data, 1, bins * 0.06) : 0;
    const rawMid = bins ? averageRange(data, bins * 0.06, bins * 0.3) : 0;
    const rawTreble = bins ? averageRange(data, bins * 0.3, bins * 0.8) : 0;

    this.bass = approach(this.bass, rawBass, 28, 7, step);
    this.mid = approach(this.mid, rawMid, 20, 6, step);
    this.treble = approach(this.treble, rawTreble, 24, 8, step);
    this.energy = approach(this.energy, rawBass * 0.5 + rawMid * 0.35 + rawTreble * 0.15, 10, 3, step);

    // A kick is bass rising clearly above its slow-moving floor.
    this.bassFloor = approach(this.bassFloor, rawBass, 2.2, 2.2, step);
    const transient = Math.max(0, rawBass - this.bassFloor - 0.04) * 4.5;
    this.kick = Math.max(Math.min(1, transient), this.kick * Math.exp(-step * 7.5));

    if (bins) {
      // Log-spaced bands so bass and mids get room, like a real spectrum display.
      for (let band = 0; band < SPECTRUM_BANDS; band += 1) {
        const from = Math.pow(bins * 0.75, band / SPECTRUM_BANDS);
        const to = Math.pow(bins * 0.75, (band + 1) / SPECTRUM_BANDS) + 1;
        const value = averageRange(data, from, to);
        this.spectrum[band] = approach(this.spectrum[band], value, 30, 9, step);
      }
    } else {
      for (let band = 0; band < SPECTRUM_BANDS; band += 1) {
        this.spectrum[band] = approach(this.spectrum[band], 0, 30, 9, step);
      }
    }

    return {
      bass: this.bass,
      mid: this.mid,
      treble: this.treble,
      energy: this.energy,
      kick: this.kick,
      spectrum: this.spectrum
    };
  }
}
