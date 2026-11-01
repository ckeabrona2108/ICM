/** Передача текста трека из мастера релиза в редактор караоке (через localStorage, т.к. открывается новая вкладка). */
export const KARAOKE_HANDOFF_KEY = "icm-karaoke-handoff-v1";

export type KaraokeHandoff = {
  artist?: string;
  title?: string;
  language?: string;
  lyrics?: string;
};

export function writeKaraokeHandoff(data: KaraokeHandoff) {
  try {
    window.localStorage.setItem(KARAOKE_HANDOFF_KEY, JSON.stringify(data));
  } catch {
    // Без хранилища редактор просто откроется пустым.
  }
}

export function takeKaraokeHandoff(): KaraokeHandoff | null {
  try {
    const raw = window.localStorage.getItem(KARAOKE_HANDOFF_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(KARAOKE_HANDOFF_KEY);
    return JSON.parse(raw) as KaraokeHandoff;
  } catch {
    return null;
  }
}
