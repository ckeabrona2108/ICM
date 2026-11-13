import type { AiStudioSection } from "@/lib/ai-studio";

/**
 * Display copy for AI Studio settings. Parameter keys and values stay in English
 * because they are sent to the generation backend as-is; artists only see these labels.
 */

export const AI_STUDIO_PARAM_GROUP_LABELS: Record<string, string> = {
  Style: "Стиль",
  Quality: "Качество",
  Format: "Формат",
  Duration: "Длительность",
  Type: "Тип",
  Length: "Длина",
  Mode: "Режим",
  Queue: "Очередь",
  Access: "Доступ"
};

const SECTION_PARAM_GROUP_LABELS: Partial<Record<AiStudioSection, Record<string, string>>> = {
  audio: { Style: "Жанр" }
};

const PARAM_OPTION_LABELS: Record<string, Record<string, string>> = {
  Style: {
    Cover: "Обложка",
    Promo: "Промо",
    Poster: "Постер",
    Abstract: "Абстракция",
    Pop: "Поп",
    Trap: "Трэп",
    Ambient: "Эмбиент"
  },
  Quality: {
    Fast: "Быстро",
    Pro: "Хорошо",
    Ultra: "Максимум"
  },
  Length: {
    Short: "Короткий",
    Standard: "Обычный",
    Extended: "Длинный"
  }
};

const PARAM_OPTION_HINTS: Record<string, Record<string, string>> = {
  Format: {
    "1:1": "Обложка",
    "4:5": "Пост",
    "9:16": "Сторис",
    "16:9": "YouTube"
  },
  Quality: {
    Fast: "Чтобы найти идею",
    Pro: "Для большинства задач",
    Ultra: "Финальная версия"
  }
};

export function getAiStudioParamGroupLabel(section: AiStudioSection, key: string): string {
  return SECTION_PARAM_GROUP_LABELS[section]?.[key] ?? AI_STUDIO_PARAM_GROUP_LABELS[key] ?? key;
}

export function getAiStudioParamOptionLabel(key: string, value: string): string {
  if (key === "Duration") {
    return value.replace(/\bsec\b/u, "сек");
  }
  return PARAM_OPTION_LABELS[key]?.[value] ?? value;
}

export function getAiStudioParamOptionHint(key: string, value: string): string | null {
  return PARAM_OPTION_HINTS[key]?.[value] ?? null;
}

/** Width/height of a "W:H" aspect value, or null when the value is not an aspect ratio. */
export function parseAiStudioAspect(value: string): { width: number; height: number } | null {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/u.exec(value.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
}

const MODEL_HINTS: Record<string, string> = {
  // Chat
  "claude sonnet 5.5": "Сильный помощник для текстов и идей",
  "claude opus 5.5": "Самый умный Claude: сложные задачи и тексты",
  "claude fable 5.2": "Флагман Anthropic, лучшее качество, дорогой",
  "claude haiku 5.5": "Быстрый и дешёвый Claude",
  "gpt-6.1 sol": "Флагман OpenAI: тексты, идеи, анализ",
  "gpt-6.1 terra": "Быстрый GPT для повседневных задач",
  "gpt-6 luna": "Самый дешёвый GPT",
  "gemini 4 carbon": "Флагман Google, хорошо с длинными текстами",
  "gemini 4 hydrogen": "Быстрый Gemini 4",
  "grok 4.7": "Свежий взгляд и смелые идеи",
  "deepseek v4.1 flash": "Дёшево и быстро",
  "kimi k3.1 pro": "Сильный в рассуждениях",
  "qwen 3.8 max": "Флагман Alibaba, хорошо знает русский",
  "glm 5.3": "Дешёвая универсальная модель",
  "mistral large 4": "Европейская модель, ровный стиль",
  "minimax m3": "Дешёвая модель для коротких задач",
  // Images
  "seedream 5.5": "Новинка: качество и детали, недорого",
  "nano banana 2.1": "Google: точно по описанию, правки по фото",
  "gpt image 2.6": "OpenAI: сложные сцены и текст на картинке",
  "ideogram 4.5": "Лучше всех пишет текст на обложке",
  "minimax h3 image": "Яркие стилизованные картинки",
  "flux 3": "Фотореализм и свет",
  "flux.3 klein": "Очень дёшево, для черновиков",
  "krea 3": "Художественный стиль",
  "flux ultra": "Фотореализм в высоком разрешении",
  // Video
  "gemini omni flash 1.2": "Google: новинка, недорого",
  "kling 4.0": "Реалистичные люди и движение",
  "kling 4.0 flash": "Kling быстрее и дешевле",
  "flux 3 max video": "Красивая картинка, со звуком",
  "seedance 2.5": "Кинематографично, со звуком, дорого",
  "grok imagine 1.5": "Быстрые короткие ролики, дёшево",
  "pixverse v6 max": "Стили: аниме, 3D, комикс, дёшево",
  // Music
  "mureka 9.5": "Песни с вокалом, ближе всего к Suno",
  "elevenlabs music 2.5": "Песни со структурой, минута трека",
  "lyria 3.5": "Google: инструменталы и биты",
  "minimax music 3": "Песня по стилю и тексту"
};

export function getAiStudioModelHint(label: string): string | null {
  return MODEL_HINTS[label.trim().toLowerCase()] ?? null;
}
