import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import {
  deleteDirectConversation,
  deleteDirectMessage,
  directConversationSchema,
  directMessageSchema,
  ensureDirectConversation,
  listDirectConversations,
  markDirectConversationRead,
  sendDirectMessage
} from "@/lib/direct-message-service";
import { toNotificationStorageId } from "@/lib/notification-storage-id";
import { SocialInteractionBlockedError } from "@/lib/social-safety-policy";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";
const messageId = "44444444-4444-4444-8444-444444444444";
const secondConversationId = "55555555-5555-4555-8555-555555555555";

type TestCall = { sql: string; args: unknown[] };

type TestPrisma = {
  calls: TestCall[];
  $queryRawUnsafe: (sql: string, ...args: unknown[]) => Promise<unknown[]>;
  $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<number>;
  $transaction: <T>(callback: (tx: TestPrisma) => Promise<T>) => Promise<T>;
  ai_user_notifications: {
    updateMany: (payload: unknown) => Promise<{ count: number }>;
  };
  social_user_blocks: {
    count: (payload: unknown) => Promise<number>;
    findMany: (payload: unknown) => Promise<Array<{ blocker_user_id: string; blocked_user_id: string }>>;
  };
};

function makePrisma(options?: { blocked?: boolean }): PrismaClient & TestPrisma {
  const calls: TestCall[] = [];
  const prisma: TestPrisma = {
    calls,
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes('SELECT id, name, avatar') && sql.includes('FROM "icecream"."user"')) {
        return [{ id: userB, name: "Artist B", avatar: null }];
      }
      if (sql.includes('INSERT INTO "icecream"."direct_conversations"')) {
        return [{ id: conversationId }];
      }
      if (sql.includes('INSERT INTO "icecream"."direct_messages"')) {
        return [{ id: messageId }];
      }
      if (sql.includes('FROM "icecream"."direct_conversations" c')) {
        return [{
          id: conversationId,
          participant_a_id: userA,
          participant_b_id: userB,
          updated_at: new Date("2026-07-31T10:00:00Z"),
          participant_a_name: "Producer A",
          participant_a_avatar: null,
          participant_a_type: "producer",
          participant_b_name: "Artist B",
          participant_b_avatar: null,
          participant_b_type: "artist",
          last_message: "hello",
          unread_count: 1
        }, {
          id: secondConversationId,
          participant_a_id: userA,
          participant_b_id: userB,
          updated_at: new Date("2026-07-30T10:00:00Z"),
          participant_a_name: "Producer A",
          participant_a_avatar: null,
          participant_a_type: "producer",
          participant_b_name: "Artist B",
          participant_b_avatar: null,
          participant_b_type: "artist",
          last_message: "older",
          unread_count: 0
        }];
      }
      if (sql.includes("FROM visible_messages")) {
        return [{
          id: messageId,
          conversation_id: conversationId,
          sender_id: userA,
          body: "hello",
          read_at: null,
          created_at: new Date("2026-07-31T10:00:01Z"),
          deleted_for_everyone_at: null
        }];
      }
      if (sql.includes('SELECT id, sender_id, conversation_id') && sql.includes('FROM "icecream"."direct_messages"')) {
        return [{
          id: messageId,
          sender_id: userA,
          conversation_id: conversationId,
          deleted_for_everyone_at: null
        }];
      }
      if (sql.includes('SELECT id, participant_a_id, participant_b_id') && sql.includes('FROM "icecream"."direct_conversations"')) {
        return [{ id: conversationId, participant_a_id: userA, participant_b_id: userB }];
      }
      if (sql.includes('SELECT id, participant_a_id, participant_b_id') && sql.includes('WHERE id = $1::uuid')) {
        return [{ id: conversationId, participant_a_id: userA, participant_b_id: userB }];
      }
      if (sql.includes('SELECT id') && sql.includes('WHERE id = $1::uuid')) return [{ id: conversationId }];
      return [];
    },
    $executeRawUnsafe: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      return 1;
    },
    $transaction: async <T>(callback: (tx: TestPrisma) => Promise<T>) => callback(prisma),
    ai_user_notifications: {
      updateMany: async (payload: unknown) => {
        calls.push({ sql: "notification.updateMany", args: [payload] });
        return { count: 1 };
      }
    },
    social_user_blocks: {
      count: async (payload: unknown) => {
        calls.push({ sql: "social_user_blocks.count", args: [payload] });
        return options?.blocked ? 1 : 0;
      },
      findMany: async (payload: unknown) => {
        calls.push({ sql: "social_user_blocks.findMany", args: [payload] });
        return options?.blocked ? [{ blocker_user_id: userA, blocked_user_id: userB }] : [];
      }
    }
  };
  return prisma as unknown as PrismaClient & TestPrisma;
}

test("direct message schemas validate recipient and body", () => {
  assert.equal(directMessageSchema.safeParse({ recipientSlug: "artist-slug", body: "hi" }).success, true);
  assert.equal(directMessageSchema.safeParse({ body: "hi" }).success, false);
  assert.equal(directMessageSchema.safeParse({ recipientId: "22222222-2222-4222-8222-222222222222", body: "hi" }).success, false);
  assert.equal(directConversationSchema.safeParse({ recipientSlug: "artist-slug" }).success, true);
  assert.equal(directConversationSchema.safeParse({ recipientId: "22222222-2222-4222-8222-222222222222" }).success, false);
});

test("listDirectConversations does not expose email or sender internal id", async () => {
  const prisma = makePrisma();
  const [conversation] = await listDirectConversations(prisma, userA);
  assert.equal(conversation.participant.name, "Artist B");
  assert.match(conversation.participant.id, /^user-artist-b-/i);
  assert.equal(conversation.participant.profileType, "artist");
  assert.equal("email" in conversation.participant, false);
  assert.equal("senderId" in conversation.messages[0]!, false);
  assert.equal(conversation.messages[0]!.isOwn, true);
  assert.equal(conversation.messages[0]!.deletedForEveryone, false);
});

test("listDirectConversations applies hidden visibility to either participant", async () => {
  const prisma = makePrisma();
  await listDirectConversations(prisma, userA);
  const conversationQuery = prisma.calls.find((call) =>
    call.sql.includes('FROM "icecream"."direct_conversations" c')
  );
  assert.match(
    conversationQuery?.sql ?? "",
    /WHERE\s+\(\s*c\.participant_a_id = \$1::uuid OR c\.participant_b_id = \$1::uuid\s*\)\s+AND\s+\(/u
  );
});

test("listDirectConversations hydrates messages only for the requested conversation", async () => {
  const prisma = makePrisma();
  await listDirectConversations(prisma, userA, { messageConversationId: secondConversationId });
  const messagesQuery = prisma.calls.find((call) => call.sql.includes("FROM visible_messages"));
  assert.deepEqual(messagesQuery?.args[0], [secondConversationId]);
});

test("listDirectConversations hides existing conversations with blocked peers", async () => {
  const prisma = makePrisma({ blocked: true });
  const conversations = await listDirectConversations(prisma, userA);
  assert.deepEqual(conversations, []);
  assert.equal(prisma.calls.some((call) => call.sql.includes("FROM visible_messages")), false);
});

test("sendDirectMessage rejects self message", async () => {
  const prisma = makePrisma();
  await assert.rejects(
    () => sendDirectMessage({ prisma, senderId: userA, recipientId: userA, body: "hi" }),
    /самому себе/
  );
});

test("ensureDirectConversation rejects a blocked peer before creating a conversation", async () => {
  const prisma = makePrisma({ blocked: true });
  await assert.rejects(
    () => ensureDirectConversation({ prisma, senderId: userA, recipientId: userB }),
    SocialInteractionBlockedError
  );
  assert.equal(prisma.calls.some((call) => call.sql.includes('INSERT INTO "icecream"."direct_conversations"')), false);
});

test("sendDirectMessage rejects a blocked peer before creating a message", async () => {
  const prisma = makePrisma({ blocked: true });
  await assert.rejects(
    () => sendDirectMessage({ prisma, senderId: userA, recipientId: userB, body: "hi" }),
    SocialInteractionBlockedError
  );
  assert.equal(prisma.calls.some((call) => call.sql.includes('INSERT INTO "icecream"."direct_messages"')), false);
});

test("sendDirectMessage reuses only the canonical direct conversation by pair", async () => {
  const prisma = makePrisma();
  await sendDirectMessage({ prisma, senderId: userA, recipientId: userB, body: "hi" });
  const insertConversation = prisma.calls.find((call) => call.sql.includes('INSERT INTO "icecream"."direct_conversations"'));
  assert.match(insertConversation?.sql ?? "", /context_type,\s*context_id/u);
  assert.match(insertConversation?.sql ?? "", /ON CONFLICT \(participant_a_id, participant_b_id\) WHERE context_type = 'direct'/u);
});

test("sendDirectMessage creates a separate contextual conversation when requested", async () => {
  const prisma = makePrisma();
  await sendDirectMessage({
    prisma,
    senderId: userA,
    recipientId: userB,
    body: "Отклик",
    context: { type: "collaboration_response", id: "post-1" }
  });
  const insertConversation = prisma.calls.find((call) => call.sql.includes('INSERT INTO "icecream"."direct_conversations"'));
  assert.match(insertConversation?.sql ?? "", /context_type,\s*context_id/u);
  assert.doesNotMatch(insertConversation?.sql ?? "", /ON CONFLICT/u);
  assert.deepEqual(insertConversation?.args.slice(2), ["collaboration_response", "post-1"]);
});

test("markDirectConversationRead updates messages and matching notification", async () => {
  const prisma = makePrisma();
  await markDirectConversationRead(prisma, userA, conversationId);
  assert.ok((prisma.calls as Array<{ sql: string; args: unknown[] }>).some((call) => call.sql.includes('UPDATE "icecream"."direct_messages"')));
  assert.ok((prisma.calls as Array<{ sql: string; args: unknown[] }>).some((call) => call.sql === "notification.updateMany"));
});

test("markDirectConversationRead rejects a blocked peer before updating messages", async () => {
  const prisma = makePrisma({ blocked: true });
  await assert.rejects(
    () => markDirectConversationRead(prisma, userA, conversationId),
    SocialInteractionBlockedError
  );
  assert.equal(prisma.calls.some((call) => call.sql.includes('UPDATE "icecream"."direct_messages"')), false);
});

test("deleteDirectMessage hides only sender copy instead of deleting shared row", async () => {
  const prisma = makePrisma();
  await deleteDirectMessage({ prisma, userId: userA, conversationId, messageId });
  const statements = prisma.calls as Array<{ sql: string; args: unknown[] }>;
  assert.ok(statements.some((call) => call.sql.includes('SET deleted_for_sender_at = now()')));
  assert.equal(statements.some((call) => call.sql.includes('DELETE FROM "icecream"."direct_messages"')), false);
});

test("deleteDirectMessage can tombstone a message for everyone", async () => {
  const prisma = makePrisma();
  await deleteDirectMessage({ prisma, userId: userA, conversationId, messageId, mode: "everyone" });
  const statements = prisma.calls as Array<{ sql: string; args: unknown[] }>;
  assert.ok(statements.some((call) => call.sql.includes('deleted_for_everyone_at = COALESCE(deleted_for_everyone_at, now())')));
  const notificationCall = statements.find((call) => call.sql === "notification.updateMany");
  const where = (notificationCall?.args[0] as { where?: Record<string, unknown> } | undefined)?.where;
  assert.deepEqual(where, {
    id: toNotificationStorageId(`direct-message-${messageId}`),
    user_id: { in: [userA, userB] },
    kind: "direct_message",
    read_at: null
  });
});

test("deleteDirectConversation hides only viewer copy instead of deleting the conversation", async () => {
  const prisma = makePrisma();
  await deleteDirectConversation({ prisma, userId: userA, conversationId });
  const statements = prisma.calls as Array<{ sql: string; args: unknown[] }>;
  assert.ok(statements.some((call) => call.sql.includes('hidden_for_participant_a_at')));
  assert.equal(statements.some((call) => call.sql.includes('DELETE FROM "icecream"."direct_conversations"')), false);
  const notificationCall = statements.find((call) => call.sql === "notification.updateMany");
  assert.equal((notificationCall?.args[0] as { where?: { user_id?: string } }).where?.user_id, userA);
});
