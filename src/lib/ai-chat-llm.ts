import { CHAT_MAX_OUTPUT_TOKENS, CHAT_MODELS, CHAT_ROUTER_ENDPOINT } from "@/lib/ai-studio-fal-models";
import { callFalEndpoint, hasFalApiKey } from "@/lib/fal";

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export const CHAT_SYSTEM_PROMPT = [
  "Ты — AI-ассистент дистрибьютора музыки ICECREAMMUSIC.",
  "Помогаешь артистам: тексты песен, названия, описания релизов для площадок, био, посты и идеи для продвижения, промпты для обложек, видео и музыки.",
  "Отвечай на языке пользователя, по делу и без воды. Не обещай конкретных цифр прослушиваний или попадания в плейлисты."
].join(" ");

const HISTORY_LIMIT = 12;
const HISTORY_CHAR_LIMIT = 12_000;

/** Old threads may carry retired model codes (gpt-4o, claude-3-5-sonnet): answer with the default model instead. */
export function resolveChatModelId(modelCode: string): string {
  return CHAT_MODELS.some((model) => model.id === modelCode) ? modelCode : CHAT_MODELS[0].id;
}

/** The router takes a single prompt, so the recent conversation is folded into it. */
export function buildChatPrompt(history: ChatHistoryMessage[], prompt: string): string {
  const recent = history.slice(-HISTORY_LIMIT);
  let transcript = recent
    .map((message) => `${message.role === "user" ? "Пользователь" : "Ассистент"}: ${message.content.trim()}`)
    .join("\n\n");
  if (transcript.length > HISTORY_CHAR_LIMIT) {
    transcript = transcript.slice(transcript.length - HISTORY_CHAR_LIMIT);
  }
  return transcript
    ? `Предыдущий диалог:\n${transcript}\n\nНовое сообщение пользователя:\n${prompt.trim()}`
    : prompt.trim();
}

function extractText(output: unknown): string | null {
  if (typeof output === "string") return output.trim() || null;
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    for (const key of ["output", "text", "content", "message"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

/** Asks the chosen model through fal.ai's OpenRouter endpoint. Throws when the model gave no answer. */
export async function generateChatReply(params: {
  modelCode: string;
  prompt: string;
  history: ChatHistoryMessage[];
}): Promise<string> {
  if (!hasFalApiKey()) {
    throw new Error("AI-чат не настроен: нет ключа fal.ai.");
  }
  const { output } = await callFalEndpoint({
    modelId: CHAT_ROUTER_ENDPOINT,
    input: {
      model: resolveChatModelId(params.modelCode),
      system_prompt: CHAT_SYSTEM_PROMPT,
      prompt: buildChatPrompt(params.history, params.prompt),
      max_tokens: CHAT_MAX_OUTPUT_TOKENS,
      temperature: 0.8
    },
    timeoutMs: 120_000
  });
  const text = extractText(output);
  if (!text) {
    throw new Error("Модель не ответила. Попробуйте ещё раз или выберите другую модель.");
  }
  return text;
}
