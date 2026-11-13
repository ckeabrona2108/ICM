import assert from "node:assert/strict";
import test from "node:test";

import {
  getAiStudioModelHint,
  getAiStudioParamGroupLabel,
  getAiStudioParamOptionHint,
  getAiStudioParamOptionLabel,
  parseAiStudioAspect
} from "@/lib/ai-studio-ui";

test("param labels are Russian while keeping unknown values as-is", () => {
  assert.equal(getAiStudioParamGroupLabel("image", "Quality"), "Качество");
  assert.equal(getAiStudioParamGroupLabel("audio", "Style"), "Жанр");
  assert.equal(getAiStudioParamGroupLabel("image", "Style"), "Стиль");
  assert.equal(getAiStudioParamOptionLabel("Quality", "Fast"), "Быстро");
  assert.equal(getAiStudioParamOptionLabel("Duration", "10 sec"), "10 сек");
  assert.equal(getAiStudioParamOptionLabel("Style", "R&B"), "R&B");
  assert.equal(getAiStudioParamOptionHint("Format", "9:16"), "Сторис");
  assert.equal(getAiStudioParamOptionHint("Style", "Cover"), null);
});

test("aspect parsing", () => {
  assert.deepEqual(parseAiStudioAspect("16:9"), { width: 16, height: 9 });
  assert.equal(parseAiStudioAspect("720p"), null);
  assert.equal(parseAiStudioAspect("0:1"), null);
});

test("model hints match labels case-insensitively", () => {
  assert.equal(getAiStudioModelHint("Ideogram 4.5"), "Лучше всех пишет текст на обложке");
  assert.equal(getAiStudioModelHint(" FLUX ULTRA "), "Фотореализм в высоком разрешении");
  assert.equal(getAiStudioModelHint("Unknown"), null);
});

test("music style tags and instrumental flag go into the fal prompt", async () => {
  const { mapSectionFalInput } = await import("@/lib/ai-generation-service");
  const input = mapSectionFalInput({
    section: "audio",
    prompt: "Трек про ночной город",
    modelName: "MiniMax Music",
    parameters: { Style: "phonk, 808, 140 bpm", Type: "Инструментал" }
  });
  assert.equal(input.prompt, "Трек про ночной город. Style: phonk, 808, 140 bpm. Instrumental, no vocals");
  const plain = mapSectionFalInput({ section: "audio", prompt: "Песня", modelName: "M", parameters: { Style: "", Type: "Песня" } });
  assert.equal(plain.prompt, "Песня");
});

test("catalog models get inputs in their own fal.ai format", async () => {
  const { buildStudioModelInput, CHAT_MODELS } = await import("@/lib/ai-studio-fal-models");
  const seedream = buildStudioModelInput({
    modelId: "bytedance/seedream/v5.5/text-to-image",
    prompt: "Ночной город",
    parameters: { Style: "Cover", Quality: "Fast", Format: "9:16" }
  });
  assert.deepEqual(seedream?.input, { prompt: "Ночной город. music album cover art", num_images: 1, image_size: "portrait_16_9" });

  const ideogram = buildStudioModelInput({ modelId: "ideogram/v4.5", prompt: "x", parameters: { Quality: "Ultra", Format: "1:1" } });
  assert.equal(ideogram?.input.quality, "high");

  const gemini = buildStudioModelInput({
    modelId: "google/gemini-omni-flash/v1.2/text-to-video",
    prompt: "x",
    parameters: { Duration: "8 sec", Quality: "480p", Format: "1:1" }
  });
  assert.deepEqual(gemini?.input, { prompt: "x", duration: 8, resolution: "720p", aspect_ratio: "16:9" });

  const seedance = buildStudioModelInput({ modelId: "bytedance/seedance-2.5/us/text-to-video", prompt: "x", parameters: { Duration: "10 sec" } });
  assert.equal(seedance?.input.duration, "10");

  const mureka = buildStudioModelInput({ modelId: "mureka/v9.5/generate/song", prompt: "про лето", parameters: { Style: "поп", Type: "Инструментал" } });
  assert.equal(mureka?.endpointId, "mureka/v9.5/generate/instrumental");

  const eleven = buildStudioModelInput({ modelId: "elevenlabs/music/v2.5", prompt: "про лето", parameters: { Style: "поп", Type: "Песня" } });
  assert.deepEqual(eleven?.input, { prompt: "про лето. поп", force_instrumental: false, music_length_ms: 60000 });

  assert.equal(buildStudioModelInput({ modelId: "unknown/model", prompt: "x" }), null);
  assert.ok(CHAT_MODELS.length >= 12);
});

test("chat keeps recent history and maps retired model codes", async () => {
  const { buildChatPrompt, resolveChatModelId } = await import("@/lib/ai-chat-llm");
  assert.equal(resolveChatModelId("gpt-4o"), "anthropic/claude-sonnet-5.5");
  assert.equal(resolveChatModelId("x-ai/grok-4.7"), "x-ai/grok-4.7");
  assert.equal(buildChatPrompt([], " Привет "), "Привет");
  const withHistory = buildChatPrompt(
    [
      { role: "user", content: "Придумай название" },
      { role: "assistant", content: "Ночной трамвай" }
    ],
    "Ещё вариант"
  );
  assert.match(withHistory, /Пользователь: Придумай название/u);
  assert.match(withHistory, /Ассистент: Ночной трамвай/u);
  assert.match(withHistory, /Новое сообщение пользователя:\nЕщё вариант$/u);
});
