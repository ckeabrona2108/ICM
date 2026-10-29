export type SnippetFormatId = "story" | "square" | "wide";

export const SNIPPET_FORMATS: Record<SnippetFormatId, { width: number; height: number; label: string; hint: string }> = {
  story: { width: 1080, height: 1920, label: "9:16", hint: "Reels · TikTok · Shorts · VK Клипы" },
  square: { width: 1080, height: 1080, label: "1:1", hint: "Пост в ленту" },
  wide: { width: 1920, height: 1080, label: "16:9", hint: "YouTube · Telegram" }
};

export type TemplateId =
  | "premiere"
  | "vinyl"
  | "headline"
  | "glitch"
  | "orb"
  | "duotone"
  | "film"
  | "halftone"
  | "glass"
  | "echo"
  | "player"
  | "poster";

export type TemplateCategory = "classic" | "design" | "audio";

export type BackgroundId =
  | "cover-blur"
  | "lava"
  | "aurora"
  | "haze"
  | "mesh"
  | "bokeh"
  | "liquid"
  | "nebula"
  | "pulse"
  | "solid";

export type SpectrumStyle = "bars" | "line" | "dots" | "off";
export type TextAnimation = "static" | "fade" | "kinetic" | "bass";

export interface SceneText {
  badge: string;
  title: string;
  artist: string;
  cta: string;
  link: string;
}

export interface SceneFx {
  /** 0..1 — how much the cover breathes with the bass. */
  bassPulse: number;
  /** 0..1 — camera push-in on kicks. */
  cameraZoom: number;
  /** 0..1 — glow around the cover on loud parts. */
  glow: number;
  dropHit: boolean;
  kickGlitch: boolean;
  shake: boolean;
  flash: boolean;
  /** Slow push-in inside the cover frame over the whole clip. */
  kenBurns: boolean;
  /** Soft dust drifting up through the frame, brighter on the bass. */
  particles: boolean;
  /** Star glints around the cover on every kick. */
  sparkles: boolean;
  /** Warm light sweeping across the frame, flaring on the drop. */
  lightLeak: boolean;
  /** Cinema bars top and bottom. */
  letterbox: boolean;
}

export interface LyricLine {
  text: string;
  /** Seconds into the whole track, so the timing survives moving the clip. */
  start: number;
}

export type LyricsMode = "off" | "karaoke" | "background";
export type LyricsPosition = "top" | "middle" | "bottom";

export interface SceneLayout {
  /** 0.6..1.4 — size of the main visual (cover, record, phone, orb). */
  coverScale: number;
  /** -0.25..0.25 of the frame height. */
  coverShiftY: number;
  /** -0.25..0.25 of the frame height. */
  textShiftY: number;
}

export interface SceneSettings {
  template: TemplateId;
  background: BackgroundId;
  /** 0 slow · 1 calm · 2 lively */
  backgroundSpeed: 0 | 1 | 2;
  /** 0..1 */
  backgroundBlur: number;
  backgroundBeat: boolean;
  grain: boolean;
  palette: [string, string, string, string];
  fx: SceneFx;
  spectrum: SpectrumStyle;
  text: SceneText;
  textAnimation: TextAnimation;
  showLink: boolean;
  endCard: boolean;
  watermark: boolean;
  /** 0..1 — how much the template floats, sways and drifts on its own, even between beats. */
  motion: number;
  layout: SceneLayout;
  lyrics: { mode: LyricsMode; position: LyricsPosition; lines: LyricLine[] };
}

export interface AudioFeatures {
  /** Smoothed band energies, 0..1. */
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  /** Fast envelope that jumps on every kick and decays, 0..1. */
  kick: number;
  /** 48 smoothed spectrum bands, 0..1. */
  spectrum: Float32Array;
}

export interface SceneFrame {
  /** Seconds since the start of the clip. */
  time: number;
  clipDuration: number;
  /** Seconds into the whole track. */
  trackTime: number;
  trackDuration: number;
  /** Drop moment in clip seconds, or null when the drop is outside the clip. */
  dropTime: number | null;
  /** Monotonic frame counter, used to seed per-frame noise deterministically. */
  frameIndex: number;
  /** Paused preview: show the settled layout instead of entrance animations. */
  still: boolean;
  audio: AudioFeatures;
}

export interface SceneAssets {
  cover: HTMLImageElement | ImageBitmap | null;
  /** Bumps whenever the cover changes, so cached derivatives get rebuilt. */
  coverKey: string;
}

export const TEMPLATE_LIST: Array<{ id: TemplateId; name: string; category: TemplateCategory; description: string }> = [
  { id: "premiere", name: "Премьера", category: "classic", description: "Обложка пульсирует от баса, дата и смарт-линк" },
  { id: "vinyl", name: "Винил", category: "classic", description: "Пластинка вращается, обложка в центре" },
  { id: "glass", name: "Стекло", category: "classic", description: "Матовая карточка поверх живого фона" },
  { id: "player", name: "Плеер", category: "classic", description: "Телефон с музыкальным плеером" },
  { id: "headline", name: "Передовица", category: "design", description: "Газетная вёрстка, крупный заголовок" },
  { id: "poster", name: "Афиша", category: "design", description: "Ч/б обложка и журнальная типографика" },
  { id: "duotone", name: "Дуотон", category: "design", description: "Два цвета из палитры обложки" },
  { id: "halftone", name: "Растр", category: "design", description: "Печатный полутон, точки дышат от баса" },
  { id: "film", name: "Плёнка", category: "design", description: "Кадровое окно, зерно, лёгкий дрейф" },
  { id: "glitch", name: "Сбой", category: "audio", description: "RGB-сдвиг и полосы на каждую бочку" },
  { id: "orb", name: "Неон-орб", category: "audio", description: "Светящееся кольцо и круговой спектр" },
  { id: "echo", name: "Эхо", category: "audio", description: "Название повторяется стопкой на каждую долю" }
];

export const BACKGROUND_LIST: Array<{ id: BackgroundId; name: string; description: string }> = [
  { id: "cover-blur", name: "Размытая обложка", description: "Обложка на весь кадр, сильно размыта" },
  { id: "lava", name: "Лава", description: "Пятна цвета обложки плавают и сливаются" },
  { id: "aurora", name: "Аврора", description: "Ленты света волнами проходят через кадр" },
  { id: "haze", name: "Дымка", description: "Обложка медленно «дышит» и поворачивается" },
  { id: "mesh", name: "Mesh", description: "Углы кадра плавно меняются цветами" },
  { id: "bokeh", name: "Боке", description: "Мягкие огни поднимаются снизу вверх" },
  { id: "liquid", name: "Жидкое стекло", description: "Обложка переливается по спектру" },
  { id: "nebula", name: "Туманность", description: "Цветовой вихрь медленно вращается" },
  { id: "pulse", name: "Пульс", description: "Пятна вздрагивают в темп трека" },
  { id: "solid", name: "Однотонный", description: "Тёмный цвет из палитры" }
];

export const DEFAULT_PALETTE: [string, string, string, string] = ["#7b61ff", "#ff6fb5", "#22d3ee", "#14112e"];

export function createDefaultSceneSettings(): SceneSettings {
  return {
    template: "premiere",
    background: "lava",
    backgroundSpeed: 1,
    backgroundBlur: 0.6,
    backgroundBeat: true,
    grain: true,
    palette: [...DEFAULT_PALETTE],
    fx: {
      bassPulse: 0.7,
      cameraZoom: 0.45,
      glow: 0.6,
      dropHit: true,
      kickGlitch: false,
      shake: false,
      flash: true,
      kenBurns: true,
      particles: true,
      sparkles: false,
      lightLeak: false,
      letterbox: false
    },
    spectrum: "bars",
    text: { badge: "", title: "", artist: "", cta: "Слушай на всех площадках", link: "" },
    textAnimation: "fade",
    showLink: true,
    endCard: true,
    watermark: true,
    motion: 0.6,
    layout: { coverScale: 1, coverShiftY: 0, textShiftY: 0 },
    lyrics: { mode: "off", position: "bottom", lines: [] }
  };
}
