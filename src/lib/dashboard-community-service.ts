import type { PrismaClient } from "@prisma/client";

import type {
  CollaborationIntent,
  CollaborationPreference,
  CollaborationRole,
  CollaborationStatus,
  CollaborationWorkflow
} from "@/lib/collaboration";
import type { FeedPostMediaItem, FeedReaction, FeedReactionSummary, PublicFeedComment } from "@/lib/feed-contract";
import {
  getPublicArtistProfile,
  getUserArtistProfileSettings,
  isCommunityReleaseVisible,
  listPublicArtistProfiles,
  type PublicArtistProfile,
  type PublicArtistRelease,
  type UserArtistProfileReleaseOption,
  type UserArtistProfileSettings
} from "@/lib/artist-profile-service";
import { normalizeArtistProfileType } from "@/lib/artist-profile-type";
import { buildPersonalProfileSlug, normalizeArtistProfileKey, PERSONAL_ARTIST_PROFILE_KEY } from "@/lib/artist-profile-shared";
import { parseArtistProfileUserId } from "@/lib/artist-profile-shared";
import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import { resolveTrackAudioAsset } from "@/lib/release-media-asset";
import { buildFeedCommentTree, buildReactionSummary } from "@/lib/feed-social-helpers";
import { findLegacyUserById, isMissingCanonicalUserTable, listLegacyUsersByIds } from "@/lib/legacy-user-store";
import { listBlockedPeerIds, type SocialSafetyPrisma } from "@/lib/social-safety-policy";
import { getReleasePublicListenSummary } from "@/lib/smart-link-service";
import {
  listSocialFeedPreferences,
  type SocialFeedPreferencePrisma
} from "@/lib/social-feed-preference-service";
import {
  buildCollaborationPresentation,
  collaborationIntentLabel,
  normalizeCollaborationCity,
  parseStructuredPostContent
} from "@/lib/collaboration";
import { buildSocialPostAudienceWhere } from "@/lib/social-post-access";
import { isAnyPrismaTableMissingError, isPrismaPoolTimeoutError } from "@/lib/prisma-errors";

export type DashboardCommunityScope = "all" | "following";
export type DashboardCommunityFilter = "all" | "releases" | "video" | "news" | "media";

type LinkedRelease = {
  id: string;
  title: string;
  releaseDate: string;
  href: string;
  artistName?: string | null;
  coverUrl?: string | null;
  audioPreviewUrl?: string | null;
  platformLinks?: Array<{ code: string; label: string; href: string }>;
};

type FeedAuthor = {
  slug: string;
  displayName: string;
  profileType: "user" | "artist" | "producer" | "group" | "label";
  avatarUrl: string | null;
  followingByViewer: boolean;
  ownedByViewer: boolean;
};

type FeedPostComment = PublicFeedComment;
type FeedReleaseComment = PublicFeedComment;

type FeedPostItem = {
  id: string;
  kind: "post";
  postType: "standard" | "collaboration";
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  content: string;
  mediaType: "image" | "audio" | "video" | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaItems: FeedPostMediaItem[];
  likes: number;
  liked: boolean;
  viewerReaction: FeedReaction | null;
  reactionSummary: FeedReactionSummary;
  commentsCount: number;
  comments: FeedPostComment[];
  responsesCount: number;
  author: FeedAuthor;
  linkedRelease: LinkedRelease | null;
  collaboration: {
    intent: CollaborationIntent;
    role: CollaborationRole;
    status: "open" | "closed";
    workflow: CollaborationWorkflow;
    customIntentLabel: string;
    genres: string[];
    preference: "remote" | "local" | "hybrid";
    city: string;
    bio: string;
    label: string;
    rawIntent: CollaborationIntent;
    intentCategory: "LOOKING_FOR_PERSON" | "LOOKING_FOR_COLLABORATION" | "OFFERING_COLLABORATION" | "OTHER";
    displayIntent: string;
    rawRole: CollaborationRole;
    displayRole: string;
  } | null;
};

type FeedReleaseItem = {
  id: string;
  kind: "release";
  createdAt: string;
  releaseId: string;
  title: string;
  coverUrl: string | null;
  audioUrl: string | null;
  playCount: number;
  likes: number;
  liked: boolean;
  viewerReaction: FeedReaction | null;
  reactionSummary: FeedReactionSummary;
  commentsCount: number;
  comments: FeedReleaseComment[];
  sceneHref: string | null;
  author: FeedAuthor;
};

export type DashboardCommunityFeedItem = FeedPostItem | FeedReleaseItem;

export function resolveDashboardCommunityScope(params: {
  scope: DashboardCommunityScope;
  viewerAuthenticated: boolean;
  followedSlugs: string[];
  publicSlugs: string[];
}) {
  if (params.scope === "following") {
    return {
      scope: "following" as const,
      requiresAuth: !params.viewerAuthenticated,
      slugs: params.viewerAuthenticated ? Array.from(new Set(params.followedSlugs)) : []
    };
  }

  return {
    scope: "all" as const,
    requiresAuth: false,
    slugs: Array.from(new Set(params.publicSlugs))
  };
}

export interface DashboardCommunityPayload {
  scope: DashboardCommunityScope;
  filter: DashboardCommunityFilter;
  collaborationFilter: "all" | "only";
  collaborationIntent: CollaborationIntent | null;
  collaborationRole: CollaborationRole | null;
  collaborationWorkflow: CollaborationWorkflow | null;
  collaborationPreference: CollaborationPreference | null;
  collaborationCity: string | null;
  collaborationStatus: CollaborationStatus | null;
  viewerAuthenticated: boolean;
  feed: DashboardCommunityFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
  ownedProfiles: UserArtistProfileSettings[];
  releaseOptions: UserArtistProfileReleaseOption[];
  suggestions: Array<{ slug: string; displayName: string; profileType: "artist" | "producer" | "group" | "label"; avatarUrl: string | null }>;
  newReleases: FeedReleaseItem[];
  popularPosts: FeedPostItem[];
  releaseOfWeek: FeedReleaseItem | null;
}

type ProfileDescriptor = {
  userId: string;
  artistKey: string;
  slug: string;
  displayName: string;
  profileType: "user" | "artist" | "producer" | "group" | "label";
  avatarUrl: string | null;
  releases: PublicArtistRelease[];
  communityReleaseVisibility: {
    hideAllCommunityReleases: boolean;
    hiddenCommunityReleaseIds: string[];
  };
  collaboration: PublicArtistProfile["collaboration"];
};

type RawPost = {
  id: string;
  user_id: string;
  profile_key: string;
  audience: string;
  content: string;
  media_type: string | null;
  media_key: string | null;
  media_name: string | null;
  created_at: Date;
  updated_at: Date;
  edited_at: Date | null;
  release?: { id: string; title: string; date: Date } | null;
  author: { id: string; name: string; avatar: string | null; isVerifiedAuthor: boolean };
  comments?: Array<{
    id: string;
    content: string;
    created_at: Date;
    author: { id: string; name: string; avatar: string | null; isVerifiedAuthor: boolean };
  }>;
  _count?: { likes: number; comments?: number };
};

function profileDescriptor(
  profile: PublicArtistProfile,
  communityReleaseVisibility: ProfileDescriptor["communityReleaseVisibility"]
): ProfileDescriptor | null {
  const userId = parseArtistProfileUserId(profile.slug);
  if (!userId) return null;
  return {
    userId,
    artistKey: profile.artistKey,
    slug: profile.slug,
    displayName: profile.displayName,
    profileType: profile.profileType,
    avatarUrl: sanitizeCommunityAvatarUrl(profile.avatarUrl),
    releases: profile.releases,
    communityReleaseVisibility,
    collaboration: profile.collaboration
  };
}

export function sanitizeCommunityAvatarUrl(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  const lower = normalized.toLowerCase();
  if (!normalized || lower.startsWith("data:") || lower.startsWith("blob:") || lower.includes("/data%3a") || lower.includes("/blob%3a")) {
    return DEFAULT_USER_AVATAR_URL;
  }
  return normalized;
}

export function resolveCommunityCoverUrl(source: { id: string; preview?: string | null }): string | null {
  const preview = source.preview?.trim() ?? "";
  if (!preview || preview.startsWith("data:") || preview.startsWith("blob:")) return null;
  const extension = preview.replace(/^\./u, "").toLowerCase();
  if (/^(?:avif|jpe?g|png|webp)$/u.test(extension)) {
    return buildStoredFileRouteUrl(`previews/${source.id}.${extension}`);
  }
  return buildStoredFileRouteUrl(preview);
}

type CommunityTrackAudioInput = {
  trackId: string;
  audioFile?: unknown;
  audioUpload?: unknown;
  audioUrl?: unknown;
  audio?: unknown;
  track?: unknown;
};

export async function resolveCommunityTrackAudio(input: CommunityTrackAudioInput) {
  return resolveTrackAudioAsset({
    trackId: input.trackId,
    audioFile: input.audioFile,
    audioUpload: input.audioUpload,
    audioUrl: input.audioUrl,
    audio: input.audio,
    track: input.track,
    preferImmediateUrl: true
  });
}

export function selectDashboardCommunityPage<T extends { id: string }>(
  items: T[],
  params: { limit?: number; cursor?: string | null }
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? 20), 1), 200);
  const cursorIndex = params.cursor ? items.findIndex((item) => item.id === params.cursor) : -1;
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const page = items.slice(start, start + limit + 1);
  const hasMore = page.length > limit;
  const selected = hasMore ? page.slice(0, limit) : page;
  return {
    items: selected,
    nextCursor: hasMore ? selected.at(-1)?.id ?? null : null,
    hasMore
  };
}

function resolvePersonalFeedProfileType(value: unknown): "user" | "producer" {
  return normalizeArtistProfileType(value) === "producer" ? "producer" : "user";
}

function buildFeedAuthor(profile: ProfileDescriptor, params: { viewerUserId?: string | null; followedSlugs: string[] }): FeedAuthor {
  return {
    slug: profile.slug,
    displayName: profile.displayName,
    profileType: profile.profileType,
    avatarUrl: profile.avatarUrl,
    followingByViewer: params.followedSlugs.includes(profile.slug),
    ownedByViewer: Boolean(params.viewerUserId && params.viewerUserId === profile.userId)
  };
}

const linkedReleaseSelect = {
  id: true,
  title: true,
  date: true,
  performer: true,
  preview: true,
  user: { select: { name: true } }
} as const;

function toLinkedRelease(release: {
  id: string;
  title: string;
  date: Date;
  performer?: string | null;
  preview?: string | null;
  user?: { name: string } | null;
} | null): LinkedRelease | null {
  if (!release) return null;
  return {
    id: release.id,
    title: release.title,
    releaseDate: release.date.toISOString(),
    href: `/dashboard/releases/${release.id}`,
    artistName: release.performer?.trim() || release.user?.name || "Артист",
    coverUrl: resolveCommunityCoverUrl({
      id: release.id,
      preview: release.preview
    })
  };
}

function mapPostMediaItems(params: {
  parsed: ReturnType<typeof parseStructuredPostContent>;
  legacyMediaType: string | null;
  legacyMediaKey: string | null;
  legacyMediaName: string | null;
}): FeedPostMediaItem[] {
  if (params.parsed.mediaItems.length) {
    return params.parsed.mediaItems
      .map((item) => ({
        id: item.id ?? item.mediaKey,
        mediaType: item.mediaType,
        mediaUrl: buildStoredFileRouteUrl(item.mediaKey) || "",
        mediaName: item.mediaName || null,
        role: item.role,
        width: item.width ?? null,
        height: item.height ?? null,
        posterUrl: buildStoredFileRouteUrl(item.posterKey) || item.posterUrl || null
      }))
      .filter((item) => item.mediaUrl);
  }
  if (!params.legacyMediaType || !params.legacyMediaKey) return [];
  const mediaUrl = buildStoredFileRouteUrl(params.legacyMediaKey);
  if (!mediaUrl) return [];
  return [{
    id: params.legacyMediaKey,
    mediaType: params.legacyMediaType as FeedPostMediaItem["mediaType"],
    mediaUrl,
    mediaName: params.legacyMediaName,
    role: "standard",
    width: null,
    height: null,
    posterUrl: null
  }];
}

function byDateDesc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const normalizedLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: normalizedLimit }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) break;
        results[index] = await worker(items[index]!, index);
      }
    })
  );

  return results;
}

export function dedupeDashboardCommunitySlugs(slugs: string[]) {
  return Array.from(new Set(slugs));
}

export function collectOwnedCommunitySeedSlugs(
  ownedProfiles: Array<{ slug: string; settings?: { enabled?: boolean } | null; adminHidden?: boolean }>
) {
  return ownedProfiles
    .filter((profile) => profile.slug && !profile.adminHidden && (profile.settings?.enabled ?? true))
    .map((profile) => profile.slug);
}

export function expandDashboardCommunityFollowScopeSlugs(params: {
  followedOwnerIds: string[];
  publicArtistSlugs: string[];
  publicPersonalSlugs: string[];
}) {
  if (params.followedOwnerIds.length === 0) return [];
  const ownerIds = new Set(params.followedOwnerIds);
  return Array.from(new Set([
    ...params.publicArtistSlugs.filter((slug) => {
      const ownerId = parseArtistProfileUserId(slug);
      return Boolean(ownerId && ownerIds.has(ownerId));
    }),
    ...params.publicPersonalSlugs.filter((slug) => {
      const ownerId = parseArtistProfileUserId(slug);
      return Boolean(ownerId && ownerIds.has(ownerId));
    })
  ]));
}

export function selectDashboardCommunityNewReleases<T extends { createdAt: string }>(items: T[]) {
  return byDateDesc(items);
}

export function buildCollaborationResponseCountMap(rows: Array<{ post_id: string; _count: { _all: number } }>) {
  return new Map(rows.map((item) => [item.post_id, item._count._all]));
}

function hasRenderableReleaseMedia(item: { coverUrl: string | null; audioUrl: string | null; sceneHref?: string | null }) {
  return Boolean(item.coverUrl?.trim() || item.audioUrl?.trim() || item.sceneHref?.trim());
}

function matchesCommunitySearch(item: DashboardCommunityFeedItem, search: string) {
  if (!search) return true;
  const needle = search.toLocaleLowerCase("ru-RU");
  const haystack = [
    item.author.displayName,
    item.author.slug,
    item.kind === "post" ? item.content : item.title,
    item.kind === "post" ? item.linkedRelease?.title ?? "" : "",
    item.kind === "post" ? item.linkedRelease?.artistName ?? "" : "",
    item.kind === "post" ? item.linkedRelease?.platformLinks?.map((platform) => `${platform.label} ${platform.code}`).join(" ") ?? "" : "",
    item.kind === "post" ? item.collaboration?.label ?? "" : "",
    item.kind === "post" ? item.collaboration?.displayIntent ?? "" : "",
    item.kind === "post" ? item.collaboration?.displayRole ?? "" : "",
    item.kind === "post" ? item.collaboration?.customIntentLabel ?? "" : "",
    item.kind === "post" ? item.collaboration?.workflow ?? "" : "",
    item.kind === "post" ? item.collaboration?.status ?? "" : "",
    item.kind === "post" ? item.collaboration?.preference ?? "" : "",
    item.kind === "post" ? item.collaboration?.city ?? "" : "",
    item.kind === "post" ? item.collaboration?.genres.join(" ") ?? "" : ""
  ].join(" ").toLocaleLowerCase("ru-RU");
  return haystack.includes(needle);
}

async function listPublicPersonalFeedProfiles(prisma: PrismaClient): Promise<Array<{ slug: string; displayName: string; profileType: "user" | "producer"; avatarUrl: string | null }>> {
  try {
    const users = await prisma.user.findMany({
      where: { artist_profile_posts: { some: { profile_key: "__personal__" } } },
      take: 48,
      select: { id: true, name: true, avatar: true, artistProfileType: true }
    });
    return users.map((user) => ({
      slug: buildPersonalProfileSlug(user.name, user.id),
      displayName: user.name,
      profileType: resolvePersonalFeedProfileType(user.artistProfileType),
      avatarUrl: sanitizeCommunityAvatarUrl(buildStoredFileRouteUrl(user.avatar))
    }));
  } catch (error) {
    if (isMissingCanonicalUserTable(error)) {
      const personalPosts = await prisma.artist_profile_posts.findMany({
        where: { profile_key: PERSONAL_ARTIST_PROFILE_KEY },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 48,
        select: {
          user_id: true,
          author: { select: { name: true } }
        }
      });
      const uniqueUserIds = Array.from(new Set(personalPosts.map((row) => row.user_id)));
      const legacyUsers = await listLegacyUsersByIds(prisma, uniqueUserIds);
      return uniqueUserIds.map((userId) => {
        const fallbackName = personalPosts.find((row) => row.user_id === userId)?.author.name ?? "Пользователь";
        const legacyUser = legacyUsers.get(userId);
        const displayName = legacyUser?.name || fallbackName;
        return {
          slug: buildPersonalProfileSlug(displayName, userId),
          displayName,
          profileType: resolvePersonalFeedProfileType(legacyUser?.artistProfileType ?? null),
          avatarUrl: sanitizeCommunityAvatarUrl(buildStoredFileRouteUrl(legacyUser?.avatar ?? null))
        };
      });
    }
    if (!/artistProfileType|column .* does not exist/iu.test(String(error))) throw error;
    const users = await prisma.user.findMany({
      where: { artist_profile_posts: { some: { profile_key: "__personal__" } } },
      take: 48,
      select: { id: true, name: true, avatar: true }
    });
    return users.map((user) => ({
      slug: buildPersonalProfileSlug(user.name, user.id),
      displayName: user.name,
      profileType: "user" as const,
      avatarUrl: sanitizeCommunityAvatarUrl(buildStoredFileRouteUrl(user.avatar))
    }));
  }
}

type RecentCommunitySeedProfile = {
  artistKey: string;
  slug: string;
  enabled: boolean;
  adminHidden: boolean;
};

export async function listRecentCommunityFeedSeedSlugs(params: {
  prisma: PrismaClient;
  audienceWhere: ReturnType<typeof buildSocialPostAudienceWhere>;
  before?: { publishedAt: Date; postId: string | null } | null;
  take?: number;
  resolveOwnerProfiles: (ownerId: string) => Promise<RecentCommunitySeedProfile[] | null>;
}): Promise<string[]> {
  const keysetWhere = params.before ? {
    OR: [
      { created_at: { lt: params.before.publishedAt } },
      ...(params.before.postId
        ? [{ created_at: params.before.publishedAt, id: { lte: params.before.postId } }]
        : [{ created_at: params.before.publishedAt }])
    ]
  } : null;

  const loadRows = async (includeAudience: boolean) => params.prisma.artist_profile_posts.findMany({
    where: {
      AND: [
        ...(includeAudience ? [params.audienceWhere] : []),
        ...(keysetWhere ? [keysetWhere] : [])
      ]
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: params.take ?? 120,
    select: {
      user_id: true,
      profile_key: true,
      author: { select: { name: true } }
    }
  });

  const rows = await loadRows(true).catch(async (error) => {
    if (!isMissingPostAudienceColumn(error)) throw error;
    console.warn("[feed-compat] recent feed seed fallback without audience due to schema mismatch", error);
    return loadRows(false);
  });

  const slugs: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    let slug: string | null = null;
    if (row.profile_key === PERSONAL_ARTIST_PROFILE_KEY) {
      slug = buildPersonalProfileSlug(row.author.name, row.user_id);
    } else {
      const profiles = await params.resolveOwnerProfiles(row.user_id);
      slug = profiles?.find((profile) =>
        profile.artistKey === row.profile_key && profile.enabled && !profile.adminHidden
      )?.slug ?? null;
    }

    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }

  return slugs;
}

async function listFollowedProfileSlugs(params: {
  prisma: PrismaClient;
  followerUserId: string;
  blockedPeerIdSet: Set<string>;
  mutedUserIdSet: Set<string>;
}): Promise<Array<{ profileUserId: string; slug: string }>> {
  const follows = await params.prisma.artist_profile_followers.findMany({
    where: {
      follower_user_id: params.followerUserId
    },
    select: {
      profile_user_id: true,
      profile_key: true
    },
    take: 100
  });

  const visibleFollows = follows.filter((follow) =>
    !params.blockedPeerIdSet.has(follow.profile_user_id) && !params.mutedUserIdSet.has(follow.profile_user_id)
  );
  if (visibleFollows.length === 0) return [];

  const ownerIds = Array.from(new Set(visibleFollows.map((follow) => follow.profile_user_id)));
  const ownerSettingsEntries = await mapWithConcurrency(ownerIds, 4, async (ownerId) => [
    ownerId,
    await withCommunityPoolFallback(() => getUserArtistProfileSettings(params.prisma, ownerId), null)
  ] as const);
  const ownerSettings = new Map(ownerSettingsEntries);

  const personalOwnerIds = Array.from(new Set(
    visibleFollows
      .filter((follow) => follow.profile_key === PERSONAL_ARTIST_PROFILE_KEY)
      .map((follow) => follow.profile_user_id)
  ));
  const personalOwners = new Map(await mapWithConcurrency(personalOwnerIds, 4, async (ownerId) => {
    const owner = await withCommunityPoolFallback(() => params.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, name: true }
    }), null);
    return [ownerId, owner] as const;
  }));

  return visibleFollows.flatMap((follow) => {
    if (follow.profile_key === PERSONAL_ARTIST_PROFILE_KEY) {
      const owner = personalOwners.get(follow.profile_user_id);
      if (!owner) return [];
      return [{
        profileUserId: follow.profile_user_id,
        slug: buildPersonalProfileSlug(owner.name, owner.id)
      }];
    }

    const profile = ownerSettings.get(follow.profile_user_id)?.profiles.find(
      (candidate) => candidate.artistKey === follow.profile_key && candidate.settings.enabled && !candidate.adminHidden
    );
    return profile
      ? [{
          profileUserId: follow.profile_user_id,
          slug: profile.slug
        }]
      : [];
  });
}

function filterFeed(items: DashboardCommunityFeedItem[], filter: DashboardCommunityFilter) {
  switch (filter) {
    case "releases":
      return items.filter((item) => item.kind === "release" || (item.kind === "post" && item.linkedRelease));
    case "video":
      return items.filter((item) => item.kind === "post" && item.mediaItems.some((mediaItem) => mediaItem.mediaType === "video"));
    case "news":
      return items.filter((item) => item.kind === "post" && item.mediaItems.length === 0 && !item.linkedRelease);
    case "media":
      return items.filter((item) => item.kind === "release" || (item.kind === "post" && item.mediaItems.length > 0));
    default:
      return items;
  }
}

function isMissingPostCommentsTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; meta?: { table?: string } };
  return candidate.code === "P2021" && candidate.meta?.table === "icecream.artist_profile_post_comments";
}

export function isMissingCommunityCommentReactionTable(error: unknown) {
  return isAnyPrismaTableMissingError(error, [
    "icecream.artist_profile_post_comment_likes",
    "icecream.scene_release_comment_likes"
  ]);
}

function isMissingCollaborationResponsesTable(error: unknown) {
  return isAnyPrismaTableMissingError(error, [
    "icecream.collaboration_responses",
    "collaboration_responses"
  ]);
}

function isMissingPostReleaseColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; meta?: { column?: string } };
  return candidate.code === "P2022" && candidate.meta?.column === "artist_profile_posts.release_id";
}

export function isMissingPostAudienceColumn(error: unknown) {
  const message = String(error ?? "").toLowerCase();
  if (message.includes("artist_profile_posts.audience") || message.includes("j1.audience")) {
    return true;
  }
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; meta?: { column?: string } };
  return candidate.code === "P2022" && (
    candidate.meta?.column === "artist_profile_posts.audience"
    || candidate.meta?.column === "j1.audience"
  );
}

type CommunityPostCommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: Date;
  updated_at: Date;
  edited_at: Date | null;
  deleted_at: Date | null;
  reactions: Array<{ visitor_id: string; reaction: string }>;
  author: { id: string; name: string; avatar: string | null; isVerifiedAuthor: boolean };
};

type CommunityReleaseCommentRow = {
  id: string;
  release_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  media_key: string | null;
  media_name: string | null;
  created_at: Date;
  updated_at: Date;
  edited_at: Date | null;
  deleted_at: Date | null;
  reactions: Array<{ visitor_id: string; reaction: string }>;
  author: { id: string; name: string; avatar: string | null; isVerifiedAuthor: boolean };
};

export async function loadCommunityPostCommentsWithFallback(
  prisma: Pick<PrismaClient, "artist_profile_post_comments">,
  params: {
    postIds: string[];
    suppressedPeerIds: string[];
  }
): Promise<CommunityPostCommentRow[]> {
  if (params.postIds.length === 0) return [];
  const baseWhere = {
    post_id: { in: params.postIds },
    ...(params.suppressedPeerIds.length ? { user_id: { notIn: params.suppressedPeerIds } } : {})
  };

  try {
    return await prisma.artist_profile_post_comments.findMany({
      where: baseWhere,
      orderBy: { created_at: "desc" },
      take: 240,
      select: {
        id: true,
        post_id: true,
        user_id: true,
        parent_id: true,
        content: true,
        created_at: true,
        updated_at: true,
        edited_at: true,
        deleted_at: true,
        reactions: {
          where: params.suppressedPeerIds.length ? { visitor_id: { notIn: params.suppressedPeerIds } } : undefined,
          select: { visitor_id: true, reaction: true }
        },
        author: { select: { id: true, name: true, avatar: true, isVerifiedAuthor: true } }
      }
    });
  } catch (error) {
    if (isMissingPostCommentsTable(error)) return [];
    if (!isMissingCommunityCommentReactionTable(error)) throw error;
    const rows = await prisma.artist_profile_post_comments.findMany({
      where: baseWhere,
      orderBy: { created_at: "desc" },
      take: 240,
      select: {
        id: true,
        post_id: true,
        user_id: true,
        parent_id: true,
        content: true,
        created_at: true,
        updated_at: true,
        edited_at: true,
        deleted_at: true,
        author: { select: { id: true, name: true, avatar: true, isVerifiedAuthor: true } }
      }
    });
    return rows.map((row) => ({ ...row, reactions: [] }));
  }
}

export async function loadCommunityReleaseCommentsWithFallback(
  prisma: Pick<PrismaClient, "scene_release_comments">,
  params: {
    releaseIds: string[];
    suppressedPeerIds: string[];
  }
): Promise<CommunityReleaseCommentRow[]> {
  if (params.releaseIds.length === 0) return [];
  const baseWhere = {
    release_id: { in: params.releaseIds },
    ...(params.suppressedPeerIds.length ? { user_id: { notIn: params.suppressedPeerIds } } : {})
  };

  try {
    return await prisma.scene_release_comments.findMany({
      where: baseWhere,
      orderBy: { created_at: "desc" },
      take: 160,
      select: {
        id: true,
        release_id: true,
        user_id: true,
        parent_id: true,
        content: true,
        media_key: true,
        media_name: true,
        created_at: true,
        updated_at: true,
        edited_at: true,
        deleted_at: true,
        reactions: {
          where: params.suppressedPeerIds.length ? { visitor_id: { notIn: params.suppressedPeerIds } } : undefined,
          select: { visitor_id: true, reaction: true }
        },
        author: { select: { id: true, name: true, avatar: true, isVerifiedAuthor: true } }
      }
    });
  } catch (error) {
    if (!isMissingCommunityCommentReactionTable(error)) throw error;
    const rows = await prisma.scene_release_comments.findMany({
      where: baseWhere,
      orderBy: { created_at: "desc" },
      take: 160,
      select: {
        id: true,
        release_id: true,
        user_id: true,
        parent_id: true,
        content: true,
        media_key: true,
        media_name: true,
        created_at: true,
        updated_at: true,
        edited_at: true,
        deleted_at: true,
        author: { select: { id: true, name: true, avatar: true, isVerifiedAuthor: true } }
      }
    });
    return rows.map((row) => ({ ...row, reactions: [] }));
  }
}

async function withCommunityPoolFallback<T>(
  load: () => Promise<T>,
  fallback: T,
  options?: { critical?: boolean }
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isPrismaPoolTimeoutError(error)) {
      if (options?.critical) {
        console.warn("[dashboard-community] pool timeout on critical feed load", error);
        throw error;
      }
      console.warn("[dashboard-community] pool timeout fallback", error);
      return fallback;
    }
    throw error;
  }
}

export async function loadCommunityPosts(
  prisma: PrismaClient,
  profileClauses: Array<{ user_id: string; profile_key: string }>,
  audienceWhere: ReturnType<typeof buildSocialPostAudienceWhere>,
  postId?: string | null,
  before?: { publishedAt: Date; postId: string | null } | null
): Promise<RawPost[]> {
  const keysetWhere = before ? {
    OR: [
      { created_at: { lt: before.publishedAt } },
      ...(before.postId ? [{ created_at: before.publishedAt, id: { lte: before.postId } }] : [{ created_at: before.publishedAt }])
    ]
  } : null;
  try {
    return await prisma.artist_profile_posts.findMany({
      where: { AND: [{ OR: profileClauses }, audienceWhere, ...(postId ? [{ id: postId }] : []), ...(keysetWhere ? [keysetWhere] : [])] },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: postId ? 1 : 120,
      select: {
        id: true,
        user_id: true,
        profile_key: true,
        audience: true,
        content: true,
        media_type: true,
        media_key: true,
        media_name: true,
        created_at: true,
        updated_at: true,
        edited_at: true,
        release: { select: linkedReleaseSelect },
        author: { select: { id: true, name: true, avatar: true, isVerifiedAuthor: true } },
        _count: { select: { likes: true } }
      }
    }) as unknown as RawPost[];
  } catch (error) {
    if (!isMissingPostCommentsTable(error) && !isMissingPostReleaseColumn(error) && !isMissingPostAudienceColumn(error)) throw error;
    console.warn("[feed-compat] artist_profile_posts query fallback due to schema mismatch", error);
  }

  try {
    return await prisma.artist_profile_posts.findMany({
      where: { AND: [{ OR: profileClauses }, ...(postId ? [{ id: postId }] : []), ...(keysetWhere ? [keysetWhere] : [])] },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: postId ? 1 : 120,
      select: {
        id: true,
        user_id: true,
        profile_key: true,
        content: true,
        media_type: true,
        media_key: true,
        media_name: true,
        created_at: true,
        release: { select: linkedReleaseSelect },
        author: { select: { id: true, name: true, avatar: true, isVerifiedAuthor: true } },
        _count: { select: { likes: true } }
      }
    }).then((rows) => rows.map((row) => ({ ...row, audience: "PUBLIC" }))) as unknown as RawPost[];
  } catch (error) {
    if (!isMissingPostReleaseColumn(error) && !isMissingPostAudienceColumn(error)) throw error;
    console.warn("[feed-compat] artist_profile_posts release_id fallback due to schema mismatch", error);
  }

  return await prisma.artist_profile_posts.findMany({
    where: { AND: [{ OR: profileClauses }, ...(postId ? [{ id: postId }] : []), ...(keysetWhere ? [keysetWhere] : [])] },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: postId ? 1 : 120,
    select: {
      id: true,
      user_id: true,
      profile_key: true,
      content: true,
      media_type: true,
      media_key: true,
      media_name: true,
      created_at: true,
      author: { select: { id: true, name: true, avatar: true, isVerifiedAuthor: true } },
      _count: { select: { likes: true } }
    }
  }).then((rows) => rows.map((row) => ({ ...row, audience: "PUBLIC" }))) as unknown as RawPost[];
}

export async function getDashboardCommunityPayload(params: {
  prisma: PrismaClient;
  userId?: string | null;
  scope: DashboardCommunityScope;
  filter: DashboardCommunityFilter;
  collaborationFilter?: "all" | "only";
  collaborationIntent?: CollaborationIntent | null;
  collaborationRole?: CollaborationRole | null;
  collaborationWorkflow?: CollaborationWorkflow | null;
  collaborationPreference?: CollaborationPreference | null;
  collaborationCity?: string | null;
  collaborationStatus?: CollaborationStatus | null;
  sort?: "newest" | "oldest" | "responses_desc" | "responses_asc";
  search?: string | null;
  cursor?: string | null;
  limit?: number;
  targetPostId?: string | null;
  targetReleaseId?: string | null;
  before?: { publishedAt: string; itemId: string } | null;
  seedSlugs?: string[];
  skipDirectoryLoad?: boolean;
}): Promise<DashboardCommunityPayload> {
  const viewerAuthenticated = Boolean(params.userId);
  const viewerUserId = params.userId ?? null;
  const blockedPeerIds = viewerUserId
    ? await withCommunityPoolFallback(
        () => listBlockedPeerIds(
          params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">,
          viewerUserId
        ),
        []
      )
    : [];
  const blockedPeerIdSet = new Set(blockedPeerIds);
  const feedPreferences = viewerUserId
    ? await withCommunityPoolFallback(
        () => listSocialFeedPreferences(
          params.prisma as unknown as SocialFeedPreferencePrisma,
          viewerUserId
        ),
        { hiddenPostIds: [], hiddenReleaseIds: [], mutedUserIds: [] }
      )
    : { hiddenPostIds: [], hiddenReleaseIds: [], mutedUserIds: [] };
  const mutedUserIdSet = new Set(feedPreferences.mutedUserIds);
  const hiddenPostIdSet = new Set(feedPreferences.hiddenPostIds);
  const hiddenReleaseIdSet = new Set(feedPreferences.hiddenReleaseIds);
  const suppressedPeerIds = Array.from(new Set([...blockedPeerIds, ...feedPreferences.mutedUserIds]));

  const own = viewerUserId ? await getUserArtistProfileSettings(params.prisma, viewerUserId) : null;
  const releaseOptions = own?.releases ?? [];
  const personalOwnedProfile = viewerUserId
    ? await params.prisma.user.findUnique({
        where: { id: viewerUserId },
        select: { id: true, name: true, avatar: true, artistProfileType: true, personalSiteUrl: true, vk: true, telegram: true }
      }).catch(async (error) => {
        if (isMissingCanonicalUserTable(error)) {
          const legacyUser = await findLegacyUserById(params.prisma, viewerUserId);
          return legacyUser
            ? {
                id: legacyUser.id,
                name: legacyUser.name,
                avatar: legacyUser.avatar,
                artistProfileType: legacyUser.artistProfileType,
                personalSiteUrl: legacyUser.personalSiteUrl,
                vk: legacyUser.vk,
                telegram: legacyUser.telegram
              }
            : null;
        }
        if (!/artistProfileType|column .* does not exist/iu.test(String(error))) throw error;
        const legacyUser = await params.prisma.user.findUnique({
          where: { id: viewerUserId },
          select: { id: true, name: true, avatar: true, personalSiteUrl: true, vk: true, telegram: true }
        });
        return legacyUser ? { ...legacyUser, artistProfileType: null } : null;
      })
    : null;
  const ownedProfiles = [
    ...(personalOwnedProfile ? [{
      artistKey: PERSONAL_ARTIST_PROFILE_KEY,
      sourceName: personalOwnedProfile.name,
      releaseCount: releaseOptions.length,
      profileType: resolvePersonalFeedProfileType(personalOwnedProfile.artistProfileType),
      settings: {
        enabled: true,
        profileType: resolvePersonalFeedProfileType(personalOwnedProfile.artistProfileType) === "producer" ? "producer" : "artist",
        displayName: personalOwnedProfile.name,
        slug: normalizeArtistProfileKey(personalOwnedProfile.name).replace(/\s+/gu, "-"),
        bio: "",
        city: "",
        avatarKey: "",
        backgroundKey: "",
        catalogReleaseIds: releaseOptions.map((release) => release.id),
        hideAllCommunityReleases: false,
        hiddenCommunityReleaseIds: [],
        autoPublishApprovedReleases: false,
        websiteUrl: "",
        vkUrl: "",
        telegramUrl: "",
        collaboration: {
          open: false,
          role: (resolvePersonalFeedProfileType(personalOwnedProfile.artistProfileType) === "producer" ? "producer" : "artist") as "producer" | "artist",
          genres: [],
          intents: [],
          preference: "hybrid" as const,
          bio: ""
        }
      } satisfies UserArtistProfileSettings["settings"],
      avatarUrl: sanitizeCommunityAvatarUrl(buildStoredFileRouteUrl(personalOwnedProfile.avatar)),
      backgroundUrl: null,
      slug: buildPersonalProfileSlug(personalOwnedProfile.name, personalOwnedProfile.id),
      adminHidden: false
    }] : []),
    ...((own?.profiles ?? []).map((profile) => ({ ...profile, profileType: profile.settings.profileType })))
  ];

  const followed = viewerUserId
    ? await withCommunityPoolFallback(
        () => listFollowedProfileSlugs({
          prisma: params.prisma,
          followerUserId: viewerUserId,
          blockedPeerIdSet,
          mutedUserIdSet
        }),
        []
      )
    : [];
  const followedSlugs = Array.from(new Set(followed.map((item) => item.slug)));
  const followedOwnerIds = Array.from(new Set(followed.map((item) => item.profileUserId)));
  const shouldLoadDirectory = params.scope !== "following" && !params.skipDirectoryLoad;
  const [publicArtistProfiles, personalPublicProfiles] = shouldLoadDirectory
    ? await Promise.all([
        withCommunityPoolFallback(() => listPublicArtistProfiles(params.prisma, { limit: 48 }), [], { critical: true }),
        withCommunityPoolFallback(() => listPublicPersonalFeedProfiles(params.prisma), [], { critical: true })
      ])
    : [[], []];
  const followScopeSlugs = expandDashboardCommunityFollowScopeSlugs({
    followedOwnerIds,
    publicArtistSlugs: publicArtistProfiles.map((item) => item.slug),
    publicPersonalSlugs: personalPublicProfiles.map((item) => item.slug)
  });
  const publicSlugs = [...publicArtistProfiles.map((item) => item.slug), ...personalPublicProfiles.map((item) => item.slug)]
    .filter((slug) => {
      const ownerId = parseArtistProfileUserId(slug);
      return !ownerId || (!blockedPeerIdSet.has(ownerId) && !mutedUserIdSet.has(ownerId));
    });
  const resolvedScope = resolveDashboardCommunityScope({
    scope: params.scope,
    viewerAuthenticated,
    followedSlugs: followScopeSlugs,
    publicSlugs
  });

  if (resolvedScope.requiresAuth) {
    return {
      scope: resolvedScope.scope,
      filter: params.filter,
      viewerAuthenticated,
      feed: [],
      nextCursor: null,
      hasMore: false,
      collaborationFilter: params.collaborationFilter ?? "all",
      collaborationIntent: params.collaborationIntent ?? null,
      collaborationRole: params.collaborationRole ?? null,
      collaborationWorkflow: params.collaborationWorkflow ?? null,
      collaborationPreference: params.collaborationPreference ?? null,
      collaborationCity: normalizeCollaborationCity(params.collaborationCity),
      collaborationStatus: params.collaborationStatus ?? null,
      ownedProfiles,
      releaseOptions,
      suggestions: [],
      newReleases: [],
      popularPosts: [],
      releaseOfWeek: null
    };
  }

  let targetPostSlug: string | null = null;
  const ownerSettingsCache = new Map<string, Promise<Awaited<ReturnType<typeof getUserArtistProfileSettings>>>>();
  const getOwnerSettings = (ownerId: string) => {
    const existing = ownerSettingsCache.get(ownerId);
    if (existing) return existing;
    const next = Promise.resolve(
      params.userId && ownerId === params.userId ? own : getUserArtistProfileSettings(params.prisma, ownerId)
    );
    ownerSettingsCache.set(ownerId, next);
    return next;
  };
  if (params.targetPostId) {
    const target = await params.prisma.artist_profile_posts.findUnique({
      where: { id: params.targetPostId },
      select: { user_id: true, profile_key: true, author: { select: { name: true } } }
    });
    if (target) {
      if (target.profile_key === PERSONAL_ARTIST_PROFILE_KEY) {
        targetPostSlug = buildPersonalProfileSlug(target.author.name, target.user_id);
      } else {
        const targetSettings = await getOwnerSettings(target.user_id);
        targetPostSlug = targetSettings?.profiles.find((profile) => profile.artistKey === target.profile_key)?.slug ?? null;
      }
    }
  }
  let targetReleaseSlug: string | null = null;
  if (params.targetReleaseId) {
    const target = await params.prisma.release.findUnique({
      where: { id: params.targetReleaseId },
      select: { userId: true, user: { select: { name: true } } }
    });
    if (target) {
      const targetSettings = await getOwnerSettings(target.userId);
      targetReleaseSlug = targetSettings?.profiles.find((profile) =>
        profile.settings.enabled
        && !profile.adminHidden
        && isCommunityReleaseVisible(profile.settings, params.targetReleaseId!)
      )?.slug ?? buildPersonalProfileSlug(target.user.name, target.userId);
    }
  }
  const recentFeedSeedSlugs = resolvedScope.scope === "all"
    ? await withCommunityPoolFallback(
        () => listRecentCommunityFeedSeedSlugs({
          prisma: params.prisma,
          audienceWhere: buildSocialPostAudienceWhere({ viewerUserId: params.userId, followedProfiles: [] }),
          before: params.before ? {
            publishedAt: new Date(params.before.publishedAt),
            postId: params.before.itemId.startsWith("post_") ? params.before.itemId.slice("post_".length) : null
          } : null,
          take: 160,
          resolveOwnerProfiles: async (ownerId) => {
            const ownerSettings = await getOwnerSettings(ownerId);
            return ownerSettings?.profiles.map((profile) => ({
              artistKey: profile.artistKey,
              slug: profile.slug,
              enabled: profile.settings.enabled,
              adminHidden: profile.adminHidden
            })) ?? null;
          }
        }),
        [],
        { critical: true }
      )
    : [];
  const baseSlugs = dedupeDashboardCommunitySlugs([
    ...resolvedScope.slugs,
    ...recentFeedSeedSlugs,
    ...collectOwnedCommunitySeedSlugs(ownedProfiles),
    ...(params.seedSlugs ?? []),
    ...(targetPostSlug ? [targetPostSlug] : []),
    ...(targetReleaseSlug ? [targetReleaseSlug] : [])
  ]).filter((slug) => {
    const ownerId = parseArtistProfileUserId(slug);
    return !ownerId || (!blockedPeerIdSet.has(ownerId) && !mutedUserIdSet.has(ownerId));
  });
  const baseSlugOwnerIds = Array.from(new Set(
    baseSlugs
      .map((slug) => parseArtistProfileUserId(slug))
      .filter((ownerId): ownerId is string => Boolean(ownerId))
  ));
  await mapWithConcurrency(baseSlugOwnerIds, 4, async (ownerId) => {
    await getOwnerSettings(ownerId);
    return null;
  });
  const loadedProfiles = await mapWithConcurrency(baseSlugs, 4, async (slug) => {
      const profile = await withCommunityPoolFallback(() => getPublicArtistProfile(params.prisma, slug, undefined, {
        includeReleaseAnalytics: false,
        resolveCoverUrl: async (source) => resolveCommunityCoverUrl(source),
        resolvePreviewAudioUrl: async (state) => state.enabled && state.previewAsset
          ? buildStoredFileRouteUrl(state.previewAsset.storageKey)
          : null,
        resolveTrackAudio: resolveCommunityTrackAudio
      }), null, { critical: true });
      if (!profile) return null;
      const ownerId = parseArtistProfileUserId(profile.slug);
      const ownerSettings = ownerId ? await getOwnerSettings(ownerId) : null;
      const sourceProfile = ownerSettings?.profiles.find((item) => item.artistKey === profile.artistKey);
      return {
        profile,
        communityReleaseVisibility: {
          hideAllCommunityReleases: sourceProfile?.settings.hideAllCommunityReleases ?? false,
          hiddenCommunityReleaseIds: sourceProfile?.settings.hiddenCommunityReleaseIds ?? []
        }
      };
    });

  const profiles = loadedProfiles
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) => profileDescriptor(entry.profile, entry.communityReleaseVisibility))
    .filter((item): item is ProfileDescriptor => item !== null);

  if (profiles.length === 0) {
    return {
      scope: resolvedScope.scope,
      filter: params.filter,
      viewerAuthenticated,
      feed: [],
      nextCursor: null,
      hasMore: false,
      collaborationFilter: params.collaborationFilter ?? "all",
      collaborationIntent: params.collaborationIntent ?? null,
      collaborationRole: params.collaborationRole ?? null,
      collaborationWorkflow: params.collaborationWorkflow ?? null,
      collaborationPreference: params.collaborationPreference ?? null,
      collaborationCity: normalizeCollaborationCity(params.collaborationCity),
      collaborationStatus: params.collaborationStatus ?? null,
      ownedProfiles,
      releaseOptions,
      suggestions: [],
      newReleases: [],
      popularPosts: [],
      releaseOfWeek: null
    };
  }

  const profileClauses = profiles.map((profile) => ({ user_id: profile.userId, profile_key: profile.artistKey }));
  const followedProfileClauses = profiles
    .filter((profile) => followedSlugs.includes(profile.slug))
    .map((profile) => ({ user_id: profile.userId, profile_key: profile.artistKey }));
  const audienceWhere = buildSocialPostAudienceWhere({ viewerUserId: params.userId, followedProfiles: followedProfileClauses });
  const profileMap = new Map(profiles.map((profile) => [`${profile.userId}:${profile.artistKey}`, profile]));
  const releaseMap = new Map<string, { release: PublicArtistRelease; profile: ProfileDescriptor }>();
  const beforeTimestamp = params.before ? new Date(params.before.publishedAt).getTime() : null;
  for (const profile of profiles) {
    for (const release of profile.releases) {
      if (params.targetReleaseId && release.id !== params.targetReleaseId) continue;
      if (
        profile.communityReleaseVisibility.hideAllCommunityReleases
        || profile.communityReleaseVisibility.hiddenCommunityReleaseIds.includes(release.id)
      ) continue;
      if (beforeTimestamp !== null) {
        const publishedAt = new Date(release.releaseDate).getTime();
        const publicId = `release_${release.id}`;
        if (publishedAt > beforeTimestamp || (publishedAt === beforeTimestamp && publicId > params.before!.itemId)) continue;
      }
      if (hiddenReleaseIdSet.has(release.id)) continue;
      releaseMap.set(release.id, { release, profile });
    }
  }

  const posts = await withCommunityPoolFallback(
    () => loadCommunityPosts(params.prisma, profileClauses, audienceWhere, params.targetPostId, params.before ? {
        publishedAt: new Date(params.before.publishedAt),
        postId: params.before.itemId.startsWith("post_") ? params.before.itemId.slice("post_".length) : null
      } : null),
    [],
    { critical: true }
  );
  const postItems: FeedPostItem[] = posts.flatMap((post) => {
    if (hiddenPostIdSet.has(post.id)) return [];
    const profile = profileMap.get(`${post.user_id}:${post.profile_key}`);
    if (!profile) return [];
      const parsedPost = parseStructuredPostContent(post.content);
      const collaborationPresentation = parsedPost.collaboration
        ? buildCollaborationPresentation(parsedPost.collaboration)
        : null;
      const mediaItems = mapPostMediaItems({
        parsed: parsedPost,
        legacyMediaType: post.media_type,
      legacyMediaKey: post.media_key,
      legacyMediaName: post.media_name
    });
    return [{
      id: post.id,
      kind: "post",
      postType: parsedPost.postType,
      createdAt: post.created_at.toISOString(),
      updatedAt: (post.updated_at ?? post.created_at).toISOString(),
      editedAt: post.edited_at?.toISOString() ?? null,
      content: parsedPost.content,
      mediaType: mediaItems[0]?.mediaType ?? (post.media_type as FeedPostItem["mediaType"]) ?? null,
      mediaUrl: mediaItems[0]?.mediaUrl ?? buildStoredFileRouteUrl(post.media_key),
      mediaName: mediaItems[0]?.mediaName ?? post.media_name,
      mediaItems,
      likes: 0,
      liked: false,
      viewerReaction: null,
      reactionSummary: buildReactionSummary([], null).summary,
      commentsCount: 0,
      comments: [],
      responsesCount: 0,
      author: buildFeedAuthor(profile, { viewerUserId: params.userId, followedSlugs }),
      linkedRelease: toLinkedRelease(post.release ?? null),
      collaboration: parsedPost.collaboration ? {
        ...parsedPost.collaboration,
        label: collaborationIntentLabel(parsedPost.collaboration.intent),
        rawIntent: parsedPost.collaboration.intent,
        intentCategory: collaborationPresentation!.intentCategory,
        displayIntent: collaborationPresentation!.displayIntent,
        rawRole: parsedPost.collaboration.role,
        displayRole: collaborationPresentation!.displayRole
      } : null
    }];
  });

  const releaseItems: FeedReleaseItem[] = Array.from(releaseMap.values()).map(({
    release,
    profile
  }): FeedReleaseItem => {
    const summary = buildReactionSummary([], null);
    return {
      id: `release:${release.id}:${profile.slug}`,
      kind: "release" as const,
      createdAt: release.releaseDate,
      releaseId: release.id,
      title: release.title,
      coverUrl: release.coverUrl,
      audioUrl: release.audioUrl,
      playCount: release.playCount,
      likes: summary.total,
      liked: summary.likedByViewer,
      viewerReaction: summary.viewerReaction,
      reactionSummary: summary.summary,
      commentsCount: 0,
      comments: [] as FeedReleaseComment[],
      sceneHref: release.sceneHref,
      author: buildFeedAuthor(profile, { viewerUserId: params.userId, followedSlugs })
    };
  }).filter((item): item is FeedReleaseItem => hasRenderableReleaseMedia(item));

  const normalizedSearch = (params.search ?? "").trim();
  const collaborationFilter = params.collaborationFilter ?? "all";
  const collaborationIntent = params.collaborationIntent ?? null;
  const collaborationRole = params.collaborationRole ?? null;
  const collaborationWorkflow = params.collaborationWorkflow ?? null;
  const collaborationPreference = params.collaborationPreference ?? null;
  const collaborationCity = normalizeCollaborationCity(params.collaborationCity);
  const collaborationStatus = params.collaborationStatus ?? null;
  const sort = params.sort ?? "newest";
  const filteredTimeline = filterFeed(byDateDesc<DashboardCommunityFeedItem>([...postItems, ...releaseItems]), params.filter);
  const collaborationAwareTimeline = filteredTimeline.filter((item) => {
    if (collaborationFilter !== "only") return true;
    if (item.kind !== "post" || item.postType !== "collaboration" || !item.collaboration) return false;
    if (collaborationIntent && item.collaboration.intent !== collaborationIntent) return false;
    if (collaborationRole && item.collaboration.role !== collaborationRole) return false;
    if (collaborationWorkflow && item.collaboration.workflow !== collaborationWorkflow) return false;
    if (collaborationPreference && item.collaboration.preference !== collaborationPreference) return false;
    if (collaborationCity && item.collaboration.city.trim().toLocaleLowerCase("ru-RU") !== collaborationCity.toLocaleLowerCase("ru-RU")) return false;
    if (collaborationStatus && item.collaboration.status !== collaborationStatus) return false;
    return true;
  });
  const matchingTimeline = normalizedSearch ? collaborationAwareTimeline.filter((item) => matchesCommunitySearch(item, normalizedSearch)) : collaborationAwareTimeline;
  const sortedTimeline = sort === "oldest"
    ? [...matchingTimeline].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    : matchingTimeline;
  const page = selectDashboardCommunityPage(sortedTimeline, { cursor: params.cursor, limit: params.limit });
  const pageReleaseIds = page.items
    .filter((item): item is FeedReleaseItem => item.kind === "release")
    .map((item) => item.releaseId);
  const pagePostIds = page.items
    .filter((item): item is FeedPostItem => item.kind === "post")
    .map((item) => item.id);

  const postReactionCounts = await withCommunityPoolFallback(
    () => pagePostIds.length
      ? params.prisma.artist_profile_post_likes.groupBy({
          by: ["post_id", "reaction"],
          where: {
            post_id: { in: pagePostIds },
            ...(suppressedPeerIds.length ? { visitor_id: { notIn: suppressedPeerIds } } : {})
          },
          _count: { _all: true }
        })
      : Promise.resolve([]),
    []
  );
  const postViewerReactions = await withCommunityPoolFallback(
    () => params.userId && pagePostIds.length
      ? params.prisma.artist_profile_post_likes.findMany({
          where: { visitor_id: params.userId, post_id: { in: pagePostIds } },
          select: { post_id: true, reaction: true }
        })
      : Promise.resolve([]),
    []
  );
  const postComments = await withCommunityPoolFallback(
    () => loadCommunityPostCommentsWithFallback(params.prisma, { postIds: pagePostIds, suppressedPeerIds }),
    []
  );
  const postCommentCounts = await withCommunityPoolFallback(
    () => pagePostIds.length
      ? params.prisma.artist_profile_post_comments.groupBy({
          by: ["post_id"],
          where: {
            post_id: { in: pagePostIds },
            deleted_at: null,
            ...(suppressedPeerIds.length ? { user_id: { notIn: suppressedPeerIds } } : {})
          },
          _count: { _all: true }
        }).catch((error) => {
          if (isMissingPostCommentsTable(error)) return [];
          throw error;
        })
      : Promise.resolve([]),
    []
  );
  const collaborationResponseCounts = await withCommunityPoolFallback(
    () => pagePostIds.length
      ? params.prisma.collaboration_responses.groupBy({
          by: ["post_id"],
          where: { post_id: { in: pagePostIds } },
          _count: { _all: true }
        }).catch((error) => {
          if (isMissingCollaborationResponsesTable(error)) return [];
          throw error;
        })
      : Promise.resolve([]),
    []
  );

  const releaseReactionCounts = await withCommunityPoolFallback(
    () => pageReleaseIds.length
      ? params.prisma.scene_release_likes.groupBy({
          by: ["release_id", "reaction"],
          where: {
            release_id: { in: pageReleaseIds },
            ...(suppressedPeerIds.length ? { visitor_id: { notIn: suppressedPeerIds } } : {})
          },
          _count: { _all: true }
        })
      : Promise.resolve([]),
    []
  );
  const releaseViewerReactions = await withCommunityPoolFallback(
    () => params.userId && pageReleaseIds.length
      ? params.prisma.scene_release_likes.findMany({
          where: { release_id: { in: pageReleaseIds }, visitor_id: params.userId },
          select: { release_id: true, reaction: true }
        })
      : Promise.resolve([]),
    []
  );
  const releaseComments = await withCommunityPoolFallback(
    () => loadCommunityReleaseCommentsWithFallback(params.prisma, { releaseIds: pageReleaseIds, suppressedPeerIds }),
    []
  );
  const releaseCommentCounts = await withCommunityPoolFallback(
    () => pageReleaseIds.length
      ? params.prisma.scene_release_comments.groupBy({
          by: ["release_id"],
          where: {
            release_id: { in: pageReleaseIds },
            deleted_at: null,
            ...(suppressedPeerIds.length ? { user_id: { notIn: suppressedPeerIds } } : {})
          },
          _count: { _all: true }
        })
      : Promise.resolve([]),
    []
  );

  const releaseReactionMap = new Map<string, Array<{ reaction: string; count: number }>>();
  for (const row of releaseReactionCounts) {
    const list = releaseReactionMap.get(row.release_id) ?? [];
    list.push({ reaction: row.reaction, count: row._count._all });
    releaseReactionMap.set(row.release_id, list);
  }
  const releaseViewerReactionMap = new Map(releaseViewerReactions.map((item) => [item.release_id, item.reaction]));
  const releaseCommentCountMap = new Map(releaseCommentCounts.map((item) => [item.release_id, item._count._all]));
  const releaseCommentRows = new Map<string, typeof releaseComments>();
  for (const row of releaseComments) {
    const list = releaseCommentRows.get(row.release_id) ?? [];
    list.push(row);
    releaseCommentRows.set(row.release_id, list);
  }
  const postReactionMap = new Map<string, Array<{ reaction: string; count: number }>>();
  for (const row of postReactionCounts) {
    const list = postReactionMap.get(row.post_id) ?? [];
    list.push({ reaction: row.reaction, count: row._count._all });
    postReactionMap.set(row.post_id, list);
  }
  const postViewerReactionMap = new Map(postViewerReactions.map((item) => [item.post_id, item.reaction]));
  const postCommentCountMap = new Map(postCommentCounts.map((item) => [item.post_id, item._count._all]));
  const collaborationResponseCountMap = buildCollaborationResponseCountMap(collaborationResponseCounts);
  const postCommentRows = new Map<string, typeof postComments>();
  for (const row of postComments) {
    const list = postCommentRows.get(row.post_id) ?? [];
    list.push(row);
    postCommentRows.set(row.post_id, list);
  }

  const feed = page.items.map((item) => {
    if (item.kind === "post") {
      const summary = buildReactionSummary(postReactionMap.get(item.id) ?? [], postViewerReactionMap.get(item.id) ?? null);
      const comments = buildFeedCommentTree(
        (postCommentRows.get(item.id) ?? []).map((row) => ({
          ...row,
          updated_at: row.updated_at ?? row.created_at
        })),
        params.userId
      ).slice(0, 3);
      return {
        ...item,
        likes: summary.total,
        liked: summary.likedByViewer,
        viewerReaction: summary.viewerReaction,
        reactionSummary: summary.summary,
        commentsCount: postCommentCountMap.get(item.id) ?? 0,
        comments,
        responsesCount: collaborationResponseCountMap.get(item.id) ?? 0
      };
    }
    const summary = buildReactionSummary(releaseReactionMap.get(item.releaseId) ?? [], releaseViewerReactionMap.get(item.releaseId) ?? null);
    const comments = buildFeedCommentTree(
      (releaseCommentRows.get(item.releaseId) ?? []).map((row) => ({
        ...row,
        updated_at: row.updated_at ?? row.created_at
      })),
      params.userId
    ).slice(0, 3);
    return {
      ...item,
      likes: summary.total,
      liked: summary.likedByViewer,
      viewerReaction: summary.viewerReaction,
      reactionSummary: summary.summary,
      commentsCount: releaseCommentCountMap.get(item.releaseId) ?? 0,
      comments
    };
  });

  const linkedReleaseIds = Array.from(new Set(
    feed
      .filter((item): item is FeedPostItem => item.kind === "post" && Boolean(item.linkedRelease))
      .map((item) => item.linkedRelease!.id)
  ));
  const linkedReleaseSummaryMap = new Map(
    (await Promise.all(linkedReleaseIds.map(async (releaseId) => [releaseId, await getReleasePublicListenSummary(releaseId)] as const)))
      .filter((entry): entry is readonly [string, NonNullable<Awaited<ReturnType<typeof getReleasePublicListenSummary>>>] => Boolean(entry[1]))
  );
  const enrichedFeed = feed.map((item) => {
    if (item.kind !== "post" || !item.linkedRelease) return item;
    const summary = linkedReleaseSummaryMap.get(item.linkedRelease.id);
    if (!summary) return item;
    return {
      ...item,
      linkedRelease: {
        ...item.linkedRelease,
        href: summary.publicUrl,
        artistName: summary.artist || item.linkedRelease.artistName || null,
        coverUrl: summary.coverUrl ?? item.linkedRelease.coverUrl ?? null,
        platformLinks: summary.platforms
      }
    };
  });

  return {
    scope: resolvedScope.scope,
    filter: params.filter,
    collaborationFilter,
    collaborationIntent,
    collaborationRole,
    collaborationWorkflow,
    collaborationPreference,
    collaborationCity,
    collaborationStatus,
    viewerAuthenticated,
    feed: enrichedFeed,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    ownedProfiles,
    releaseOptions,
    suggestions: [],
    newReleases: [],
    popularPosts: [],
    releaseOfWeek: null
  };
}
