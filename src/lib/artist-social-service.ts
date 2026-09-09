import type { PrismaClient } from "@prisma/client";

import type { FeedReaction, FeedReactionSummary } from "@/lib/feed-contract";
import { z } from "zod";

import {
  getPublicArtistProfile,
  getUserArtistProfilesForRelease,
  getSingleUserArtistProfileSettings,
  getUserArtistProfileSettings,
  isCommunityReleaseVisible,
  type PublicArtistRelease
} from "@/lib/artist-profile-service";
import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import {
  FEED_REACTIONS,
  buildFeedCommentTree,
  buildReactionSummary,
  isFeedReaction
} from "@/lib/feed-social-helpers";
import { buildPersonalProfileSlug, parseArtistProfileUserId, PERSONAL_ARTIST_PROFILE_KEY } from "@/lib/artist-profile-shared";
import { normalizeArtistProfileType } from "@/lib/artist-profile-type";
import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import { dispatchSocialNotificationsSafely, enqueueSocialNotification } from "@/lib/social-notification-outbox";
import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import { containsBlockedWords } from "@/lib/text-moderation";
import {
  assertSocialInteractionAllowed,
  listBlockedPeerIds,
  type SocialSafetyPrisma
} from "@/lib/social-safety-policy";
import { getReleasePublicListenSummary } from "@/lib/smart-link-service";
import {
  buildCollaborationPresentation,
  buildCollaborationSearchText,
  collaborationPostMetadataSchema,
  encodeStructuredPostContent,
  parseStructuredPostContent,
  postMediaItemSchema,
  type CollaborationStatus,
  type PostMediaItem
} from "@/lib/collaboration";
import { canViewSocialPost, normalizeSocialPostAudience } from "@/lib/social-post-access";
import { listUnreferencedSocialMediaKeys } from "@/lib/social-media-lifecycle";
import { upsertSocialActivityEvent } from "@/lib/social-activity-service";
import { resolveCommunityCoverUrl } from "@/lib/dashboard-community-service";
import { createDirectMessageRowsInTransaction } from "@/lib/direct-message-service";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { toNotificationStorageId } from "@/lib/notification-storage-id";

const optionalMediaKey = z.string().trim().max(500).optional().default("");
const optionalMediaName = z.string().trim().max(255).optional().default("");
const optionalCollaboration = collaborationPostMetadataSchema.optional().nullable();
const optionalMediaItems = z.array(postMediaItemSchema).max(8).optional().default([]);
const optionalReleaseId = z.string().trim().uuid().optional().nullable();

function isMissingCollaborationResponsesTable(error: unknown) {
  return isAnyPrismaTableMissingError(error, [
    "icecream.collaboration_responses",
    "collaboration_responses"
  ]);
}

function isCollaborationResponseDuplicateError(error: unknown) {
  if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002") {
    return true;
  }
  return /collaboration_responses.*unique|unique constraint|duplicate key/i.test(String(error instanceof Error ? error.message : error ?? ""));
}

function isMissingArtistPostCommentsTable(error: unknown) {
  return isAnyPrismaTableMissingError(error, [
    "icecream.artist_profile_post_comments",
    "artist_profile_post_comments"
  ]);
}

function isMissingSceneReleaseCommentsTable(error: unknown) {
  return isAnyPrismaTableMissingError(error, [
    "icecream.scene_release_comments",
    "scene_release_comments"
  ]);
}

function isMissingArtistPostCommentReactionsTable(error: unknown) {
  return isAnyPrismaTableMissingError(error, [
    "icecream.artist_profile_post_comment_likes",
    "artist_profile_post_comment_likes"
  ]);
}

function isMissingSceneReleaseCommentReactionsTable(error: unknown) {
  return isAnyPrismaTableMissingError(error, [
    "icecream.scene_release_comment_likes",
    "scene_release_comment_likes"
  ]);
}

export function normalizeSocialIdempotencyKey(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(normalized)) {
    throw new Error("SOCIAL_IDEMPOTENCY_KEY_INVALID");
  }
  return normalized;
}

function canonicalPostPreview(content: string | null | undefined, maxLength = 80): string {
  if (!content) return "";
  return parseStructuredPostContent(content).content.replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function resolveSocialActivityMediaKind(mediaItems: PostMediaItem[]) {
  if (mediaItems.some((item) => item.mediaType === "video")) return "VIDEO";
  if (mediaItems.some((item) => item.mediaType === "audio")) return "AUDIO";
  if (mediaItems.some((item) => item.mediaType === "image")) return "IMAGE";
  return "NONE";
}

async function lockSocialMutation(prisma: PrismaClient, key: string): Promise<void> {
  const raw = prisma as unknown as { $executeRaw?: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> };
  if (raw.$executeRaw) await raw.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

function normalizeArtistPostMediaItems(value: {
  mediaType?: "image" | "audio" | "video";
  mediaKey?: string;
  mediaName?: string;
  mediaItems?: PostMediaItem[];
}) {
  const normalized = [...(value.mediaItems ?? [])];
  if (!normalized.length && value.mediaType && value.mediaKey) {
    normalized.push({
      mediaType: value.mediaType,
      mediaKey: value.mediaKey,
      mediaName: value.mediaName ?? "",
      role: "standard"
    });
  }
  return normalized.slice(0, 8);
}

function validateArtistPostMediaItems(mediaItems: PostMediaItem[], context: z.RefinementCtx) {
  const imageCount = mediaItems.filter((item) => item.mediaType === "image").length;
  const videoCount = mediaItems.filter((item) => item.mediaType === "video").length;
  const audioCount = mediaItems.filter((item) => item.mediaType === "audio").length;
  if (imageCount > 8) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Можно прикрепить до 8 фотографий", path: ["mediaItems"] });
  }
  if (videoCount > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "К публикации можно прикрепить только одно видео", path: ["mediaItems"] });
  }
  if (audioCount > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "К публикации можно прикрепить только один demo audio", path: ["mediaItems"] });
  }
}

function assertOwnedSocialMediaKeys(userId: string, mediaItems: PostMediaItem[]) {
  for (const item of mediaItems) {
    assertOwnedSocialMediaKey(userId, item.mediaKey);
    if (item.posterKey) assertOwnedSocialMediaKey(userId, item.posterKey);
  }
}

export const artistPostSchema = z.object({
  artistKey: z.string().trim().min(1).max(160),
  audience: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]).optional().default("PUBLIC"),
  content: z.string().trim().max(1500).optional().default(""),
  mediaType: z.enum(["image", "audio", "video"]).optional(),
  mediaKey: optionalMediaKey,
  mediaName: optionalMediaName,
  mediaItems: optionalMediaItems,
  releaseId: z.string().trim().max(64).optional().default(""),
  collaboration: optionalCollaboration
}).superRefine((value, context) => {
  const mediaItems = normalizeArtistPostMediaItems(value);
  if (!value.content && !value.mediaKey && !value.releaseId && !mediaItems.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Добавьте текст, фото, аудио или видео", path: ["content"] });
  }
  if (Boolean(value.mediaKey) !== Boolean(value.mediaType)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Проверьте вложение", path: ["mediaKey"] });
  }
  validateArtistPostMediaItems(mediaItems, context);
  if (value.content && containsBlockedWords(value.content)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Нецензурные слова в публикации запрещены", path: ["content"] });
  }
});

export const releaseCommentSchema = z.object({
  content: z.string().trim().max(800).optional().default(""),
  mediaKey: optionalMediaKey,
  mediaName: optionalMediaName,
  parentId: z.string().trim().uuid().optional().nullable()
}).superRefine((value, context) => {
  if (!value.content && !value.mediaKey) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Добавьте комментарий, эмодзи или фото", path: ["content"] });
  }
  if (value.content && containsBlockedWords(value.content)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Нецензурные слова в комментариях запрещены", path: ["content"] });
  }
});

export const artistPostCommentSchema = z.object({
  content: z.string().trim().min(1, "Добавьте комментарий").max(800),
  parentId: z.string().trim().uuid().optional().nullable()
}).superRefine((value, context) => {
  if (containsBlockedWords(value.content)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Нецензурные слова в комментариях запрещены", path: ["content"] });
  }
});

export const artistPostEditSchema = z.object({
  content: z.string().trim().max(1500)
}).superRefine((value, context) => {
  if (value.content && containsBlockedWords(value.content)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Нецензурные слова в публикации запрещены", path: ["content"] });
  }
});

export const collaborationResponseSchema = z.object({
  artistKey: z.string().trim().min(1).max(160).optional().default(PERSONAL_ARTIST_PROFILE_KEY),
  message: z.string().trim().min(1, "Добавьте сообщение").max(1200),
  linkedReleaseId: optionalReleaseId
}).superRefine((value, context) => {
  if (containsBlockedWords(value.message)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Нецензурные слова в отклике запрещены", path: ["message"] });
  }
});

export const commentEditSchema = z.object({
  commentId: z.string().trim().uuid(),
  content: z.string().trim().min(1, "Добавьте комментарий").max(800)
}).superRefine((value, context) => {
  if (containsBlockedWords(value.content)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Нецензурные слова в комментариях запрещены", path: ["content"] });
  }
});

const socialAuthorSelect = {
  id: true,
  name: true,
  avatar: true,
  isVerifiedAuthor: true
} as const;

const linkedReleaseSelect = {
  id: true,
  title: true,
  date: true,
  performer: true,
  preview: true,
  user: { select: { name: true } }
} as const;

const postCommentSelect = {
  id: true,
  user_id: true,
  parent_id: true,
  content: true,
  created_at: true,
  updated_at: true,
  edited_at: true,
  deleted_at: true,
  reactions: { select: { visitor_id: true, reaction: true } },
  author: { select: socialAuthorSelect }
} as const;

const postCommentSelectWithoutReactions = {
  id: true,
  user_id: true,
  parent_id: true,
  content: true,
  created_at: true,
  updated_at: true,
  edited_at: true,
  deleted_at: true,
  author: { select: socialAuthorSelect }
} as const;

const releaseCommentSelect = {
  ...postCommentSelect,
  media_key: true,
  media_name: true
} as const;

const releaseCommentSelectWithoutReactions = {
  ...postCommentSelectWithoutReactions,
  media_key: true,
  media_name: true
} as const;

type SocialCommentRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  media_key?: string | null;
  media_name?: string | null;
  created_at: Date;
  updated_at: Date;
  edited_at: Date | null;
  deleted_at: Date | null;
  reactions?: Array<{ visitor_id: string; reaction: string }>;
  author: {
    id: string;
    name: string;
    avatar: string | null;
    isVerifiedAuthor: boolean;
  };
};

export const feedReactionSchema = z.enum(FEED_REACTIONS);

function mapSocialAuthor(author: {
  id: string;
  name: string;
  avatar: string | null;
  isVerifiedAuthor: boolean;
}) {
  return {
    id: author.id,
    name: author.name,
    avatarUrl: buildStoredFileRouteUrl(author.avatar),
    isVerified: author.isVerifiedAuthor
  };
}

function assertOwnedSocialMediaKey(userId: string, mediaKey: string) {
  if (mediaKey && !mediaKey.startsWith(`artist-social/${userId}/`)) {
    throw new Error("ARTIST_SOCIAL_INVALID_MEDIA");
  }
}

async function enqueueArtistPostPublishedNotifications(params: {
  prisma: PrismaClient;
  userId: string;
  artistKey: string;
  postId: string;
  content: string;
  audience: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
}): Promise<void> {
  if (params.audience === "PRIVATE") return;

  const followerIds = Array.from(new Set((await params.prisma.artist_profile_followers.findMany({
    where: {
      profile_user_id: params.userId,
      profile_key: params.artistKey,
      follower_user_id: { not: params.userId }
    },
    select: { follower_user_id: true }
  })).map((follow) => follow.follower_user_id)));

  if (followerIds.length === 0) return;

  const eventIds = followerIds.map((followerUserId) => `artist-post-published-${params.postId}-${followerUserId}`);
  const href = `/feed/post_${encodeURIComponent(params.postId)}`;
  const message = params.content.trim()
    ? `Автор опубликовал: «${params.content.trim().slice(0, 100)}».`
    : "Автор опубликовал новый материал.";
  const outbox = params.prisma as PrismaClient & {
    social_notification_outbox?: {
      createMany: (args: {
        data: Array<{
          event_id: string;
          user_id: string;
          kind: string;
          title: string;
          message: string;
          href: string;
          source_type: string | null;
          source_id: string | null;
          send_push: boolean;
        }>;
        skipDuplicates: boolean;
      }) => Promise<unknown>;
    };
  };

  if (outbox.social_notification_outbox) {
    await outbox.social_notification_outbox.createMany({
      data: followerIds.map((followerUserId, index) => ({
        event_id: eventIds[index],
        user_id: followerUserId,
        kind: "artist_post_published",
        title: "Новая публикация",
        message,
        href,
        source_type: "post",
        source_id: params.postId,
        send_push: true
      })),
      skipDuplicates: true
    });
  } else {
    for (const followerUserId of followerIds) {
      await enqueueSocialNotification(params.prisma, {
        id: `artist-post-published-${params.postId}-${followerUserId}`,
        userId: followerUserId,
        kind: "artist_post_published",
        title: "Новая публикация",
        message,
        href,
        sourceType: "post",
        sourceId: params.postId
      });
    }
  }

  await dispatchSocialNotificationsSafely(params.prisma, eventIds);
}

function enqueueArtistPostPublishedNotificationsDeferred(params: {
  prisma: PrismaClient;
  userId: string;
  artistKey: string;
  postId: string;
  content: string;
  audience: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
}): void {
  void enqueueArtistPostPublishedNotifications(params).catch((error) => {
    console.error("[artist-social] post notification enqueue failed", error);
  });
}

async function resolveReleaseForAutoPost(
  prisma: PrismaClient,
  profiles: Array<{ slug: string }>,
  releaseId: string
): Promise<PublicArtistRelease | null> {
  const uniqueSlugs = Array.from(new Set(profiles.map((profile) => profile.slug).filter(Boolean)));
  for (const slug of uniqueSlugs) {
    const profile = await getPublicArtistProfile(prisma, slug, undefined, { includeReleaseAnalytics: false });
    const release = profile?.releases.find((item) => item.id === releaseId) ?? null;
    if (release) return release;
  }
  return null;
}

export async function assertOwnedArtistProfile(
  prisma: PrismaClient,
  userId: string,
  artistKey: string
) {
  if (artistKey === PERSONAL_ARTIST_PROFILE_KEY) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatar: true,
        personalSiteUrl: true,
        vk: true,
        telegram: true,
        artistProfileType: true,
        release: { select: { id: true } }
      }
    }).catch(async (error) => {
      if (!/artistProfileType|column .* does not exist/iu.test(String(error))) throw error;
      const legacyUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          avatar: true,
          personalSiteUrl: true,
          vk: true,
          telegram: true,
          release: { select: { id: true } }
        }
      });
      return legacyUser ? { ...legacyUser, artistProfileType: null } : null;
    });
    if (!user) throw new Error("ARTIST_PROFILE_NOT_FOUND");
    return {
      artistKey: PERSONAL_ARTIST_PROFILE_KEY,
      sourceName: user.name,
      releaseCount: user.release.length,
      profileType: normalizeArtistProfileType(user.artistProfileType) === "producer" ? "producer" : "user",
      settings: {
        enabled: true,
        profileType: "artist",
        displayName: user.name,
        bio: "",
        city: "",
        avatarKey: "",
        backgroundKey: "",
        catalogReleaseIds: user.release.map((release) => release.id),
        hideAllCommunityReleases: false,
        hiddenCommunityReleaseIds: [],
        autoPublishApprovedReleases: false,
        websiteUrl: typeof user.personalSiteUrl === "string" ? user.personalSiteUrl : "",
        vkUrl: typeof user.vk === "string" ? user.vk : "",
        telegramUrl: typeof user.telegram === "string" ? user.telegram : "",
        collaboration: {
          open: false,
          role: normalizeArtistProfileType(user.artistProfileType) === "producer" ? "producer" : "artist",
          genres: [],
          intents: [],
          preference: "hybrid",
          bio: ""
        }
      },
      avatarUrl: buildStoredFileRouteUrl(user.avatar) || null,
      slug: buildPersonalProfileSlug(user.name, user.id),
      adminHidden: false
    };
  }

  const profile = await getSingleUserArtistProfileSettings(prisma, userId, artistKey);
  if (!profile) throw new Error("ARTIST_PROFILE_NOT_FOUND");
  if (!profile.settings.enabled || profile.adminHidden) throw new Error("ARTIST_PROFILE_DISABLED");
  return { ...profile, profileType: profile.profileType ?? profile.settings.profileType };
}

async function assertOwnedArtistProfileForPost(
  prisma: PrismaClient,
  userId: string,
  artistKey: string,
) {
  if (artistKey === PERSONAL_ARTIST_PROFILE_KEY) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatar: true,
        personalSiteUrl: true,
        vk: true,
        telegram: true,
        artistProfileType: true
      }
    }).catch(async (error) => {
      if (!/artistProfileType|column .* does not exist/iu.test(String(error))) throw error;
      const legacyUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          avatar: true,
          personalSiteUrl: true,
          vk: true,
          telegram: true
        }
      });
      return legacyUser ? { ...legacyUser, artistProfileType: null } : null;
    });
    if (!user) throw new Error("ARTIST_PROFILE_NOT_FOUND");
    return {
      artistKey: PERSONAL_ARTIST_PROFILE_KEY,
      sourceName: user.name,
      releaseCount: 0,
      profileType: normalizeArtistProfileType(user.artistProfileType) === "producer" ? "producer" : "user",
      settings: {
        enabled: true,
        profileType: "artist",
        displayName: user.name,
        bio: "",
        city: "",
        avatarKey: "",
        backgroundKey: "",
        catalogReleaseIds: [],
        hideAllCommunityReleases: false,
        hiddenCommunityReleaseIds: [],
        autoPublishApprovedReleases: false,
        websiteUrl: typeof user.personalSiteUrl === "string" ? user.personalSiteUrl : "",
        vkUrl: typeof user.vk === "string" ? user.vk : "",
        telegramUrl: typeof user.telegram === "string" ? user.telegram : "",
        collaboration: {
          open: false,
          role: normalizeArtistProfileType(user.artistProfileType) === "producer" ? "producer" : "artist",
          genres: [],
          intents: [],
          preference: "hybrid",
          bio: ""
        }
      },
      avatarUrl: buildStoredFileRouteUrl(user.avatar) || null,
      slug: buildPersonalProfileSlug(user.name, user.id),
      adminHidden: false
    };
  }

  return assertOwnedArtistProfile(prisma, userId, artistKey);
}

export async function createArtistProfilePost(params: {
  prisma: PrismaClient;
  userId: string;
  artistKey: string;
  content: string;
  mediaType?: "image" | "audio" | "video";
  mediaKey?: string;
  mediaName?: string;
  mediaItems?: PostMediaItem[];
  releaseId?: string;
  collaboration?: z.infer<typeof collaborationPostMetadataSchema> | null;
  audience?: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
  idempotencyKey?: string | null;
}) {
  const profile = await assertOwnedArtistProfileForPost(
    params.prisma,
    params.userId,
    params.artistKey
  );
  const mediaItems = normalizeArtistPostMediaItems(params);
  const primaryMediaItem = mediaItems[0] ?? null;
  assertOwnedSocialMediaKey(params.userId, params.mediaKey ?? "");
  assertOwnedSocialMediaKeys(params.userId, mediaItems);
  if (params.releaseId) {
    if (
      profile.artistKey !== PERSONAL_ARTIST_PROFILE_KEY
      && !profile.settings.catalogReleaseIds.includes(params.releaseId)
    ) {
      throw new Error("ARTIST_POST_INVALID_RELEASE");
    }
    const ownedRelease = await params.prisma.release.findFirst({ where: { id: params.releaseId, userId: params.userId }, select: { id: true } });
    if (!ownedRelease) throw new Error("ARTIST_POST_INVALID_RELEASE");
  }
  if (
    params.collaboration
    && profile.artistKey !== PERSONAL_ARTIST_PROFILE_KEY
    && !profile.settings.collaboration.open
  ) {
    throw new Error("ARTIST_COLLABORATION_DISABLED");
  }
  const idempotencyKey = normalizeSocialIdempotencyKey(params.idempotencyKey);
  const audience = normalizeSocialPostAudience(params.audience);
  const postSelect = {
    id: true,
    content: true,
    media_type: true,
    media_key: true,
    media_name: true,
    created_at: true,
    updated_at: true,
    author: { select: socialAuthorSelect },
    release: { select: linkedReleaseSelect }
  } as const;
  const result = await params.prisma.$transaction(async (tx) => {
    let post = null;
    if (idempotencyKey) {
      await lockSocialMutation(tx as PrismaClient, `social-post:${params.userId}:${idempotencyKey}`);
      const existing = await tx.artist_profile_posts.findFirst({
        where: { user_id: params.userId, idempotency_key: idempotencyKey },
        select: postSelect
      });
      if (existing) {
        post = existing;
      }
    }
    if (!post) {
      post = await tx.artist_profile_posts.create({
        data: {
          user_id: params.userId,
          profile_key: params.artistKey,
          audience,
          release_id: params.releaseId || null,
          content: encodeStructuredPostContent({
            content: params.content,
            collaboration: params.collaboration ?? null,
            mediaItems
          }),
          media_type: primaryMediaItem?.mediaType ?? params.mediaType ?? null,
          media_key: primaryMediaItem?.mediaKey ?? params.mediaKey ?? null,
          media_name: primaryMediaItem?.mediaName ?? params.mediaName ?? null,
          idempotency_key: idempotencyKey
        },
        select: postSelect
      });
    }
    if ((tx as unknown as { social_activity_events?: unknown }).social_activity_events) {
      const searchText = buildCollaborationSearchText({
        content: params.content,
        collaboration: params.collaboration
      });
      await upsertSocialActivityEvent({
        prisma: tx as unknown as Pick<PrismaClient, "social_activity_events">,
        kind: "POST",
        sourceId: post.id,
        actorUserId: params.userId,
        profileKey: params.artistKey,
        audience,
        publishedAt: post.created_at,
        metadata: params.releaseId ? { releaseId: params.releaseId } : undefined,
        searchText,
        mediaKind: resolveSocialActivityMediaKind(mediaItems),
        isCollaboration: Boolean(params.collaboration),
        collaborationIntent: params.collaboration?.intent ?? null,
        collaborationRole: params.collaboration?.role ?? null,
        linkedRelease: Boolean(params.releaseId),
        category: params.collaboration ? "collaboration" : "post"
      });
    }
    return post;
  });
  enqueueArtistPostPublishedNotificationsDeferred({
    prisma: params.prisma,
    userId: params.userId,
    artistKey: profile.artistKey,
    postId: result.id,
    content: params.content,
    audience
  });
  return result;
}

export async function deleteArtistProfilePost(params: {
  prisma: PrismaClient;
  userId: string;
  postId: string;
}) {
  const post = await params.prisma.artist_profile_posts.findUnique({
    where: { id: params.postId },
    select: { id: true, user_id: true, content: true, media_key: true }
  });
  if (!post) throw new Error("ARTIST_POST_NOT_FOUND");
  if (post.user_id !== params.userId) throw new Error("ARTIST_POST_FORBIDDEN");
  const parsed = parseStructuredPostContent(post.content);
  const mediaKeys = Array.from(new Set([
    post.media_key,
    ...parsed.mediaItems.flatMap((item) => [item.mediaKey, item.posterKey ?? null])
  ].filter((key): key is string => Boolean(key))));
  const activityStore = (params.prisma as unknown as { social_activity_events?: PrismaClient["social_activity_events"] }).social_activity_events;
  await params.prisma.$transaction([
    params.prisma.artist_profile_post_likes.deleteMany({ where: { post_id: params.postId } }),
    params.prisma.artist_profile_post_comments.deleteMany({ where: { post_id: params.postId } }),
    ...(activityStore ? [activityStore.deleteMany({ where: { kind: "POST", source_id: params.postId } })] : []),
    params.prisma.artist_profile_posts.delete({ where: { id: params.postId } })
  ]);
  const [remainingPosts, remainingComments] = mediaKeys.length ? await Promise.all([
    params.prisma.artist_profile_posts.findMany({
      where: { OR: [{ media_key: { in: mediaKeys } }, ...mediaKeys.map((key) => ({ content: { contains: key } }))] },
      select: { media_key: true, content: true }
    }),
    params.prisma.scene_release_comments.findMany({
      where: { media_key: { in: mediaKeys } },
      select: { media_key: true }
    })
  ]) : [[], []];
  return {
    deleted: true as const,
    id: params.postId,
    mediaKeys: listUnreferencedSocialMediaKeys({ candidateKeys: mediaKeys, posts: remainingPosts, comments: remainingComments })
  };
}

export async function updateArtistProfilePost(params: {
  prisma: PrismaClient;
  userId: string;
  postId: string;
  content: string;
}) {
  const post = await params.prisma.artist_profile_posts.findUnique({
    where: { id: params.postId },
    select: {
      id: true,
      user_id: true,
      profile_key: true,
      audience: true,
      content: true,
      media_type: true,
      media_key: true,
      media_name: true,
      release_id: true,
      created_at: true
    }
  });
  if (!post) throw new Error("ARTIST_POST_NOT_FOUND");
  if (post.user_id !== params.userId) throw new Error("ARTIST_POST_FORBIDDEN");
  if (Date.now() - post.created_at.getTime() > 24 * 60 * 60 * 1000) {
    throw new Error("ARTIST_POST_EDIT_WINDOW_EXPIRED");
  }
  const parsed = parseStructuredPostContent(post.content);
  if (!params.content && !post.media_key && !post.release_id && parsed.mediaItems.length === 0) {
    throw new Error("ARTIST_POST_EMPTY");
  }
  const editedAt = new Date();
  const nextStructuredContent = encodeStructuredPostContent({ ...parsed, content: params.content });
  const updated = await params.prisma.artist_profile_posts.update({
    where: { id: params.postId },
    data: {
      content: nextStructuredContent,
      edited_at: editedAt
    },
    select: { id: true, content: true, updated_at: true, edited_at: true }
  });
  if ((params.prisma as unknown as { social_activity_events?: unknown }).social_activity_events) {
    await upsertSocialActivityEvent({
      prisma: params.prisma as unknown as Pick<PrismaClient, "social_activity_events">,
      kind: "POST",
      sourceId: params.postId,
      actorUserId: post.user_id,
      profileKey: post.profile_key,
      audience: normalizeSocialPostAudience(post.audience),
      publishedAt: post.created_at,
      metadata: post.release_id ? { releaseId: post.release_id } : undefined,
      searchText: buildCollaborationSearchText({
        content: params.content,
        collaboration: parsed.collaboration
      }),
      mediaKind: resolveSocialActivityMediaKind(parsed.mediaItems),
      isCollaboration: Boolean(parsed.collaboration),
      collaborationIntent: parsed.collaboration?.intent ?? null,
      collaborationRole: parsed.collaboration?.role ?? null,
      linkedRelease: Boolean(post.release_id),
      category: parsed.collaboration ? "collaboration" : "post"
    });
  }
  return {
    id: updated.id,
    content: parseStructuredPostContent(updated.content).content,
    updatedAt: updated.updated_at.toISOString(),
    editedAt: updated.edited_at?.toISOString() ?? editedAt.toISOString()
  };
}

async function mapLinkedRelease(release: {
  id: string;
  title: string;
  date: Date;
  performer?: string | null;
  preview?: string | null;
  user?: { name: string } | null;
} | null | undefined) {
  if (!release) return null;
  const smartLink = await getReleasePublicListenSummary(release.id);
  const fallbackArtistName = release.performer?.trim() || release.user?.name || "Артист";
  return {
    id: release.id,
    title: release.title,
    releaseDate: release.date.toISOString(),
    href: smartLink?.publicUrl ?? `/dashboard/releases/${release.id}`,
    artistName: smartLink?.artist ?? fallbackArtistName,
    coverUrl: smartLink?.coverUrl ?? resolveCommunityCoverUrl({ id: release.id, preview: release.preview }),
    platformLinks: smartLink?.platforms ?? []
  };
}

function requireCollaborationAnnouncement(content: string) {
  const parsed = parseStructuredPostContent(content);
  if (!parsed.collaboration || parsed.postType !== "collaboration") {
    throw new Error("COLLABORATION_POST_REQUIRED");
  }
  return parsed;
}

function toCollaborationStatus(content: string): CollaborationStatus {
  return requireCollaborationAnnouncement(content).collaboration?.status ?? "open";
}

function buildCollaborationResponseDirectMessage(params: {
  message: string;
  postId: string;
  postContent: string;
  linkedReleaseTitle?: string | null;
}) {
  const parsed = requireCollaborationAnnouncement(params.postContent);
  const presentation = buildCollaborationPresentation({
    intent: parsed.collaboration?.intent ?? null,
    role: parsed.collaboration?.role ?? null,
    workflow: parsed.collaboration?.workflow ?? null,
    customIntentLabel: parsed.collaboration?.customIntentLabel ?? null
  });
  const postPreview = parsed.content.replace(/\s+/gu, " ").trim().slice(0, 180);
  return [
    "Отклик на объявление",
    `${presentation.displayIntent} · ${presentation.displayRole}`,
    postPreview ? `Объявление: ${postPreview}` : null,
    params.linkedReleaseTitle ? `Релиз в портфолио: ${params.linkedReleaseTitle}` : null,
    `Пост: /dashboard/community?view=collaborations&post=${params.postId}`,
    "",
    params.message.trim()
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

async function resolveResponseSenderProfile(params: {
  prisma: PrismaClient;
  userId: string;
  artistKey: string;
}) {
  try {
    const profile = await assertOwnedArtistProfileForPost(params.prisma, params.userId, params.artistKey);
    return {
      artistKey: profile.artistKey,
      slug: profile.slug,
      displayName: profile.settings.displayName || profile.sourceName,
      profileType: profile.profileType ?? "user",
      avatarUrl: profile.avatarUrl ?? null
    };
  } catch {
    const user = await params.prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        name: true,
        avatar: true,
        artistProfileType: true
      }
    });
    if (!user) throw new Error("ARTIST_PROFILE_NOT_FOUND");
    return {
      artistKey: PERSONAL_ARTIST_PROFILE_KEY,
      slug: buildPersonalProfileSlug(user.name, user.id),
      displayName: user.name,
      profileType: (normalizeArtistProfileType(user.artistProfileType) === "producer" ? "producer" : "user") as "producer" | "user",
      avatarUrl: buildStoredFileRouteUrl(user.avatar) || null
    };
  }
}

type CollaborationResponseRecord = {
  id: string;
  message: string;
  createdAt: string;
  linkedRelease: Awaited<ReturnType<typeof mapLinkedRelease>>;
  sender: {
    id: string;
    slug: string | null;
    displayName: string;
    avatarUrl: string | null;
    profileType: "user" | "artist" | "producer" | "group" | "label";
    verified: boolean;
  };
};

async function mapCollaborationResponseRecord(row: {
  id: string;
  message: string;
  created_at: Date;
  linked_release: { id: string; title: string; date: Date } | null;
  sender: { id: string; isVerifiedAuthor: boolean | null };
  senderProfile: Awaited<ReturnType<typeof resolveResponseSenderProfile>>;
}): Promise<CollaborationResponseRecord> {
  return {
    id: row.id,
    message: row.message,
    createdAt: row.created_at.toISOString(),
    linkedRelease: await mapLinkedRelease(row.linked_release),
    sender: {
      id: row.sender.id,
      slug: row.senderProfile.slug,
      displayName: row.senderProfile.displayName,
      avatarUrl: row.senderProfile.avatarUrl,
      profileType: row.senderProfile.profileType as "user" | "artist" | "producer" | "group" | "label",
      verified: Boolean(row.sender.isVerifiedAuthor)
    }
  };
}

export async function createCollaborationResponse(params: {
  prisma: PrismaClient;
  postId: string;
  userId: string;
  artistKey?: string;
  message: string;
  linkedReleaseId?: string | null;
}): Promise<CollaborationResponseRecord> {
  const senderProfile = await resolveResponseSenderProfile({
    prisma: params.prisma,
    userId: params.userId,
    artistKey: params.artistKey ?? PERSONAL_ARTIST_PROFILE_KEY
  });

  const post = await params.prisma.artist_profile_posts.findUnique({
    where: { id: params.postId },
    select: {
      id: true,
      user_id: true,
      profile_key: true,
      content: true
    }
  });

  if (!post) throw new Error("COLLABORATION_POST_NOT_FOUND");
  if (post.user_id === params.userId) throw new Error("COLLABORATION_RESPONSE_SELF_FORBIDDEN");

  const parsed = requireCollaborationAnnouncement(post.content);
  if ((parsed.collaboration?.status ?? "open") === "closed") {
    throw new Error("COLLABORATION_RESPONSE_CLOSED");
  }

  await assertSocialInteractionAllowed(
    params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">,
    params.userId,
    post.user_id
  );

  const linkedReleaseId = params.linkedReleaseId?.trim() || null;
  let linkedReleaseTitle: string | null = null;
  if (linkedReleaseId) {
    const ownedRelease = await params.prisma.release.findFirst({
      where: { id: linkedReleaseId, userId: params.userId },
      select: { id: true, title: true }
    });
    if (!ownedRelease) throw new Error("COLLABORATION_RESPONSE_INVALID_RELEASE");
    linkedReleaseTitle = ownedRelease.title;
  }

  const body = buildCollaborationResponseDirectMessage({
    message: params.message,
    postId: params.postId,
    postContent: post.content,
    linkedReleaseTitle
  });
  const [participantA, participantB] = [params.userId, post.user_id].sort();

  try {
    const result = await params.prisma.$transaction(async (tx) => {
      const response = await tx.collaboration_responses.create({
        data: {
          post_id: params.postId,
          sender_user_id: params.userId,
          sender_profile_key: senderProfile.artistKey,
          linked_release_id: linkedReleaseId,
          message: params.message.trim()
        },
        select: {
          id: true,
          message: true,
          created_at: true,
          sender_user_id: true,
          sender_profile_key: true,
          linked_release: { select: linkedReleaseSelect },
          sender: { select: { id: true, isVerifiedAuthor: true } }
        }
      });
      const directMessage = await createDirectMessageRowsInTransaction({
        tx,
        participantA,
        participantB,
        senderId: params.userId,
        body,
        context: {
          type: "collaboration_response",
          id: params.postId
        }
      });
      if (directMessage.messageId) {
        await tx.ai_user_notifications.upsert({
          where: { id: toNotificationStorageId(`direct-message-${directMessage.messageId}`) },
          create: {
            id: toNotificationStorageId(`direct-message-${directMessage.messageId}`),
            user_id: post.user_id,
            kind: "direct_message",
            title: "У Вас отклик на объявление",
            message: "У Вас отклик на объявление",
            cta_label: "Открыть",
            cta_href: `/dashboard/messages?conversationId=${encodeURIComponent(directMessage.conversationId)}`,
            source_type: "collaboration_response",
            source_id: params.postId
          },
          update: {
            kind: "direct_message",
            title: "У Вас отклик на объявление",
            message: "У Вас отклик на объявление",
            cta_label: "Открыть",
            cta_href: `/dashboard/messages?conversationId=${encodeURIComponent(directMessage.conversationId)}`,
            source_type: "collaboration_response",
            source_id: params.postId,
            read_at: null,
            created_at: new Date()
          }
        });
      }
      return { response, directMessage };
    });

    if (result.directMessage.messageId) {
      void deliverUserNotificationSafely(params.prisma, {
        id: `direct-message-${result.directMessage.messageId}`,
        userId: post.user_id,
        kind: "direct_message",
        title: "У Вас отклик на объявление",
        message: "У Вас отклик на объявление",
        href: `/dashboard/messages?conversationId=${encodeURIComponent(result.directMessage.conversationId)}`,
        emailCta: false,
        resetReadState: true
      });
    }

    return mapCollaborationResponseRecord({
      ...result.response,
      senderProfile
    });
  } catch (error) {
    if (isCollaborationResponseDuplicateError(error)) {
      throw new Error("COLLABORATION_RESPONSE_ALREADY_EXISTS");
    }
    throw error;
  }
}

export async function listCollaborationResponses(params: {
  prisma: PrismaClient;
  postId: string;
  userId: string;
}) {
  const post = await params.prisma.artist_profile_posts.findUnique({
    where: { id: params.postId },
    select: { id: true, user_id: true, content: true }
  });
  if (!post) throw new Error("COLLABORATION_POST_NOT_FOUND");
  requireCollaborationAnnouncement(post.content);
  if (post.user_id !== params.userId) throw new Error("COLLABORATION_RESPONSE_FORBIDDEN");

  const rows = await params.prisma.collaboration_responses.findMany({
    where: { post_id: params.postId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      message: true,
      created_at: true,
      sender_user_id: true,
      sender_profile_key: true,
      linked_release: { select: linkedReleaseSelect },
      sender: { select: { id: true, isVerifiedAuthor: true } }
    }
  }).catch((error) => {
    if (isMissingCollaborationResponsesTable(error)) return [];
    throw error;
  });

  const senderProfiles = new Map(await Promise.all(rows.map(async (row) => [
    row.id,
    await resolveResponseSenderProfile({
      prisma: params.prisma,
      userId: row.sender_user_id,
      artistKey: row.sender_profile_key
    })
  ] as const)));

  return await Promise.all(rows.map((row) => mapCollaborationResponseRecord({
    ...row,
    senderProfile: senderProfiles.get(row.id)!
  })));
}

export async function updateCollaborationAnnouncementStatus(params: {
  prisma: PrismaClient;
  postId: string;
  userId: string;
  status: CollaborationStatus;
}) {
  const post = await params.prisma.artist_profile_posts.findUnique({
    where: { id: params.postId },
    select: {
      id: true,
      user_id: true,
      profile_key: true,
      audience: true,
      created_at: true,
      release_id: true,
      content: true
    }
  });
  if (!post) throw new Error("COLLABORATION_POST_NOT_FOUND");
  if (post.user_id !== params.userId) throw new Error("COLLABORATION_CLOSE_FORBIDDEN");

  const parsed = requireCollaborationAnnouncement(post.content);
  const nextContent = encodeStructuredPostContent({
    content: parsed.content,
    collaboration: {
      ...parsed.collaboration!,
      status: params.status
    },
    mediaItems: parsed.mediaItems
  });

  const updated = await params.prisma.artist_profile_posts.update({
    where: { id: params.postId },
    data: { content: nextContent, updated_at: new Date() },
    select: { id: true, content: true }
  });

  await upsertSocialActivityEvent({
    prisma: params.prisma as unknown as Pick<PrismaClient, "social_activity_events">,
    kind: "POST",
    sourceId: params.postId,
    actorUserId: post.user_id,
    profileKey: post.profile_key,
    audience: normalizeSocialPostAudience(post.audience),
    publishedAt: post.created_at,
    metadata: post.release_id ? { releaseId: post.release_id } : undefined,
    searchText: buildCollaborationSearchText({
      content: parsed.content,
      collaboration: parsed.collaboration!
    }),
    mediaKind: resolveSocialActivityMediaKind(parsed.mediaItems),
    isCollaboration: true,
    collaborationIntent: parsed.collaboration?.intent ?? null,
    collaborationRole: parsed.collaboration?.role ?? null,
    linkedRelease: Boolean(post.release_id),
    category: "collaboration"
  });

  return {
    id: updated.id,
    status: toCollaborationStatus(updated.content)
  };
}

async function notifyCommunityEvent(prisma: PrismaClient, event: {
  id: string;
  userId: string;
  kind: string;
  title: string;
  message: string;
  href: string;
  sourceType?: "post" | "release" | "comment";
  sourceId?: string;
  sendPush?: boolean;
}) {
  if (!(prisma as unknown as { social_notification_outbox?: unknown }).social_notification_outbox) {
    await deliverUserNotificationSafely(prisma, {
      ...event,
      sendEmail: false,
      resetReadState: false,
      sendPush: event.sendPush
    });
    return;
  }
  await enqueueSocialNotification(prisma, event);
  await dispatchSocialNotificationsSafely(prisma, [event.id]);
}

export async function getArtistSocialSnapshot(params: {
  prisma: PrismaClient;
  profileUserId: string;
  artistKey: string;
  releaseIds: string[];
  visitorId?: string | null;
  viewerUserId?: string | null;
}) {
  const releaseIds = Array.from(new Set(params.releaseIds)).slice(0, 100);
  const safetyPrisma = params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">;
  if (params.viewerUserId) {
    await assertSocialInteractionAllowed(safetyPrisma, params.viewerUserId, params.profileUserId);
  }
  const blockedPeerIds = params.viewerUserId
    ? await listBlockedPeerIds(safetyPrisma, params.viewerUserId)
    : [];
  const visibleCommentWhere = blockedPeerIds.length
    ? { deleted_at: null, user_id: { notIn: blockedPeerIds } }
    : { deleted_at: null };
  const visibleReactionCount = blockedPeerIds.length
    ? { where: { visitor_id: { notIn: blockedPeerIds } } }
    : true;
  const following = params.viewerUserId
    ? await params.prisma.artist_profile_followers.findUnique({
        where: {
          profile_user_id_profile_key_follower_user_id: {
            profile_user_id: params.profileUserId,
            profile_key: params.artistKey,
            follower_user_id: params.viewerUserId
          }
        },
        select: { id: true }
      })
    : null;
  const audienceWhere = {
    OR: [
      { audience: "PUBLIC" },
      ...(params.viewerUserId === params.profileUserId ? [{ user_id: params.profileUserId }] : []),
      ...(following ? [{ audience: "FOLLOWERS" }] : [])
    ]
  };
  const postLikesCountPromise = typeof params.prisma.artist_profile_post_likes.count === "function"
    ? params.prisma.artist_profile_post_likes.count({
        where: {
          post: { user_id: params.profileUserId, profile_key: params.artistKey, AND: audienceWhere },
          ...(blockedPeerIds.length ? { visitor_id: { notIn: blockedPeerIds } } : {})
        }
      })
    : Promise.resolve<number | null>(null);
  const [posts, activePostLikes, postLikesCount, releaseLikeCounts, activeReleaseLikes, comments, followers] = await Promise.all([
    params.prisma.artist_profile_posts.findMany({
      where: { user_id: params.profileUserId, profile_key: params.artistKey, AND: audienceWhere },
      orderBy: { created_at: "desc" },
      take: 30,
      select: {
        id: true,
        content: true,
        media_type: true,
        media_key: true,
        media_name: true,
        created_at: true,
        updated_at: true,
        author: { select: socialAuthorSelect },
        release: { select: linkedReleaseSelect },
        comments: {
          where: visibleCommentWhere,
          orderBy: { created_at: "desc" },
          take: 30,
          select: {
            id: true,
            content: true,
            created_at: true,
            author: { select: socialAuthorSelect }
          }
        },
        _count: { select: { likes: visibleReactionCount, comments: { where: visibleCommentWhere } } }
      }
    }),
    params.visitorId
      ? params.prisma.artist_profile_post_likes.findMany({
          where: {
            visitor_id: params.visitorId,
            post: { user_id: params.profileUserId, profile_key: params.artistKey }
          },
          select: { post_id: true }
        })
      : Promise.resolve([]),
    postLikesCountPromise,
    releaseIds.length
      ? params.prisma.scene_release_likes.groupBy({
          by: ["release_id"],
          where: {
            release_id: { in: releaseIds },
            ...(blockedPeerIds.length ? { visitor_id: { notIn: blockedPeerIds } } : {})
          },
          _count: { _all: true }
        })
      : Promise.resolve([]),
    params.visitorId && releaseIds.length
      ? params.prisma.scene_release_likes.findMany({
          where: { release_id: { in: releaseIds }, visitor_id: params.visitorId },
          select: { release_id: true }
        })
      : Promise.resolve([]),
    releaseIds.length
      ? params.prisma.scene_release_comments.findMany({
          where: { release_id: { in: releaseIds }, ...visibleCommentWhere },
          orderBy: { created_at: "desc" },
          take: 120,
          select: {
            id: true,
            release_id: true,
            content: true,
            media_key: true,
            media_name: true,
            created_at: true,
            author: { select: socialAuthorSelect }
          }
        })
      : Promise.resolve([]),
    params.prisma.artist_profile_followers.count({
      where: { profile_user_id: params.profileUserId, profile_key: params.artistKey }
    })
  ]);

  const likedPosts = new Set(activePostLikes.map((item) => item.post_id));
  const likedReleases = new Set(activeReleaseLikes.map((item) => item.release_id));
  const likeCounts = new Map(releaseLikeCounts.map((item) => [item.release_id, item._count._all]));
  return {
    posts: await Promise.all(posts.map(async (post) => {
      const parsedPost = parseStructuredPostContent(post.content);
      const mediaItems = parsedPost.mediaItems.length
        ? parsedPost.mediaItems.map((item) => ({
            id: item.id ?? item.mediaKey,
            mediaType: item.mediaType,
            mediaUrl: buildStoredFileRouteUrl(item.mediaKey) || "",
            mediaName: item.mediaName || null,
            role: item.role,
            width: item.width ?? null,
            height: item.height ?? null,
            posterUrl: buildStoredFileRouteUrl(item.posterKey) || item.posterUrl || null
          })).filter((item) => item.mediaUrl)
        : post.media_type && post.media_key
          ? [{
              id: post.media_key,
              mediaType: post.media_type,
              mediaUrl: buildStoredFileRouteUrl(post.media_key) || "",
              mediaName: post.media_name,
              role: "standard",
              width: null,
              height: null,
              posterUrl: null
            }].filter((item) => item.mediaUrl)
          : [];
      return {
        id: post.id,
        content: parsedPost.content,
        mediaType: mediaItems[0]?.mediaType ?? post.media_type,
        mediaUrl: mediaItems[0]?.mediaUrl ?? buildStoredFileRouteUrl(post.media_key),
        mediaName: mediaItems[0]?.mediaName ?? post.media_name,
        mediaItems,
        createdAt: post.created_at.toISOString(),
        updatedAt: post.updated_at.toISOString(),
        author: mapSocialAuthor(post.author),
        linkedRelease: await mapLinkedRelease(post.release),
        comments: post.comments.map((comment) => ({
          id: comment.id,
          content: comment.content,
          createdAt: comment.created_at.toISOString(),
          author: mapSocialAuthor(comment.author)
        })),
        likes: post._count.likes,
        liked: likedPosts.has(post.id)
      };
    })),
    releases: Object.fromEntries(releaseIds.map((releaseId) => [releaseId, {
      likes: likeCounts.get(releaseId) ?? 0,
      liked: likedReleases.has(releaseId),
      comments: comments
        .filter((comment) => comment.release_id === releaseId)
        .slice(0, 30)
        .map((comment) => ({
          id: comment.id,
          content: comment.content,
          mediaUrl: buildStoredFileRouteUrl(comment.media_key),
          mediaName: comment.media_name,
          createdAt: comment.created_at.toISOString(),
          author: mapSocialAuthor(comment.author)
        }))
    }])),
    stats: {
      followers,
      likes: (postLikesCount ?? posts.reduce((sum, post) => sum + post._count.likes, 0))
        + releaseLikeCounts.reduce((sum, item) => sum + item._count._all, 0),
      following: Boolean(following),
      authenticated: Boolean(params.viewerUserId),
      ownProfile: params.viewerUserId === params.profileUserId
    }
  };
}

export async function toggleArtistProfileFollow(params: {
  prisma: PrismaClient;
  profileUserId: string;
  artistKey: string;
  profileSlug: string;
  followerUserId: string;
}) {
  if (params.profileUserId === params.followerUserId) throw new Error("ARTIST_PROFILE_SELF_FOLLOW");
  await assertSocialInteractionAllowed(
    params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">,
    params.followerUserId,
    params.profileUserId
  );
  const result = await params.prisma.$transaction(async (tx) => {
    await lockSocialMutation(tx as PrismaClient, `profile-follow:${params.profileUserId}:${params.artistKey}:${params.followerUserId}`);
    const where = {
      profile_user_id_profile_key_follower_user_id: {
        profile_user_id: params.profileUserId,
        profile_key: params.artistKey,
        follower_user_id: params.followerUserId
      }
    };
    const existing = await tx.artist_profile_followers.findUnique({ where, select: { id: true } });
    let eventId: string | null = null;
    if (existing) await tx.artist_profile_followers.delete({ where: { id: existing.id } });
    else {
      const created = await tx.artist_profile_followers.create({
        data: {
          profile_user_id: params.profileUserId,
          profile_key: params.artistKey,
          follower_user_id: params.followerUserId
        },
        select: { id: true }
      });
      eventId = `artist-profile-followed-${created.id}`;
      await enqueueSocialNotification(tx, {
        id: eventId,
        userId: params.profileUserId,
        kind: "artist_profile_followed",
        title: "Новый подписчик",
        message: "На ваш профиль подписался новый слушатель.",
        href: `/artists/${encodeURIComponent(params.profileSlug)}`
      });
    }
    const followers = await tx.artist_profile_followers.count({
      where: { profile_user_id: params.profileUserId, profile_key: params.artistKey }
    });
    return { following: !existing, followers, eventId };
  });
  if (result.eventId) {
    void dispatchSocialNotificationsSafely(params.prisma, [result.eventId]).catch((error) => {
      console.error("[artist-social] follow notification dispatch failed", error);
    });
  }
  return { following: result.following, followers: result.followers };
}

export interface FollowedArtistProfileSummary {
  id: string;
  followedAt: string;
  artist: {
    slug: string;
    displayName: string;
    profileType: "user" | "artist" | "producer" | "group" | "label";
    avatarUrl: string | null;
  };
  latestReleases: PublicArtistRelease[];
}

export async function listFollowedArtistProfiles(params: {
  prisma: PrismaClient;
  followerUserId: string;
}): Promise<FollowedArtistProfileSummary[]> {
  const blockedPeerIds = await listBlockedPeerIds(
    params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">,
    params.followerUserId
  );
  const follows = await params.prisma.artist_profile_followers.findMany({
    where: {
      follower_user_id: params.followerUserId,
      ...(blockedPeerIds.length ? { profile_user_id: { notIn: blockedPeerIds } } : {})
    },
    orderBy: { created_at: "desc" },
    take: 100,
    select: {
      id: true,
      profile_user_id: true,
      profile_key: true,
      created_at: true
    }
  });
  const ownerIds = Array.from(new Set(follows.map((follow) => follow.profile_user_id)));
  const profileSettings = new Map(await Promise.all(ownerIds.map(async (ownerId) => [
    ownerId,
    await getUserArtistProfileSettings(params.prisma, ownerId)
  ] as const)));
  const personalOwnerIds = Array.from(new Set(
    follows
      .filter((follow) => follow.profile_key === PERSONAL_ARTIST_PROFILE_KEY)
      .map((follow) => follow.profile_user_id)
  ));
  const personalOwners = new Map(await Promise.all(personalOwnerIds.map(async (ownerId) => {
    const owner = await params.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, name: true } });
    return [ownerId, owner] as const;
  })));

  const subscriptions = await Promise.all(follows.map(async (follow) => {
    if (follow.profile_key === PERSONAL_ARTIST_PROFILE_KEY) {
      const owner = personalOwners.get(follow.profile_user_id);
      if (!owner) return null;
      const publicProfile = await getPublicArtistProfile(
        params.prisma,
        buildPersonalProfileSlug(owner.name, owner.id),
        undefined,
        { includeReleaseAnalytics: false }
      );
      if (!publicProfile) return null;
      return {
        id: follow.id,
        followedAt: follow.created_at.toISOString(),
        artist: {
          slug: publicProfile.slug,
          displayName: publicProfile.displayName,
          profileType: publicProfile.profileType,
          avatarUrl: publicProfile.avatarUrl
        },
        latestReleases: []
      } satisfies FollowedArtistProfileSummary;
    }
    const profile = profileSettings.get(follow.profile_user_id)?.profiles.find(
      (item) => item.artistKey === follow.profile_key
    );
    if (!profile || !profile.settings.enabled || profile.adminHidden) return null;
    const publicProfile = await getPublicArtistProfile(params.prisma, profile.slug, undefined, { includeReleaseAnalytics: false });
    if (!publicProfile) return null;
    return {
      id: follow.id,
      followedAt: follow.created_at.toISOString(),
      artist: {
        slug: publicProfile.slug,
        displayName: publicProfile.displayName,
        profileType: publicProfile.profileType,
        avatarUrl: publicProfile.avatarUrl
      },
      latestReleases: [...publicProfile.releases]
        .sort((left, right) => new Date(right.releaseDate).getTime() - new Date(left.releaseDate).getTime())
        .slice(0, 3)
    } satisfies FollowedArtistProfileSummary;
  }));

  return subscriptions.filter((item): item is FollowedArtistProfileSummary => item !== null);
}

export async function notifyArtistFollowersAboutPublishedRelease(params: {
  prisma: PrismaClient;
  profileUserId: string;
  releaseId: string;
  releaseTitle: string;
}): Promise<number> {
  const ownedProfiles = await getUserArtistProfilesForRelease(params.prisma, params.profileUserId, params.releaseId);
  const publishingProfiles = ownedProfiles?.profiles.filter((profile) =>
    profile.settings.enabled
    && !profile.adminHidden
    && profile.settings.catalogReleaseIds.includes(params.releaseId)
  ) ?? [];
  const publishingProfileKeys = Array.from(new Set([
    PERSONAL_ARTIST_PROFILE_KEY,
    ...publishingProfiles.map((profile) => profile.artistKey)
  ]));

  const followers = await params.prisma.artist_profile_followers.findMany({
    where: {
      profile_user_id: params.profileUserId,
      profile_key: { in: publishingProfileKeys },
      follower_user_id: { not: params.profileUserId }
    },
    select: { follower_user_id: true }
  });
  const followerIds = Array.from(new Set(followers.map((follow) => follow.follower_user_id)));
  const artistNames = publishingProfiles.map((profile) => profile.settings.displayName);
  const artistLabel = artistNames.length === 1
    ? artistNames[0]
    : artistNames.length > 1
      ? artistNames.slice(0, 2).join(" · ")
      : "Автор";
  const href = `/feed/release_${encodeURIComponent(params.releaseId)}`;

  await Promise.all(followerIds.map((followerUserId) => notifyCommunityEvent(params.prisma, {
    id: `artist-release-published-${params.releaseId}-${followerUserId}`,
    userId: followerUserId,
    kind: "artist_release_published",
    title: "Новый релиз у артиста",
    message: `${artistLabel} выпустил релиз «${params.releaseTitle}».`,
    href,
    sourceType: "release",
    sourceId: params.releaseId
  })));
  return followerIds.length;
}

export async function notifyArtistFollowersAboutPublishedPost(params: {
  prisma: PrismaClient;
  profileUserId: string;
  profileKey: string;
  postId: string;
  content: string;
}): Promise<number> {
  const followers = await params.prisma.artist_profile_followers.findMany({
    where: {
      profile_user_id: params.profileUserId,
      profile_key: params.profileKey,
      follower_user_id: { not: params.profileUserId }
    },
    select: { follower_user_id: true }
  });
  const followerIds = Array.from(new Set(followers.map((follow) => follow.follower_user_id)));
  const summary = params.content.trim();
  const href = `/feed/post_${encodeURIComponent(params.postId)}`;
  await Promise.all(followerIds.map((followerUserId) => notifyCommunityEvent(params.prisma, {
    id: `artist-post-published-${params.postId}-${followerUserId}`,
    userId: followerUserId,
    kind: "artist_post_published",
    title: "Новая публикация",
    message: summary ? `Автор опубликовал: «${summary.slice(0, 100)}».` : "Автор опубликовал новый материал.",
    href,
    sourceType: "post",
    sourceId: params.postId
  })));
  return followerIds.length;
}

export async function getOwnedArtistSocialDashboard(params: {
  prisma: PrismaClient;
  userId: string;
  artistKey: string;
  releaseIds: string[];
}) {
  await assertOwnedArtistProfile(params.prisma, params.userId, params.artistKey);
  const [snapshot, followers] = await Promise.all([
    getArtistSocialSnapshot({
      prisma: params.prisma,
      profileUserId: params.userId,
      artistKey: params.artistKey,
      releaseIds: params.releaseIds,
      viewerUserId: params.userId
    }),
    params.prisma.artist_profile_followers.findMany({
      where: { profile_user_id: params.userId, profile_key: params.artistKey },
      orderBy: { created_at: "desc" },
      take: 100,
      select: {
        id: true,
        created_at: true,
        follower: { select: { id: true, name: true, avatar: true } }
      }
    })
  ]);
  return {
    ...snapshot,
    followers: followers.map((item) => ({
      id: item.id,
      followedAt: item.created_at.toISOString(),
      user: {
        id: item.follower.id,
        name: item.follower.name,
        avatarUrl: buildStoredFileRouteUrl(item.follower.avatar)
      }
    }))
  };
}

function assertFeedReactionValue(reaction: FeedReaction) {
  if (!isFeedReaction(reaction)) {
    throw new Error("FEED_REACTION_INVALID");
  }
}

async function buildFastReactionMutationSummary(params: {
  loadCounts: () => Promise<Array<{ reaction: string; _count: { _all: number } }>>;
  nextReaction: FeedReaction | null;
}): Promise<{
  likedByViewer: boolean;
  likes: number;
  viewerReaction: FeedReaction | null;
  reactionSummary: FeedReactionSummary;
}> {
  const counts = await params.loadCounts();
  const summary = buildReactionSummary(
    counts.map((item) => ({ reaction: item.reaction, count: item._count._all })),
    params.nextReaction
  );
  return {
    likedByViewer: summary.likedByViewer,
    likes: summary.total,
    viewerReaction: summary.viewerReaction,
    reactionSummary: summary.summary
  };
}

export async function toggleArtistPostCommentReaction(params: {
  prisma: PrismaClient;
  postId: string;
  commentId: string;
  visitorId: string;
  ipHash: string | null;
  reaction?: FeedReaction;
}) {
  const reaction = params.reaction ?? "heart";
  assertFeedReactionValue(reaction);
  const post = await assertPublicArtistPost(params.prisma, params.postId);
  const comment = await params.prisma.artist_profile_post_comments.findUnique({ where: { id: params.commentId }, select: { id: true, post_id: true, user_id: true, deleted_at: true } });
  if (!comment || comment.post_id !== params.postId || comment.deleted_at) throw new Error("ARTIST_POST_COMMENT_NOT_FOUND");
  await assertSocialInteractionAllowed(params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">, params.visitorId, post.user_id);
  await assertSocialInteractionAllowed(params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">, params.visitorId, comment.user_id);
  const result = await params.prisma.$transaction(async (tx) => {
    await lockSocialMutation(tx as PrismaClient, `post-comment-reaction:${params.commentId}:${params.visitorId}`);
    const commentLikesRepo = tx.artist_profile_post_comment_likes as unknown as {
      groupBy: (args: unknown) => Promise<Array<{ reaction: string; _count: { _all: number } }>>;
    };
    const existing = await tx.artist_profile_post_comment_likes.findUnique({ where: { comment_id_visitor_id: { comment_id: params.commentId, visitor_id: params.visitorId } }, select: { id: true, reaction: true } });
    let nextReaction: FeedReaction | null = reaction;
    if (existing?.reaction === reaction) {
      await tx.artist_profile_post_comment_likes.delete({ where: { id: existing.id } });
      nextReaction = null;
    } else if (existing) {
      await tx.artist_profile_post_comment_likes.update({ where: { id: existing.id }, data: { reaction, ip_hash: params.ipHash } });
    } else {
      await tx.artist_profile_post_comment_likes.create({ data: { comment_id: params.commentId, visitor_id: params.visitorId, reaction, ip_hash: params.ipHash } });
    }
    const summary = await buildFastReactionMutationSummary({
      loadCounts: () => commentLikesRepo.groupBy({
        by: ["reaction"],
        where: { comment_id: params.commentId },
        _count: { _all: true }
      }),
      nextReaction
    });
    const eventId = `artist-post-comment-reacted-${params.commentId}-${params.visitorId}`;
    if (summary.likedByViewer && comment.user_id !== params.visitorId) {
      await enqueueSocialNotification(tx, { id: eventId, userId: comment.user_id, kind: "artist_post_comment_reacted", title: "Новая реакция", message: "Кто-то отреагировал на ваш комментарий.", href: `/feed/post_${encodeURIComponent(params.postId)}#comment-${encodeURIComponent(params.commentId)}`, sourceType: "post", sourceId: params.postId });
    }
    return { summary, eventId: summary.likedByViewer && comment.user_id !== params.visitorId ? eventId : null };
  });
  if (result.eventId) void dispatchSocialNotificationsSafely(params.prisma, [result.eventId]);
  return { liked: result.summary.likedByViewer, likes: result.summary.likes, viewerReaction: result.summary.viewerReaction, reactionSummary: result.summary.reactionSummary };
}

export async function toggleReleaseCommentReaction(params: {
  prisma: PrismaClient;
  releaseId: string;
  commentId: string;
  visitorId: string;
  ipHash: string | null;
  reaction?: FeedReaction;
}) {
  const reaction = params.reaction ?? "heart";
  assertFeedReactionValue(reaction);
  const release = await assertPublicRelease(params.prisma, params.releaseId);
  const comment = await params.prisma.scene_release_comments.findUnique({ where: { id: params.commentId }, select: { id: true, release_id: true, user_id: true, deleted_at: true } });
  if (!comment || comment.release_id !== params.releaseId || comment.deleted_at) throw new Error("RELEASE_COMMENT_NOT_FOUND");
  await assertSocialInteractionAllowed(params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">, params.visitorId, release.userId);
  await assertSocialInteractionAllowed(params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">, params.visitorId, comment.user_id);
  const result = await params.prisma.$transaction(async (tx) => {
    await lockSocialMutation(tx as PrismaClient, `release-comment-reaction:${params.commentId}:${params.visitorId}`);
    const commentLikesRepo = tx.scene_release_comment_likes as unknown as {
      groupBy: (args: unknown) => Promise<Array<{ reaction: string; _count: { _all: number } }>>;
    };
    const existing = await tx.scene_release_comment_likes.findUnique({ where: { comment_id_visitor_id: { comment_id: params.commentId, visitor_id: params.visitorId } }, select: { id: true, reaction: true } });
    let nextReaction: FeedReaction | null = reaction;
    if (existing?.reaction === reaction) {
      await tx.scene_release_comment_likes.delete({ where: { id: existing.id } });
      nextReaction = null;
    } else if (existing) {
      await tx.scene_release_comment_likes.update({ where: { id: existing.id }, data: { reaction, ip_hash: params.ipHash } });
    } else {
      await tx.scene_release_comment_likes.create({ data: { comment_id: params.commentId, visitor_id: params.visitorId, reaction, ip_hash: params.ipHash } });
    }
    const summary = await buildFastReactionMutationSummary({
      loadCounts: () => commentLikesRepo.groupBy({
        by: ["reaction"],
        where: { comment_id: params.commentId },
        _count: { _all: true }
      }),
      nextReaction
    });
    const eventId = `artist-release-comment-reacted-${params.commentId}-${params.visitorId}`;
    if (summary.likedByViewer && comment.user_id !== params.visitorId) {
      await enqueueSocialNotification(tx, { id: eventId, userId: comment.user_id, kind: "artist_release_comment_reacted", title: "Новая реакция", message: "Кто-то отреагировал на ваш комментарий.", href: `/feed/release_${encodeURIComponent(params.releaseId)}#comment-${encodeURIComponent(params.commentId)}`, sourceType: "release", sourceId: params.releaseId });
    }
    return { summary, eventId: summary.likedByViewer && comment.user_id !== params.visitorId ? eventId : null };
  });
  if (result.eventId) void dispatchSocialNotificationsSafely(params.prisma, [result.eventId]);
  return { liked: result.summary.likedByViewer, likes: result.summary.likes, viewerReaction: result.summary.viewerReaction, reactionSummary: result.summary.reactionSummary };
}

export async function toggleArtistPostLike(params: {
  prisma: PrismaClient;
  postId: string;
  visitorId: string;
  ipHash: string | null;
  reaction?: FeedReaction;
}) {
  const reaction = params.reaction ?? "heart";
  assertFeedReactionValue(reaction);
  return params.prisma.$transaction(async (tx) => {
    await lockSocialMutation(tx as PrismaClient, `post-reaction:${params.postId}:${params.visitorId}`);
    const postLikesRepo = tx.artist_profile_post_likes as unknown as {
      groupBy: (args: unknown) => Promise<Array<{ reaction: string; _count: { _all: number } }>>;
    };
    const post = await assertPublicArtistPost(tx as PrismaClient, params.postId, params.visitorId);
    await assertSocialInteractionAllowed(
      tx as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">,
      params.visitorId,
      post.user_id
    );
    const existing = await tx.artist_profile_post_likes.findUnique({
      where: { post_id_visitor_id: { post_id: params.postId, visitor_id: params.visitorId } },
      select: { id: true, reaction: true }
    });
    let nextReaction: FeedReaction | null = reaction;
    if (existing?.reaction === reaction) {
      await tx.artist_profile_post_likes.delete({ where: { id: existing.id } });
      nextReaction = null;
    } else if (existing) {
      await tx.artist_profile_post_likes.update({ where: { id: existing.id }, data: { reaction, ip_hash: params.ipHash } });
    } else {
      await tx.artist_profile_post_likes.create({
        data: { post_id: params.postId, visitor_id: params.visitorId, reaction, ip_hash: params.ipHash }
      });
    }
    const summary = await buildFastReactionMutationSummary({
      loadCounts: () => postLikesRepo.groupBy({
        by: ["reaction"],
        where: { post_id: params.postId },
        _count: { _all: true }
      }),
      nextReaction
    });
    const eventId = `artist-post-liked-${params.postId}-${params.visitorId}`;
    if (summary.likedByViewer && post.user_id !== params.visitorId) {
      const preview = canonicalPostPreview(post.content);
      await enqueueSocialNotification(tx, {
        id: eventId,
        userId: post.user_id,
        kind: "artist_post_liked",
        title: "Новая реакция",
        message: preview ? `Кто-то отреагировал на ваш пост «${preview}».` : "Кто-то отреагировал на ваш пост.",
        href: `/feed/post_${encodeURIComponent(params.postId)}`,
        sourceType: "post",
        sourceId: params.postId
      });
    }
    return {
      ownerUserId: post.user_id,
      postContent: post.content,
      liked: summary.likedByViewer,
      likes: summary.likes,
      viewerReaction: summary.viewerReaction,
      reactionSummary: summary.reactionSummary,
      eventId: summary.likedByViewer && post.user_id !== params.visitorId ? eventId : null
    };
  }).then((result) => {
    if (result.eventId) void dispatchSocialNotificationsSafely(params.prisma, [result.eventId]);
    return {
      liked: result.liked,
      likes: result.likes,
      viewerReaction: result.viewerReaction,
      reactionSummary: result.reactionSummary
    };
  });
}

async function assertPublicRelease(prisma: PrismaClient, releaseId: string) {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { id: true, userId: true, title: true, date: true, status: true, confirmed: true, roles: true }
  });
  if (!release || release.date > new Date() || !shouldTreatReleaseAsApproved(release)) {
    throw new Error("PUBLIC_RELEASE_NOT_FOUND");
  }
  return release;
}

export async function toggleReleaseLike(params: {
  prisma: PrismaClient;
  releaseId: string;
  visitorId: string;
  ipHash: string | null;
  reaction?: FeedReaction;
}) {
  const reaction = params.reaction ?? "heart";
  assertFeedReactionValue(reaction);
  const release = await assertPublicRelease(params.prisma, params.releaseId);
  await assertSocialInteractionAllowed(
    params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">,
    params.visitorId,
    release.userId
  );
  return params.prisma.$transaction(async (tx) => {
    await lockSocialMutation(tx as PrismaClient, `release-reaction:${params.releaseId}:${params.visitorId}`);
    const releaseLikesRepo = tx.scene_release_likes as unknown as {
      groupBy: (args: unknown) => Promise<Array<{ reaction: string; _count: { _all: number } }>>;
    };
    const existing = await tx.scene_release_likes.findUnique({
      where: { release_id_visitor_id: { release_id: params.releaseId, visitor_id: params.visitorId } },
      select: { id: true, reaction: true }
    });
    let nextReaction: FeedReaction | null = reaction;
    if (existing?.reaction === reaction) {
      await tx.scene_release_likes.delete({ where: { id: existing.id } });
      nextReaction = null;
    } else if (existing) {
      await tx.scene_release_likes.update({ where: { id: existing.id }, data: { reaction, ip_hash: params.ipHash } });
    } else {
      await tx.scene_release_likes.create({
        data: { release_id: params.releaseId, visitor_id: params.visitorId, reaction, ip_hash: params.ipHash }
      });
    }
    const summary = await buildFastReactionMutationSummary({
      loadCounts: () => releaseLikesRepo.groupBy({
        by: ["reaction"],
        where: { release_id: params.releaseId },
        _count: { _all: true }
      }),
      nextReaction
    });
    const eventId = `artist-release-liked-${release.id}-${params.visitorId}`;
    if (summary.likedByViewer && release.userId !== params.visitorId) {
      await enqueueSocialNotification(tx, {
        id: eventId,
        userId: release.userId,
        kind: "artist_release_liked",
        title: "Новая реакция на релиз",
        message: `Кто-то отреагировал на релиз «${release.title ?? "Без названия"}».`,
        href: `/feed/release_${encodeURIComponent(release.id)}`,
        sourceType: "release",
        sourceId: release.id
      });
    }
    return {
      liked: summary.likedByViewer,
      likes: summary.likes,
      viewerReaction: summary.viewerReaction,
      reactionSummary: summary.reactionSummary,
      eventId: summary.likedByViewer && release.userId !== params.visitorId ? eventId : null
    };
  }).then((result) => {
    if (result.eventId) void dispatchSocialNotificationsSafely(params.prisma, [result.eventId]);
    const { eventId, ...payload } = result;
    void eventId;
    return payload;
  });
}

export async function listReleaseComments(params: {
  prisma: PrismaClient;
  releaseId: string;
  userId?: string | null;
  limit?: number;
  offset?: number;
}) {
  const release = await assertPublicRelease(params.prisma, params.releaseId);
  const safetyPrisma = params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">;
  if (params.userId) await assertSocialInteractionAllowed(safetyPrisma, params.userId, release.userId);
  const blockedPeerIds = params.userId ? await listBlockedPeerIds(safetyPrisma, params.userId) : [];
  const visibleAuthors = blockedPeerIds.length ? { user_id: { notIn: blockedPeerIds } } : {};
  const offset = Math.max(params.offset ?? 0, 0);
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  let reactionsAvailable = true;
  let rootPage: SocialCommentRow[];
  try {
    rootPage = await params.prisma.scene_release_comments.findMany({
      where: { release_id: params.releaseId, parent_id: null, ...visibleAuthors },
      orderBy: { created_at: "desc" },
      skip: offset,
      take: limit + 1,
      select: releaseCommentSelect
    });
  } catch (error) {
    if (isMissingSceneReleaseCommentsTable(error)) return { comments: [], total: 0, nextOffset: null, hasMore: false };
    if (!isMissingSceneReleaseCommentReactionsTable(error)) throw error;
    reactionsAvailable = false;
    rootPage = (await params.prisma.scene_release_comments.findMany({
      where: { release_id: params.releaseId, parent_id: null, ...visibleAuthors },
      orderBy: { created_at: "desc" },
      skip: offset,
      take: limit + 1,
      select: releaseCommentSelectWithoutReactions
    })).map((comment) => ({ ...comment, reactions: [] }));
  }
  const selectedRoots = rootPage.slice(0, limit);
  const rows = [...selectedRoots];
  let parentIds = selectedRoots.map((comment) => comment.id);
  while (parentIds.length) {
    let replies: typeof rows;
    try {
      replies = await params.prisma.scene_release_comments.findMany({
        where: { release_id: params.releaseId, parent_id: { in: parentIds }, ...visibleAuthors },
        orderBy: { created_at: "desc" },
        select: reactionsAvailable ? releaseCommentSelect : releaseCommentSelectWithoutReactions
      });
    } catch (error) {
      if (isMissingSceneReleaseCommentsTable(error)) return { comments: [], total: 0, nextOffset: null, hasMore: false };
      if (!isMissingSceneReleaseCommentReactionsTable(error)) throw error;
      reactionsAvailable = false;
      replies = (await params.prisma.scene_release_comments.findMany({
        where: { release_id: params.releaseId, parent_id: { in: parentIds }, ...visibleAuthors },
        orderBy: { created_at: "desc" },
        select: releaseCommentSelectWithoutReactions
      })).map((comment) => ({ ...comment, reactions: [] }));
    }
    if (!reactionsAvailable) replies = replies.map((comment) => ({ ...comment, reactions: comment.reactions ?? [] }));
    rows.push(...replies);
    parentIds = replies.map((comment) => comment.id);
  }
  let total = 0;
  try {
    total = await params.prisma.scene_release_comments.count({ where: { release_id: params.releaseId, deleted_at: null, ...visibleAuthors } });
  } catch (error) {
    if (isMissingSceneReleaseCommentsTable(error)) return { comments: [], total: 0, nextOffset: null, hasMore: false };
    throw error;
  }
  const comments = buildFeedCommentTree(rows, params.userId);
  const hasMore = rootPage.length > limit;
  return {
    comments,
    total,
    nextOffset: hasMore ? offset + selectedRoots.length : null,
    hasMore
  };
}


export async function deleteReleaseComment(params: {
  prisma: PrismaClient;
  releaseId: string;
  commentId: string;
  userId: string;
}) {
  await assertPublicRelease(params.prisma, params.releaseId);
  return params.prisma.$transaction(async (tx) => {
    await lockSocialMutation(tx as PrismaClient, `release-comment-parent:${params.commentId}`);
    const comment = await tx.scene_release_comments.findUnique({
      where: { id: params.commentId },
      select: { id: true, release_id: true, user_id: true, deleted_at: true, media_key: true }
    });
    if (!comment || comment.release_id !== params.releaseId) throw new Error("RELEASE_COMMENT_NOT_FOUND");
    if (comment.user_id !== params.userId) throw new Error("RELEASE_COMMENT_FORBIDDEN");
    if (comment.deleted_at) return { deleted: true as const, id: params.commentId, alreadyDeleted: true as const, mediaKey: null };
    await tx.scene_release_comments.update({
      where: { id: params.commentId },
      data: { deleted_at: new Date(), content: "", media_key: null, media_name: null }
    });
    return { deleted: true as const, id: params.commentId, alreadyDeleted: false as const, mediaKey: comment.media_key };
  });
}

export async function updateReleaseComment(params: {
  prisma: PrismaClient;
  releaseId: string;
  commentId: string;
  userId: string;
  content: string;
}) {
  await assertPublicRelease(params.prisma, params.releaseId);
  const comment = await params.prisma.scene_release_comments.findUnique({
    where: { id: params.commentId },
    select: { id: true, release_id: true, user_id: true, deleted_at: true }
  });
  if (!comment || comment.release_id !== params.releaseId || comment.deleted_at) throw new Error("RELEASE_COMMENT_NOT_FOUND");
  if (comment.user_id !== params.userId) throw new Error("RELEASE_COMMENT_FORBIDDEN");
  const editedAt = new Date();
  const updated = await params.prisma.scene_release_comments.update({
    where: { id: params.commentId },
    data: { content: params.content, edited_at: editedAt },
    select: { id: true, content: true, updated_at: true, edited_at: true }
  });
  return { id: updated.id, content: updated.content, updatedAt: updated.updated_at.toISOString(), editedAt: updated.edited_at?.toISOString() ?? editedAt.toISOString() };
}

export async function createReleaseComment(params: {
  prisma: PrismaClient;
  releaseId: string;
  userId: string;
  content: string;
  mediaKey?: string;
  mediaName?: string;
  parentId?: string | null;
  idempotencyKey?: string | null;
}) {
  const release = await assertPublicRelease(params.prisma, params.releaseId);
  assertOwnedSocialMediaKey(params.userId, params.mediaKey ?? "");
  const owner = await params.prisma.release.findUnique({ where: { id: params.releaseId }, select: { userId: true, title: true } });
  await assertSocialInteractionAllowed(
    params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">,
    params.userId,
    release.userId
  );
  const idempotencyKey = normalizeSocialIdempotencyKey(params.idempotencyKey);
  const select = { ...releaseCommentSelect } as const;
  const result = await params.prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      await lockSocialMutation(tx as PrismaClient, `release-comment:${params.userId}:${idempotencyKey}`);
      const existing = await tx.scene_release_comments.findFirst({ where: { user_id: params.userId, idempotency_key: idempotencyKey }, select });
      if (existing) return { comment: existing, eventIds: [] as string[] };
    }
    let parentAuthorUserId: string | null = null;
    if (params.parentId) {
      await lockSocialMutation(tx as PrismaClient, `release-comment-parent:${params.parentId}`);
      const parent = await tx.scene_release_comments.findUnique({ where: { id: params.parentId }, select: { id: true, release_id: true, user_id: true, deleted_at: true } });
      if (!parent || parent.release_id !== params.releaseId || parent.deleted_at) throw new Error("RELEASE_COMMENT_PARENT_NOT_FOUND");
      await assertSocialInteractionAllowed(
        tx as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">,
        params.userId,
        parent.user_id
      );
      parentAuthorUserId = parent.user_id;
    }
    const comment = await tx.scene_release_comments.create({
      data: { release_id: params.releaseId, user_id: params.userId, parent_id: params.parentId || null, content: params.content, media_key: params.mediaKey || null, media_name: params.mediaName || null, idempotency_key: idempotencyKey },
      select
    });
    const href = `/feed/release_${encodeURIComponent(params.releaseId)}#comment-${encodeURIComponent(comment.id)}`;
    const events = [
      owner?.userId && owner.userId !== params.userId ? { id: `artist-release-commented-${params.releaseId}-${comment.id}`, userId: owner.userId, title: "Новый комментарий", message: `К релизу «${owner.title ?? "Без названия"}» появился новый комментарий.` } : null,
      parentAuthorUserId && parentAuthorUserId !== params.userId && parentAuthorUserId !== owner?.userId ? { id: `artist-release-replied-${params.releaseId}-${comment.id}`, userId: parentAuthorUserId, title: "Новый ответ", message: `На ваш комментарий к релизу «${owner?.title ?? "Без названия"}» ответили.` } : null
    ].filter((event): event is { id: string; userId: string; title: string; message: string } => Boolean(event));
    for (const event of events) await enqueueSocialNotification(tx, { ...event, kind: "artist_release_commented", href, sourceType: "release", sourceId: params.releaseId });
    return { comment, eventIds: events.map((event) => event.id) };
  });
  await dispatchSocialNotificationsSafely(params.prisma, result.eventIds);
  return buildFeedCommentTree([result.comment], params.userId)[0];
}

async function assertPublicArtistPost(prisma: PrismaClient, postId: string, viewerUserId?: string | null) {
  const post = await prisma.artist_profile_posts.findUnique({
    where: { id: postId },
    select: { id: true, user_id: true, profile_key: true, audience: true, content: true }
  });
  if (!post) throw new Error("ARTIST_POST_NOT_FOUND");
  if (post.profile_key !== PERSONAL_ARTIST_PROFILE_KEY) {
    const profile = await getSingleUserArtistProfileSettings(prisma, post.user_id, post.profile_key);
    if (!profile || !profile.settings.enabled || profile.adminHidden) {
      throw new Error("ARTIST_POST_NOT_FOUND");
    }
  }
  const followerStore = prisma.artist_profile_followers as typeof prisma.artist_profile_followers | undefined;
  const followsAuthorProfile = Boolean(viewerUserId && viewerUserId !== post.user_id && followerStore && await followerStore.findUnique({
    where: {
      profile_user_id_profile_key_follower_user_id: {
        profile_user_id: post.user_id,
        profile_key: post.profile_key,
        follower_user_id: viewerUserId
      }
    },
    select: { id: true }
  }));
  if (!canViewSocialPost({ audience: post.audience, authorUserId: post.user_id, viewerUserId, followsAuthorProfile })) {
    throw new Error("ARTIST_POST_NOT_FOUND");
  }
  return post;
}

export async function listArtistPostComments(params: {
  prisma: PrismaClient;
  postId: string;
  userId?: string | null;
  limit?: number;
  offset?: number;
}) {
  const post = await assertPublicArtistPost(params.prisma, params.postId, params.userId);
  const safetyPrisma = params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">;
  if (params.userId) await assertSocialInteractionAllowed(safetyPrisma, params.userId, post.user_id);
  const blockedPeerIds = params.userId ? await listBlockedPeerIds(safetyPrisma, params.userId) : [];
  const visibleAuthors = blockedPeerIds.length ? { user_id: { notIn: blockedPeerIds } } : {};
  const offset = Math.max(params.offset ?? 0, 0);
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  let reactionsAvailable = true;
  let rootPage: SocialCommentRow[];
  try {
    rootPage = await params.prisma.artist_profile_post_comments.findMany({
      where: { post_id: params.postId, parent_id: null, ...visibleAuthors },
      orderBy: { created_at: "desc" },
      skip: offset,
      take: limit + 1,
      select: postCommentSelect
    });
  } catch (error) {
    if (isMissingArtistPostCommentsTable(error)) return { comments: [], total: 0, nextOffset: null, hasMore: false };
    if (!isMissingArtistPostCommentReactionsTable(error)) throw error;
    reactionsAvailable = false;
    rootPage = (await params.prisma.artist_profile_post_comments.findMany({
      where: { post_id: params.postId, parent_id: null, ...visibleAuthors },
      orderBy: { created_at: "desc" },
      skip: offset,
      take: limit + 1,
      select: postCommentSelectWithoutReactions
    })).map((comment) => ({ ...comment, reactions: [] }));
  }
  const selectedRoots = rootPage.slice(0, limit);
  const rows = [...selectedRoots];
  let parentIds = selectedRoots.map((comment) => comment.id);
  while (parentIds.length) {
    let replies: typeof rows;
    try {
      replies = await params.prisma.artist_profile_post_comments.findMany({
        where: { post_id: params.postId, parent_id: { in: parentIds }, ...visibleAuthors },
        orderBy: { created_at: "desc" },
        select: reactionsAvailable ? postCommentSelect : postCommentSelectWithoutReactions
      });
    } catch (error) {
      if (isMissingArtistPostCommentsTable(error)) return { comments: [], total: 0, nextOffset: null, hasMore: false };
      if (!isMissingArtistPostCommentReactionsTable(error)) throw error;
      reactionsAvailable = false;
      replies = (await params.prisma.artist_profile_post_comments.findMany({
        where: { post_id: params.postId, parent_id: { in: parentIds }, ...visibleAuthors },
        orderBy: { created_at: "desc" },
        select: postCommentSelectWithoutReactions
      })).map((comment) => ({ ...comment, reactions: [] }));
    }
    if (!reactionsAvailable) replies = replies.map((comment) => ({ ...comment, reactions: comment.reactions ?? [] }));
    rows.push(...replies);
    parentIds = replies.map((comment) => comment.id);
  }
  let total = 0;
  try {
    total = await params.prisma.artist_profile_post_comments.count({ where: { post_id: params.postId, deleted_at: null, ...visibleAuthors } });
  } catch (error) {
    if (isMissingArtistPostCommentsTable(error)) return { comments: [], total: 0, nextOffset: null, hasMore: false };
    throw error;
  }
  const comments = buildFeedCommentTree(rows, params.userId);
  const hasMore = rootPage.length > limit;
  return {
    comments,
    total,
    nextOffset: hasMore ? offset + selectedRoots.length : null,
    hasMore
  };
}


export async function deleteArtistPostComment(params: {
  prisma: PrismaClient;
  postId: string;
  commentId: string;
  userId: string;
}) {
  await assertPublicArtistPost(params.prisma, params.postId, params.userId);
  return params.prisma.$transaction(async (tx) => {
    await lockSocialMutation(tx as PrismaClient, `post-comment-parent:${params.commentId}`);
    const comment = await tx.artist_profile_post_comments.findUnique({
      where: { id: params.commentId },
      select: { id: true, post_id: true, user_id: true, deleted_at: true }
    });
    if (!comment || comment.post_id !== params.postId) throw new Error("ARTIST_POST_COMMENT_NOT_FOUND");
    if (comment.user_id !== params.userId) throw new Error("ARTIST_POST_COMMENT_FORBIDDEN");
    if (comment.deleted_at) return { deleted: true as const, id: params.commentId, alreadyDeleted: true as const };
    await tx.artist_profile_post_comments.update({
      where: { id: params.commentId },
      data: { deleted_at: new Date(), content: "" }
    });
    return { deleted: true as const, id: params.commentId, alreadyDeleted: false as const };
  });
}

export async function updateArtistPostComment(params: {
  prisma: PrismaClient;
  postId: string;
  commentId: string;
  userId: string;
  content: string;
}) {
  await assertPublicArtistPost(params.prisma, params.postId);
  const comment = await params.prisma.artist_profile_post_comments.findUnique({
    where: { id: params.commentId },
    select: { id: true, post_id: true, user_id: true, deleted_at: true }
  });
  if (!comment || comment.post_id !== params.postId || comment.deleted_at) throw new Error("ARTIST_POST_COMMENT_NOT_FOUND");
  if (comment.user_id !== params.userId) throw new Error("ARTIST_POST_COMMENT_FORBIDDEN");
  const editedAt = new Date();
  const updated = await params.prisma.artist_profile_post_comments.update({
    where: { id: params.commentId },
    data: { content: params.content, edited_at: editedAt },
    select: { id: true, content: true, updated_at: true, edited_at: true }
  });
  return { id: updated.id, content: updated.content, updatedAt: updated.updated_at.toISOString(), editedAt: updated.edited_at?.toISOString() ?? editedAt.toISOString() };
}

export async function createArtistPostComment(params: {
  prisma: PrismaClient;
  postId: string;
  userId: string;
  content: string;
  parentId?: string | null;
  idempotencyKey?: string | null;
}) {
  const post = await assertPublicArtistPost(params.prisma, params.postId, params.userId);
  await assertSocialInteractionAllowed(
    params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">,
    params.userId,
    post.user_id
  );
  const idempotencyKey = normalizeSocialIdempotencyKey(params.idempotencyKey);
  const select = { ...postCommentSelect } as const;
  const result = await params.prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      await lockSocialMutation(tx as PrismaClient, `post-comment:${params.userId}:${idempotencyKey}`);
      const existing = await tx.artist_profile_post_comments.findFirst({ where: { user_id: params.userId, idempotency_key: idempotencyKey }, select });
      if (existing) return { comment: existing, eventIds: [] as string[] };
    }
    let parentAuthorUserId: string | null = null;
    if (params.parentId) {
      await lockSocialMutation(tx as PrismaClient, `post-comment-parent:${params.parentId}`);
      const parent = await tx.artist_profile_post_comments.findUnique({ where: { id: params.parentId }, select: { id: true, post_id: true, user_id: true, deleted_at: true } });
      if (!parent || parent.post_id !== params.postId || parent.deleted_at) throw new Error("ARTIST_POST_COMMENT_PARENT_NOT_FOUND");
      await assertSocialInteractionAllowed(
        tx as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">,
        params.userId,
        parent.user_id
      );
      parentAuthorUserId = parent.user_id;
    }
    const comment = await tx.artist_profile_post_comments.create({
      data: { post_id: params.postId, user_id: params.userId, parent_id: params.parentId || null, content: params.content, idempotency_key: idempotencyKey },
      select
    });
    const href = `/feed/post_${encodeURIComponent(params.postId)}#comment-${encodeURIComponent(comment.id)}`;
    const preview = canonicalPostPreview(post.content);
    const events = [
      post.user_id !== params.userId ? { id: `artist-post-commented-${params.postId}-${comment.id}`, userId: post.user_id, title: "Новый комментарий", message: preview ? `К вашему посту «${preview}» появился новый комментарий.` : "К вашему посту появился новый комментарий." } : null,
      parentAuthorUserId && parentAuthorUserId !== params.userId && parentAuthorUserId !== post.user_id ? { id: `artist-post-replied-${params.postId}-${comment.id}`, userId: parentAuthorUserId, title: "Новый ответ", message: preview ? `На ваш комментарий к посту «${preview}» ответили.` : "На ваш комментарий к посту ответили." } : null
    ].filter((event): event is { id: string; userId: string; title: string; message: string } => Boolean(event));
    for (const event of events) await enqueueSocialNotification(tx, { ...event, kind: "artist_post_commented", href, sourceType: "post", sourceId: params.postId });
    return { comment, eventIds: events.map((event) => event.id) };
  });
  await dispatchSocialNotificationsSafely(params.prisma, result.eventIds);
  return buildFeedCommentTree([result.comment], params.userId)[0];
}

export async function requestArtistCollaborationContact(params: {
  prisma: PrismaClient;
  slug: string;
  requesterUserId: string;
}) {
  const profile = await getPublicArtistProfile(params.prisma, params.slug, undefined, { includeReleaseAnalytics: false });
  const profileUserId = profile ? parseArtistProfileUserId(profile.slug) : null;
  if (!profile || !profileUserId) throw new Error("ARTIST_PROFILE_NOT_FOUND");
  if (!profile.collaboration.open) throw new Error("ARTIST_COLLABORATION_DISABLED");
  if (profileUserId === params.requesterUserId) throw new Error("ARTIST_COLLABORATION_SELF_CONTACT");

  const requester = await params.prisma.user.findUnique({
    where: { id: params.requesterUserId },
    select: { name: true }
  });
  await notifyCommunityEvent(params.prisma, {
    id: `artist-collaboration-contact-${profileUserId}-${profile.artistKey}-${params.requesterUserId}`,
    userId: profileUserId,
    kind: "artist_profile_followed",
    title: "Новый запрос на сотрудничество",
    message: `${requester?.name ?? "Новый пользователь"} хочет обсудить сотрудничество с профилем ${profile.displayName}.`,
    href: `/artists/${encodeURIComponent(profile.slug)}`
  });
  return { ok: true as const };
}

export async function publishApprovedReleasePosts(params: {
  prisma: PrismaClient;
  userId: string;
  releaseId: string;
  releaseTitle: string;
}) {
  const approvedRelease = await params.prisma.release.findUnique({ where: { id: params.releaseId }, select: { date: true } });
  if (approvedRelease && (params.prisma as unknown as { social_activity_events?: unknown }).social_activity_events) {
    await upsertSocialActivityEvent({
      prisma: params.prisma,
      kind: "RELEASE",
      sourceId: params.releaseId,
      actorUserId: params.userId,
      publishedAt: approvedRelease.date,
      metadata: { title: params.releaseTitle }
    });
  }
  const settings = await getUserArtistProfilesForRelease(params.prisma, params.userId, params.releaseId);
  const profiles = settings?.profiles.filter((profile) =>
    profile.settings.enabled
    && profile.settings.autoPublishApprovedReleases
    && !profile.adminHidden
    && isCommunityReleaseVisible(profile.settings, params.releaseId)
  ) ?? [];
  if (profiles.length === 0) return 0;

  const existing = await params.prisma.artist_profile_posts.findMany({
    where: {
      user_id: params.userId,
      profile_key: { in: profiles.map((profile) => profile.artistKey) },
      release_id: params.releaseId
    },
    select: { profile_key: true }
  });
  const existingKeys = new Set(existing.map((item) => item.profile_key));
  const targets = profiles.filter((profile) => !existingKeys.has(profile.artistKey));
  if (targets.length === 0) return 0;

  const release = await resolveReleaseForAutoPost(params.prisma, targets, params.releaseId);
  if (!release?.coverUrl?.trim() || !release.audioUrl?.trim()) return 0;

  await Promise.all(targets.map(async (profile) => {
    const post = await params.prisma.artist_profile_posts.create({
      data: {
        user_id: params.userId,
        profile_key: profile.artistKey,
        release_id: params.releaseId,
        audience: "PUBLIC",
        content: `Новый релиз «${params.releaseTitle}» уже в каталоге.`
      },
      select: { id: true, created_at: true }
    });
    if ((params.prisma as unknown as { social_activity_events?: unknown }).social_activity_events) {
      await upsertSocialActivityEvent({
        prisma: params.prisma,
        kind: "POST",
        sourceId: post.id,
        actorUserId: params.userId,
        profileKey: profile.artistKey,
        publishedAt: post.created_at,
        metadata: { releaseId: params.releaseId, autoPublished: true }
      });
    }
  }));

  return targets.length;
}
