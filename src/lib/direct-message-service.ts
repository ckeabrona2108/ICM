import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import { normalizeArtistProfileType } from "@/lib/artist-profile-type";
import { buildPersonalProfileSlug, parseArtistProfileUserId } from "@/lib/artist-profile-shared";
import { getPublicArtistProfile } from "@/lib/artist-profile-service";
import type {
  DirectConversationResponse,
  DirectMessageResponse
} from "@/lib/api/contracts";
import { toNotificationStorageId } from "@/lib/notification-storage-id";
import {
  assertSocialInteractionAllowed,
  listBlockedPeerIds,
  type SocialSafetyPrisma
} from "@/lib/social-safety-policy";

export const directMessageSchema = z.object({
  recipientSlug: z.string().trim().min(3, "Некорректный получатель.").max(220, "Некорректный получатель."),
  body: z.string().trim().min(1, "Введите сообщение.").max(4000, "Сообщение слишком длинное.")
});

export const directConversationSchema = z.object({
  recipientSlug: z.string().trim().min(3, "Некорректный получатель.").max(220, "Некорректный получатель.")
});

export class DirectMessageAccessError extends Error {}
export class DirectMessageNotFoundError extends Error {}
export class DirectMessageValidationError extends Error {}

function toSocialSafetyPrisma(prisma: PrismaClient) {
  return prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">;
}

type ConversationRow = {
  id: string;
  participant_a_id: string;
  participant_b_id: string;
  updated_at: Date;
  participant_a_name: string;
  participant_a_avatar: string | null;
  participant_a_type: string | null;
  participant_b_name: string;
  participant_b_avatar: string | null;
  participant_b_type: string | null;
  last_message: string | null;
  unread_count: bigint | number | string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read_at: Date | null;
  created_at: Date;
  deleted_for_everyone_at?: Date | null;
};

type UserRow = {
  id: string;
  name: string;
  avatar: string | null;
};

type DirectConversationContext = {
  type: "direct" | "collaboration_response";
  id?: string | null;
};

type DirectMessageWriteClient = Pick<PrismaClient, "$queryRawUnsafe">;

export async function createDirectMessageRowsInTransaction(params: {
  tx: DirectMessageWriteClient;
  participantA: string;
  participantB: string;
  senderId: string;
  body: string;
  context: DirectConversationContext;
}): Promise<{ conversationId: string; messageId: string | null }> {
  const conversationRows = params.context.type === "direct"
    ? await params.tx.$queryRawUnsafe<Array<{ id: string }>>(`
      INSERT INTO "icecream"."direct_conversations" (participant_a_id, participant_b_id, context_type, context_id, updated_at)
      VALUES ($1::uuid, $2::uuid, 'direct', NULL, now())
      ON CONFLICT (participant_a_id, participant_b_id) WHERE context_type = 'direct'
      DO UPDATE SET
        updated_at = EXCLUDED.updated_at,
        hidden_for_participant_a_at = CASE
          WHEN "icecream"."direct_conversations".participant_a_id = $3::uuid THEN NULL
          ELSE "icecream"."direct_conversations".hidden_for_participant_a_at
        END,
        hidden_for_participant_b_at = CASE
          WHEN "icecream"."direct_conversations".participant_b_id = $3::uuid THEN NULL
          ELSE "icecream"."direct_conversations".hidden_for_participant_b_at
        END
      RETURNING id
    `, params.participantA, params.participantB, params.senderId)
    : await params.tx.$queryRawUnsafe<Array<{ id: string }>>(`
      INSERT INTO "icecream"."direct_conversations" (participant_a_id, participant_b_id, context_type, context_id, updated_at)
      VALUES ($1::uuid, $2::uuid, $3, $4, now())
      RETURNING id
    `, params.participantA, params.participantB, params.context.type, params.context.id ?? null);
  const conversationId = conversationRows[0]?.id;
  if (!conversationId) throw new DirectMessageValidationError("Не удалось создать диалог.");

  const messageRows = await params.tx.$queryRawUnsafe<Array<{ id: string }>>(`
    INSERT INTO "icecream"."direct_messages" (conversation_id, sender_id, body)
    VALUES ($1::uuid, $2::uuid, $3)
    RETURNING id
  `, conversationId, params.senderId, params.body);
  const messageId = messageRows[0]?.id ?? null;
  return { conversationId, messageId };
}

function avatarUrl(userId: string, avatar: string | null): string | null {
  if (!avatar) return DEFAULT_USER_AVATAR_URL;
  if (!avatar.includes("/") && !avatar.includes(".") && /^[a-z0-9]{2,8}$/iu.test(avatar.trim())) {
    return buildStoredFileRouteUrl(`avatars/${userId}.${avatar.trim().replace(/^\./u, "")}`) ?? DEFAULT_USER_AVATAR_URL;
  }
  return buildStoredFileRouteUrl(avatar) ?? DEFAULT_USER_AVATAR_URL;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toMessage(row: MessageRow, viewerId: string): DirectMessageResponse {
  const deletedForEveryone = Boolean(row.deleted_for_everyone_at);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    body: deletedForEveryone ? "Сообщение удалено" : row.body,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    readAt: toIso(row.read_at),
    isOwn: row.sender_id === viewerId,
    deletedForEveryone
  };
}

async function listMessages(prisma: PrismaClient, conversationIds: string[], viewerId: string): Promise<Map<string, DirectMessageResponse[]>> {
  const grouped = new Map<string, DirectMessageResponse[]>();
  if (!conversationIds.length) return grouped;

  const rows = await prisma.$queryRawUnsafe<MessageRow[]>(`
    WITH visible_messages AS (
      SELECT
        dm.id,
        dm.conversation_id,
        dm.sender_id,
        dm.body,
        dm.read_at,
        dm.created_at,
        dm.deleted_for_everyone_at,
        ROW_NUMBER() OVER (PARTITION BY dm.conversation_id ORDER BY dm.created_at DESC, dm.id DESC) AS reverse_position
      FROM "icecream"."direct_messages" dm
      JOIN "icecream"."direct_conversations" c ON c.id = dm.conversation_id
      WHERE dm.conversation_id = ANY($1::uuid[])
        AND NOT (
          dm.sender_id = $2::uuid
          AND dm.deleted_for_sender_at IS NOT NULL
          AND dm.deleted_for_everyone_at IS NULL
        )
        AND dm.created_at > COALESCE((
          CASE
            WHEN c.participant_a_id = $2::uuid THEN c.hidden_for_participant_a_at
            ELSE c.hidden_for_participant_b_at
          END
        ), to_timestamp(0))
    )
    SELECT id, conversation_id, sender_id, body, read_at, created_at, deleted_for_everyone_at
    FROM visible_messages
    WHERE reverse_position <= 80
    ORDER BY conversation_id ASC, created_at ASC, id ASC
  `, conversationIds, viewerId);

  for (const row of rows) {
    const item = toMessage(row, viewerId);
    const bucket = grouped.get(item.conversationId) ?? [];
    bucket.push(item);
    grouped.set(item.conversationId, bucket.slice(-80));
  }
  return grouped;
}

function mapConversation(row: ConversationRow, viewerId: string, messages: DirectMessageResponse[]): DirectConversationResponse {
  const isA = row.participant_a_id === viewerId;
  const participantId = isA ? row.participant_b_id : row.participant_a_id;
  const participantName = isA ? row.participant_b_name : row.participant_a_name;
  const participantAvatar = isA ? row.participant_b_avatar : row.participant_a_avatar;
  const participantType = normalizeArtistProfileType(isA ? row.participant_b_type : row.participant_a_type);
  return {
    id: row.id,
    participant: {
      id: buildPersonalProfileSlug(participantName, participantId),
      name: participantName,
      avatarUrl: avatarUrl(participantId, participantAvatar),
      profileType: participantType
    },
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
    unreadCount: Number(row.unread_count ?? 0),
    lastMessage: row.last_message,
    messages
  };
}

async function getDirectConversationById(
  prisma: PrismaClient,
  userId: string,
  conversationId: string
): Promise<DirectConversationResponse> {
  const [rows, blockedPeerIds, messagesByConversation] = await Promise.all([
    prisma.$queryRawUnsafe<ConversationRow[]>(`
      SELECT
        c.id,
        c.participant_a_id,
        c.participant_b_id,
        c.updated_at,
        a.name AS participant_a_name,
        a.avatar AS participant_a_avatar,
        a."artistProfileType" AS participant_a_type,
        b.name AS participant_b_name,
        b.avatar AS participant_b_avatar,
        b."artistProfileType" AS participant_b_type,
        lm.body AS last_message,
        COUNT(um.id) AS unread_count
      FROM "icecream"."direct_conversations" c
      JOIN "icecream"."user" a ON a.id = c.participant_a_id
      JOIN "icecream"."user" b ON b.id = c.participant_b_id
      LEFT JOIN LATERAL (
        SELECT CASE
          WHEN dm.deleted_for_everyone_at IS NOT NULL THEN 'Сообщение удалено'
          ELSE dm.body
        END AS body
        FROM "icecream"."direct_messages" dm
        WHERE dm.conversation_id = c.id
          AND NOT (
            dm.sender_id = $2::uuid
            AND dm.deleted_for_sender_at IS NOT NULL
            AND dm.deleted_for_everyone_at IS NULL
          )
          AND dm.created_at > COALESCE((
            CASE
              WHEN c.participant_a_id = $2::uuid THEN c.hidden_for_participant_a_at
              ELSE c.hidden_for_participant_b_at
            END
          ), to_timestamp(0))
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ) lm ON TRUE
      LEFT JOIN "icecream"."direct_messages" um
        ON um.conversation_id = c.id
        AND um.sender_id <> $2::uuid
        AND um.read_at IS NULL
        AND um.deleted_for_everyone_at IS NULL
        AND um.created_at > COALESCE((
          CASE
            WHEN c.participant_a_id = $2::uuid THEN c.hidden_for_participant_a_at
            ELSE c.hidden_for_participant_b_at
          END
        ), to_timestamp(0))
      WHERE c.id = $1::uuid
        AND (c.participant_a_id = $2::uuid OR c.participant_b_id = $2::uuid)
      GROUP BY c.id, a.name, a.avatar, a."artistProfileType", b.name, b.avatar, b."artistProfileType", lm.body
      LIMIT 1
    `, conversationId, userId),
    listBlockedPeerIds(toSocialSafetyPrisma(prisma), userId),
    listMessages(prisma, [conversationId], userId)
  ]);

  const row = rows[0];
  if (!row) throw new DirectMessageNotFoundError("Диалог не найден.");
  const peerId = row.participant_a_id === userId ? row.participant_b_id : row.participant_a_id;
  if (blockedPeerIds.includes(peerId)) throw new DirectMessageAccessError("Диалог недоступен.");
  return mapConversation(row, userId, messagesByConversation.get(conversationId) ?? []);
}

export async function listDirectConversations(
  prisma: PrismaClient,
  userId: string,
  options?: { messageConversationId?: string | null }
): Promise<DirectConversationResponse[]> {
  const [baseRows, blockedPeerIds] = await Promise.all([
    prisma.$queryRawUnsafe<ConversationRow[]>(`
    SELECT
      c.id,
      c.participant_a_id,
      c.participant_b_id,
      c.updated_at,
      c.hidden_for_participant_a_at,
      c.hidden_for_participant_b_at,
      a.name AS participant_a_name,
      a.avatar AS participant_a_avatar,
      a."artistProfileType" AS participant_a_type,
      b.name AS participant_b_name,
      b.avatar AS participant_b_avatar,
      b."artistProfileType" AS participant_b_type,
      lm.body AS last_message,
      COUNT(um.id) AS unread_count
    FROM "icecream"."direct_conversations" c
    JOIN "icecream"."user" a ON a.id = c.participant_a_id
    JOIN "icecream"."user" b ON b.id = c.participant_b_id
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN dm.deleted_for_everyone_at IS NOT NULL THEN 'Сообщение удалено'
        ELSE dm.body
      END AS body
      FROM "icecream"."direct_messages" dm
      WHERE dm.conversation_id = c.id
        AND NOT (
          dm.sender_id = $1::uuid
          AND dm.deleted_for_sender_at IS NOT NULL
          AND dm.deleted_for_everyone_at IS NULL
        )
        AND dm.created_at > COALESCE((
          CASE
            WHEN c.participant_a_id = $1::uuid THEN c.hidden_for_participant_a_at
            ELSE c.hidden_for_participant_b_at
          END
        ), to_timestamp(0))
      ORDER BY dm.created_at DESC, dm.id DESC
      LIMIT 1
    ) lm ON TRUE
    LEFT JOIN "icecream"."direct_messages" um
      ON um.conversation_id = c.id
      AND um.sender_id <> $1::uuid
      AND um.read_at IS NULL
      AND um.deleted_for_everyone_at IS NULL
      AND um.created_at > COALESCE((
        CASE
          WHEN c.participant_a_id = $1::uuid THEN c.hidden_for_participant_a_at
          ELSE c.hidden_for_participant_b_at
        END
      ), to_timestamp(0))
    WHERE (c.participant_a_id = $1::uuid OR c.participant_b_id = $1::uuid)
      AND (
        (
          CASE
            WHEN c.participant_a_id = $1::uuid THEN c.hidden_for_participant_a_at
            ELSE c.hidden_for_participant_b_at
          END
        ) IS NULL
        OR lm.body IS NOT NULL
      )
    GROUP BY
      c.id,
      c.participant_a_id,
      c.participant_b_id,
      c.updated_at,
      c.hidden_for_participant_a_at,
      c.hidden_for_participant_b_at,
      a.name,
      a.avatar,
      a."artistProfileType",
      b.name,
      b.avatar,
      b."artistProfileType",
      lm.body
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT 50
  `, userId),
    listBlockedPeerIds(toSocialSafetyPrisma(prisma), userId)
  ]);
  const blockedPeerIdSet = new Set(blockedPeerIds);
  const candidateRows = baseRows.filter((row) => {
    const participantId = row.participant_a_id === userId ? row.participant_b_id : row.participant_a_id;
    return !blockedPeerIdSet.has(participantId);
  });
  const visibleRows = candidateRows;

  const requestedConversationId = options?.messageConversationId;
  const messageConversationId = requestedConversationId && visibleRows.some((row) => row.id === requestedConversationId)
    ? requestedConversationId
    : visibleRows[0]?.id;
  const messagesByConversation = await listMessages(
    prisma,
    messageConversationId ? [messageConversationId] : [],
    userId
  );
  return visibleRows.map((row) => mapConversation(row, userId, messagesByConversation.get(row.id) ?? []));
}

export async function markDirectConversationRead(prisma: PrismaClient, userId: string, conversationId: string): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; participant_a_id: string; participant_b_id: string }>>(`
    SELECT id, participant_a_id, participant_b_id
    FROM "icecream"."direct_conversations"
    WHERE id = $1::uuid AND (participant_a_id = $2::uuid OR participant_b_id = $2::uuid)
    LIMIT 1
  `, conversationId, userId);
  const conversation = rows[0];
  if (!conversation) throw new DirectMessageAccessError("Conversation is unavailable.");
  const peerId = conversation.participant_a_id === userId
    ? conversation.participant_b_id
    : conversation.participant_a_id;
  await assertSocialInteractionAllowed(toSocialSafetyPrisma(prisma), userId, peerId);

  await prisma.$executeRawUnsafe(`
    UPDATE "icecream"."direct_messages"
    SET read_at = now()
    WHERE conversation_id = $1::uuid AND sender_id <> $2::uuid AND read_at IS NULL
  `, conversationId, userId);

  await prisma.ai_user_notifications.updateMany({
    where: {
      user_id: userId,
      kind: "direct_message",
      cta_href: `/dashboard/messages?conversationId=${encodeURIComponent(conversationId)}`,
      read_at: null
    },
    data: { read_at: new Date() }
  });
}

export async function resolveDirectMessageRecipient(params: {
  prisma: PrismaClient;
  senderId: string;
  recipientId?: string | null;
  recipientSlug?: string | null;
}): Promise<string> {
  if (params.recipientId) return params.recipientId;
  const slug = params.recipientSlug?.trim();
  if (!slug) throw new DirectMessageValidationError("Выберите получателя.");
  const profile = await getPublicArtistProfile(params.prisma, slug, new Date(), { includeReleaseAnalytics: false });
  const recipientId = profile ? parseArtistProfileUserId(profile.slug) : null;
  if (!profile || !recipientId) throw new DirectMessageNotFoundError("Получатель не найден.");
  return recipientId;
}

export async function ensureDirectConversation(params: {
  prisma: PrismaClient;
  senderId: string;
  recipientId: string;
}): Promise<DirectConversationResponse> {
  if (params.senderId === params.recipientId) throw new DirectMessageValidationError("Нельзя открыть диалог с самим собой.");
  await assertSocialInteractionAllowed(toSocialSafetyPrisma(params.prisma), params.senderId, params.recipientId);
  const recipientRows = await params.prisma.$queryRawUnsafe<UserRow[]>(`
    SELECT id, name, avatar
    FROM "icecream"."user"
    WHERE id = $1::uuid
    LIMIT 1
  `, params.recipientId);
  if (!recipientRows[0]) throw new DirectMessageNotFoundError("Получатель не найден.");

  const [participantA, participantB] = [params.senderId, params.recipientId].sort();
  const conversationRows = await params.prisma.$queryRawUnsafe<Array<{ id: string }>>(`
    INSERT INTO "icecream"."direct_conversations" (participant_a_id, participant_b_id, context_type, context_id, updated_at)
    VALUES ($1::uuid, $2::uuid, 'direct', NULL, now())
    ON CONFLICT (participant_a_id, participant_b_id) WHERE context_type = 'direct'
    DO UPDATE SET
      updated_at = "icecream"."direct_conversations".updated_at,
      hidden_for_participant_a_at = CASE
        WHEN "icecream"."direct_conversations".participant_a_id = $3::uuid THEN NULL
        ELSE "icecream"."direct_conversations".hidden_for_participant_a_at
      END,
      hidden_for_participant_b_at = CASE
        WHEN "icecream"."direct_conversations".participant_b_id = $3::uuid THEN NULL
        ELSE "icecream"."direct_conversations".hidden_for_participant_b_at
      END
    RETURNING id
  `, participantA, participantB, params.senderId);
  const conversationId = conversationRows[0]?.id;
  if (!conversationId) throw new DirectMessageNotFoundError("Диалог не найден.");
  return getDirectConversationById(params.prisma, params.senderId, conversationId);
}

export async function sendDirectMessage(params: {
  prisma: PrismaClient;
  senderId: string;
  recipientId: string;
  body: string;
  context?: DirectConversationContext;
  notification?: {
    title?: string;
    message?: string;
    emailCta?: boolean;
  };
}): Promise<DirectConversationResponse> {
  const body = params.body.trim();
  if (!body) throw new DirectMessageValidationError("Введите сообщение.");
  if (params.senderId === params.recipientId) throw new DirectMessageValidationError("Нельзя отправить сообщение самому себе.");
  await assertSocialInteractionAllowed(toSocialSafetyPrisma(params.prisma), params.senderId, params.recipientId);

  const recipientRows = await params.prisma.$queryRawUnsafe<UserRow[]>(`
    SELECT id, name, avatar
    FROM "icecream"."user"
    WHERE id = $1::uuid
    LIMIT 1
  `, params.recipientId);
  if (!recipientRows[0]) throw new DirectMessageNotFoundError("Получатель не найден.");

  const [participantA, participantB] = [params.senderId, params.recipientId].sort();
  const context = params.context ?? { type: "direct", id: null };
  const result = await params.prisma.$transaction((tx) => createDirectMessageRowsInTransaction({
    tx,
    participantA,
    participantB,
    senderId: params.senderId,
    body,
    context
  }));

  if (result.messageId) {
    void deliverUserNotificationSafely(params.prisma, {
      id: `direct-message-${result.messageId}`,
      userId: params.recipientId,
      kind: "direct_message",
      title: params.notification?.title?.trim() || "Новое личное сообщение",
      message: params.notification?.message?.trim() || (body.length > 120 ? `${body.slice(0, 117)}...` : body),
      href: `/dashboard/messages?conversationId=${encodeURIComponent(result.conversationId)}`,
      emailCta: params.notification?.emailCta,
      resetReadState: true
    }).catch((error) => {
      console.error("[direct-messages] notification delivery failed", error);
    });
  }

  return getDirectConversationById(params.prisma, params.senderId, result.conversationId);
}

export async function deleteDirectMessage(params: {
  prisma: PrismaClient;
  userId: string;
  conversationId: string;
  messageId: string;
  mode?: "self" | "everyone";
}) {
  const membership = await params.prisma.$queryRawUnsafe<Array<{ id: string; participant_a_id: string; participant_b_id: string }>>(`
    SELECT id, participant_a_id, participant_b_id
    FROM "icecream"."direct_conversations"
    WHERE id = $1::uuid AND (participant_a_id = $2::uuid OR participant_b_id = $2::uuid)
    LIMIT 1
  `, params.conversationId, params.userId);
  if (!membership.length) throw new DirectMessageAccessError("Диалог недоступен.");
  const participants = [membership[0]!.participant_a_id, membership[0]!.participant_b_id];

  const rows = await params.prisma.$queryRawUnsafe<Array<{ id: string; sender_id: string; conversation_id: string; deleted_for_everyone_at: Date | null }>>(`
    SELECT id, sender_id, conversation_id, deleted_for_everyone_at
    FROM "icecream"."direct_messages"
    WHERE id = $1::uuid
    LIMIT 1
  `, params.messageId);
  const message = rows[0];
  if (!message || message.conversation_id !== params.conversationId) throw new DirectMessageNotFoundError("Сообщение не найдено.");
  if (message.sender_id !== params.userId) throw new DirectMessageAccessError("Нельзя удалить чужое сообщение.");

  const mode = params.mode === "everyone" ? "everyone" : "self";

  await params.prisma.$transaction(async (tx) => {
    if (mode === "everyone") {
      await tx.$executeRawUnsafe(`
        UPDATE "icecream"."direct_messages"
        SET
          deleted_for_everyone_at = COALESCE(deleted_for_everyone_at, now()),
          deleted_for_sender_at = NULL,
          read_at = now()
        WHERE id = $1::uuid AND sender_id = $2::uuid
      `, params.messageId, params.userId);

      await tx.ai_user_notifications.updateMany({
        where: {
          id: toNotificationStorageId(`direct-message-${params.messageId}`),
          user_id: { in: participants },
          kind: "direct_message",
          read_at: null
        },
        data: { read_at: new Date() }
      });
      return;
    }

    await tx.$executeRawUnsafe(`
      UPDATE "icecream"."direct_messages"
      SET deleted_for_sender_at = now()
      WHERE id = $1::uuid AND sender_id = $2::uuid
        AND deleted_for_sender_at IS NULL
        AND deleted_for_everyone_at IS NULL
    `, params.messageId, params.userId);
  });

  return { ok: true as const, id: params.messageId, mode };
}

export async function deleteDirectConversation(params: {
  prisma: PrismaClient;
  userId: string;
  conversationId: string;
}) {
  const rows = await params.prisma.$queryRawUnsafe<Array<{ id: string }>>(`
    SELECT id
    FROM "icecream"."direct_conversations"
    WHERE id = $1::uuid AND (participant_a_id = $2::uuid OR participant_b_id = $2::uuid)
    LIMIT 1
  `, params.conversationId, params.userId);
  if (!rows.length) throw new DirectMessageNotFoundError("Диалог не найден.");

  await params.prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      UPDATE "icecream"."direct_conversations"
      SET
        hidden_for_participant_a_at = CASE
          WHEN participant_a_id = $2::uuid THEN now()
          ELSE hidden_for_participant_a_at
        END,
        hidden_for_participant_b_at = CASE
          WHEN participant_b_id = $2::uuid THEN now()
          ELSE hidden_for_participant_b_at
        END
      WHERE id = $1::uuid
    `, params.conversationId, params.userId);

    await tx.ai_user_notifications.updateMany({
      where: {
        user_id: params.userId,
        kind: "direct_message",
        cta_href: `/dashboard/messages?conversationId=${encodeURIComponent(params.conversationId)}`
      },
      data: {
        read_at: new Date()
      }
    });
  });

  return { ok: true as const, id: params.conversationId };
}
