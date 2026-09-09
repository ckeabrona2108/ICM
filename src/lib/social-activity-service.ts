import type { Prisma, PrismaClient } from "@prisma/client";
import { listSocialFeedPreferences, type SocialFeedPreferencePrisma } from "@/lib/social-feed-preference-service";
import { listBlockedPeerIds, type SocialSafetyPrisma } from "@/lib/social-safety-policy";
import { isPrismaPoolTimeoutError, isPrismaTableMissingError } from "@/lib/prisma-errors";

export type SocialActivityCursor = { publishedAt: string; id: string };
export type SocialActivityKind = "POST" | "RELEASE" | "NEWS";

function isSocialActivityKind(value: string): value is SocialActivityKind {
  return value === "POST" || value === "RELEASE" || value === "NEWS";
}

function isMissingSocialActivityEventsTable(error: unknown) {
  return isPrismaTableMissingError(error, "icecream.social_activity_events");
}

function isUnavailableSocialActivityStore(error: unknown) {
  return isMissingSocialActivityEventsTable(error) || isPrismaPoolTimeoutError(error);
}

export async function listSocialActivityPage(params: {
  prisma: PrismaClient;
  viewerUserId?: string | null;
  cursor?: SocialActivityCursor | null;
  limit: number;
  kinds?: SocialActivityKind[];
  scope?: "all" | "following";
}) {
  const [followed, blockedPeerIds, preferences] = params.viewerUserId ? await Promise.all([
    params.prisma.artist_profile_followers.findMany({
      where: { follower_user_id: params.viewerUserId },
      select: { profile_user_id: true, profile_key: true }
    }).catch((error) => {
      if (isPrismaPoolTimeoutError(error)) return [];
      throw error;
    }),
    listBlockedPeerIds(params.prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">, params.viewerUserId),
    listSocialFeedPreferences(params.prisma as unknown as SocialFeedPreferencePrisma, params.viewerUserId)
  ]) : [[], [], { hiddenPostIds: [], hiddenReleaseIds: [], mutedUserIds: [] }];
  const suppressedActors = Array.from(new Set([...blockedPeerIds, ...preferences.mutedUserIds]));
  const visibleAudience: Prisma.social_activity_eventsWhereInput = {
    OR: [
      { audience: "PUBLIC" },
      ...(params.viewerUserId ? [{ actor_user_id: params.viewerUserId }] : []),
      ...(followed.length ? [{ audience: "FOLLOWERS", OR: followed.map((item) => ({ actor_user_id: item.profile_user_id, profile_key: item.profile_key })) }] : [])
    ]
  };
  const followedScope: Prisma.social_activity_eventsWhereInput | null = params.scope === "following"
    ? followed.length
      ? { OR: followed.map((item) => ({ actor_user_id: item.profile_user_id, profile_key: item.profile_key })) }
      : { id: { in: [] } }
    : null;
  const cursorAt = params.cursor ? new Date(params.cursor.publishedAt) : null;
  const policyWhere: Prisma.social_activity_eventsWhereInput = {
    AND: [
      visibleAudience,
      ...(followedScope ? [followedScope] : []),
      { consent_state: "PUBLISHED" },
      ...(params.kinds?.length ? [{ kind: { in: params.kinds } }] : []),
      ...(suppressedActors.length ? [{ actor_user_id: { notIn: suppressedActors } }] : []),
      ...(preferences.hiddenPostIds.length ? [{ NOT: { kind: "POST", source_id: { in: preferences.hiddenPostIds } } }] : []),
      ...(preferences.hiddenReleaseIds.length ? [{ NOT: { kind: "RELEASE", source_id: { in: preferences.hiddenReleaseIds } } }] : [])
    ]
  };
  let cursorValid = true;
  try {
    cursorValid = !params.cursor || Boolean(await params.prisma.social_activity_events.findFirst({
      where: { AND: [policyWhere, { id: params.cursor.id, published_at: cursorAt! }] },
      select: { id: true }
    }));
  } catch (error) {
    if (isUnavailableSocialActivityStore(error)) {
      return { rows: [], hasMore: false, cursorValid: true, unavailable: true };
    }
    throw error;
  }
  if (!cursorValid) return { rows: [], hasMore: false, cursorValid: false, unavailable: false };
  let rows: Array<{ id: string; kind: string; source_id: string; published_at: Date }>;
  try {
    rows = await params.prisma.social_activity_events.findMany({
      where: {
        AND: [
          policyWhere,
          ...(cursorAt && params.cursor ? [{
            OR: [
              { published_at: { lt: cursorAt } },
              { published_at: cursorAt, id: { lt: params.cursor.id } }
            ]
          }] : [])
        ]
      },
      orderBy: [{ published_at: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(params.limit, 1), 50) + 1,
      select: { id: true, kind: true, source_id: true, published_at: true }
    });
  } catch (error) {
    if (isUnavailableSocialActivityStore(error)) {
      return { rows: [], hasMore: false, cursorValid: true, unavailable: true };
    }
    throw error;
  }
  return {
    rows: rows
      .filter((row): row is { id: string; kind: SocialActivityKind; source_id: string; published_at: Date } => isSocialActivityKind(row.kind))
      .slice(0, params.limit),
    hasMore: rows.length > params.limit,
    cursorValid: true,
    unavailable: false
  };
}

export async function upsertSocialActivityEvent(params: {
  prisma: Pick<PrismaClient, "social_activity_events">;
  kind: SocialActivityKind;
  sourceId: string;
  actorUserId?: string | null;
  profileKey?: string | null;
  audience?: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
  publishedAt: Date;
  provenance?: "APPLICATION" | "BACKFILL";
  metadata?: Prisma.InputJsonValue;
  searchText?: string;
  mediaKind?: string;
  isCollaboration?: boolean;
  collaborationIntent?: string | null;
  collaborationRole?: string | null;
  linkedRelease?: boolean;
  category?: string | null;
}) {
  const createData = {
    kind: params.kind,
    source_id: params.sourceId,
    actor_user_id: params.actorUserId ?? null,
    profile_key: params.profileKey ?? null,
    audience: params.audience ?? "PUBLIC",
    consent_state: "PUBLISHED",
    provenance: params.provenance ?? "APPLICATION",
    dedupe_key: `${params.kind.toLowerCase()}:${params.sourceId}`,
    metadata: params.metadata,
    search_text: params.searchText ?? "",
    media_kind: params.mediaKind ?? "NONE",
    is_collaboration: params.isCollaboration ?? false,
    collaboration_intent: params.collaborationIntent ?? null,
    collaboration_role: params.collaborationRole ?? null,
    linked_release: params.linkedRelease ?? false,
    category: params.category ?? null,
    published_at: params.publishedAt
  } as unknown as Prisma.social_activity_eventsUncheckedCreateInput;
  const updateData = {
    actor_user_id: params.actorUserId ?? null,
    profile_key: params.profileKey ?? null,
    audience: params.audience ?? "PUBLIC",
    consent_state: "PUBLISHED",
    metadata: params.metadata,
    search_text: params.searchText ?? "",
    media_kind: params.mediaKind ?? "NONE",
    is_collaboration: params.isCollaboration ?? false,
    collaboration_intent: params.collaborationIntent ?? null,
    collaboration_role: params.collaborationRole ?? null,
    linked_release: params.linkedRelease ?? false,
    category: params.category ?? null,
    published_at: params.publishedAt
  } as unknown as Prisma.social_activity_eventsUncheckedUpdateInput;
  return params.prisma.social_activity_events.upsert({
    where: { kind_source_id: { kind: params.kind, source_id: params.sourceId } },
    create: createData,
    update: updateData
  });
}
