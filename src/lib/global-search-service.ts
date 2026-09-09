import type { PrismaClient } from "@prisma/client";

import { listPublicArtistProfiles, type PublicArtistProfileCard } from "@/lib/artist-profile-service";
import type { PublicFeedItem } from "@/lib/feed-contract";
import { getPublicFeedPayload } from "@/lib/public-feed-service";
import { buildReleaseDetailHref } from "@/lib/release-route";

export type GlobalSearchEntity = {
  id: string;
  slug: string;
  displayName: string;
  profileType: "artist" | "producer" | "group" | "label";
  avatarUrl: string | null;
  secondary: string;
  href: string;
};

export type GlobalSearchPost = {
  id: string;
  kind: PublicFeedItem["kind"];
  title: string;
  excerpt: string;
  author: string;
  authorHref: string | null;
  avatarUrl: string | null;
  publishedAt: string;
  href: string;
};

export type GlobalSearchRelease = GlobalSearchPost & {
  kind: "release";
};

export type GlobalSearchPublication = GlobalSearchPost & {
  kind: "post" | "news";
};

export type GlobalSearchPayload = {
  query: string;
  releases: GlobalSearchRelease[];
  publications: GlobalSearchPublication[];
  entities: {
    artists: GlobalSearchEntity[];
    producers: GlobalSearchEntity[];
    groups: GlobalSearchEntity[];
    labels: GlobalSearchEntity[];
  };
  hasMore: {
    releases: boolean;
    publications: boolean;
    artists: boolean;
    producers: boolean;
    groups: boolean;
    labels: boolean;
  };
};

function normalizeQuery(query: string | null | undefined) {
  return (query ?? "").trim();
}

function entityFromProfile(profile: PublicArtistProfileCard): GlobalSearchEntity | null {
  if (profile.profileType !== "artist" && profile.profileType !== "producer" && profile.profileType !== "group" && profile.profileType !== "label") return null;
  return {
    id: profile.slug,
    slug: profile.slug,
    displayName: profile.displayName,
    profileType: profile.profileType,
    avatarUrl: profile.avatarUrl,
    secondary: [
      profile.city,
      profile.genres.slice(0, 2).join(", "),
      profile.releaseCount ? `${profile.releaseCount} релизов` : "",
      profile.releaseTitles.slice(0, 2).join(", ")
    ].filter(Boolean).join(" · "),
    href: `/artists/${profile.slug}`
  };
}

function postTitle(item: PublicFeedItem) {
  if (item.kind === "release") return item.title;
  if (item.kind === "news") return item.title;
  return item.linkedRelease?.title || item.content || "Публикация";
}

function postExcerpt(item: PublicFeedItem) {
  if (item.kind === "post") return item.content || item.linkedRelease?.title || "Медиа-публикация";
  if (item.kind === "release") return `Релиз · ${item.author.displayName}`;
  return item.excerpt || item.content || "Новость";
}

function mapPost(item: PublicFeedItem): GlobalSearchPost {
  return {
    id: item.id,
    kind: item.kind,
    title: postTitle(item),
    excerpt: postExcerpt(item),
    author: item.author.displayName,
    authorHref: item.author.slug ? `/artists/${item.author.slug}` : null,
    avatarUrl: item.kind === "news" ? item.coverUrl ?? item.author.avatarUrl : item.author.avatarUrl,
    publishedAt: item.publishedAt,
    href: item.kind === "release"
      ? (item.sceneHref || buildReleaseDetailHref(item.releaseId))
      : item.permalink
  };
}

export function splitGlobalSearchFeedItems(
  items: PublicFeedItem[],
  limit: number
): {
  releases: GlobalSearchRelease[];
  publications: GlobalSearchPublication[];
  hasMore: { releases: boolean; publications: boolean };
} {
  const mapped = items.map(mapPost);
  const releases = mapped.filter((item): item is GlobalSearchRelease => item.kind === "release");
  const publications = mapped.filter((item): item is GlobalSearchPublication => item.kind === "post" || item.kind === "news");

  return {
    releases: releases.slice(0, limit),
    publications: publications.slice(0, limit),
    hasMore: {
      releases: releases.length > limit,
      publications: publications.length > limit
    }
  };
}

export async function getGlobalSearchPayload(params: {
  prisma: PrismaClient;
  userId?: string | null;
  query?: string | null;
  limit?: number;
}): Promise<GlobalSearchPayload> {
  const query = normalizeQuery(params.query);
  const limit = Math.min(Math.max(params.limit ?? 6, 1), 12);
  const empty = {
    query,
    releases: [],
    publications: [],
    entities: { artists: [], producers: [], groups: [], labels: [] },
    hasMore: { releases: false, publications: false, artists: false, producers: false, groups: false, labels: false }
  };
  if (query.length < 2) return empty;

  const feedSearchLimit = Math.max(limit * 8, 24);
  const [feed, profiles] = await Promise.all([
    getPublicFeedPayload({ prisma: params.prisma, userId: params.userId ?? null, scope: "all", type: "all", search: query, limit: feedSearchLimit })
      .catch(() => ({ items: [], hasMore: false })),
    listPublicArtistProfiles(params.prisma, { query, limit: 60 }).catch(() => [])
  ]);

  const entityMatches = profiles
    .map(entityFromProfile)
    .filter((item): item is GlobalSearchEntity => Boolean(item));

  const artists = entityMatches.filter((item) => item.profileType === "artist");
  const producers = entityMatches.filter((item) => item.profileType === "producer");
  const groups = entityMatches.filter((item) => item.profileType === "group");
  const labels = entityMatches.filter((item) => item.profileType === "label");
  const grouped = splitGlobalSearchFeedItems(feed.items, limit);

  return {
    query,
    releases: grouped.releases,
    publications: grouped.publications,
    entities: {
      artists: artists.slice(0, limit),
      producers: producers.slice(0, limit),
      groups: groups.slice(0, limit),
      labels: labels.slice(0, limit)
    },
    hasMore: {
      releases: grouped.hasMore.releases || feed.hasMore,
      publications: grouped.hasMore.publications || feed.hasMore,
      artists: artists.length > limit,
      producers: producers.length > limit,
      groups: groups.length > limit,
      labels: labels.length > limit
    }
  };
}
