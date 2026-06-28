import assert from "node:assert/strict";
import test from "node:test";

import { buildChatAssistantText } from "@/lib/ai-generation-service";

test("buildChatAssistantText avoids mirror replies", () => {
  const response = buildChatAssistantText("Придумай обложку для трека");

  assert.match(response, /Понял задачу по визуалу/);
  assert.ok(!response.includes("Придумай обложку для трека"));
});

test("buildChatAssistantText identifies the assistant", () => {
  const response = buildChatAssistantText("кто ты");

  assert.match(response, /ICECREAMMUSIC AI Агент/);
});
