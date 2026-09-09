export const SOCIAL_POST_AUDIENCES = ["PUBLIC", "FOLLOWERS", "PRIVATE"] as const;

export type SocialPostAudience = (typeof SOCIAL_POST_AUDIENCES)[number];

export function normalizeSocialPostAudience(value: unknown): SocialPostAudience {
  if (value === undefined || value === null || value === "") return "PUBLIC";
  return SOCIAL_POST_AUDIENCES.includes(value as SocialPostAudience)
    ? value as SocialPostAudience
    : "PRIVATE";
}

export function canViewSocialPost(params: {
  audience: unknown;
  authorUserId: string;
  viewerUserId?: string | null;
  followsAuthorProfile?: boolean;
}) {
  if (params.viewerUserId === params.authorUserId) return true;
  const audience = normalizeSocialPostAudience(params.audience);
  if (audience === "PUBLIC") return true;
  return audience === "FOLLOWERS" && Boolean(params.viewerUserId && params.followsAuthorProfile);
}

export function buildSocialPostAudienceWhere(params: {
  viewerUserId?: string | null;
  followedProfiles?: Array<{ user_id: string; profile_key: string }>;
}) {
  const followedProfiles = params.viewerUserId ? params.followedProfiles ?? [] : [];
  return {
    OR: [
      { audience: "PUBLIC" },
      ...(params.viewerUserId ? [{ user_id: params.viewerUserId }] : []),
      ...(followedProfiles.length ? [{ audience: "FOLLOWERS", OR: followedProfiles }] : [])
    ]
  };
}
