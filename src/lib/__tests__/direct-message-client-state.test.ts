import assert from "node:assert/strict";
import test from "node:test";

import {
  getDirectConversationReadKey,
  parseCollaborationResponseMessage
} from "@/components/messages/direct-messages-panel";
import type { DirectConversationResponse } from "@/lib/api/contracts";

function conversation(unreadCount: number, incomingMessageId: string): DirectConversationResponse {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    participant: {
      id: "artist-b",
      name: "Artist B",
      avatarUrl: null,
      profileType: "artist"
    },
    updatedAt: "2026-08-11T10:00:00.000Z",
    unreadCount,
    lastMessage: "hello",
    messages: [{
      id: incomingMessageId,
      conversationId: "33333333-3333-4333-8333-333333333333",
      body: "hello",
      createdAt: "2026-08-11T10:00:00.000Z",
      readAt: null,
      isOwn: false,
      deletedForEveryone: false
    }]
  };
}

test("active conversation read key changes when a newly polled unread message arrives", () => {
  const first = getDirectConversationReadKey(conversation(1, "message-1"));
  const second = getDirectConversationReadKey(conversation(2, "message-2"));

  assert.equal(first, "33333333-3333-4333-8333-333333333333:message-1");
  assert.equal(second, "33333333-3333-4333-8333-333333333333:message-2");
  assert.notEqual(first, second);
  assert.equal(getDirectConversationReadKey(conversation(0, "message-2")), null);
});

test("collaboration response direct messages expose announcement context", () => {
  const parsed = parseCollaborationResponseMessage([
    "Отклик на объявление",
    "Ищу продюсера · Артист",
    "Объявление: Нужен продюсер на сингл",
    "Релиз в портфолио: Demo Track",
    "Пост: /dashboard/community?view=collaborations&post=11111111-1111-4111-8111-111111111111",
    "",
    "Готов помочь с аранжировкой."
  ].join("\n"));

  assert.equal(parsed?.summary, "Ищу продюсера · Артист");
  assert.equal(parsed?.announcement, "Нужен продюсер на сингл");
  assert.equal(parsed?.release, "Demo Track");
  assert.equal(parsed?.href, "/dashboard/community?view=collaborations&post=11111111-1111-4111-8111-111111111111");
  assert.equal(parsed?.message, "Готов помочь с аранжировкой.");
  assert.equal(parseCollaborationResponseMessage("Обычное сообщение"), null);
});
