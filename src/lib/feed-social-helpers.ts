import type { FeedReaction, FeedReactionCounts, FeedReactionSummary, PublicFeedComment } from "@/lib/feed-contract";
import { buildStoredFileRouteUrl } from "@/lib/file-resolver";

function resolveFeedAssetUrl(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.startsWith("data:") || normalized.startsWith("blob:")) return null;
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;
  }
  return buildStoredFileRouteUrl(value);
}

export const FEED_REACTIONS = ["heart", "fire", "laugh", "wow", "sad", "thumbs", "party", "diamond"] as const satisfies readonly FeedReaction[];

export function isFeedReaction(value: string): value is FeedReaction {
  return FEED_REACTIONS.includes(value as FeedReaction);
}

export function createEmptyReactionSummary(): FeedReactionCounts {
  return {
    heart: 0,
    fire: 0,
    laugh: 0,
    wow: 0,
    sad: 0,
    thumbs: 0,
    party: 0,
    diamond: 0
  };
}

export function buildReactionSummary(rows: Array<{ reaction: string; count: number }>, viewerReaction: string | null): {
  summary: FeedReactionSummary;
  total: number;
  viewerReaction: FeedReaction | null;
  likedByViewer: boolean;
} {
  const summary = createEmptyReactionSummary();
  for (const row of rows) {
    if (isFeedReaction(row.reaction)) {
      summary[row.reaction] = row.count;
    }
  }
  const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
  const activeReaction: FeedReaction | null = viewerReaction && isFeedReaction(viewerReaction) ? viewerReaction : null;
  return {
    summary: {
      total,
      counts: summary,
      viewerReaction: activeReaction
    },
    total,
    viewerReaction: activeReaction,
    likedByViewer: activeReaction !== null
  };
}

type RawCommentAuthor = {
  id: string;
  name: string;
  avatar: string | null;
  isVerifiedAuthor: boolean;
};

type RawComment = {
  id: string;
  parent_id: string | null;
  user_id: string;
  content: string;
  media_key?: string | null;
  media_name?: string | null;
  created_at: Date;
  updated_at: Date;
  edited_at?: Date | null;
  deleted_at?: Date | null;
  reactions?: Array<{ visitor_id: string; reaction: string }>;
  author: RawCommentAuthor;
};

export function buildFeedCommentTree(rows: RawComment[], viewerUserId?: string | null): PublicFeedComment[] {
  const mapped = new Map<string, PublicFeedComment>();
  for (const row of rows) {
    const reactionSummary = buildReactionSummary(
      Array.from((row.reactions ?? []).reduce((counts, item) => counts.set(item.reaction, (counts.get(item.reaction) ?? 0) + 1), new Map<string, number>()))
        .map(([reaction, count]) => ({ reaction, count })),
      row.reactions?.find((item) => item.visitor_id === viewerUserId)?.reaction ?? null
    );
    mapped.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      content: row.deleted_at ? "Комментарий удалён" : row.content,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      editedAt: row.edited_at?.toISOString() ?? null,
      deletedAt: row.deleted_at?.toISOString() ?? null,
      ownedByViewer: Boolean(viewerUserId && row.user_id === viewerUserId),
      reactionSummary: reactionSummary.summary,
      viewerReaction: reactionSummary.viewerReaction,
      author: {
        id: row.author.id,
        name: row.author.name,
        avatarUrl: resolveFeedAssetUrl(row.author.avatar),
        isVerified: row.author.isVerifiedAuthor
      },
      mediaUrl: resolveFeedAssetUrl(row.media_key ?? null),
      mediaName: row.media_name ?? null,
      replies: [],
      repliesCount: 0
    });
  }

  const roots: PublicFeedComment[] = [];
  for (const comment of mapped.values()) {
    if (comment.parentId && mapped.has(comment.parentId)) {
      mapped.get(comment.parentId)!.replies.push(comment);
      mapped.get(comment.parentId)!.repliesCount += 1;
      continue;
    }
    roots.push(comment);
  }

  const sortComments = (items: PublicFeedComment[]): PublicFeedComment[] => {
    items.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    return items.flatMap((item) => {
      item.replies = sortComments(item.replies);
      item.repliesCount = item.replies.length;
      return item.deletedAt && item.replies.length === 0 ? [] : [item];
    });
  };

  return sortComments(roots);
}
