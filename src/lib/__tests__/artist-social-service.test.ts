import assert from "node:assert/strict";
import test from "node:test";

import { encodeStructuredPostContent, parseStructuredPostContent } from "@/lib/collaboration";
import {
  artistPostCommentSchema,
  artistPostSchema,
  commentEditSchema,
  createCollaborationResponse,
  createArtistPostComment,
  createArtistProfilePost,
  deleteArtistPostComment,
  deleteArtistProfilePost,
  getArtistSocialSnapshot,
  listArtistPostComments,
  listCollaborationResponses,
  listFollowedArtistProfiles,
  listReleaseComments,
  normalizeSocialIdempotencyKey,
  notifyArtistFollowersAboutPublishedPost,
  notifyArtistFollowersAboutPublishedRelease,
  releaseCommentSchema,
  toggleArtistPostLike,
  toggleArtistPostCommentReaction,
  toggleReleaseLike,
  updateCollaborationAnnouncementStatus,
  updateArtistPostComment,
  updateArtistProfilePost,
  updateReleaseComment
} from "@/lib/artist-social-service";
import { buildFeedCommentTree } from "@/lib/feed-social-helpers";
import { SocialInteractionBlockedError } from "@/lib/social-safety-policy";

test("social idempotency keys are bounded opaque tokens", () => {
  assert.equal(normalizeSocialIdempotencyKey(" request:post-1 "), "request:post-1");
  assert.equal(normalizeSocialIdempotencyKey(null), null);
  assert.throws(() => normalizeSocialIdempotencyKey("contains spaces"), /SOCIAL_IDEMPOTENCY_KEY_INVALID/);
  assert.throws(() => normalizeSocialIdempotencyKey("x".repeat(129)), /SOCIAL_IDEMPOTENCY_KEY_INVALID/);
});

test("an idempotent post retry re-enqueues follower notifications without recreating the post", async () => {
  let transactionOpen = false;
  let createdPosts = 0;
  const enqueuedEventIds: string[] = [];
  const existingPost = {
    id: "11111111-1111-4111-8111-111111111119",
    content: "Post",
    media_type: null,
    media_key: null,
    media_name: null,
    created_at: new Date("2026-08-19T00:00:00.000Z"),
    updated_at: new Date("2026-08-19T00:00:00.000Z"),
    author: { id: "11111111-1111-4111-8111-111111111111", name: "Artist", avatar: null, isVerifiedAuthor: false },
    release: null
  };
  const prisma = {
    user: {
      findUnique: async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        name: "Artist",
        avatar: null,
        personalSiteUrl: null,
        vk: null,
        telegram: null,
        artistProfileType: "artist",
        release: []
      })
    },
    artist_profile_followers: {
      findMany: async () => [{ follower_user_id: "22222222-2222-4222-8222-222222222222" }]
    },
    artist_profile_posts: {
      findFirst: async () => existingPost,
      create: async () => { createdPosts += 1; return existingPost; }
    },
    social_notification_outbox: {
      createMany: async ({ data }: { data: Array<{ event_id: string }> }) => {
        assert.equal(transactionOpen, false);
        enqueuedEventIds.push(...data.map((item) => item.event_id));
        return { count: data.length };
      },
      updateMany: async () => ({ count: 1 }),
      findUnique: async ({ where }: { where: { event_id: string } }) => ({
        id: where.event_id,
        event_id: where.event_id,
        user_id: "22222222-2222-4222-8222-222222222222",
        kind: "artist_post_published",
        title: "Новая публикация",
        message: "Post",
        href: `/feed/post_${existingPost.id}`,
        source_type: "post",
        source_id: existingPost.id,
        send_push: false,
        attempt_count: 1
      }),
      update: async () => ({})
    },
    ai_user_notifications: { upsert: async () => ({ id: "notification-1" }) },
    push_subscriptions: { findMany: async () => [] },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      transactionOpen = true;
      try {
        return await run(prisma);
      } finally {
        transactionOpen = false;
      }
    }
  } as never;

  const result = await createArtistProfilePost({
    prisma,
    userId: "11111111-1111-4111-8111-111111111111",
    artistKey: "__personal__",
    content: "Post",
    idempotencyKey: "request-1"
  });

  assert.equal(result.id, existingPost.id);
  assert.equal(createdPosts, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(enqueuedEventIds, [`artist-post-published-${existingPost.id}-22222222-2222-4222-8222-222222222222`]);
});

test("artist post trims content and requires a profile key", () => {
  assert.deepEqual(artistPostSchema.parse({ artistKey: " artist-key ", content: "  Новый релиз  " }), {
    artistKey: "artist-key",
    audience: "PUBLIC",
    content: "Новый релиз",
    mediaKey: "",
    mediaName: "",
    mediaItems: [],
    releaseId: ""
  });
  assert.equal(artistPostSchema.safeParse({ artistKey: "", content: "Новость" }).success, false);
});

test("artist post is limited to 1500 characters", () => {
  assert.equal(artistPostSchema.safeParse({ artistKey: "artist", content: "x".repeat(1501) }).success, false);
});

test("artist post can contain an uploaded image, audio or video", () => {
  assert.equal(artistPostSchema.safeParse({ artistKey: "artist", content: "" }).success, false);
  assert.equal(artistPostSchema.safeParse({
    artistKey: "artist",
    content: "",
    mediaType: "image",
    mediaKey: "artist-social/user/photo.webp",
    mediaName: "photo.webp"
  }).success, true);
  assert.equal(artistPostSchema.safeParse({
    artistKey: "artist",
    content: "",
    mediaType: "video",
    mediaKey: "artist-social/user/video.mp4",
    mediaName: "video.mp4"
  }).success, true);
  assert.equal(artistPostSchema.safeParse({
    artistKey: "artist",
    content: "",
    mediaKey: "artist-social/user/audio.mp3"
  }).success, false);
});

test("artist post supports multiple media items including demo audio", () => {
  const parsed = artistPostSchema.parse({
    artistKey: "artist",
    content: "Demo pack",
    mediaItems: [
      {
        mediaType: "image",
        mediaKey: "artist-social/user/photo-1.webp",
        mediaName: "photo-1.webp",
        role: "standard",
        width: 1600,
        height: 1600
      },
      {
        mediaType: "image",
        mediaKey: "artist-social/user/photo-2.webp",
        mediaName: "photo-2.webp",
        role: "standard"
      },
      {
        mediaType: "audio",
        mediaKey: "artist-social/user/demo-track.mp3",
        mediaName: "demo-track.mp3",
        role: "demo"
      }
    ]
  });

  assert.equal(parsed.mediaItems.length, 3);
  assert.equal(parsed.mediaItems[2]?.role, "demo");
});

test("deleting an owned post returns every storage key for lifecycle cleanup", async () => {
  let deletedId: string | null = null;
  const deletedLikePostIds: string[] = [];
  const deletedCommentPostIds: string[] = [];
  const content = encodeStructuredPostContent({
    content: "Media post",
    collaboration: null,
    mediaItems: [
      { mediaType: "image", mediaKey: "artist-social/user-1/image.webp", mediaName: "image.webp", role: "standard" },
      { mediaType: "video", mediaKey: "artist-social/user-1/video.mp4", mediaName: "video.mp4", role: "standard", posterKey: "artist-social/user-1/poster.webp" }
    ]
  });
  const prisma = {
    artist_profile_posts: {
      findUnique: async () => ({ id: "post-1", user_id: "user-1", content, media_key: "artist-social/user-1/image.webp" }),
      findMany: async () => [],
      delete: async ({ where }: { where: { id: string } }) => { deletedId = where.id; }
    },
    artist_profile_post_likes: {
      deleteMany: async ({ where }: { where: { post_id: string } }) => {
        deletedLikePostIds.push(where.post_id);
      }
    },
    artist_profile_post_comments: {
      deleteMany: async ({ where }: { where: { post_id: string } }) => {
        deletedCommentPostIds.push(where.post_id);
      }
    },
    scene_release_comments: { findMany: async () => [] },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations)
  } as never;

  const result = await deleteArtistProfilePost({ prisma, userId: "user-1", postId: "post-1" });

  assert.equal(deletedId, "post-1");
  assert.deepEqual(deletedLikePostIds, ["post-1"]);
  assert.deepEqual(deletedCommentPostIds, ["post-1"]);
  assert.deepEqual(result.mediaKeys.sort(), [
    "artist-social/user-1/image.webp",
    "artist-social/user-1/poster.webp",
    "artist-social/user-1/video.mp4"
  ]);
});

test("artist post rejects too many videos or audio attachments", () => {
  assert.equal(artistPostSchema.safeParse({
    artistKey: "artist",
    content: "Видео",
    mediaItems: [
      { mediaType: "video", mediaKey: "artist-social/user/video-1.mp4", mediaName: "video-1.mp4", role: "standard" },
      { mediaType: "video", mediaKey: "artist-social/user/video-2.mp4", mediaName: "video-2.mp4", role: "standard" }
    ]
  }).success, false);

  assert.equal(artistPostSchema.safeParse({
    artistKey: "artist",
    content: "Demo",
    mediaItems: [
      { mediaType: "audio", mediaKey: "artist-social/user/demo-1.mp3", mediaName: "demo-1.mp3", role: "demo" },
      { mediaType: "audio", mediaKey: "artist-social/user/demo-2.mp3", mediaName: "demo-2.mp3", role: "demo" }
    ]
  }).success, false);
});

test("post comments reject empty and oversized values", () => {
  assert.equal(artistPostCommentSchema.safeParse({ content: "   " }).success, false);
  assert.equal(artistPostCommentSchema.safeParse({ content: "x".repeat(801) }).success, false);
  assert.equal(artistPostCommentSchema.parse({ content: "  Ждём релиз  " }).content, "Ждём релиз");
});

test("release comments reject empty and oversized values", () => {
  assert.equal(releaseCommentSchema.safeParse({ content: "   " }).success, false);
  assert.equal(releaseCommentSchema.safeParse({ content: "x".repeat(801) }).success, false);
  assert.equal(releaseCommentSchema.parse({ content: "  Отличный релиз  " }).content, "Отличный релиз");
});

test("release comment can contain a photo without text", () => {
  assert.equal(releaseCommentSchema.safeParse({
    content: "",
    mediaKey: "artist-social/user/comment.webp",
    mediaName: "comment.webp"
  }).success, true);
});

test("comment edits require a non-empty moderated body", () => {
  assert.equal(commentEditSchema.safeParse({ commentId: "11111111-1111-4111-8111-111111111111", content: "  Обновлено  " }).success, true);
  assert.equal(commentEditSchema.safeParse({ commentId: "11111111-1111-4111-8111-111111111111", content: "   " }).success, false);
});

test("only the post owner can edit a publication", async () => {
  let updated = false;
  const prisma = {
    artist_profile_posts: {
      findUnique: async () => ({ id: "post-1", user_id: "owner-1", content: "Original", media_key: null, release_id: null }),
      update: async () => { updated = true; throw new Error("must not update"); }
    }
  } as never;
  await assert.rejects(() => updateArtistProfilePost({ prisma, userId: "other-1", postId: "post-1", content: "Changed" }), /ARTIST_POST_FORBIDDEN/);
  assert.equal(updated, false);
});

test("post owner edit preserves structured metadata and records editedAt", async () => {
  const original = encodeStructuredPostContent({ content: "Original", collaboration: null, mediaItems: [{ mediaType: "image", mediaKey: "artist-social/owner-1/photo.webp", mediaName: "photo.webp", role: "standard" }] });
  let stored = "";
  const now = new Date();
  const prisma = { artist_profile_posts: {
    findUnique: async () => ({
      id: "post-1",
      user_id: "owner-1",
      profile_key: "__personal__",
      audience: "PUBLIC",
      content: original,
      media_type: "image",
      media_key: "artist-social/owner-1/photo.webp",
      media_name: "photo.webp",
      release_id: null,
      created_at: new Date(now.getTime() - 60 * 60 * 1000)
    }),
    update: async ({ data }: { data: { content: string; edited_at: Date } }) => { stored = data.content; return { id: "post-1", content: data.content, updated_at: now, edited_at: data.edited_at }; }
  } } as never;
  const result = await updateArtistProfilePost({ prisma, userId: "owner-1", postId: "post-1", content: "Changed" });
  assert.equal(result.content, "Changed");
  assert.equal(parseStructuredPostContent(stored).mediaItems.length, 1);
  assert.ok(result.editedAt);
});

test("comment editing rejects another author before mutation", async () => {
  let mutated = false;
  const postPrisma = {
    artist_profile_posts: { findUnique: async () => ({ id: "post-1", user_id: "owner-1", profile_key: "__personal__", content: "Post" }) },
    artist_profile_post_comments: {
      findUnique: async () => ({ id: "comment-1", post_id: "post-1", user_id: "author-1", deleted_at: null }),
      update: async () => { mutated = true; }
    }
  } as never;
  await assert.rejects(() => updateArtistPostComment({ prisma: postPrisma, postId: "post-1", commentId: "comment-1", userId: "other-1", content: "Changed" }), /ARTIST_POST_COMMENT_FORBIDDEN/);
  assert.equal(mutated, false);

  const releasePrisma = {
    release: { findUnique: async () => ({ id: "release-1", userId: "owner-1", date: new Date("2026-08-01"), status: "approved", confirmed: true, roles: {} }) },
    scene_release_comments: {
      findUnique: async () => ({ id: "comment-1", release_id: "release-1", user_id: "author-1", deleted_at: null }),
      update: async () => { mutated = true; }
    }
  } as never;
  await assert.rejects(() => updateReleaseComment({ prisma: releasePrisma, releaseId: "release-1", commentId: "comment-1", userId: "other-1", content: "Changed" }), /RELEASE_COMMENT_FORBIDDEN/);
  assert.equal(mutated, false);
});

test("publishing a release notifies each unique artist follower with an exact feed link", async () => {
  const notifications: Array<Record<string, unknown>> = [];
  const prisma = {
    user: {
      findUnique: async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        name: "Artist",
        avatar: null,
        personalSiteUrl: null,
        vk: null,
        telegram: null,
        release: [{
          id: "release-1",
          title: "Fresh",
          date: new Date("2026-07-19T00:00:00.000Z"),
          performer: "Artist",
          roles: {}
        }]
      })
    },
    artist_profile_followers: {
      findMany: async () => [
        { follower_user_id: "22222222-2222-4222-8222-222222222222" },
        { follower_user_id: "22222222-2222-4222-8222-222222222222" },
        { follower_user_id: "33333333-3333-4333-8333-333333333333" }
      ]
    },
    social_notification_outbox: {
      createMany: async () => ({ count: 1 }),
      updateMany: async () => ({ count: 1 }),
      findUnique: async ({ where }: { where: { event_id: string } }) => ({ id: where.event_id, event_id: where.event_id, user_id: where.event_id.includes("33333333") ? "33333333-3333-4333-8333-333333333333" : "22222222-2222-4222-8222-222222222222", kind: "artist_release_published", title: "Новый релиз", message: "Fresh", href: "/feed/release_release-1", source_type: "release", source_id: "release-1", send_push: false, attempt_count: 1 }),
      update: async () => ({})
    },
    ai_user_notifications: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        notifications.push(create);
        return create;
      }
    },
    push_subscriptions: { findMany: async () => [] }
  } as never;

  const delivered = await notifyArtistFollowersAboutPublishedRelease({
    prisma,
    profileUserId: "11111111-1111-4111-8111-111111111111",
    releaseId: "release-1",
    releaseTitle: "Fresh"
  });

  assert.equal(delivered, 2);
  assert.equal(notifications.length, 2);
  assert.ok(notifications.every((item) => item.kind === "artist_release_published"));
  assert.ok(notifications.every((item) => item.cta_href === "/feed/release_release-1"));
});

test("publishing a post notifies each unique follower with an exact feed permalink", async () => {
  const notifications: Array<Record<string, unknown>> = [];
  const prisma = {
    artist_profile_followers: {
      findMany: async () => [
        { follower_user_id: "follower-1" },
        { follower_user_id: "follower-1" },
        { follower_user_id: "follower-2" }
      ]
    },
    social_notification_outbox: {
      createMany: async () => ({ count: 1 }),
      updateMany: async () => ({ count: 1 }),
      findUnique: async ({ where }: { where: { event_id: string } }) => ({ id: where.event_id, event_id: where.event_id, user_id: where.event_id.endsWith("follower-2") ? "follower-2" : "follower-1", kind: "artist_post_published", title: "Новая публикация", message: "Новая публикация", href: "/feed/post_post-1", source_type: "post", source_id: "post-1", send_push: false, attempt_count: 1 }),
      update: async () => ({})
    },
    ai_user_notifications: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        notifications.push(create);
        return create;
      }
    },
    push_subscriptions: { findMany: async () => [] }
  } as never;

  const delivered = await notifyArtistFollowersAboutPublishedPost({
    prisma,
    profileUserId: "author-1",
    profileKey: "__personal__",
    postId: "post-1",
    content: "Новая публикация"
  });

  assert.equal(delivered, 2);
  assert.equal(notifications.length, 2);
  assert.ok(notifications.every((item) => item.kind === "artist_post_published"));
  assert.ok(notifications.every((item) => item.cta_href === "/feed/post_post-1"));
});


test("artist post can be published with a linked release only", () => {
  assert.equal(artistPostSchema.safeParse({
    artistKey: "artist",
    content: "",
    releaseId: "release-1"
  }).success, true);
});


test("artist post can carry collaboration metadata", () => {
  const parsed = artistPostSchema.parse({
    artistKey: "artist",
    content: "Ищу продюсера для нового релиза",
    releaseId: "release-1",
    collaboration: {
      intent: "find_producer",
      role: "artist",
      genres: ["pop", "dance"],
      preference: "remote",
      bio: "Нужен продюсер под быстрый summer single"
    }
  });

  assert.equal(parsed.collaboration?.intent, "find_producer");
  assert.deepEqual(parsed.collaboration?.genres, ["pop", "dance"]);
});


test("structured collaboration posts roundtrip into stored content", () => {
  const parsed = artistPostSchema.parse({
    artistKey: "artist",
    content: "Ищу продюсера для нового релиза",
    releaseId: "release-1",
    collaboration: {
      intent: "find_producer",
      role: "artist",
      genres: ["pop", "dance"],
      preference: "remote",
      bio: "Нужен продюсер под быстрый summer single"
    }
  });

  const stored = parseStructuredPostContent(`[[ICM_POST_META_V1]]${JSON.stringify({
    type: "collaboration",
    collaboration: parsed.collaboration,
    mediaItems: [
      {
        mediaType: "audio",
        mediaKey: "artist-social/user/demo-track.mp3",
        mediaName: "demo-track.mp3",
        role: "demo"
      }
    ]
  })}

${parsed.content}`);

  assert.equal(stored.postType, "collaboration");
  assert.equal(stored.collaboration?.intent, "find_producer");
  assert.deepEqual(stored.collaboration?.genres, ["pop", "dance"]);
  assert.equal(stored.mediaItems.length, 1);
  assert.equal(stored.mediaItems[0]?.role, "demo");
  assert.equal(stored.content, "Ищу продюсера для нового релиза");
});

test("collaboration responses send a direct message with announcement context", async () => {
  let createdMessageBody = "";
  let createdConversationArgs: unknown[] = [];
  let createdConversationSql = "";
  let createdResponseData: Record<string, unknown> | null = null;
  const notifications: Array<Record<string, unknown>> = [];
  const prisma = {
    social_user_blocks: {
      count: async () => 0,
      findMany: async () => []
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === "sender-1"
        ? {
            id: "sender-1",
            name: "Sender",
            avatar: null,
            personalSiteUrl: null,
            vk: null,
            telegram: null,
            artistProfileType: "artist"
          }
        : null
    },
    release: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => (
        where.id === "release-1" && where.userId === "sender-1" ? { id: "release-1", title: "Portfolio" } : null
      )
    },
    artist_profile_posts: {
      findUnique: async () => ({
        id: "post-1",
        user_id: "owner-1",
        profile_key: "__personal__",
        content: encodeStructuredPostContent({
          content: "Ищу битмейкера",
          collaboration: {
            intent: "find_beatmaker",
            role: "artist",
            status: "open",
            workflow: "seeking",
            customIntentLabel: "",
            genres: [],
            preference: "remote",
            city: "",
            bio: ""
          }
        })
      })
    },
    collaboration_responses: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdResponseData = data;
        return {
          id: "response-1",
          message: data.message,
          created_at: new Date("2026-08-28T12:00:00.000Z"),
          sender_user_id: data.sender_user_id,
          sender_profile_key: data.sender_profile_key,
          linked_release: null,
          sender: { id: "sender-1", isVerifiedAuthor: false }
        };
      }
    },
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      if (sql.includes('SELECT id, name, avatar') && sql.includes('FROM "icecream"."user"')) {
        return [{ id: "owner-1", name: "Owner", avatar: null }];
      }
      if (sql.includes('INSERT INTO "icecream"."direct_conversations"')) {
        createdConversationSql = sql;
        createdConversationArgs = args;
        return [{ id: "conversation-1" }];
      }
      if (sql.includes('INSERT INTO "icecream"."direct_messages"')) {
        createdMessageBody = String(args[2] ?? "");
        return [{ id: "message-1" }];
      }
      return [];
    },
    ai_user_notifications: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const index = notifications.findIndex((item) => item.id === create.id);
        if (index >= 0) {
          notifications[index] = { ...notifications[index], ...update };
          return notifications[index];
        }
        notifications.push(create);
        return { id: "notification-1" };
      }
    },
    push_subscriptions: {
      findMany: async () => []
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
    $executeRaw: async () => undefined
  } as never;

  const result = await createCollaborationResponse({
    prisma,
    postId: "post-1",
    userId: "sender-1",
    artistKey: "__personal__",
    message: "Есть демо и опыт сведения",
    linkedReleaseId: "release-1"
  });

  assert.equal(result.id, "response-1");
  assert.equal(result.message, "Есть демо и опыт сведения");
  assert.equal(result.sender.id, "sender-1");
  assert.deepEqual(createdResponseData, {
    post_id: "post-1",
    sender_user_id: "sender-1",
    sender_profile_key: "__personal__",
    linked_release_id: "release-1",
    message: "Есть демо и опыт сведения"
  });
  assert.doesNotMatch(createdConversationSql, /ON CONFLICT/u);
  assert.deepEqual(createdConversationArgs.slice(2), ["collaboration_response", "post-1"]);
  assert.match(createdMessageBody, /Отклик на объявление/);
  assert.match(createdMessageBody, /Ищу битмейкера · Артист/);
  assert.match(createdMessageBody, /Объявление: Ищу битмейкера/);
  assert.match(createdMessageBody, /Релиз в портфолио: Portfolio/);
  assert.match(createdMessageBody, /Пост: \/dashboard\/community\?view=collaborations&post=post-1/);
  assert.match(createdMessageBody, /Есть демо и опыт сведения/);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, "direct_message");
  assert.equal(notifications[0]?.title, "У Вас отклик на объявление");
  assert.equal(notifications[0]?.message, "У Вас отклик на объявление");
  assert.equal(notifications[0]?.cta_href, "/dashboard/messages?conversationId=conversation-1");
});

test("collaboration responses reject duplicate sender response from unique constraint", async () => {
  const prisma = {
    social_user_blocks: {
      count: async () => 0,
      findMany: async () => []
    },
    user: {
      findUnique: async () => ({
        id: "sender-1",
        name: "Sender",
        avatar: null,
        personalSiteUrl: null,
        vk: null,
        telegram: null,
        artistProfileType: "artist"
      })
    },
    release: { findFirst: async () => null },
    artist_profile_posts: {
      findUnique: async () => ({
        id: "post-1",
        user_id: "owner-1",
        profile_key: "__personal__",
        content: encodeStructuredPostContent({
          content: "Ищу битмейкера",
          collaboration: {
            intent: "find_beatmaker",
            role: "artist",
            status: "open",
            workflow: "seeking",
            customIntentLabel: "",
            genres: [],
            preference: "remote",
            city: "",
            bio: ""
          }
        })
      })
    },
    collaboration_responses: {
      create: async () => {
        throw { code: "P2002", message: "Unique constraint failed on collaboration_responses" };
      }
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
    $executeRaw: async () => undefined
  } as never;

  await assert.rejects(
    () => createCollaborationResponse({
      prisma,
      postId: "post-1",
      userId: "sender-1",
      artistKey: "__personal__",
      message: "Повторный отклик"
    }),
    /COLLABORATION_RESPONSE_ALREADY_EXISTS/
  );
});

test("collaboration responses reject self-response, closed and non-collaboration posts", async () => {
  const openContent = encodeStructuredPostContent({
    content: "Ищу продюсера",
    collaboration: {
      intent: "find_producer",
      role: "artist",
      status: "open",
      workflow: "seeking",
      customIntentLabel: "",
      genres: [],
      preference: "remote",
      city: "",
      bio: ""
    }
  });
  const closedContent = encodeStructuredPostContent({
    content: "Ищу вокалиста",
    collaboration: {
      intent: "find_artist",
      role: "producer",
      status: "closed",
      workflow: "seeking",
      customIntentLabel: "",
      genres: [],
      preference: "remote",
      city: "",
      bio: ""
    }
  });
  const prisma = {
    social_user_blocks: {
      count: async () => 0,
      findMany: async () => []
    },
    user: {
      findUnique: async () => ({
        id: "viewer-1",
        name: "Viewer",
        avatar: null,
        personalSiteUrl: null,
        vk: null,
        telegram: null,
        artistProfileType: "artist"
      })
    },
    release: { findFirst: async () => null },
    artist_profile_posts: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === "self") return { id: "self", user_id: "viewer-1", profile_key: "__personal__", content: openContent };
        if (where.id === "closed") return { id: "closed", user_id: "owner-1", profile_key: "__personal__", content: closedContent };
        return { id: "plain", user_id: "owner-1", profile_key: "__personal__", content: "Обычный пост" };
      }
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
    $executeRaw: async () => undefined
  } as never;

  await assert.rejects(() => createCollaborationResponse({ prisma, postId: "self", userId: "viewer-1", message: "self" }), /COLLABORATION_RESPONSE_SELF_FORBIDDEN/);
  await assert.rejects(() => createCollaborationResponse({ prisma, postId: "closed", userId: "viewer-1", message: "closed" }), /COLLABORATION_RESPONSE_CLOSED/);
  await assert.rejects(() => createCollaborationResponse({ prisma, postId: "plain", userId: "viewer-1", message: "plain" }), /COLLABORATION_POST_REQUIRED/);
});

test("only the announcement owner can list collaboration responses", async () => {
  const content = encodeStructuredPostContent({
    content: "Ищу сонграйтера",
    collaboration: {
      intent: "find_songwriter",
      role: "artist",
      status: "open",
      workflow: "seeking",
      customIntentLabel: "",
      genres: [],
      preference: "remote",
      city: "",
      bio: ""
    }
  });
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        name: where.id === "sender-1" ? "Sender" : "Owner",
        avatar: null,
        personalSiteUrl: null,
        vk: null,
        telegram: null,
        artistProfileType: "artist"
      })
    },
    artist_profile_posts: {
      findUnique: async () => ({ id: "post-1", user_id: "owner-1", content })
    },
    collaboration_responses: {
      findMany: async () => [{
        id: "response-1",
        message: "Готов помочь",
        created_at: new Date("2026-08-28T13:00:00.000Z"),
        sender_user_id: "sender-1",
        sender_profile_key: "__personal__",
        linked_release: null,
        sender: { id: "sender-1", isVerifiedAuthor: false }
      }]
    }
  } as never;

  await assert.rejects(() => listCollaborationResponses({ prisma, postId: "post-1", userId: "viewer-1" }), /COLLABORATION_RESPONSE_FORBIDDEN/);
  const result = await listCollaborationResponses({ prisma, postId: "post-1", userId: "owner-1" });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.sender.displayName, "Sender");
});

test("collaboration announcement status can be closed only by the owner", async () => {
  const stored = encodeStructuredPostContent({
    content: "Ищу менеджера",
    collaboration: {
      intent: "find_manager",
      role: "artist",
      status: "open",
      workflow: "seeking",
      customIntentLabel: "",
      genres: [],
      preference: "hybrid",
      city: "",
      bio: ""
    }
  });
  let updatedContent = "";
  let upsertedCategory = "";
  const prisma = {
    artist_profile_posts: {
      findUnique: async () => ({
        id: "post-1",
        user_id: "owner-1",
        profile_key: "__personal__",
        audience: "PUBLIC",
        created_at: new Date("2026-08-28T10:00:00.000Z"),
        release_id: null,
        content: stored
      }),
      update: async ({ data }: { data: { content: string } }) => {
        updatedContent = data.content;
        return { id: "post-1", content: data.content };
      }
    },
    social_activity_events: {
      upsert: async ({ create }: { create: { category?: string } }) => {
        upsertedCategory = create.category ?? "";
        return {};
      }
    }
  } as never;

  await assert.rejects(
    () => updateCollaborationAnnouncementStatus({ prisma, postId: "post-1", userId: "viewer-1", status: "closed" }),
    /COLLABORATION_CLOSE_FORBIDDEN/
  );

  const result = await updateCollaborationAnnouncementStatus({
    prisma,
    postId: "post-1",
    userId: "owner-1",
    status: "closed"
  });

  assert.equal(result.status, "closed");
  assert.equal(parseStructuredPostContent(updatedContent).collaboration?.status, "closed");
  assert.equal(upsertedCategory, "collaboration");
});

test("comment trees hide deleted leaves but retain deleted ancestors that preserve live replies", () => {
  const author = { id: "user-1", name: "User", avatar: "data:image/jpeg;base64,oversized", isVerifiedAuthor: false };
  const rows = [
    { id: "root-live", parent_id: null, user_id: "user-1", content: "Root", created_at: new Date("2026-08-01T10:00:00Z"), updated_at: new Date("2026-08-01T10:00:00Z"), deleted_at: null, author },
    { id: "reply-deleted", parent_id: "root-live", user_id: "user-1", content: "", created_at: new Date("2026-08-01T11:00:00Z"), updated_at: new Date("2026-08-01T11:00:00Z"), deleted_at: new Date("2026-08-02T00:00:00Z"), author },
    { id: "root-deleted", parent_id: null, user_id: "user-1", content: "", created_at: new Date("2026-08-01T12:00:00Z"), updated_at: new Date("2026-08-01T12:00:00Z"), deleted_at: new Date("2026-08-02T00:00:00Z"), author },
    { id: "reply-live", parent_id: "root-deleted", user_id: "user-1", content: "Still visible", created_at: new Date("2026-08-01T13:00:00Z"), updated_at: new Date("2026-08-01T13:00:00Z"), deleted_at: null, author }
  ];

  const tree = buildFeedCommentTree(rows);

  assert.deepEqual(tree.map((comment) => comment.id), ["root-deleted", "root-live"]);
  assert.deepEqual(tree.find((comment) => comment.id === "root-live")?.replies, []);
  assert.equal(tree.find((comment) => comment.id === "root-deleted")?.content, "Комментарий удалён");
  assert.equal(tree.find((comment) => comment.id === "root-deleted")?.author.avatarUrl, null);
  assert.deepEqual(tree.find((comment) => comment.id === "root-deleted")?.replies.map((reply) => reply.id), ["reply-live"]);
});

test("post comment listing paginates roots in Prisma and loads replies only for the selected page", async () => {
  const author = { id: "user-1", name: "User", avatar: null, isVerifiedAuthor: false };
  const queryLog: Array<Record<string, unknown>> = [];
  const root = { id: "root-2", user_id: "user-1", parent_id: null, content: "Root", created_at: new Date("2026-08-02T10:00:00Z"), updated_at: new Date("2026-08-02T10:00:00Z"), edited_at: null, deleted_at: null, author };
  const reply = { id: "reply-2", user_id: "user-2", parent_id: "root-2", content: "Reply", created_at: new Date("2026-08-02T11:00:00Z"), updated_at: new Date("2026-08-02T11:00:00Z"), edited_at: null, deleted_at: null, author: { ...author, id: "user-2" } };
  const prisma = {
    social_user_blocks: { count: async () => 0, findMany: async () => [] },
    artist_profile_posts: { findUnique: async () => ({ id: "post-1", user_id: "user-1", profile_key: "__personal__", content: "Post" }) },
    artist_profile_post_comments: {
      count: async (args: Record<string, unknown>) => {
        queryLog.push({ operation: "count", ...args });
        return 3;
      },
      findMany: async (args: { where: { parent_id?: null | { in: string[] } }; skip?: number; take?: number }) => {
        queryLog.push({ operation: "findMany", ...args });
        if (args.where.parent_id === null) return [root];
        if (typeof args.where.parent_id === "object" && args.where.parent_id.in.includes("root-2")) return [reply];
        return [];
      }
    }
  } as never;

  const result = await listArtistPostComments({ prisma, postId: "post-1", userId: "user-1", limit: 1, offset: 1 });

  assert.equal(result.total, 3);
  assert.equal(result.comments[0]?.id, "root-2");
  assert.equal(result.comments[0]?.replies[0]?.id, "reply-2");
  assert.equal(result.hasMore, false);
  const rootQuery = queryLog.find((entry) => entry.operation === "findMany" && (entry.where as { parent_id?: unknown }).parent_id === null);
  assert.equal(rootQuery?.skip, 1);
  assert.equal(rootQuery?.take, 2);
  assert.deepEqual((queryLog.find((entry) => entry.operation === "count")?.where as { deleted_at?: unknown }).deleted_at, null);
});

test("post comment listing degrades to an empty page when the comments table is missing", async () => {
  const prisma = {
    social_user_blocks: { count: async () => 0, findMany: async () => [] },
    artist_profile_posts: { findUnique: async () => ({ id: "post-1", user_id: "user-1", profile_key: "__personal__", content: "Post" }) },
    artist_profile_post_comments: {
      findMany: async () => {
        throw new Error("The table `icecream.artist_profile_post_comments` does not exist in the current database.");
      }
    }
  } as never;

  const result = await listArtistPostComments({ prisma, postId: "post-1", userId: "user-1" });

  assert.deepEqual(result, { comments: [], total: 0, nextOffset: null, hasMore: false });
});

test("post comment listing retries without reaction hydration when the comment reactions table is missing", async () => {
  const author = { id: "user-1", name: "User", avatar: null, isVerifiedAuthor: false };
  const root = { id: "root-1", user_id: "user-1", parent_id: null, content: "Root", created_at: new Date("2026-08-02T10:00:00Z"), updated_at: new Date("2026-08-02T10:00:00Z"), edited_at: null, deleted_at: null, author };
  const prisma = {
    social_user_blocks: { count: async () => 0, findMany: async () => [] },
    artist_profile_posts: { findUnique: async () => ({ id: "post-1", user_id: "user-1", profile_key: "__personal__", content: "Post" }) },
    artist_profile_post_comments: {
      count: async () => 1,
      findMany: async (args: { where: { parent_id?: null | { in: string[] } }; select?: { reactions?: unknown } }) => {
        if (args.select?.reactions) {
          throw new Error("The table `icecream.artist_profile_post_comment_likes` does not exist in the current database.");
        }
        if (args.where.parent_id === null) return [root];
        return [];
      }
    }
  } as never;

  const result = await listArtistPostComments({ prisma, postId: "post-1", userId: "user-1" });

  assert.equal(result.total, 1);
  assert.equal(result.comments[0]?.id, "root-1");
  assert.equal(result.comments[0]?.reactionSummary.total, 0);
});

test("personal profile follows survive subscription listing", async () => {
  const ownerId = "11111111-1111-4111-8111-111111111111";
  const prisma = {
    social_user_blocks: { findMany: async () => [] },
    artist_profile_followers: {
      findMany: async () => [{ id: "follow-1", profile_user_id: ownerId, profile_key: "__personal__", created_at: new Date("2026-08-01T00:00:00Z") }]
    },
    user: {
      findUnique: async () => ({ id: ownerId, name: "Personal Artist", avatar: null, emailVerified: null, isVerifiedAuthor: false, personalSiteUrl: null, vk: null, telegram: null, artistProfileType: "producer", release: [] })
    },
    artist_profile_posts: { findFirst: async () => ({ id: "post-1" }) }
  } as never;

  const subscriptions = await listFollowedArtistProfiles({ prisma, followerUserId: "follower-1" });

  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0]?.artist.displayName, "Personal Artist");
  assert.equal(subscriptions[0]?.artist.profileType, "producer");
});

test("reacting to your own post does not create a notification", async () => {
  let activeReaction: string | null = null;
  let notifications = 0;
  const prisma = {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
    artist_profile_posts: { findUnique: async () => ({ id: "post-1", user_id: "user-1", profile_key: "__personal__", content: "Post" }) },
    artist_profile_post_likes: {
      findUnique: async () => activeReaction ? ({ id: "like-1", reaction: activeReaction }) : null,
      create: async ({ data }: { data: { reaction: string } }) => { activeReaction = data.reaction; },
      update: async ({ data }: { data: { reaction: string } }) => { activeReaction = data.reaction; },
      delete: async () => { activeReaction = null; },
      groupBy: async () => activeReaction ? [{ reaction: activeReaction, _count: { _all: 1 } }] : []
    },
    ai_user_notifications: { upsert: async () => { notifications += 1; } }
  } as never;

  const result = await toggleArtistPostLike({ prisma, postId: "post-1", visitorId: "user-1", ipHash: null, reaction: "heart" });

  assert.equal(result.likes, 1);
  assert.equal(notifications, 0);
});

test("a blocked peer cannot react to an artist post", async () => {
  let mutated = false;
  const prisma = {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
    social_user_blocks: { count: async () => 1 },
    artist_profile_posts: { findUnique: async () => ({ id: "post-1", user_id: "owner-1", profile_key: "__personal__", content: "Post" }) },
    artist_profile_post_likes: {
      findUnique: async () => { mutated = true; return null; },
      create: async () => { mutated = true; }
    }
  } as never;

  await assert.rejects(
    () => toggleArtistPostLike({ prisma, postId: "post-1", visitorId: "viewer-1", ipHash: null }),
    SocialInteractionBlockedError
  );
  assert.equal(mutated, false);
});

test("a blocked peer cannot react to a comment", async () => {
  let transactionStarted = false;
  const prisma = {
    social_user_blocks: { count: async () => 1 },
    artist_profile_posts: { findUnique: async () => ({ id: "post-1", user_id: "owner-1", profile_key: "__personal__", content: "Post" }) },
    artist_profile_post_comments: { findUnique: async () => ({ id: "comment-1", post_id: "post-1", user_id: "author-1", deleted_at: null }) },
    $transaction: async () => { transactionStarted = true; }
  } as never;
  await assert.rejects(() => toggleArtistPostCommentReaction({ prisma, postId: "post-1", commentId: "comment-1", visitorId: "viewer-1", ipHash: null }), SocialInteractionBlockedError);
  assert.equal(transactionStarted, false);
});

test("replies cannot target a deleted parent comment", async () => {
  const locks: string[] = [];
  const prisma = {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
    $executeRaw: async (_query: TemplateStringsArray, key: string) => { locks.push(key); },
    artist_profile_posts: { findUnique: async () => ({ id: "post-1", user_id: "user-1", profile_key: "__personal__", content: "Post" }) },
    artist_profile_post_comments: {
      findUnique: async () => ({ id: "comment-1", post_id: "post-1", user_id: "user-2", deleted_at: new Date() }),
      create: async () => { throw new Error("must not create"); }
    }
  } as never;

  await assert.rejects(
    () => createArtistPostComment({ prisma, postId: "post-1", userId: "user-1", content: "Reply", parentId: "comment-1" }),
    /ARTIST_POST_COMMENT_PARENT_NOT_FOUND/
  );
  await deleteArtistPostComment({ prisma, postId: "post-1", commentId: "comment-1", userId: "user-2" });
  assert.deepEqual(locks, ["post-comment-parent:comment-1", "post-comment-parent:comment-1"]);
});

test("comments cannot mutate a post whose backing public profile is no longer available", async () => {
  const prisma = {
    artist_profile_posts: { findUnique: async () => ({ id: "post-1", user_id: "owner-1", profile_key: "disabled-profile", content: "Post" }) },
    user: {
      findUnique: async () => ({ id: "owner-1", name: "Owner", avatar: null, emailVerified: null, isVerifiedAuthor: false, personalSiteUrl: null, vk: null, telegram: null, artistProfileType: "artist", release: [] })
    },
    artist_profile_post_comments: { findMany: async () => [], count: async () => 0 }
  } as never;

  await assert.rejects(
    () => listArtistPostComments({ prisma, postId: "post-1" }),
    /ARTIST_POST_NOT_FOUND/
  );
});

test("release comment listing applies root pagination before loading the selected thread replies", async () => {
  const author = { id: "user-1", name: "User", avatar: null, isVerifiedAuthor: false };
  const root = { id: "root-1", user_id: "user-1", parent_id: null, content: "Root", media_key: null, media_name: null, created_at: new Date("2026-08-01T10:00:00Z"), updated_at: new Date("2026-08-01T10:00:00Z"), edited_at: null, deleted_at: null, author };
  const reply = { ...root, id: "reply-1", parent_id: "root-1", content: "Reply" };
  const rootQueries: Array<{ skip?: number; take?: number }> = [];
  const prisma = {
    release: { findUnique: async () => ({ id: "release-1", date: new Date("2026-08-01T00:00:00Z"), status: "approved", confirmed: true, roles: {} }) },
    scene_release_comments: {
      count: async () => 2,
      findMany: async (args: { where: { parent_id?: null | { in: string[] } }; skip?: number; take?: number }) => {
        if (args.where.parent_id === null) {
          rootQueries.push(args);
          return [root];
        }
        if (typeof args.where.parent_id === "object" && args.where.parent_id.in.includes("root-1")) return [reply];
        return [];
      }
    }
  } as never;

  const result = await listReleaseComments({ prisma, releaseId: "release-1", limit: 10, offset: 4 });

  assert.equal(result.total, 2);
  assert.equal(result.comments[0]?.replies[0]?.id, "reply-1");
  assert.deepEqual(rootQueries.map(({ skip, take }) => ({ skip, take })), [{ skip: 4, take: 11 }]);
});

test("release comment listing degrades to an empty page when the comments table is missing", async () => {
  const prisma = {
    release: { findUnique: async () => ({ id: "release-1", userId: "owner-1", date: new Date("2026-08-01T00:00:00Z"), status: "approved", confirmed: true, roles: {} }) },
    scene_release_comments: {
      findMany: async () => {
        throw new Error("The table `icecream.scene_release_comments` does not exist in the current database.");
      }
    }
  } as never;

  const result = await listReleaseComments({ prisma, releaseId: "release-1" });

  assert.deepEqual(result, { comments: [], total: 0, nextOffset: null, hasMore: false });
});

test("release comment listing retries without reaction hydration when the comment reactions table is missing", async () => {
  const author = { id: "user-1", name: "User", avatar: null, isVerifiedAuthor: false };
  const root = { id: "root-1", user_id: "user-1", parent_id: null, content: "Root", media_key: null, media_name: null, created_at: new Date("2026-08-01T10:00:00Z"), updated_at: new Date("2026-08-01T10:00:00Z"), edited_at: null, deleted_at: null, author };
  const prisma = {
    release: { findUnique: async () => ({ id: "release-1", userId: "owner-1", date: new Date("2026-08-01T00:00:00Z"), status: "approved", confirmed: true, roles: {} }) },
    scene_release_comments: {
      count: async () => 1,
      findMany: async (args: { where: { parent_id?: null | { in: string[] } }; select?: { reactions?: unknown } }) => {
        if (args.select?.reactions) {
          throw new Error("The table `icecream.scene_release_comment_likes` does not exist in the current database.");
        }
        if (args.where.parent_id === null) return [root];
        return [];
      }
    }
  } as never;

  const result = await listReleaseComments({ prisma, releaseId: "release-1" });

  assert.equal(result.total, 1);
  assert.equal(result.comments[0]?.id, "root-1");
  assert.equal(result.comments[0]?.reactionSummary.total, 0);
});

test("reacting to your own release does not create a notification", async () => {
  let activeReaction: string | null = null;
  let notifications = 0;
  const prisma = {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
    release: { findUnique: async () => ({ id: "release-1", date: new Date("2026-08-01T00:00:00Z"), status: "approved", confirmed: true, roles: {}, userId: "user-1", title: "Release" }) },
    scene_release_likes: {
      findUnique: async () => activeReaction ? ({ id: "like-1", reaction: activeReaction }) : null,
      create: async ({ data }: { data: { reaction: string } }) => { activeReaction = data.reaction; },
      update: async ({ data }: { data: { reaction: string } }) => { activeReaction = data.reaction; },
      delete: async () => { activeReaction = null; },
      groupBy: async () => activeReaction ? [{ reaction: activeReaction, _count: { _all: 1 } }] : []
    },
    ai_user_notifications: { upsert: async () => { notifications += 1; } }
  } as never;

  const result = await toggleReleaseLike({ prisma, releaseId: "release-1", visitorId: "user-1", ipHash: null, reaction: "fire" });

  assert.equal(result.likes, 1);
  assert.equal(notifications, 0);
});

test("artist social snapshots query only non-deleted comments and count the same visible set", async () => {
  const postQueries: Record<string, unknown>[] = [];
  const releaseCommentQueries: Record<string, unknown>[] = [];
  const prisma = {
    social_user_blocks: {
      count: async () => 0,
      findMany: async () => [{ blocker_user_id: "viewer-1", blocked_user_id: "blocked-1" }]
    },
    artist_profile_posts: { findMany: async (args: Record<string, unknown>) => { postQueries.push(args); return []; } },
    artist_profile_post_likes: { findMany: async () => [] },
    scene_release_likes: { groupBy: async () => [], findMany: async () => [] },
    scene_release_comments: { findMany: async (args: Record<string, unknown>) => { releaseCommentQueries.push(args); return []; } },
    artist_profile_followers: { count: async () => 0, findUnique: async () => null }
  } as never;

  await getArtistSocialSnapshot({
    prisma,
    profileUserId: "owner-1",
    artistKey: "artist-key",
    releaseIds: ["release-1"],
    visitorId: "viewer-1",
    viewerUserId: "viewer-1"
  });

  const postSelect = postQueries[0]?.select as { comments?: { where?: unknown }; _count?: { select?: { comments?: unknown } } };
  assert.deepEqual(postSelect.comments?.where, { deleted_at: null, user_id: { notIn: ["blocked-1"] } });
  assert.deepEqual(postSelect._count?.select?.comments, {
    where: { deleted_at: null, user_id: { notIn: ["blocked-1"] } }
  });
  assert.deepEqual(releaseCommentQueries[0]?.where, {
    release_id: { in: ["release-1"] },
    deleted_at: null,
    user_id: { notIn: ["blocked-1"] }
  });
});
