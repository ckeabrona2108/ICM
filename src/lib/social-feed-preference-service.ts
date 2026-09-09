import { z } from "zod";
import { isPrismaPoolTimeoutError, isPrismaTableMissingError } from "@/lib/prisma-errors";

const uuid = z.string().uuid();

export const socialFeedPreferenceInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("hide"), targetType: z.enum(["post", "release"]), targetId: uuid }),
  z.object({ action: z.literal("mute"), targetType: z.literal("user"), targetId: uuid })
]);

export type SocialFeedPreferenceInput = z.infer<typeof socialFeedPreferenceInputSchema>;

type PreferenceRow = {
  action: string;
  target_type: string;
  target_id: string;
};

export type SocialFeedPreferencePrisma = {
  social_feed_preferences: {
    findMany(args: unknown): Promise<PreferenceRow[]>;
    upsert(args: unknown): Promise<{ id: string }>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  user: { findUnique(args: unknown): Promise<{ id: string } | null> };
  artist_profile_posts: { findUnique(args: unknown): Promise<{ id: string } | null> };
  release: { findUnique(args: unknown): Promise<{ id: string } | null> };
};

export class SocialFeedPreferenceTargetNotFoundError extends Error {}
export class SocialFeedPreferenceSelfActionError extends Error {}

function isMissingSocialFeedPreferencesTable(error: unknown) {
  return isPrismaTableMissingError(error, "icecream.social_feed_preferences");
}

function isUnavailableSocialFeedPreferencesStore(error: unknown) {
  return isMissingSocialFeedPreferencesTable(error) || isPrismaPoolTimeoutError(error);
}

async function assertPreferenceTarget(
  prisma: SocialFeedPreferencePrisma,
  viewerUserId: string,
  input: SocialFeedPreferenceInput
) {
  if (input.action === "mute") {
    if (input.targetId === viewerUserId) throw new SocialFeedPreferenceSelfActionError();
    if (!await prisma.user.findUnique({ where: { id: input.targetId }, select: { id: true } })) {
      throw new SocialFeedPreferenceTargetNotFoundError();
    }
    return;
  }
  const target = input.targetType === "post"
    ? await prisma.artist_profile_posts.findUnique({ where: { id: input.targetId }, select: { id: true } })
    : await prisma.release.findUnique({ where: { id: input.targetId }, select: { id: true } });
  if (!target) throw new SocialFeedPreferenceTargetNotFoundError();
}

export async function listSocialFeedPreferences(
  prisma: SocialFeedPreferencePrisma,
  viewerUserId: string
) {
  let rows: PreferenceRow[];
  try {
    rows = await prisma.social_feed_preferences.findMany({
      where: { viewer_user_id: viewerUserId },
      select: { action: true, target_type: true, target_id: true }
    });
  } catch (error) {
    if (isUnavailableSocialFeedPreferencesStore(error)) {
      return { hiddenPostIds: [], hiddenReleaseIds: [], mutedUserIds: [] };
    }
    throw error;
  }
  return {
    hiddenPostIds: rows.filter((row) => row.action === "hide" && row.target_type === "post").map((row) => row.target_id).sort(),
    hiddenReleaseIds: rows.filter((row) => row.action === "hide" && row.target_type === "release").map((row) => row.target_id).sort(),
    mutedUserIds: rows.filter((row) => row.action === "mute" && row.target_type === "user").map((row) => row.target_id).sort()
  };
}

export async function setSocialFeedPreference(
  prisma: SocialFeedPreferencePrisma,
  viewerUserId: string,
  rawInput: SocialFeedPreferenceInput
) {
  const input = socialFeedPreferenceInputSchema.parse(rawInput);
  await assertPreferenceTarget(prisma, viewerUserId, input);
  await prisma.social_feed_preferences.upsert({
    where: {
      viewer_user_id_action_target_type_target_id: {
        viewer_user_id: viewerUserId,
        action: input.action,
        target_type: input.targetType,
        target_id: input.targetId
      }
    },
    update: {},
    create: {
      viewer_user_id: viewerUserId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId
    }
  });
  return { active: true as const };
}

export async function removeSocialFeedPreference(
  prisma: SocialFeedPreferencePrisma,
  viewerUserId: string,
  rawInput: SocialFeedPreferenceInput
) {
  const input = socialFeedPreferenceInputSchema.parse(rawInput);
  await prisma.social_feed_preferences.deleteMany({
    where: {
      viewer_user_id: viewerUserId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId
    }
  });
  return { active: false as const };
}
