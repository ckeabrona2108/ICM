"use client";

import { SceneRenderer } from "./scene/render-scene";
import type { SceneAssets, SceneSettings } from "./scene/types";

export type ShareKitItemId = "story" | "square" | "canvas" | "poster" | "post";

export interface ShareKitItemInfo {
  id: ShareKitItemId;
  kind: "video" | "image";
  label: string;
  hint: string;
  width: number;
  height: number;
  /** Name inside the archive, without the release prefix. */
  fileName: string;
}

export const SHARE_KIT_ITEMS: ShareKitItemInfo[] = [
  { id: "story", kind: "video", label: "Ролик 9:16", hint: "Reels · TikTok · Shorts · VK Клипы", width: 1080, height: 1920, fileName: "reels-9x16.mp4" },
  { id: "square", kind: "video", label: "Ролик 1:1", hint: "Пост в ленту VK и Telegram", width: 1080, height: 1080, fileName: "post-1x1.mp4" },
  { id: "canvas", kind: "video", label: "Видеообложка", hint: "Spotify Canvas · 8 секунд по кругу, без звука и текста", width: 720, height: 1280, fileName: "canvas-9x16.mp4" },
  { id: "poster", kind: "image", label: "Сторис-картинка", hint: "Сторис со стикером ссылки", width: 1080, height: 1920, fileName: "story-9x16.png" },
  { id: "post", kind: "image", label: "Пост 4:5", hint: "Карусель и пост в Instagram", width: 1080, height: 1350, fileName: "post-4x5.png" }
];

export const CANVAS_SECONDS = 8;
/** How long the end of the Canvas loop dissolves into its first frame. */
const CANVAS_SEAM_SECONDS = 0.6;

/** Spotify rejects Canvas with text, links or logos, so only the moving picture stays. */
export function canvasSceneSettings(settings: SceneSettings): SceneSettings {
  return {
    ...settings,
    text: { badge: "", title: " ", artist: " ", cta: "", link: "" },
    showLink: false,
    endCard: false,
    watermark: false,
    lyrics: { ...settings.lyrics, mode: "off" }
  };
}

/**
 * Draws a Canvas frame and, near the end, fades in the very first frame,
 * so the loop restarts on exactly the picture it is showing.
 */
export function createLoopDrawer(renderer: SceneRenderer, settings: SceneSettings, assets: SceneAssets, clipDuration: number) {
  let firstFrame: HTMLCanvasElement | null = null;
  return (context: CanvasRenderingContext2D, width: number, height: number, input: { time: number; trackTime: number; trackDuration: number; frequencyData: Uint8Array | null }) => {
    renderer.render(context, width, height, settings, { ...input, clipDuration, dropTime: null, loop: true }, assets);
    if (!firstFrame) {
      firstFrame = document.createElement("canvas");
      firstFrame.width = width;
      firstFrame.height = height;
      firstFrame.getContext("2d")?.drawImage(context.canvas, 0, 0);
      return;
    }
    const seamStart = clipDuration - CANVAS_SEAM_SECONDS;
    if (input.time <= seamStart) return;
    context.save();
    context.globalAlpha = Math.min(1, (input.time - seamStart) / CANVAS_SEAM_SECONDS);
    context.drawImage(firstFrame, 0, 0);
    context.restore();
  };
}

/** One settled frame of the scene as a PNG: no entrance animation and no end card. */
export async function renderSceneStill(settings: SceneSettings, assets: SceneAssets, width: number, height: number, clipDuration: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas недоступен");
  const renderer = new SceneRenderer();
  const input = { time: 1.5, clipDuration, trackTime: 1.5, trackDuration: clipDuration, dropTime: null, frequencyData: null, still: true };
  // A few frames let the smoothed audio features and cached layers settle.
  for (let index = 0; index < 3; index += 1) renderer.render(context, width, height, settings, input, assets);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Не удалось сохранить картинку"))), "image/png");
  });
}

export interface ShareKitCaption {
  id: string;
  platform: string;
  text: string;
}

function hashtag(value: string) {
  const tag = value.replace(/[^\p{L}\p{N}]+/gu, "");
  return tag ? `#${tag.toLowerCase()}` : "";
}

/** Ready-to-paste captions, one per platform, in each platform's usual voice. */
export function buildShareKitCaptions(params: { title: string; artist: string; link: string; releaseDate: string | null }): ShareKitCaption[] {
  const title = params.title.trim() || "Новый трек";
  const artist = params.artist.trim() || "Артист";
  const date = params.releaseDate ? new Date(params.releaseDate) : null;
  const upcoming = Boolean(date && !Number.isNaN(date.getTime()) && date.getTime() > Date.now());
  const day = upcoming && date ? date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";
  // Cyrillic slugs come percent-encoded; people should see (and paste) the readable form.
  let link = params.link.trim();
  try {
    link = decodeURI(link);
  } catch {
    // Keep the encoded link when it is not valid URI encoding.
  }
  const tags = [hashtag(artist), hashtag(title), upcoming ? "#премьера" : "#новаямузыка", "#музыка"].filter(Boolean).join(" ");
  const linkLine = link ? (upcoming ? `Пресейв: ${link}` : `Слушать: ${link}`) : "";

  const short = upcoming ? `«${title}» выходит ${day} 🔥 Пресейв — ссылка в профиле` : `«${title}» уже на всех площадках 🔥 Ссылка в профиле`;

  return [
    { id: "tiktok", platform: "TikTok · Reels · Shorts", text: `${short}\n\n${tags}` },
    {
      id: "vk",
      platform: "VK",
      text: [`${artist} — «${title}»`, upcoming ? `Премьера ${day}. Сохрани трек заранее, чтобы услышать его первым.` : "Трек уже вышел на всех площадках. Включай и делись с друзьями!", linkLine, tags]
        .filter(Boolean)
        .join("\n\n")
    },
    {
      id: "telegram",
      platform: "Telegram",
      text: [`🎧 ${upcoming ? "Скоро" : "Вышло"}: ${artist} — «${title}»`, upcoming ? `Релиз ${day}. Жмите пресейв, в день выхода пришлю напоминание.` : "Слушайте на любой площадке, ссылка ниже 👇", linkLine]
        .filter(Boolean)
        .join("\n\n")
    }
  ];
}

// --- Minimal ZIP (stored, no compression): MP4 and PNG are already compressed. ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export async function zipFiles(files: Array<{ name: string; blob: Blob }>) {
  const encoder = new TextEncoder();
  const { time, day } = dosDateTime(new Date());
  const parts: BlobPart[] = [];
  const central: ArrayBuffer[] = [];
  let offset = 0;

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const name = encoder.encode(file.name);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(local.buffer, name, data);

    const entry = new DataView(new ArrayBuffer(46 + name.length));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, day, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    new Uint8Array(entry.buffer).set(name, 46);
    central.push(entry.buffer);

    offset += 30 + name.length + data.length;
  }

  const centralSize = central.reduce((sum, entry) => sum + entry.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}
