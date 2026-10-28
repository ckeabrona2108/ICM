import { DEFAULT_PALETTE } from "./types";

type Rgb = [number, number, number];

function toHex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function saturation([r, g, b]: Rgb) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function luminance([r, g, b]: Rgb) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function distance(a: Rgb, b: Rgb) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Picks four colours from the cover: three vivid accents for blobs and light,
 * plus one deep colour for the base. Falls back to the ICM palette.
 */
export function extractPalette(image: CanvasImageSource | null): [string, string, string, string] {
  if (!image || typeof document === "undefined") return [...DEFAULT_PALETTE];
  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 40;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [...DEFAULT_PALETTE];

  try {
    context.drawImage(image, 0, 0, 40, 40);
    const { data } = context.getImageData(0, 0, 40, 40);
    // Bucket colours into a coarse 4-bit cube and keep the busiest buckets.
    const buckets = new Map<number, { sum: Rgb; count: number }>();
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { sum: [0, 0, 0] as Rgb, count: 0 };
      bucket.sum[0] += r;
      bucket.sum[1] += g;
      bucket.sum[2] += b;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
    const colours = [...buckets.values()].map((bucket) => ({
      rgb: bucket.sum.map((value) => value / bucket.count) as Rgb,
      count: bucket.count
    }));

    const vivid = colours
      .filter((colour) => luminance(colour.rgb) > 0.18 && luminance(colour.rgb) < 0.92)
      .sort((a, b) => b.count * (0.35 + saturation(b.rgb)) - a.count * (0.35 + saturation(a.rgb)));
    const accents: Rgb[] = [];
    for (const colour of vivid) {
      if (accents.every((picked) => distance(picked, colour.rgb) > 70)) accents.push(colour.rgb);
      if (accents.length === 3) break;
    }
    const fallbackAccents = DEFAULT_PALETTE.slice(0, 3);
    const accentHex = [0, 1, 2].map((index) => (accents[index] ? toHex(accents[index]) : fallbackAccents[index]));

    const darkest = [...colours].sort((a, b) => luminance(a.rgb) - luminance(b.rgb))[0]?.rgb;
    const base: Rgb = darkest ? [darkest[0] * 0.55, darkest[1] * 0.55, darkest[2] * 0.6] : [20, 17, 46];
    return [accentHex[0], accentHex[1], accentHex[2], toHex(base)];
  } catch {
    // A cross-origin cover cannot be read back; keep the brand palette.
    return [...DEFAULT_PALETTE];
  }
}
