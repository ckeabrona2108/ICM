import { z } from "zod";
import { isPrismaPoolTimeoutError, isPrismaTableMissingError } from "@/lib/prisma-errors";

export const SOCIAL_REPORT_TARGET_TYPES = [
  "post",
  "release",
  "post_comment",
  "release_comment",
  "user"
] as const;

export const SOCIAL_REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "impersonation",
  "privacy",
  "illegal",
  "other"
] as const;

export const socialReportInputSchema = z.object({
  targetType: z.enum(SOCIAL_REPORT_TARGET_TYPES),
  targetId: z.string().uuid(),
  reason: z.enum(SOCIAL_REPORT_REASONS),
  details: z.string().trim().max(1000).optional().default("")
});

export type SocialReportInput = z.infer<typeof socialReportInputSchema>;

type BlockRow = { blocker_user_id: string; blocked_user_id: string };

export type SocialSafetyPrisma = {
  social_user_blocks: {
    count(args: unknown): Promise<number>;
    findMany(args: unknown): Promise<BlockRow[]>;
    upsert(args: unknown): Promise<{ id: string }>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  social_reports: {
    upsert(args: unknown): Promise<{ id: string; status: string }>;
  };
  user: { findUnique(args: unknown): Promise<{ id: string } | null> };
  artist_profile_posts: { findUnique(args: unknown): Promise<{ user_id: string } | null> };
  artist_profile_post_comments: { findUnique(args: unknown): Promise<{ user_id: string } | null> };
  release: { findUnique(args: unknown): Promise<{ userId: string } | null> };
  scene_release_comments: { findUnique(args: unknown): Promise<{ user_id: string } | null> };
  artist_profile_followers: { deleteMany(args: unknown): Promise<{ count: number }> };
  $transaction<T>(work: (tx: SocialSafetyPrisma) => Promise<T>): Promise<T>;
};

export class SocialInteractionBlockedError extends Error {
  constructor() {
    super("SOCIAL_INTERACTION_BLOCKED");
    this.name = "SocialInteractionBlockedError";
  }
}

export class SocialSafetyTargetNotFoundError extends Error {
  constructor() {
    super("SOCIAL_SAFETY_TARGET_NOT_FOUND");
    this.name = "SocialSafetyTargetNotFoundError";
  }
}

export class SocialSafetySelfActionError extends Error {
  constructor() {
    super("SOCIAL_SAFETY_SELF_ACTION");
    this.name = "SocialSafetySelfActionError";
  }
}

function blockPairWhere(firstUserId: string, secondUserId: string) {
  return {
    OR: [
      { blocker_user_id: firstUserId, blocked_user_id: secondUserId },
      { blocker_user_id: secondUserId, blocked_user_id: firstUserId }
    ]
  };
}

function isMissingSocialBlocksTable(error: unknown) {
  return isPrismaTableMissingError(error, "icecream.social_user_blocks");
}

function isUnavailableSocialBlocksStore(error: unknown) {
  return isMissingSocialBlocksTable(error) || isPrismaPoolTimeoutError(error);
}

export async function hasSocialBlockBetween(
  prisma: Pick<SocialSafetyPrisma, "social_user_blocks">,
  firstUserId: string,
  secondUserId: string
) {
  if (firstUserId === secondUserId) return false;
  try {
    return (await prisma.social_user_blocks.count({ where: blockPairWhere(firstUserId, secondUserId) })) > 0;
  } catch (error) {
    if (isUnavailableSocialBlocksStore(error)) return false;
    throw error;
  }
}

export async function assertSocialInteractionAllowed(
  prisma: Pick<SocialSafetyPrisma, "social_user_blocks">,
  actorUserId: string,
  targetUserId: string
) {
  if (await hasSocialBlockBetween(prisma, actorUserId, targetUserId)) {
    throw new SocialInteractionBlockedError();
  }
}

export async function listBlockedPeerIds(
  prisma: Pick<SocialSafetyPrisma, "social_user_blocks">,
  viewerUserId: string
) {
  let rows: BlockRow[];
  try {
    rows = await prisma.social_user_blocks.findMany({
      where: { OR: [{ blocker_user_id: viewerUserId }, { blocked_user_id: viewerUserId }] },
      select: { blocker_user_id: true, blocked_user_id: true }
    });
  } catch (error) {
    if (isUnavailableSocialBlocksStore(error)) return [];
    throw error;
  }
  return Array.from(new Set(rows.map((row) => row.blocker_user_id === viewerUserId
    ? row.blocked_user_id
    : row.blocker_user_id))).sort();
}

export async function blockSocialUser(prisma: SocialSafetyPrisma, blockerUserId: string, blockedUserId: string) {
  if (blockerUserId === blockedUserId) throw new SocialSafetySelfActionError();
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: blockedUserId }, select: { id: true } });
    if (!target) throw new SocialSafetyTargetNotFoundError();
    await tx.social_user_blocks.upsert({
      where: {
        blocker_user_id_blocked_user_id: {
          blocker_user_id: blockerUserId,
          blocked_user_id: blockedUserId
        }
      },
      update: {},
      create: { blocker_user_id: blockerUserId, blocked_user_id: blockedUserId }
    });
    await tx.artist_profile_followers.deleteMany({
      where: {
        OR: [
          { profile_user_id: blockerUserId, follower_user_id: blockedUserId },
          { profile_user_id: blockedUserId, follower_user_id: blockerUserId }
        ]
      }
    });
    return { blocked: true };
  });
}

export async function unblockSocialUser(
  prisma: Pick<SocialSafetyPrisma, "social_user_blocks">,
  blockerUserId: string,
  blockedUserId: string
) {
  if (blockerUserId === blockedUserId) throw new SocialSafetySelfActionError();
  await prisma.social_user_blocks.deleteMany({
    where: { blocker_user_id: blockerUserId, blocked_user_id: blockedUserId }
  });
  return { blocked: false };
}

async function resolveReportedUserId(prisma: SocialSafetyPrisma, input: SocialReportInput) {
  if (input.targetType === "user") {
    return (await prisma.user.findUnique({ where: { id: input.targetId }, select: { id: true } }))?.id ?? null;
  }
  if (input.targetType === "post") {
    return (await prisma.artist_profile_posts.findUnique({ where: { id: input.targetId }, select: { user_id: true } }))?.user_id ?? null;
  }
  if (input.targetType === "post_comment") {
    return (await prisma.artist_profile_post_comments.findUnique({ where: { id: input.targetId }, select: { user_id: true } }))?.user_id ?? null;
  }
  if (input.targetType === "release") {
    return (await prisma.release.findUnique({ where: { id: input.targetId }, select: { userId: true } }))?.userId ?? null;
  }
  return (await prisma.scene_release_comments.findUnique({ where: { id: input.targetId }, select: { user_id: true } }))?.user_id ?? null;
}

export async function createSocialReport(
  prisma: SocialSafetyPrisma,
  reporterUserId: string,
  rawInput: SocialReportInput
) {
  const input = socialReportInputSchema.parse(rawInput);
  const reportedUserId = await resolveReportedUserId(prisma, input);
  if (!reportedUserId) throw new SocialSafetyTargetNotFoundError();
  if (reportedUserId === reporterUserId) throw new SocialSafetySelfActionError();
  return prisma.social_reports.upsert({
    where: {
      reporter_user_id_target_type_target_id: {
        reporter_user_id: reporterUserId,
        target_type: input.targetType,
        target_id: input.targetId
      }
    },
    update: { reason: input.reason, details: input.details || null, status: "pending" },
    create: {
      reporter_user_id: reporterUserId,
      reported_user_id: reportedUserId,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason,
      details: input.details || null
    },
    select: { id: true, status: true }
  });
}
