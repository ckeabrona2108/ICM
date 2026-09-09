import type { PrismaClient } from "@prisma/client";

import type {
  FeedAuthor,
  FeedCollaborationFilter,
  FeedCommunityDiscovery,
  FeedNewsItem,
  FeedPersonCard,
  FeedPersonProfileType,
  FeedPostItem,
  FeedPrimaryView,
  FeedReleaseItem,
  FeedScope,
  FeedSort,
  FeedType,
  PublicFeedItem,
  PublicFeedPayload
} from "@/lib/feed-contract";
import type { CollaborationIntent, CollaborationPreference, CollaborationRole, CollaborationStatus, CollaborationWorkflow } from "@/lib/collaboration";
import { buildCollaborationPresentation, buildCollaborationSearchText, normalizeCollaborationCity } from "@/lib/collaboration";
import { createEmptyCommunityDiscovery } from "@/lib/community-engine";
import { getDashboardCommunityPayload, type DashboardCommunityFeedItem } from "@/lib/dashboard-community-service";
import { getPublicNewsBySlug, listPublicNews, type PublicNewsPostDto } from "@/lib/news-service";
import {
  getUserArtistProfilesForRelease,
  getSingleUserArtistProfileSettings,
  isCommunityReleaseVisible,
  listPublicArtistProfiles,
  type PublicArtistProfileCard
} from "@/lib/artist-profile-service";
import { buildPersonalProfileSlug, parseArtistProfileUserId, PERSONAL_ARTIST_PROFILE_KEY } from "@/lib/artist-profile-shared";
import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import { listSocialActivityPage, type SocialActivityKind } from "@/lib/social-activity-service";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";

export class FeedAuthRequiredError extends Error {
  constructor(message = "Войдите, чтобы открыть ленту подписок") {
    super(message);
    this.name = "FeedAuthRequiredError";
  }
}

export class FeedCursorError extends Error {
  constructor(message = "Некорректный или устаревший курсор ленты") {
    super(message);
    this.name = "FeedCursorError";
  }
}

const FEED_STORAGE_TABLES = [
  "icecream.social_activity_events",
  "icecream.social_user_blocks",
  "icecream.social_feed_preferences",
  "icecream.artist_profile_posts",
  "icecream.artist_profile_post_comments",
  "icecream.artist_profile_post_likes",
  "icecream.artist_profile_followers",
  "icecream.scene_release_comments",
  "icecream.scene_release_likes",
  "icecream.scene_release_plays",
  "icecream.user_artist_profile_settings"
] as const;

export function isFeedStorageUnavailableError(error: unknown) {
  return isAnyPrismaTableMissingError(error, [...FEED_STORAGE_TABLES]);
}

export function assertFeedScopeAccess(scope: FeedScope, userId?: string | null) {
  if (scope === "following" && !userId) {
    throw new FeedAuthRequiredError();
  }
}

function emptyCommunity(): FeedCommunityDiscovery {
  return createEmptyCommunityDiscovery();
}

export function createAuthRequiredFeedPayload(params: {
  view?: FeedPrimaryView | null;
  scope: FeedScope;
  type: FeedType;
  search?: string | null;
  author?: string | null;
  userId?: string | null;
  collaborationFilter?: FeedCollaborationFilter;
  collaborationIntent?: CollaborationIntent | null;
  collaborationRole?: CollaborationRole | null;
  collaborationWorkflow?: CollaborationWorkflow | null;
  collaborationPreference?: CollaborationPreference | null;
  collaborationCity?: string | null;
  collaborationStatus?: CollaborationStatus | null;
  sort?: FeedSort;
  profileType?: FeedPersonProfileType | null;
}): PublicFeedPayload {
  return {
    view: params.view ?? null,
    scope: params.scope,
    scopeAccess: "auth_required",
    type: params.type,
    collaborationFilter: params.collaborationFilter ?? "all",
    collaborationIntent: params.collaborationIntent ?? null,
    collaborationRole: params.collaborationRole ?? null,
    collaborationWorkflow: params.collaborationWorkflow ?? null,
    collaborationPreference: params.collaborationPreference ?? null,
    collaborationCity: params.collaborationCity ?? null,
    collaborationStatus: params.collaborationStatus ?? null,
    sort: params.sort ?? "newest",
    profileType: params.profileType ?? null,
    search: normalizeSearch(params.search),
    author: params.author?.trim() || null,
    items: [],
    people: [],
    nextCursor: null,
    hasMore: false,
    viewer: { authenticated: Boolean(params.userId), id: params.userId ?? null },
    ownedProfiles: [],
    releaseOptions: [],
    collaborationCities: [],
    suggestions: [],
    newReleases: [],
    popularPosts: [],
    releaseOfWeek: null,
    community: emptyCommunity()
  };
}

function emptyReactionSummary() {
  return {
    total: 0,
    counts: { heart: 0, fire: 0, laugh: 0, wow: 0, sad: 0, thumbs: 0, party: 0, diamond: 0 },
    viewerReaction: null
  } as const;
}

export function createDemoFeedPayload(params: {
  view?: FeedPrimaryView | null;
  scope: FeedScope;
  type: FeedType;
  search?: string | null;
  collaborationFilter?: FeedCollaborationFilter;
  collaborationIntent?: CollaborationIntent | null;
  collaborationRole?: CollaborationRole | null;
  collaborationWorkflow?: CollaborationWorkflow | null;
  collaborationPreference?: CollaborationPreference | null;
  collaborationCity?: string | null;
  collaborationStatus?: CollaborationStatus | null;
  sort?: FeedSort;
  profileType?: FeedPersonProfileType | null;
  userId?: string | null;
}): PublicFeedPayload {
  const author: FeedAuthor = {
    id: "demo-artist",
    slug: "neon-valley",
    displayName: "Neon Valley",
    avatarUrl: "/brand/logo.png",
    profileType: "artist",
    verified: true,
    followingByViewer: false,
    ownedByViewer: false
  };
  const releaseAuthor: FeedAuthor = {
    ...author,
    id: "demo-producer",
    slug: "polar-after",
    displayName: "Polar After",
    profileType: "producer"
  };
  const now = "2026-08-08T18:00:00.000Z";
  const post: FeedPostItem = {
    id: "post_demo_1",
    sourceId: "demo-post-1",
    kind: "post",
    publishedAt: now,
    updatedAt: now,
    editedAt: null,
    permalink: "/feed/post_demo_1",
    author,
    likesCount: 128,
    commentsCount: 14,
    likedByViewer: false,
    viewerReaction: null,
    reactionSummary: { ...emptyReactionSummary(), total: 128, counts: { ...emptyReactionSummary().counts, heart: 86, fire: 24, wow: 18 } },
    postType: "collaboration",
    content: "Ищем вокал для нового melodic house релиза. Нужен чистый topline, англоязычный текст и готовность быстро зайти в демо-обмен.",
    mediaType: "image",
    mediaUrl: "/brand/logo.png",
    mediaName: "Demo visual",
    mediaItems: [
      {
        id: "demo-media-1",
        mediaType: "image",
        mediaUrl: "/brand/logo.png",
        mediaName: "Demo visual",
        role: "standard",
        width: 1200,
        height: 1200,
        posterUrl: null
      }
    ],
    comments: [],
    responsesCount: 2,
    linkedRelease: {
      id: "demo-linked-release",
      title: "Midnight Broadcast",
      releaseDate: "2026-08-01T00:00:00.000Z",
      href: "/dashboard/releases/demo-linked-release",
      artistName: "Neon Valley",
      coverUrl: "/brand/logo.png",
      platformLinks: []
    },
    collaboration: {
      intent: "feature",
      role: "artist",
      status: "open",
      workflow: "seeking",
      customIntentLabel: "",
      genres: ["Melodic House", "Indie Dance"],
      preference: "remote",
      city: "",
      bio: "Нужен артист для быстрого продакшн-цикла.",
      label: "Ищу фичеринг",
      rawIntent: "feature",
      intentCategory: buildCollaborationPresentation({ intent: "feature", role: "artist" }).intentCategory,
      displayIntent: "Ищу фичеринг",
      rawRole: "artist",
      displayRole: "Артист"
    }
  };
  const release: FeedReleaseItem = {
    id: "release_demo_1",
    sourceId: "demo-release-1",
    kind: "release",
    publishedAt: "2026-08-07T20:00:00.000Z",
    permalink: "/feed/release_demo_1",
    author: releaseAuthor,
    likesCount: 74,
    commentsCount: 6,
    likedByViewer: false,
    viewerReaction: null,
    reactionSummary: { ...emptyReactionSummary(), total: 74, counts: { ...emptyReactionSummary().counts, heart: 51, fire: 23 } },
    releaseId: "demo-release-1",
    title: "Afterglow / Night Drive",
    coverUrl: "/brand/logo.png",
    audioUrl: null,
    playCount: 932,
    comments: [],
    sceneHref: "/feed/release_demo_1"
  };
  const news: FeedNewsItem = {
    id: "news_demo_1",
    sourceId: "demo-news-1",
    kind: "news",
    publishedAt: "2026-08-07T12:00:00.000Z",
    permalink: "/feed/news_demo_1",
    author: {
      id: "platform",
      slug: null,
      displayName: "ICECREAMMUSIC",
      avatarUrl: "/brand/logo.png",
      profileType: "platform",
      verified: true,
      followingByViewer: false,
      ownedByViewer: false
    },
    likesCount: 0,
    commentsCount: 0,
    likedByViewer: false,
    viewerReaction: null,
    reactionSummary: emptyReactionSummary(),
    newsId: "demo-news-1",
    slug: "feed-demo-mode",
    title: "Лента работает в demo-режиме без подключения к базе",
    excerpt: "Пока база недоступна, показываем статическую подборку карточек, чтобы можно было продолжать работу над UI.",
    content: null,
    coverUrl: "/brand/logo.png"
  };
  const items = composeTimeline({
    socialItems: [post, release],
    newsItems: [news],
    type: params.type,
    collaborationFilter: params.collaborationFilter ?? "all"
  }).filter((item) => matchesType(item, params.type));
  const people: FeedPersonCard[] = [{
    userId: author.id,
    slug: author.slug ?? "neon-valley",
    displayName: author.displayName,
    profileType: "artist",
    city: "Москва",
    bio: "Melodic house и live demo.",
    genres: ["Melodic House", "Indie Dance"],
    avatarUrl: author.avatarUrl,
    releaseCount: 2,
    collaborationOpen: true,
    collaborationRole: "artist",
    displayRole: "Артист",
    portfolio: [
      { id: "demo-linked-release", title: "Midnight Broadcast", releaseDate: "2026-08-01T00:00:00.000Z" },
      { id: "demo-release-1", title: "Afterglow / Night Drive", releaseDate: "2026-08-07T20:00:00.000Z" }
    ]
  }];

  return {
    view: params.view ?? null,
    scope: params.scope,
    scopeAccess: "granted",
    type: params.type,
    collaborationFilter: params.collaborationFilter ?? "all",
    collaborationIntent: params.collaborationIntent ?? null,
    collaborationRole: params.collaborationRole ?? null,
    collaborationWorkflow: params.collaborationWorkflow ?? null,
    collaborationPreference: params.collaborationPreference ?? null,
    collaborationCity: params.collaborationCity ?? null,
    collaborationStatus: params.collaborationStatus ?? null,
    sort: params.sort ?? "newest",
    profileType: params.profileType ?? null,
    search: normalizeSearch(params.search),
    author: null,
    items,
    people,
    nextCursor: null,
    hasMore: false,
    viewer: { authenticated: Boolean(params.userId), id: params.userId ?? null },
    ownedProfiles: [],
    releaseOptions: [],
    collaborationCities: [],
    suggestions: [],
    newReleases: [release],
    popularPosts: [post],
    releaseOfWeek: release,
    community: emptyCommunity()
  };
}

type FeedCursor = { publishedAt: string; id: string };

type FeedCore = Omit<PublicFeedPayload, "items" | "nextCursor" | "hasMore" | "search" | "author" | "type" | "scope" | "view"> & {
  items: PublicFeedItem[];
};

function toFeedAuthor(input: { slug: string; displayName: string; profileType: "user" | "artist" | "producer" | "group" | "label"; avatarUrl: string | null; followingByViewer: boolean; ownedByViewer: boolean }): FeedAuthor {
  return {
    id: parseArtistProfileUserId(input.slug) ?? input.slug,
    slug: input.slug,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl || DEFAULT_USER_AVATAR_URL,
    profileType: input.profileType,
    verified: true,
    followingByViewer: input.followingByViewer,
    ownedByViewer: input.ownedByViewer
  };
}

function mapPublicArtistProfileToFeedPerson(profile: PublicArtistProfileCard): FeedPersonCard {
  return {
    userId: profile.userId,
    slug: profile.slug,
    displayName: profile.displayName,
    profileType: profile.profileType,
    city: profile.city,
    bio: profile.bio,
    genres: profile.genres,
    avatarUrl: profile.avatarUrl || DEFAULT_USER_AVATAR_URL,
    releaseCount: profile.releaseCount,
    collaborationOpen: profile.collaborationOpen,
    collaborationRole: profile.collaborationRole,
    displayRole: profile.displayRole,
    portfolio: profile.portfolio
  };
}

function mapCommunityItem(item: DashboardCommunityFeedItem): FeedPostItem | FeedReleaseItem {
  if (item.kind === "post") {
    return {
      id: `post_${item.id}`,
      sourceId: item.id,
      kind: "post",
      publishedAt: item.createdAt,
      updatedAt: item.updatedAt,
      editedAt: item.editedAt,
      permalink: `/feed/post_${item.id}`,
      author: toFeedAuthor(item.author),
      likesCount: item.likes,
      commentsCount: item.commentsCount,
      likedByViewer: item.liked,
      viewerReaction: item.viewerReaction,
      reactionSummary: item.reactionSummary,
      postType: item.postType,
      content: item.content,
      mediaType: item.mediaType,
      mediaUrl: item.mediaUrl,
      mediaName: item.mediaName,
      mediaItems: item.mediaItems,
      comments: item.comments,
      responsesCount: item.responsesCount ?? 0,
      linkedRelease: item.linkedRelease,
      collaboration: item.collaboration
    };
  }

  return {
    id: `release_${item.releaseId}`,
    sourceId: item.releaseId,
    kind: "release",
    publishedAt: item.createdAt,
    permalink: `/feed/release_${item.releaseId}`,
    author: toFeedAuthor(item.author),
    likesCount: item.likes,
    commentsCount: item.commentsCount,
    likedByViewer: item.liked,
    viewerReaction: item.viewerReaction,
    reactionSummary: item.reactionSummary,
    releaseId: item.releaseId,
    title: item.title,
    coverUrl: item.coverUrl,
    audioUrl: item.audioUrl,
    playCount: item.playCount,
    comments: item.comments,
    sceneHref: item.sceneHref
  };
}

function mapNewsItem(item: PublicNewsPostDto): FeedNewsItem {
  return {
    id: `news_${item.id}`,
    sourceId: item.id,
    kind: "news",
    publishedAt: item.published_at,
    permalink: `/feed/news_${item.id}`,
    author: {
      id: "platform",
      slug: null,
      displayName: "ICECREAMMUSIC",
      avatarUrl: "/brand/logo.png",
      profileType: "platform",
      verified: true,
      followingByViewer: false,
      ownedByViewer: false
    },
    likesCount: 0,
    commentsCount: 0,
    likedByViewer: false,
    viewerReaction: null,
    reactionSummary: { total: 0, counts: { heart: 0, fire: 0, laugh: 0, wow: 0, sad: 0, thumbs: 0, party: 0, diamond: 0 }, viewerReaction: null },
    newsId: item.id,
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt,
    content: item.content,
    coverUrl: item.cover_image
  };
}

function sortFeed(items: PublicFeedItem[]) {
  return [...items].sort((left, right) => {
    const byDate = new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    if (byDate !== 0) return byDate;
    return right.id.localeCompare(left.id, "en");
  });
}

function sortFeedByResponses(items: PublicFeedItem[], direction: "desc" | "asc") {
  return [...items].sort((left, right) => {
    const leftResponses = left.kind === "post" ? left.responsesCount : direction === "desc" ? -1 : Number.MAX_SAFE_INTEGER;
    const rightResponses = right.kind === "post" ? right.responsesCount : direction === "desc" ? -1 : Number.MAX_SAFE_INTEGER;
    if (leftResponses !== rightResponses) {
      return direction === "desc" ? rightResponses - leftResponses : leftResponses - rightResponses;
    }
    return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
  });
}

function normalizeSearch(value: string | null | undefined) {
  return (value ?? "").trim();
}

function encodeCursor(item: PublicFeedItem): string {
  return Buffer.from(JSON.stringify({ publishedAt: item.publishedAt, id: item.id } satisfies FeedCursor)).toString("base64url");
}

function encodeActivityCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string | null | undefined): FeedCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as FeedCursor;
    if (!parsed?.publishedAt || !parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function matchesType(item: PublicFeedItem, type: FeedType) {
  switch (type) {
    case "posts":
      return item.kind === "post";
    case "releases":
      return item.kind === "release";
    case "news":
      return item.kind === "news"
        || (item.kind === "post" && item.mediaItems.length === 0 && !item.linkedRelease);
    case "video":
      return item.kind === "post" && item.mediaItems.some((mediaItem) => mediaItem.mediaType === "video");
    case "media":
      return item.kind === "release" || (item.kind === "post" && item.mediaItems.length > 0);
    default:
      return true;
  }
}

function matchesSearch(item: PublicFeedItem, search: string) {
  if (!search) return true;
  const needle = search.toLocaleLowerCase("ru-RU");
  const haystack = item.kind === "post"
    ? buildCollaborationSearchText({
        content: item.content,
        author: {
          displayName: item.author.displayName,
          slug: item.author.slug
        },
        collaboration: item.collaboration ? {
          intent: item.collaboration.rawIntent,
          role: item.collaboration.rawRole,
          workflow: item.collaboration.workflow,
          customIntentLabel: item.collaboration.customIntentLabel,
          status: item.collaboration.status,
          preference: item.collaboration.preference,
          city: item.collaboration.city,
          genres: item.collaboration.genres,
          bio: item.collaboration.bio
        } : null,
        linkedRelease: item.linkedRelease ? {
          title: item.linkedRelease.title,
          artistName: item.linkedRelease.artistName ?? null,
          platformLinks: item.linkedRelease.platformLinks ?? []
        } : null
      }).toLocaleLowerCase("ru-RU")
    : [
        item.author.displayName,
        item.author.slug ?? "",
        item.kind === "release" ? item.title : "",
        item.kind === "news" ? item.title : "",
        item.kind === "news" ? item.excerpt ?? "" : "",
        item.kind === "news" ? item.content ?? "" : ""
      ].join(" ").toLocaleLowerCase("ru-RU");
  return haystack.includes(needle);
}

function mapTypeToCommunityFilter(type: FeedType): "all" | "releases" | "video" | "news" | "media" {
  if (type === "releases") return "releases";
  if (type === "video") return "video";
  if (type === "media") return "media";
  if (type === "news") return "news";
  return "all";
}

function shouldIncludePlatformNews(type: FeedType, collaborationFilter: FeedCollaborationFilter) {
  if (collaborationFilter === "only") return false;
  return type === "all" || type === "news";
}

export function shouldIncludePlatformNewsForScope(scope: FeedScope, type: FeedType, collaborationFilter: FeedCollaborationFilter) {
  if (scope === "following") return false;
  return shouldIncludePlatformNews(type, collaborationFilter);
}

function dedupeFeed(items: PublicFeedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function composeTimeline(params: { socialItems: PublicFeedItem[]; newsItems: FeedNewsItem[]; type: FeedType; collaborationFilter: FeedCollaborationFilter }) {
  if (!shouldIncludePlatformNews(params.type, params.collaborationFilter)) {
    return dedupeFeed(sortFeed(params.socialItems));
  }
  if (params.type === "news") {
    return dedupeFeed(sortFeed([...params.socialItems, ...params.newsItems]));
  }

  const social = sortFeed(params.socialItems);
  const news = sortFeed(params.newsItems);
  if (!social.length) return dedupeFeed(news);
  if (!news.length) return dedupeFeed(social);

  const result: PublicFeedItem[] = [];
  let socialIndex = 0;
  let newsIndex = 0;
  const chunkSize = social.length >= 8 ? 4 : 5;
  const maxNewsItems = Math.min(news.length, Math.max(1, Math.floor(social.length / chunkSize)));

  while (socialIndex < social.length) {
    const nextChunk = social.slice(socialIndex, socialIndex + chunkSize);
    result.push(...nextChunk);
    socialIndex += nextChunk.length;
    if (newsIndex < maxNewsItems && socialIndex < social.length) {
      result.push(news[newsIndex]!);
      newsIndex += 1;
    }
  }

  return dedupeFeed(result);
}

async function loadFeedCore(params: {
  prisma: PrismaClient;
  userId?: string | null;
  view?: FeedPrimaryView | null;
  scope: FeedScope;
  type: FeedType;
  search?: string | null;
  collaborationFilter?: FeedCollaborationFilter;
  collaborationIntent?: CollaborationIntent | null;
  collaborationRole?: CollaborationRole | null;
  collaborationWorkflow?: CollaborationWorkflow | null;
  collaborationPreference?: CollaborationPreference | null;
  collaborationCity?: string | null;
  collaborationStatus?: CollaborationStatus | null;
  sort?: FeedSort;
  profileType?: FeedPersonProfileType | null;
  cursor?: FeedCursor | null;
}): Promise<FeedCore> {
  assertFeedScopeAccess(params.scope, params.userId);

  const normalizedSearch = normalizeSearch(params.search);
  const shouldLoadPeople = params.view === "people";
  const [communitySource, people] = await Promise.all([
    getDashboardCommunityPayload({
      prisma: params.prisma,
      userId: params.userId,
      scope: params.scope,
      filter: mapTypeToCommunityFilter(params.type),
      collaborationFilter: params.collaborationFilter ?? "all",
      collaborationIntent: params.collaborationIntent ?? null,
      collaborationRole: params.collaborationRole ?? null,
      collaborationWorkflow: params.collaborationWorkflow ?? null,
      collaborationPreference: params.collaborationPreference ?? null,
      collaborationCity: null,
      collaborationStatus: params.collaborationStatus ?? null,
      sort: params.sort ?? "newest",
      search: normalizedSearch,
      before: params.cursor ? { publishedAt: params.cursor.publishedAt, itemId: params.cursor.id } : null,
      limit: 200,
      skipDirectoryLoad: !shouldLoadPeople
    }),
    shouldLoadPeople
      ? listPublicArtistProfiles(params.prisma, {
          query: normalizedSearch || undefined,
          limit: 24,
          profileType: params.profileType ?? null,
          collaborationRole: params.collaborationRole ?? null
        }).then((profiles) => profiles.map(mapPublicArtistProfileToFeedPerson))
      : Promise.resolve([] as FeedPersonCard[])
  ]);
  const news = shouldIncludePlatformNewsForScope(params.scope, params.type, params.collaborationFilter ?? "all") ? await listPublicNews(params.prisma) : [];
  const newsWithBody: PublicNewsPostDto[] = news
    .map((item) => ({ ...item, content: item.excerpt ?? "" }))
    .filter((item) => !params.cursor
      || item.published_at < params.cursor.publishedAt
      || (item.published_at === params.cursor.publishedAt && `news_${item.id}` <= params.cursor.id));
  const socialItems = communitySource.feed.map(mapCommunityItem);
  const community = emptyCommunity();
  const filteredSocialItemsBase = normalizedSearch ? socialItems.filter((item) => matchesSearch(item, normalizedSearch)) : socialItems;
  const collaborationCity = normalizeCollaborationCity(params.collaborationCity);
  const collaborationCities = Array.from(new Set(
    filteredSocialItemsBase
      .filter((item): item is FeedPostItem => item.kind === "post" && item.postType === "collaboration" && item.collaboration?.preference === "local" && Boolean(item.collaboration.city.trim()))
      .map((item) => item.collaboration!.city.trim())
  )).sort((left, right) => left.localeCompare(right, "ru-RU"));
  const cityFilteredSocialItems = collaborationCity
    ? filteredSocialItemsBase.filter((item) => item.kind !== "post"
      || item.postType !== "collaboration"
      || item.collaboration?.city.trim().toLocaleLowerCase("ru-RU") === collaborationCity.toLocaleLowerCase("ru-RU"))
    : filteredSocialItemsBase;
  const filteredSocialItems = params.sort === "responses_desc"
    ? sortFeedByResponses(cityFilteredSocialItems, "desc")
    : params.sort === "responses_asc"
      ? sortFeedByResponses(cityFilteredSocialItems, "asc")
      : cityFilteredSocialItems;
  const mappedNewsItems = newsWithBody.map(mapNewsItem).filter((item) => !normalizedSearch || matchesSearch(item, normalizedSearch));

  return {
    scopeAccess: "granted",
    collaborationFilter: params.collaborationFilter ?? "all",
    collaborationIntent: params.collaborationIntent ?? null,
    collaborationRole: params.collaborationRole ?? null,
    collaborationWorkflow: params.collaborationWorkflow ?? null,
    collaborationPreference: params.collaborationPreference ?? null,
    collaborationCity,
    collaborationStatus: params.collaborationStatus ?? null,
    sort: params.sort ?? "newest",
    profileType: params.profileType ?? null,
    viewer: { authenticated: communitySource.viewerAuthenticated, id: params.userId ?? null },
    ownedProfiles: communitySource.ownedProfiles,
    releaseOptions: communitySource.releaseOptions,
    collaborationCities,
    suggestions: communitySource.suggestions,
    newReleases: community.releases.map((entry) => entry.item),
    popularPosts: community.popular.map((entry) => entry.item),
    releaseOfWeek: community.releases[0]?.item ?? null,
    community,
    people,
    items: composeTimeline({ socialItems: filteredSocialItems, newsItems: mappedNewsItems, type: params.type, collaborationFilter: params.collaborationFilter ?? "all" })
  };
}

export async function getPublicFeedPayload(params: {
  prisma: PrismaClient;
  userId?: string | null;
  view?: FeedPrimaryView | null;
  scope: FeedScope;
  type: FeedType;
  cursor?: string | null;
  limit?: number;
  author?: string | null;
  search?: string | null;
  collaborationFilter?: FeedCollaborationFilter;
  collaborationIntent?: CollaborationIntent | null;
  collaborationRole?: CollaborationRole | null;
  collaborationWorkflow?: CollaborationWorkflow | null;
  collaborationPreference?: CollaborationPreference | null;
  collaborationCity?: string | null;
  collaborationStatus?: CollaborationStatus | null;
  sort?: FeedSort;
  profileType?: FeedPersonProfileType | null;
}): Promise<PublicFeedPayload> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const search = normalizeSearch(params.search);
  const author = params.author?.trim() || null;
  const collaborationFilter = params.collaborationFilter ?? "all";
  const collaborationIntent = params.collaborationIntent ?? null;
  const collaborationRole = params.collaborationRole ?? null;
  const collaborationWorkflow = params.collaborationWorkflow ?? null;
  const collaborationPreference = params.collaborationPreference ?? null;
  const collaborationCity = normalizeCollaborationCity(params.collaborationCity);
  const collaborationStatus = params.collaborationStatus ?? null;
  const sort = params.sort ?? "newest";
  const profileType = params.profileType ?? null;
  const cursor = decodeCursor(params.cursor);
  if (params.cursor && !cursor) throw new FeedCursorError();
  try {
    const ledgerKinds: SocialActivityKind[] | null = params.type === "all"
      ? ["POST", "RELEASE", "NEWS"]
      : params.type === "posts"
        ? ["POST"]
        : params.type === "releases"
          ? ["RELEASE"]
          : null;
    const useActivityLedger = Boolean(ledgerKinds && !search && !author && collaborationFilter === "all" && !collaborationIntent && !collaborationRole && !collaborationWorkflow && !collaborationPreference && !collaborationCity && !collaborationStatus && !profileType && params.view !== "people");
    const [core, activityPage] = await Promise.all([
      loadFeedCore({ ...params, view: params.view ?? null, type: params.type, search, collaborationFilter, collaborationIntent, collaborationRole, collaborationWorkflow, collaborationPreference, collaborationCity, collaborationStatus, sort, profileType, cursor: useActivityLedger ? null : cursor }),
      useActivityLedger ? listSocialActivityPage({ prisma: params.prisma, viewerUserId: params.userId, scope: params.scope, cursor, limit, kinds: ledgerKinds! }) : Promise.resolve(null)
    ]);

    if (activityPage && !activityPage.unavailable) {
      if (!activityPage.cursorValid) throw new FeedCursorError();
      const coreItemsBySource = new Map<`post:${string}` | `release:${string}` | `news:${string}`, PublicFeedItem>(
        core.items.map((item) => [`${item.kind}:${item.sourceId}` as `post:${string}` | `release:${string}` | `news:${string}`, item] as const)
      );
      const hydrated = (await Promise.all(activityPage.rows.map(async (event) => {
        const cacheKey = `${event.kind.toLowerCase()}:${event.source_id}` as `post:${string}` | `release:${string}` | `news:${string}`;
        const cached = coreItemsBySource.get(cacheKey);
        if (cached) return cached;
        return getPublicFeedItemById({
          prisma: params.prisma,
          userId: params.userId,
          id: `${event.kind.toLowerCase()}_${event.source_id}`
        });
      }))).filter((item): item is PublicFeedItem => Boolean(item));
      const lastEvent = activityPage.rows.at(-1) ?? null;
      return {
        view: params.view ?? null,
        scope: params.scope,
        scopeAccess: core.scopeAccess,
        type: params.type,
        collaborationFilter,
        collaborationIntent,
        collaborationRole,
        collaborationWorkflow,
        collaborationPreference,
        collaborationCity,
        collaborationStatus,
        sort,
        profileType,
        search,
        author,
        items: hydrated,
        people: core.people,
        nextCursor: activityPage.hasMore && lastEvent ? encodeActivityCursor({ publishedAt: lastEvent.published_at.toISOString(), id: lastEvent.id }) : null,
        hasMore: activityPage.hasMore,
        viewer: core.viewer,
        ownedProfiles: core.ownedProfiles,
        releaseOptions: core.releaseOptions,
        collaborationCities: core.collaborationCities,
        suggestions: core.suggestions,
        newReleases: core.newReleases,
        popularPosts: core.popularPosts,
        releaseOfWeek: core.releaseOfWeek,
        community: core.community
      };
    }

    let items = core.items.filter((item) => matchesType(item, params.type));
    if (author) {
      items = items.filter((item) => item.author.slug === author);
    }

    if (cursor) {
      const index = items.findIndex((item) => item.id === cursor.id && item.publishedAt === cursor.publishedAt);
      if (index < 0) throw new FeedCursorError();
      items = items.slice(index + 1);
    }

    const pageItems = items.slice(0, limit);
    const hasMore = items.length > limit;

    return {
      view: params.view ?? null,
      scope: params.scope,
      scopeAccess: core.scopeAccess,
      type: params.type,
      collaborationFilter,
      collaborationIntent,
      collaborationRole,
      collaborationWorkflow,
      collaborationPreference,
      collaborationCity,
      collaborationStatus,
      sort,
      profileType,
      search,
      author,
      items: pageItems,
      people: core.people,
      nextCursor: hasMore && pageItems.length ? encodeCursor(pageItems[pageItems.length - 1]) : null,
      hasMore,
      viewer: core.viewer,
      ownedProfiles: core.ownedProfiles,
      releaseOptions: core.releaseOptions,
      collaborationCities: core.collaborationCities,
      suggestions: core.suggestions,
      newReleases: core.newReleases,
      popularPosts: core.popularPosts,
      releaseOfWeek: core.releaseOfWeek,
      community: core.community
    };
  } catch (error) {
    if (!isFeedStorageUnavailableError(error)) throw error;
    console.error("[public-feed-service] feed storage unavailable; serving demo payload", error);
    return createDemoFeedPayload({
      view: params.view ?? null,
      scope: params.scope,
      type: params.type,
      search,
      collaborationFilter,
      collaborationIntent,
      collaborationRole,
      collaborationWorkflow,
      collaborationPreference,
      collaborationCity,
      collaborationStatus,
      sort,
      profileType,
      userId: params.userId
    });
  }
}

export async function getPublicFeedItemById(params: {
  prisma: PrismaClient;
  userId?: string | null;
  id: string;
}): Promise<PublicFeedItem | null> {
  if (params.id.startsWith("post_")) {
    const postId = params.id.slice("post_".length);
    if (!/^[0-9a-f-]{36}$/iu.test(postId)) return null;
    const target = await params.prisma.artist_profile_posts.findUnique({
      where: { id: postId },
      select: { user_id: true, profile_key: true, author: { select: { name: true } } }
    });
    if (!target) return null;
    const seedSlug = target.profile_key === PERSONAL_ARTIST_PROFILE_KEY
      ? buildPersonalProfileSlug(target.author.name, target.user_id)
      : (await getSingleUserArtistProfileSettings(params.prisma, target.user_id, target.profile_key))?.slug ?? null;
    if (!seedSlug) return null;
    const community = await getDashboardCommunityPayload({
      prisma: params.prisma,
      userId: params.userId,
      scope: "all",
      filter: "all",
      limit: 1,
      targetPostId: postId,
      seedSlugs: [seedSlug],
      skipDirectoryLoad: true
    });
    const post = community.feed.find((item) => item.kind === "post" && item.id === postId);
    return post ? mapCommunityItem(post) : null;
  }
  if (params.id.startsWith("release_")) {
    const releaseId = params.id.slice("release_".length);
    if (!/^[0-9a-f-]{36}$/iu.test(releaseId)) return null;
    const target = await params.prisma.release.findUnique({
      where: { id: releaseId },
      select: { userId: true, user: { select: { id: true, name: true } } }
    });
    if (!target) return null;
    const ownerSettings = await getUserArtistProfilesForRelease(params.prisma, target.userId, releaseId);
    const seedSlug = ownerSettings?.profiles.find((profile) =>
      profile.settings.enabled && !profile.adminHidden && isCommunityReleaseVisible(profile.settings, releaseId)
    )?.slug ?? buildPersonalProfileSlug(target.user.name, target.user.id);
    const community = await getDashboardCommunityPayload({
      prisma: params.prisma,
      userId: params.userId,
      scope: "all",
      filter: "releases",
      limit: 1,
      targetReleaseId: releaseId,
      seedSlugs: [seedSlug],
      skipDirectoryLoad: true
    });
    const release = community.feed.find((item) => item.kind === "release" && item.releaseId === releaseId);
    return release ? mapCommunityItem(release) : null;
  }
  if (params.id.startsWith("news_")) {
    const newsId = params.id.slice("news_".length);
    if (!/^[0-9a-f-]{36}$/iu.test(newsId)) return null;
    const news = await getPublicNewsBySlug(params.prisma, newsId);
    return news ? mapNewsItem(news) : null;
  }
  const core = await loadFeedCore({ prisma: params.prisma, userId: params.userId, scope: "all", type: "all", search: "" });
  return core.items.find((item) => item.id === params.id) ?? null;
}
