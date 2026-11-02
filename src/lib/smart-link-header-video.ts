/** Rules for an artist's own MP4 that replaces the cover in the smart link header. */

export type SmartLinkHeaderVideoSlot = "snippetVideoUrl" | "snippetVideoWideUrl";

export const HEADER_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const HEADER_VIDEO_MIN_SECONDS = 3;
export const HEADER_VIDEO_MAX_SECONDS = 60;

// The header crops with object-cover, so near-9:16 / near-16:9 clips look fine.
const SLOT_RATIO: Record<SmartLinkHeaderVideoSlot, { target: number; min: number; max: number }> = {
  snippetVideoUrl: { target: 9 / 16, min: 0.5, max: 0.66 },
  snippetVideoWideUrl: { target: 16 / 9, min: 1.6, max: 2 }
};

/** Checks the file itself before we spend time reading its metadata. */
export function checkHeaderVideoFile(file: { name: string; type: string; size: number }): string | null {
  const isMp4 = file.type === "video/mp4" || (!file.type && /\.mp4$/iu.test(file.name));
  if (!isMp4 || !/\.mp4$/iu.test(file.name)) {
    return "Нужен файл MP4 (H.264). Пересохраните видео в MP4 и попробуйте снова.";
  }
  if (file.size > HEADER_VIDEO_MAX_BYTES) {
    return "Видео больше 50 МБ. Сократите ролик или сожмите его.";
  }
  if (file.size === 0) {
    return "Файл пустой.";
  }
  return null;
}

/** Checks what the browser read from the video: length and frame shape for the slot. */
export function checkHeaderVideoMetadata(
  slot: SmartLinkHeaderVideoSlot,
  meta: { duration: number; width: number; height: number }
): string | null {
  if (!meta.width || !meta.height || !Number.isFinite(meta.duration)) {
    return "Браузер не смог открыть это видео. Пересохраните его в MP4 с кодеком H.264.";
  }
  if (meta.duration < HEADER_VIDEO_MIN_SECONDS) {
    return `Видео слишком короткое — нужно хотя бы ${HEADER_VIDEO_MIN_SECONDS} секунды.`;
  }
  if (meta.duration > HEADER_VIDEO_MAX_SECONDS + 0.5) {
    return `Видео длиннее ${HEADER_VIDEO_MAX_SECONDS} секунд. Обрежьте его.`;
  }
  const ratio = meta.width / meta.height;
  const allowed = SLOT_RATIO[slot];
  if (ratio < allowed.min || ratio > allowed.max) {
    return slot === "snippetVideoUrl"
      ? "Для телефона нужно вертикальное видео 9:16 (например, 1080×1920)."
      : "Для компьютера нужно горизонтальное видео 16:9 (например, 1920×1080).";
  }
  return null;
}
