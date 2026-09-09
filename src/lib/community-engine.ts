import type {
  FeedCommunityDiagnosticsEntry,
  FeedCommunityDiscovery,
  FeedCommunityMetrics,
  FeedCommunityPostEntry,
  FeedCommunityReleaseEntry,
  FeedCommunitySignalAudit,
  FeedPostItem,
  FeedReleaseItem
} from "@/lib/feed-contract";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const COMMUNITY_ENGINE_CONFIG = {
  liveWindowMs: 60 * MINUTE,
  liveMinParticipants: 2,
  liveMinScore: 8,
  liveMinReactionActors: 2,
  liveMinQualifiedPlays: 3,
  trendingWindowMs: 6 * HOUR,
  popularWindowMs: 7 * DAY,
  collaborationWindowMs: 30 * DAY,
  releasesWindowMs: 24 * HOUR,
  releasesFallbackWindowMs: 30 * DAY,
  scoreWeights: {
    uniqueReactions: 2,
    rootComments: 4,
    replies: 2.5,
    uniqueParticipants: 3,
    qualifiedPlays: 0.45
  },
  recencyBoostMax: 6,
  recencyBoostWindowMs: 48 * HOUR,
  trendingVelocityThreshold: 3.5,
  postOfWeekMinScore: 10,
  postOfWeekMinParticipants: 2
} as const;

export type CommunityActivitySignals = {
  postReactions: Array<{ postId: string; visitorId: string; createdAt: Date }>;
  postComments: Array<{ postId: string; userId: string; parentId: string | null; createdAt: Date; deletedAt: Date | null }>;
  releaseReactions: Array<{ releaseId: string; visitorId: string; createdAt: Date }>;
  releaseComments: Array<{ releaseId: string; userId: string; parentId: string | null; createdAt: Date; deletedAt: Date | null }>;
  releasePlays: Array<{ releaseId: string; visitorId: string; createdAt: Date }>;
};

type CommunityItem = FeedPostItem | FeedReleaseItem;
type Bucket = {
  reactionActors: Set<string>;
  participantActors: Set<string>;
  rootComments: number;
  replies: number;
  qualifiedPlays: number;
};

type Accumulator = {
  item: CommunityItem;
  authorId: string;
  sourceId: string;
  createdAtMs: number;
  latestInteractionMs: number;
  total: Bucket;
  recent: Bucket;
  previous: Bucket;
  live: Bucket;
};

type RankedItem = {
  item: CommunityItem;
  metrics: FeedCommunityMetrics;
  score: number;
  recentScore: number;
  previousScore: number;
  velocity: number;
  latestInteractionMs: number;
};

const SIGNAL_AUDIT: FeedCommunitySignalAudit[] = [
  { signal: "unique reactions", exists: true, reliable: true, canRank: true, notes: "Берётся из artist_profile_post_likes и scene_release_likes по visitor_id." },
  { signal: "reaction types", exists: true, reliable: true, canRank: false, notes: "Тип реакции доступен, но score использует уникальных участников, а не декоративные веса emoji." },
  { signal: "root comments", exists: true, reliable: true, canRank: true, notes: "Берётся из parent_id IS NULL, удалённые комментарии исключаются." },
  { signal: "replies", exists: true, reliable: true, canRank: true, notes: "Берётся из comment rows с parent_id, удалённые ответы исключаются." },
  { signal: "unique commenters", exists: true, reliable: true, canRank: true, notes: "Учитываются как часть unique participants по user_id." },
  { signal: "qualified audio plays", exists: true, reliable: true, canRank: true, notes: "Берётся из scene_release_plays; play already deduplicated server-side within 5 minutes." },
  { signal: "post createdAt", exists: true, reliable: true, canRank: true, notes: "Используется для recency decay и summary." },
  { signal: "latest interaction timestamp", exists: true, reliable: true, canRank: true, notes: "Собирается как max(createdAt, reaction/comment/play)." },
  { signal: "follows attributed to post", exists: false, reliable: false, canRank: false, notes: "В текущей схеме нет post-level follow attribution." },
  { signal: "detail views", exists: false, reliable: false, canRank: false, notes: "Feed/detail view tracking для Community Engine не найден." },
  { signal: "shares", exists: false, reliable: false, canRank: false, notes: "Share tracking в БД отсутствует; clipboard/native share не дают серверного счётчика." }
];

function createBucket(): Bucket {
  return {
    reactionActors: new Set<string>(),
    participantActors: new Set<string>(),
    rootComments: 0,
    replies: 0,
    qualifiedPlays: 0
  };
}

function createAccumulator(item: CommunityItem): Accumulator {
  const createdAtMs = new Date(item.publishedAt).getTime();
  return {
    item,
    authorId: item.author.id,
    sourceId: item.sourceId,
    createdAtMs,
    latestInteractionMs: createdAtMs,
    total: createBucket(),
    recent: createBucket(),
    previous: createBucket(),
    live: createBucket()
  };
}

function addParticipant(bucket: Bucket, actorId: string | null | undefined, authorId: string) {
  if (!actorId || actorId === authorId) return false;
  bucket.participantActors.add(actorId);
  return true;
}

function addReaction(acc: Accumulator, actorId: string, createdAtMs: number, nowMs: number) {
  if (actorId === acc.authorId) return;
  if (createdAtMs >= nowMs - COMMUNITY_ENGINE_CONFIG.popularWindowMs) {
    acc.total.reactionActors.add(actorId);
    acc.total.participantActors.add(actorId);
  }
  if (createdAtMs >= nowMs - COMMUNITY_ENGINE_CONFIG.trendingWindowMs) {
    acc.recent.reactionActors.add(actorId);
    acc.recent.participantActors.add(actorId);
  } else if (createdAtMs >= nowMs - (COMMUNITY_ENGINE_CONFIG.trendingWindowMs * 2)) {
    acc.previous.reactionActors.add(actorId);
    acc.previous.participantActors.add(actorId);
  }
  if (createdAtMs >= nowMs - COMMUNITY_ENGINE_CONFIG.liveWindowMs) {
    acc.live.reactionActors.add(actorId);
    acc.live.participantActors.add(actorId);
  }
  acc.latestInteractionMs = Math.max(acc.latestInteractionMs, createdAtMs);
}

function addComment(acc: Accumulator, actorId: string, parentId: string | null, createdAtMs: number, nowMs: number) {
  if (actorId === acc.authorId) return;
  const isReply = Boolean(parentId);
  if (createdAtMs >= nowMs - COMMUNITY_ENGINE_CONFIG.popularWindowMs) {
    addParticipant(acc.total, actorId, acc.authorId);
    if (isReply) acc.total.replies += 1;
    else acc.total.rootComments += 1;
  }
  if (createdAtMs >= nowMs - COMMUNITY_ENGINE_CONFIG.trendingWindowMs) {
    addParticipant(acc.recent, actorId, acc.authorId);
    if (isReply) acc.recent.replies += 1;
    else acc.recent.rootComments += 1;
  } else if (createdAtMs >= nowMs - (COMMUNITY_ENGINE_CONFIG.trendingWindowMs * 2)) {
    addParticipant(acc.previous, actorId, acc.authorId);
    if (isReply) acc.previous.replies += 1;
    else acc.previous.rootComments += 1;
  }
  if (createdAtMs >= nowMs - COMMUNITY_ENGINE_CONFIG.liveWindowMs) {
    addParticipant(acc.live, actorId, acc.authorId);
    if (isReply) acc.live.replies += 1;
    else acc.live.rootComments += 1;
  }
  acc.latestInteractionMs = Math.max(acc.latestInteractionMs, createdAtMs);
}

function addPlay(acc: Accumulator, actorId: string, createdAtMs: number, nowMs: number) {
  if (actorId === acc.authorId) return;
  if (createdAtMs >= nowMs - COMMUNITY_ENGINE_CONFIG.popularWindowMs) {
    acc.total.qualifiedPlays += 1;
    acc.total.participantActors.add(actorId);
  }
  if (createdAtMs >= nowMs - COMMUNITY_ENGINE_CONFIG.trendingWindowMs) {
    acc.recent.qualifiedPlays += 1;
    acc.recent.participantActors.add(actorId);
  } else if (createdAtMs >= nowMs - (COMMUNITY_ENGINE_CONFIG.trendingWindowMs * 2)) {
    acc.previous.qualifiedPlays += 1;
    acc.previous.participantActors.add(actorId);
  }
  if (createdAtMs >= nowMs - COMMUNITY_ENGINE_CONFIG.liveWindowMs) {
    acc.live.qualifiedPlays += 1;
    acc.live.participantActors.add(actorId);
  }
  acc.latestInteractionMs = Math.max(acc.latestInteractionMs, createdAtMs);
}

function computeRecencyBoost(latestInteractionMs: number, nowMs: number) {
  const age = Math.max(0, nowMs - latestInteractionMs);
  if (age >= COMMUNITY_ENGINE_CONFIG.recencyBoostWindowMs) return 0;
  const ratio = 1 - (age / COMMUNITY_ENGINE_CONFIG.recencyBoostWindowMs);
  return Number((COMMUNITY_ENGINE_CONFIG.recencyBoostMax * ratio).toFixed(2));
}

function computeScore(params: {
  uniqueReactions: number;
  rootComments: number;
  replies: number;
  uniqueParticipants: number;
  qualifiedPlays: number;
  recencyBoost: number;
}) {
  const score =
    params.uniqueReactions * COMMUNITY_ENGINE_CONFIG.scoreWeights.uniqueReactions
    + params.rootComments * COMMUNITY_ENGINE_CONFIG.scoreWeights.rootComments
    + params.replies * COMMUNITY_ENGINE_CONFIG.scoreWeights.replies
    + params.uniqueParticipants * COMMUNITY_ENGINE_CONFIG.scoreWeights.uniqueParticipants
    + params.qualifiedPlays * COMMUNITY_ENGINE_CONFIG.scoreWeights.qualifiedPlays
    + params.recencyBoost;
  return Number(score.toFixed(2));
}

function finalizeMetrics(acc: Accumulator, nowMs: number): RankedItem {
  const recencyBoost = computeRecencyBoost(acc.latestInteractionMs, nowMs);
  const score = computeScore({
    uniqueReactions: acc.total.reactionActors.size,
    rootComments: acc.total.rootComments,
    replies: acc.total.replies,
    uniqueParticipants: acc.total.participantActors.size,
    qualifiedPlays: acc.total.qualifiedPlays,
    recencyBoost
  });
  const recentScore = computeScore({
    uniqueReactions: acc.recent.reactionActors.size,
    rootComments: acc.recent.rootComments,
    replies: acc.recent.replies,
    uniqueParticipants: acc.recent.participantActors.size,
    qualifiedPlays: acc.recent.qualifiedPlays,
    recencyBoost: 0
  });
  const previousScore = computeScore({
    uniqueReactions: acc.previous.reactionActors.size,
    rootComments: acc.previous.rootComments,
    replies: acc.previous.replies,
    uniqueParticipants: acc.previous.participantActors.size,
    qualifiedPlays: acc.previous.qualifiedPlays,
    recencyBoost: 0
  });
  const velocity = Number((recentScore - previousScore).toFixed(2));
  return {
    item: acc.item,
    score,
    recentScore,
    previousScore,
    velocity,
    latestInteractionMs: acc.latestInteractionMs,
    metrics: {
      uniqueReactions: acc.total.reactionActors.size,
      rootComments: acc.total.rootComments,
      replies: acc.total.replies,
      uniqueParticipants: acc.total.participantActors.size,
      qualifiedPlays: acc.item.kind === "release" ? acc.total.qualifiedPlays : null,
      latestInteractionAt: new Date(acc.latestInteractionMs).toISOString(),
      score,
      velocity,
      recencyBoost
    }
  };
}

function compareRanked(left: RankedItem, right: RankedItem) {
  if (right.score !== left.score) return right.score - left.score;
  if (right.latestInteractionMs !== left.latestInteractionMs) return right.latestInteractionMs - left.latestInteractionMs;
  const byDate = new Date(right.item.publishedAt).getTime() - new Date(left.item.publishedAt).getTime();
  if (byDate !== 0) return byDate;
  return left.item.id.localeCompare(right.item.id, "en");
}

function compareVelocity(left: RankedItem, right: RankedItem) {
  if (right.velocity !== left.velocity) return right.velocity - left.velocity;
  return compareRanked(left, right);
}

function toPostEntry(item: RankedItem): FeedCommunityPostEntry {
  return { item: item.item as FeedPostItem, metrics: item.metrics };
}

function toReleaseEntry(item: RankedItem): FeedCommunityReleaseEntry {
  return { item: item.item as FeedReleaseItem, metrics: item.metrics };
}

function toDiagnosticsEntry(item: RankedItem, category: FeedCommunityDiagnosticsEntry["category"], window: string, exclusionReason?: string | null): FeedCommunityDiagnosticsEntry {
  return {
    itemId: item.item.id,
    sourceId: item.item.sourceId,
    kind: item.item.kind,
    category,
    window,
    score: item.score,
    metrics: item.metrics,
    exclusionReason: exclusionReason ?? null
  };
}

function createBaseCommunityDiscovery(status: FeedCommunityDiscovery["status"]): FeedCommunityDiscovery {
  return {
    status,
    releaseWindow: "today",
    signalAudit: SIGNAL_AUDIT,
    live: [],
    trending: [],
    popular: [],
    releases: [],
    collaborations: [],
    postOfWeek: null,
    summary: {
      publicPostsToday: 0,
      releasesToday: 0,
      collaborationsToday: 0
    },
    diagnostics: null
  };
}

export function createEmptyCommunityDiscovery(): FeedCommunityDiscovery {
  return createBaseCommunityDiscovery("ready");
}

export function createUnavailableCommunityDiscovery(): FeedCommunityDiscovery {
  return createBaseCommunityDiscovery("unavailable");
}

export function buildCommunityDiscovery(params: {
  items: Array<FeedPostItem | FeedReleaseItem>;
  signals: CommunityActivitySignals;
  now?: Date;
  includeDiagnostics?: boolean;
}): FeedCommunityDiscovery {
  const nowMs = (params.now ?? new Date()).getTime();
  const discovery = createEmptyCommunityDiscovery();
  const posts = params.items.filter((item): item is FeedPostItem => item.kind === "post");
  const releases = params.items.filter((item): item is FeedReleaseItem => item.kind === "release");
  const postMap = new Map(posts.map((item) => [item.sourceId, createAccumulator(item)]));
  const releaseMap = new Map(releases.map((item) => [item.releaseId, createAccumulator(item)]));

  for (const row of params.signals.postReactions) {
    const acc = postMap.get(row.postId);
    if (!acc) continue;
    addReaction(acc, row.visitorId, row.createdAt.getTime(), nowMs);
  }
  for (const row of params.signals.postComments) {
    if (row.deletedAt) continue;
    const acc = postMap.get(row.postId);
    if (!acc) continue;
    addComment(acc, row.userId, row.parentId, row.createdAt.getTime(), nowMs);
  }
  for (const row of params.signals.releaseReactions) {
    const acc = releaseMap.get(row.releaseId);
    if (!acc) continue;
    addReaction(acc, row.visitorId, row.createdAt.getTime(), nowMs);
  }
  for (const row of params.signals.releaseComments) {
    if (row.deletedAt) continue;
    const acc = releaseMap.get(row.releaseId);
    if (!acc) continue;
    addComment(acc, row.userId, row.parentId, row.createdAt.getTime(), nowMs);
  }
  for (const row of params.signals.releasePlays) {
    const acc = releaseMap.get(row.releaseId);
    if (!acc) continue;
    addPlay(acc, row.visitorId, row.createdAt.getTime(), nowMs);
  }

  const rankedPosts = Array.from(postMap.values()).map((acc) => finalizeMetrics(acc, nowMs));
  const rankedReleases = Array.from(releaseMap.values()).map((acc) => finalizeMetrics(acc, nowMs));

  const liveCandidates = rankedPosts
    .filter((item) => item.latestInteractionMs >= nowMs - COMMUNITY_ENGINE_CONFIG.liveWindowMs)
    .filter((item) => (item.metrics.uniqueParticipants ?? 0) >= COMMUNITY_ENGINE_CONFIG.liveMinParticipants)
    .filter((item) => item.score >= COMMUNITY_ENGINE_CONFIG.liveMinScore)
    .filter((item) => {
      const acc = postMap.get(item.item.sourceId);
      if (!acc) return false;
      return acc.live.rootComments + acc.live.replies > 0
        || acc.live.reactionActors.size >= COMMUNITY_ENGINE_CONFIG.liveMinReactionActors
        || acc.live.qualifiedPlays >= COMMUNITY_ENGINE_CONFIG.liveMinQualifiedPlays;
    })
    .sort(compareRanked)
    .slice(0, 3);

  const trendingCandidates = rankedPosts
    .filter((item) => item.latestInteractionMs >= nowMs - COMMUNITY_ENGINE_CONFIG.trendingWindowMs)
    .filter((item) => item.velocity >= COMMUNITY_ENGINE_CONFIG.trendingVelocityThreshold)
    .filter((item) => (item.metrics.uniqueParticipants ?? 0) >= 2)
    .sort(compareVelocity)
    .slice(0, 4);

  const popularCandidates = rankedPosts
    .filter((item) => new Date(item.item.publishedAt).getTime() >= nowMs - COMMUNITY_ENGINE_CONFIG.popularWindowMs)
    .filter((item) => item.score > COMMUNITY_ENGINE_CONFIG.recencyBoostMax)
    .sort(compareRanked)
    .slice(0, 4);

  const releaseFresh = rankedReleases
    .filter((item) => new Date(item.item.publishedAt).getTime() >= nowMs - COMMUNITY_ENGINE_CONFIG.releasesWindowMs)
    .sort(compareRanked);
  const releaseFallback = rankedReleases
    .filter((item) => new Date(item.item.publishedAt).getTime() >= nowMs - COMMUNITY_ENGINE_CONFIG.releasesFallbackWindowMs)
    .sort(compareRanked);
  const releaseCandidates = (releaseFresh.length ? releaseFresh : releaseFallback).slice(0, 4);

  const collaborationCandidates = rankedPosts
    .filter((item) => item.item.kind === "post" && item.item.collaboration !== null)
    .filter((item) => new Date(item.item.publishedAt).getTime() >= nowMs - COMMUNITY_ENGINE_CONFIG.collaborationWindowMs)
    .sort(compareRanked)
    .slice(0, 4);

  const postOfWeekCandidate = rankedPosts
    .filter((item) => new Date(item.item.publishedAt).getTime() >= nowMs - COMMUNITY_ENGINE_CONFIG.popularWindowMs)
    .filter((item) => item.score >= COMMUNITY_ENGINE_CONFIG.postOfWeekMinScore)
    .filter((item) => (item.metrics.uniqueParticipants ?? 0) >= COMMUNITY_ENGINE_CONFIG.postOfWeekMinParticipants)
    .sort(compareRanked)[0] ?? null;

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();

  discovery.releaseWindow = releaseFresh.length ? "today" : "recent";
  discovery.live = liveCandidates.map(toPostEntry);
  discovery.trending = trendingCandidates.map(toPostEntry);
  discovery.popular = popularCandidates.map(toPostEntry);
  discovery.releases = releaseCandidates.map(toReleaseEntry);
  discovery.collaborations = collaborationCandidates.map(toPostEntry);
  discovery.postOfWeek = postOfWeekCandidate ? toPostEntry(postOfWeekCandidate) : null;
  discovery.summary = {
    publicPostsToday: posts.filter((item) => new Date(item.publishedAt).getTime() >= startOfTodayMs).length,
    releasesToday: releases.filter((item) => new Date(item.publishedAt).getTime() >= startOfTodayMs).length,
    collaborationsToday: posts.filter((item) => item.collaboration && new Date(item.publishedAt).getTime() >= startOfTodayMs).length
  };

  if (params.includeDiagnostics) {
    discovery.diagnostics = {
      ranked: [
        ...liveCandidates.map((item) => toDiagnosticsEntry(item, "live", "60m")),
        ...trendingCandidates.map((item) => toDiagnosticsEntry(item, "trending", "6h_vs_prev_6h")),
        ...popularCandidates.map((item) => toDiagnosticsEntry(item, "popular", "7d")),
        ...releaseCandidates.map((item) => toDiagnosticsEntry(item, "new_release", discovery.releaseWindow === "today" ? "24h" : "30d_fallback")),
        ...collaborationCandidates.map((item) => toDiagnosticsEntry(item, "collaboration", "30d")),
        ...(postOfWeekCandidate ? [toDiagnosticsEntry(postOfWeekCandidate, "post_of_week", "7d")] : [])
      ],
      excluded: [
        ...rankedPosts
          .filter((item) => item.item.kind === "post" && item.item.collaboration !== null)
          .filter((item) => !collaborationCandidates.some((candidate) => candidate.item.id === item.item.id))
          .slice(0, 6)
          .map((item) => toDiagnosticsEntry(item, "collaboration", "30d", "did_not_reach_top_block")),
        ...rankedPosts
          .filter((item) => !liveCandidates.some((candidate) => candidate.item.id === item.item.id))
          .filter((item) => item.latestInteractionMs >= nowMs - COMMUNITY_ENGINE_CONFIG.liveWindowMs)
          .slice(0, 6)
          .map((item) => toDiagnosticsEntry(item, "live", "60m", "failed_live_thresholds"))
      ]
    };
  }

  return discovery;
}
