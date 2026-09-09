import { isAnyPrismaTableMissingError, isPrismaConnectionError, isPrismaPoolTimeoutError } from "@/lib/prisma-errors";

const FEED_REACTION_TABLES = [
  "icecream.artist_profile_post_likes",
  "icecream.artist_profile_post_comment_likes",
  "icecream.scene_release_likes",
  "icecream.scene_release_comment_likes",
  "icecream.social_user_blocks",
  "icecream.social_notification_outbox",
  "icecream.ai_user_notifications"
] as const;

export type FeedReactionErrorResponse = {
  error: string;
  status: number;
};

export function resolveFeedReactionErrorResponse(error: unknown): FeedReactionErrorResponse | null {
  if (isAnyPrismaTableMissingError(error, [...FEED_REACTION_TABLES])) {
    return { error: "Реакции временно недоступны", status: 503 };
  }

  if (isPrismaConnectionError(error) || isPrismaPoolTimeoutError(error)) {
    return { error: "Реакции временно недоступны", status: 503 };
  }

  return null;
}
