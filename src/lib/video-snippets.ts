export type VideoSnippetFormat = "story" | "square";
export type VideoSnippetDuration = 15 | 30 | 60;
export type VideoSnippetStyle =
  | "classic"
  | "left-align"
  | "neon-wave"
  | "glass-card"
  | "retro-vhs"
  | "poster-split"
  | "vinyl-rotation"
  | "glitch"
  | "default"
  | "split"
  | "polaroid"
  | "glass"
  | "vinyl"
  | "neon"
  | "vhs";
export type VideoSnippetSpectrum = "bars" | "wave" | "circle" | "neon-orb" | "off";
export type VideoSnippetBackground =
  | "auto-cover"
  | "custom-image"
  | "gradient"
  | "solid-color"
  | "animated-gradient";
export type VideoSnippetDropEffect =
  | "auto"
  | "bass-hit"
  | "zoom-pulse"
  | "glow-burst"
  | "camera-shake"
  | "flash"
  | "wave-explosion"
  | "orb-expansion"
  | "beat-bounce"
  | "bounce"
  | "fly-up"
  | "shake"
  | "scale-hit";
export type VideoSnippetPlatformPreset =
  | "none"
  | "all-platforms"
  | "listen-ru"
  | "available-en"
  | "custom";
export type VideoSnippetTextFont = "inter" | "space-grotesk" | "montserrat" | "serif" | "mono";
export type VideoSnippetTextAnimation = "off" | "pulse" | "float";

export interface SnippetMomentAnalysis {
  introEnd: number;
  chorusStart: number;
  dropAt: number;
  peakAt: number;
  confidence: number;
}

export interface EffectiveSegmentInput {
  audioDuration: number;
  startTime: number;
  requestedDuration: number;
}

export interface EffectiveSegment {
  startTime: number;
  endTime: number;
  durationSeconds: number;
}

export const LEGACY_VIDEO_SNIPPET_STYLE_ALIASES = {
  default: "classic",
  split: "poster-split",
  glass: "glass-card",
  vhs: "retro-vhs",
  vinyl: "vinyl-rotation",
  neon: "neon-wave"
} as const satisfies Partial<Record<VideoSnippetStyle, VideoSnippetStyle>>;

const CANONICAL_VIDEO_SNIPPET_STYLES = new Set<VideoSnippetStyle>([
  "classic",
  "left-align",
  "neon-wave",
  "glass-card",
  "retro-vhs",
  "polaroid",
  "poster-split",
  "vinyl-rotation",
  "glitch"
]);

export const VIDEO_SNIPPET_FORMATS: Array<{
  value: VideoSnippetFormat;
  label: string;
  ratio: string;
  description: string;
}> = [
  { value: "story", label: "9:16", ratio: "Stories / Reels / Shorts", description: "Вертикальный формат" },
  { value: "square", label: "1:1", ratio: "Square", description: "Для лент и промо-постов" }
];

export const VIDEO_SNIPPET_COMPOSITION_SIZES: Record<
  VideoSnippetFormat,
  {
    width: number;
    height: number;
  }
> = {
  story: {
    width: 1080,
    height: 1920
  },
  square: {
    width: 1080,
    height: 1080
  }
};

export function getVideoSnippetCompositionSize(format: VideoSnippetFormat) {
  return VIDEO_SNIPPET_COMPOSITION_SIZES[format];
}

export interface VideoSnippetLayout {
  canvasWidth: number;
  canvasHeight: number;
  coverX: number;
  coverY: number;
  coverWidth: number;
  coverHeight: number;
  coverRadius: number;
  textX: number;
  titleY: number;
  artistY: number;
  platformsY: number;
  spectrumX: number;
  spectrumY: number;
  spectrumWidth: number;
  spectrumHeight: number;
  align: "left" | "center";
  titleMaxWidth: number;
  artistMaxWidth: number;
  platformsMaxWidth: number;
  titleBaseSize: number;
  artistBaseSize: number;
  platformsBaseSize: number;
  textOffsetY: number;
  titleWeight: number;
  safeBottom: number;
  showPlatforms: boolean;
  titleMaxLines: number;
  artistMaxLines: number;
  platformMaxLines: number;
}

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutEngineResult {
  width: number;
  height: number;
  safeArea: SafeAreaInsets;
  coverRect: LayoutRect;
  titleRect: LayoutRect;
  artistRect: LayoutRect;
  visualizerRect: LayoutRect;
  platformRect: LayoutRect;
  align: "left" | "center";
  coverRadius: number;
  titleBaseSize: number;
  artistBaseSize: number;
  platformBaseSize: number;
  titleWeight: number;
  titleMaxLines: number;
  artistMaxLines: number;
  platformMaxLines: number;
  showPlatforms: boolean;
}

function clampLayout(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeVideoSnippetStyle(style: VideoSnippetStyle): VideoSnippetStyle {
  return LEGACY_VIDEO_SNIPPET_STYLE_ALIASES[style as keyof typeof LEGACY_VIDEO_SNIPPET_STYLE_ALIASES] ?? style;
}

export function isCanonicalVideoSnippetStyle(style: VideoSnippetStyle): boolean {
  return CANONICAL_VIDEO_SNIPPET_STYLES.has(style);
}

export function getEffectiveSegment(input: EffectiveSegmentInput): EffectiveSegment {
  const audioDuration = Math.max(0, input.audioDuration || 0);
  const requestedDuration = Math.max(0, input.requestedDuration || 0);

  if (audioDuration <= 0 || requestedDuration <= 0) {
    return {
      startTime: 0,
      endTime: 0,
      durationSeconds: 0
    };
  }

  const durationSeconds = Math.min(requestedDuration, audioDuration);
  const maxStart = Math.max(0, audioDuration - durationSeconds);
  const startTime = clampLayout(input.startTime || 0, 0, maxStart);
  const endTime = Math.min(audioDuration, startTime + durationSeconds);

  return {
    startTime,
    endTime,
    durationSeconds: Math.max(0, endTime - startTime)
  };
}

export function isAcceptedImageFile(file: Pick<File, "name" | "type"> | null | undefined): boolean {
  if (!file) return false;
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
}

export function getVideoSnippetLayout(
  format: VideoSnippetFormat,
  stylePreset: VideoSnippetStyle,
  options?: {
    textOffsetY?: number;
    titleWeight?: number;
    platformText?: string;
  }
): VideoSnippetLayout {
  const normalizedStyle = normalizeVideoSnippetStyle(stylePreset);
  const size = getVideoSnippetCompositionSize(format);
  const titleWeight = clampLayout(options?.titleWeight ?? 800, 500, 900);
  const textOffsetY = options?.textOffsetY ?? 0;
  const hasPlatformText = Boolean(options?.platformText?.trim());

  if (format === "story") {
    const baseStory = {
      canvasWidth: size.width,
      canvasHeight: size.height,
      coverX: 180,
      coverY: 308,
      coverWidth: 720,
      coverHeight: 720,
      coverRadius: 42,
      textX: size.width / 2,
      align: "center" as const,
      titleMaxWidth: 880,
      artistMaxWidth: 720,
      platformsMaxWidth: 900,
      textOffsetY,
      titleWeight,
      safeBottom: 124,
      showPlatforms: hasPlatformText,
      titleMaxLines: 2,
      artistMaxLines: 2,
      platformMaxLines: 1
    };

    if (normalizedStyle === "poster-split") {
      return {
        ...baseStory,
        coverX: 0,
        coverY: 240,
        coverWidth: 1080,
        coverHeight: 690,
        coverRadius: 0,
        textX: size.width / 2,
        titleY: 1058 + textOffsetY,
        artistY: 1172 + textOffsetY,
        platformsY: 1670 + textOffsetY,
        spectrumX: 94,
        spectrumY: 1366 + textOffsetY,
        spectrumWidth: 892,
        spectrumHeight: 160,
        titleMaxWidth: 900,
        artistMaxWidth: 760,
        platformsMaxWidth: 860,
        titleBaseSize: 86,
        artistBaseSize: 46,
        platformsBaseSize: 26
      };
    }

    if (normalizedStyle === "polaroid") {
      return {
        ...baseStory,
        coverX: 196,
        coverY: 282,
        coverWidth: 688,
        coverHeight: 688,
        coverRadius: 20,
        titleY: 1198 + textOffsetY,
        artistY: 1304 + textOffsetY,
        platformsY: 1580 + textOffsetY,
        spectrumX: 116,
        spectrumY: 1436 + textOffsetY,
        spectrumWidth: 848,
        spectrumHeight: 118,
        titleBaseSize: 76,
        artistBaseSize: 40,
        platformsBaseSize: 24,
        platformMaxLines: 2
      };
    }

    if (normalizedStyle === "glass-card") {
      return {
        ...baseStory,
        coverX: 164,
        coverY: 268,
        coverWidth: 752,
        coverHeight: 752,
        coverRadius: 32,
        titleY: 1216 + textOffsetY,
        artistY: 1314 + textOffsetY,
        platformsY: 1592 + textOffsetY,
        spectrumX: 128,
        spectrumY: 1458 + textOffsetY,
        spectrumWidth: 824,
        spectrumHeight: 116,
        titleBaseSize: 78,
        artistBaseSize: 38,
        platformsBaseSize: 24
      };
    }

    if (normalizedStyle === "vinyl-rotation") {
      return {
        ...baseStory,
        coverX: 132,
        coverY: 440,
        coverWidth: 480,
        coverHeight: 480,
        coverRadius: 999,
        textX: 700,
        titleY: 824 + textOffsetY,
        artistY: 936 + textOffsetY,
        platformsY: 1570 + textOffsetY,
        spectrumX: 624,
        spectrumY: 1136 + textOffsetY,
        spectrumWidth: 244,
        spectrumHeight: 246,
        align: "left",
        titleMaxWidth: 264,
        artistMaxWidth: 264,
        platformsMaxWidth: 300,
        titleBaseSize: 70,
        artistBaseSize: 38,
        platformsBaseSize: 24,
        titleMaxLines: 3
      };
    }

    if (normalizedStyle === "neon-wave") {
      return {
        ...baseStory,
        coverX: 172,
        coverY: 300,
        coverWidth: 736,
        coverHeight: 736,
        coverRadius: 12,
        titleY: 1182 + textOffsetY,
        artistY: 1292 + textOffsetY,
        platformsY: 1634 + textOffsetY,
        spectrumX: 108,
        spectrumY: 1474 + textOffsetY,
        spectrumWidth: 864,
        spectrumHeight: 126,
        titleBaseSize: 82,
        artistBaseSize: 44,
        platformsBaseSize: 25
      };
    }

    if (normalizedStyle === "retro-vhs" || normalizedStyle === "glitch") {
      return {
        ...baseStory,
        coverX: 164,
        coverY: 330,
        coverWidth: 752,
        coverHeight: 752,
        coverRadius: 12,
        titleY: 1192 + textOffsetY,
        artistY: 1302 + textOffsetY,
        platformsY: 1604 + textOffsetY,
        spectrumX: 100,
        spectrumY: 1442 + textOffsetY,
        spectrumWidth: 880,
        spectrumHeight: 108,
        titleBaseSize: 76,
        artistBaseSize: 40,
        platformsBaseSize: 22,
        platformMaxLines: 2
      };
    }

    if (normalizedStyle === "left-align") {
      return {
        ...baseStory,
        textX: 116,
        align: "left",
        titleY: 1158 + textOffsetY,
        artistY: 1278 + textOffsetY,
        platformsY: 1656 + textOffsetY,
        spectrumX: 112,
        spectrumY: 1450 + textOffsetY,
        spectrumWidth: 856,
        spectrumHeight: 148,
        titleBaseSize: 84,
        artistBaseSize: 44,
        platformsBaseSize: 26,
        titleMaxWidth: 760,
        artistMaxWidth: 760,
        platformsMaxWidth: 760
      };
    }

    return {
      ...baseStory,
      titleY: 1158 + textOffsetY,
      artistY: 1278 + textOffsetY,
      platformsY: 1656 + textOffsetY,
      spectrumX: 112,
      spectrumY: 1450 + textOffsetY,
      spectrumWidth: 856,
      spectrumHeight: 148,
      titleBaseSize: 84,
      artistBaseSize: 44,
      platformsBaseSize: 26
    };
  }

  const baseSquare = {
    canvasWidth: size.width,
    canvasHeight: size.height,
    coverX: 182,
    coverY: 92,
    coverWidth: 716,
    coverHeight: 716,
    coverRadius: 34,
    textX: size.width / 2,
    titleY: 850 + textOffsetY,
    artistY: 936 + textOffsetY,
    platformsY: 1022 + textOffsetY,
    spectrumX: 110,
    spectrumY: 880 + textOffsetY,
    spectrumWidth: 860,
    spectrumHeight: 112,
    align: "center" as const,
    titleMaxWidth: 840,
    artistMaxWidth: 700,
    platformsMaxWidth: 840,
    titleBaseSize: 62,
    artistBaseSize: 34,
    platformsBaseSize: 22,
    textOffsetY,
    titleWeight,
    safeBottom: 74,
    showPlatforms: hasPlatformText,
    titleMaxLines: 2,
    artistMaxLines: 2,
    platformMaxLines: 2
  };

  if (normalizedStyle === "poster-split") {
    return {
      ...baseSquare,
      coverX: 0,
      coverY: 54,
      coverWidth: 1080,
      coverHeight: 430,
      coverRadius: 0,
      titleY: 610 + textOffsetY,
      artistY: 694 + textOffsetY,
      platformsY: 1014 + textOffsetY,
      spectrumX: 116,
      spectrumY: 802 + textOffsetY,
      spectrumWidth: 848,
      spectrumHeight: 114
    };
  }

  if (normalizedStyle === "vinyl-rotation") {
    return {
      ...baseSquare,
      coverX: 92,
      coverY: 244,
      coverWidth: 362,
      coverHeight: 362,
      coverRadius: 999,
      textX: 584,
      titleY: 276 + textOffsetY,
      artistY: 358 + textOffsetY,
      platformsY: 918 + textOffsetY,
      spectrumX: 570,
      spectrumY: 504 + textOffsetY,
      spectrumWidth: 276,
      spectrumHeight: 198,
      align: "left",
      titleMaxWidth: 314,
      artistMaxWidth: 314,
      platformsMaxWidth: 330,
      titleMaxLines: 3
    };
  }

  if (normalizedStyle === "polaroid") {
    return {
      ...baseSquare,
      coverX: 194,
      coverY: 74,
      coverWidth: 692,
      coverHeight: 692,
      coverRadius: 18,
      titleY: 862 + textOffsetY,
      artistY: 942 + textOffsetY,
      platformsY: 998 + textOffsetY,
      spectrumY: 880 + textOffsetY,
      spectrumHeight: 86
    };
  }

  if (normalizedStyle === "glass-card") {
    return {
      ...baseSquare,
      coverX: 166,
      coverY: 84,
      coverWidth: 748,
      coverHeight: 748,
      coverRadius: 28,
      titleY: 878 + textOffsetY,
      artistY: 954 + textOffsetY,
      platformsY: 1016 + textOffsetY,
      spectrumY: 896 + textOffsetY,
      spectrumHeight: 82
    };
  }

  if (normalizedStyle === "neon-wave") {
    return {
      ...baseSquare,
      coverX: 170,
      coverY: 102,
      coverWidth: 740,
      coverHeight: 740,
      coverRadius: 12,
      titleY: 858 + textOffsetY,
      artistY: 942 + textOffsetY,
      platformsY: 1016 + textOffsetY,
      spectrumX: 126,
      spectrumY: 898 + textOffsetY,
      spectrumWidth: 828,
      spectrumHeight: 90
    };
  }

  if (normalizedStyle === "retro-vhs" || normalizedStyle === "glitch") {
    return {
      ...baseSquare,
      coverX: 170,
      coverY: 104,
      coverWidth: 740,
      coverHeight: 740,
      coverRadius: 10,
      titleY: 858 + textOffsetY,
      artistY: 944 + textOffsetY,
      platformsY: 1012 + textOffsetY,
      spectrumX: 124,
      spectrumY: 902 + textOffsetY,
      spectrumWidth: 832,
      spectrumHeight: 82
    };
  }

  if (normalizedStyle === "left-align") {
    return {
      ...baseSquare,
      textX: 118,
      align: "left",
      titleMaxWidth: 760,
      artistMaxWidth: 760,
      platformsMaxWidth: 760
    };
  }

  return baseSquare;
}

export function getLayout(params: {
  format: VideoSnippetFormat;
  style: VideoSnippetStyle;
  width: number;
  height: number;
  platformText?: string;
  textOffsetY?: number;
  titleWeight?: number;
}): LayoutEngineResult {
  const { format, style, width, height, platformText, textOffsetY, titleWeight } = params;
  const baseSize = getVideoSnippetCompositionSize(format);
  const layout = getVideoSnippetLayout(format, style, { platformText, textOffsetY, titleWeight });
  const scaleX = width / baseSize.width;
  const scaleY = height / baseSize.height;
  const safeArea: SafeAreaInsets =
    format === "story"
      ? { top: 120 * scaleY, right: 90 * scaleX, bottom: layout.safeBottom * scaleY, left: 90 * scaleX }
      : { top: 72 * scaleY, right: 72 * scaleX, bottom: layout.safeBottom * scaleY, left: 72 * scaleX };

  return {
    width,
    height,
    safeArea,
    coverRect: {
      x: layout.coverX * scaleX,
      y: layout.coverY * scaleY,
      width: layout.coverWidth * scaleX,
      height: layout.coverHeight * scaleY
    },
    titleRect: {
      x: (layout.align === "center" ? layout.textX - layout.titleMaxWidth / 2 : layout.textX) * scaleX,
      y: layout.titleY * scaleY,
      width: layout.titleMaxWidth * scaleX,
      height: layout.titleBaseSize * layout.titleMaxLines * 1.2 * scaleY
    },
    artistRect: {
      x: (layout.align === "center" ? layout.textX - layout.artistMaxWidth / 2 : layout.textX) * scaleX,
      y: layout.artistY * scaleY,
      width: layout.artistMaxWidth * scaleX,
      height: layout.artistBaseSize * layout.artistMaxLines * 1.16 * scaleY
    },
    visualizerRect: {
      x: layout.spectrumX * scaleX,
      y: layout.spectrumY * scaleY,
      width: layout.spectrumWidth * scaleX,
      height: layout.spectrumHeight * scaleY
    },
    platformRect: {
      x: (layout.align === "center" ? layout.textX - layout.platformsMaxWidth / 2 : layout.textX) * scaleX,
      y: layout.platformsY * scaleY,
      width: layout.platformsMaxWidth * scaleX,
      height: layout.platformsBaseSize * layout.platformMaxLines * 1.16 * scaleY
    },
    align: layout.align,
    coverRadius: layout.coverRadius * Math.min(scaleX, scaleY),
    titleBaseSize: layout.titleBaseSize * Math.min(scaleX, scaleY),
    artistBaseSize: layout.artistBaseSize * Math.min(scaleX, scaleY),
    platformBaseSize: layout.platformsBaseSize * Math.min(scaleX, scaleY),
    titleWeight: layout.titleWeight,
    titleMaxLines: layout.titleMaxLines,
    artistMaxLines: layout.artistMaxLines,
    platformMaxLines: layout.platformMaxLines,
    showPlatforms: layout.showPlatforms
  };
}

export const VIDEO_SNIPPET_DURATIONS: Array<{ value: VideoSnippetDuration; label: string }> = [
  { value: 15, label: "15 сек" },
  { value: 30, label: "30 сек" },
  { value: 60, label: "60 сек" }
];

export const VIDEO_SNIPPET_STYLES: Array<{ value: VideoSnippetStyle; label: string; pro?: boolean }> = [
  { value: "classic", label: "Classic" },
  { value: "left-align", label: "Left Align" },
  { value: "neon-wave", label: "Neon Wave" },
  { value: "glass-card", label: "Glass Card" },
  { value: "retro-vhs", label: "Retro VHS" },
  { value: "polaroid", label: "Polaroid" },
  { value: "poster-split", label: "Poster Split" },
  { value: "vinyl-rotation", label: "Vinyl Rotation" },
  { value: "glitch", label: "Glitch" }
];

export const VIDEO_SNIPPET_SPECTRUMS: Array<{ value: VideoSnippetSpectrum; label: string }> = [
  { value: "bars", label: "Bars (Столбики)" },
  { value: "wave", label: "Wave (Линия)" },
  { value: "circle", label: "Circle" },
  { value: "neon-orb", label: "Neon Orb" },
  { value: "off", label: "Выкл" }
];

export const VIDEO_SNIPPET_TEXT_FONTS: Array<{ value: VideoSnippetTextFont; label: string }> = [
  { value: "inter", label: "Inter" },
  { value: "space-grotesk", label: "Space Grotesk" },
  { value: "montserrat", label: "Montserrat" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" }
];

export const VIDEO_SNIPPET_BACKGROUNDS: Array<{ value: VideoSnippetBackground; label: string }> = [
  { value: "auto-cover", label: "Авто из обложки" },
  { value: "custom-image", label: "Пользовательское изображение" },
  { value: "gradient", label: "Градиент" },
  { value: "solid-color", label: "Сплошной цвет" },
  { value: "animated-gradient", label: "Анимированный градиент" }
];

export const VIDEO_SNIPPET_DROP_EFFECTS: Array<{ value: VideoSnippetDropEffect; label: string }> = [
  { value: "auto", label: "Auto Detect" },
  { value: "bass-hit", label: "Bass Hit" },
  { value: "zoom-pulse", label: "Zoom Pulse" },
  { value: "glow-burst", label: "Glow Burst" },
  { value: "camera-shake", label: "Camera Shake" },
  { value: "flash", label: "Flash" },
  { value: "wave-explosion", label: "Wave Explosion" },
  { value: "orb-expansion", label: "Orb Expansion" },
  { value: "beat-bounce", label: "Beat Bounce" }
];

export const VIDEO_SNIPPET_PLATFORM_PRESETS: Array<{ value: VideoSnippetPlatformPreset; label: string; text: string }> = [
  { value: "none", label: "Не показывать", text: "" },
  {
    value: "all-platforms",
    label: "Доступно на всех площадках",
    text: "Доступно на всех площадках"
  },
  {
    value: "listen-ru",
    label: "Слушайте: Яндекс Музыка • VK Музыка",
    text: "Слушайте: Яндекс Музыка • VK Музыка"
  },
  {
    value: "available-en",
    label: "Available on: Apple Music • Spotify",
    text: "Available on: Apple Music • Spotify"
  },
  { value: "custom", label: "Свой вариант…", text: "" }
];

export const VIDEO_SNIPPET_MAX_SECONDS: Record<VideoSnippetDuration, number> = {
  15: 15,
  30: 30,
  60: 60
};

export function formatSnippetTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remaining = wholeSeconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = clampValue(percentileValue, 0, 1) * (sorted.length - 1);
  const baseIndex = Math.floor(position);
  const fraction = position - baseIndex;
  const current = sorted[baseIndex] ?? 0;
  const next = sorted[Math.min(sorted.length - 1, baseIndex + 1)] ?? current;
  return current + (next - current) * fraction;
}

export function analyzeEnergyTimeline(energies: number[], durationSeconds: number): SnippetMomentAnalysis {
  if (!energies.length || durationSeconds <= 0) {
    return {
      introEnd: 0,
      chorusStart: durationSeconds * 0.33,
      dropAt: durationSeconds * 0.62,
      peakAt: durationSeconds * 0.78,
      confidence: 0
    };
  }

  const normalized = energies.map((value) => clampValue(value, 0, 1));
  const smoothed = normalized.map((_, index) => {
    const start = Math.max(0, index - 2);
    const end = Math.min(normalized.length, index + 3);
    const span = normalized.slice(start, end);
    return span.reduce((sum, value) => sum + value, 0) / Math.max(1, span.length);
  });

  const average = smoothed.reduce((sum, value) => sum + value, 0) / smoothed.length;
  const variance = smoothed.reduce((sum, value) => sum + (value - average) ** 2, 0) / smoothed.length;
  const deviation = Math.sqrt(variance);
  const threshold = average + deviation * 0.35;
  const highThreshold = percentile(smoothed, 0.78);

  const toSeconds = (index: number) => (index / Math.max(1, smoothed.length - 1)) * durationSeconds;
  const introIndex = smoothed.findIndex((value, index) => index > 0.08 * smoothed.length && value >= threshold * 0.92);
  const chorusCandidate = smoothed.findIndex((value, index) => index > 0.28 * smoothed.length && value >= highThreshold);
  const chorusIndex = chorusCandidate >= 0 ? chorusCandidate : Math.max(0, Math.floor(smoothed.length * 0.42));

  let peakIndex = 0;
  let peakValue = -1;
  for (let index = 0; index < smoothed.length; index += 1) {
    if (smoothed[index] > peakValue) {
      peakValue = smoothed[index];
      peakIndex = index;
    }
  }

  const dropWindowStart = Math.min(smoothed.length - 1, Math.floor(smoothed.length * 0.4));
  let dropIndex = peakIndex;
  let dropValue = -1;
  for (let index = dropWindowStart; index < smoothed.length; index += 1) {
    const momentum = (smoothed[index] - (smoothed[index - 2] ?? smoothed[index])) * 0.45;
    const weighted = smoothed[index] + momentum;
    if (weighted > dropValue) {
      dropValue = weighted;
      dropIndex = index;
    }
  }

  const introEnd = clampValue(toSeconds(introIndex >= 0 ? introIndex : Math.floor(smoothed.length * 0.12)), 0, durationSeconds);
  const chorusStart = clampValue(toSeconds(chorusIndex), introEnd, durationSeconds);
  const dropAt = clampValue(toSeconds(dropIndex), chorusStart, durationSeconds);
  const peakAt = clampValue(toSeconds(peakIndex), dropAt, durationSeconds);
  const confidence = clampValue((peakValue - average) * 1.6 + deviation * 0.4, 0, 1);

  return {
    introEnd,
    chorusStart,
    dropAt,
    peakAt,
    confidence
  };
}

export function buildSpectralProfile(samples: Uint8Array, bandCount = 24) {
  if (!samples.length) return Array.from({ length: bandCount }, () => 0);
  const bands = Array.from({ length: bandCount }, () => 0);
  const slice = Math.max(1, Math.floor(samples.length / bandCount));
  for (let band = 0; band < bandCount; band += 1) {
    const start = band * slice;
    const end = band === bandCount - 1 ? samples.length : Math.min(samples.length, start + slice);
    let total = 0;
    for (let index = start; index < end; index += 1) {
      total += (samples[index] ?? 0) / 255;
    }
    bands[band] = total / Math.max(1, end - start);
  }
  return bands;
}

export function calculateAverageEnergy(samples: Uint8Array) {
  if (!samples.length) return 0;
  let total = 0;
  for (const sample of samples) {
    total += sample / 255;
  }
  return total / samples.length;
}
