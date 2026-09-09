import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import {
  buildArtistProfileSlug,
  buildPersonalProfileSlug,
  normalizeArtistProfileKey,
  parseArtistProfileUserId,
  PERSONAL_ARTIST_PROFILE_KEY,
  sanitizeArtistProfileSlugSegment
} from "@/lib/artist-profile-shared";
import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import { findLegacyUserById, isMissingCanonicalUserTable } from "@/lib/legacy-user-store";
import { normalizeArtistProfileType } from "@/lib/artist-profile-type";
import { listAnalyticsReleases } from "@/lib/analytics-query-service";
import { getReleaseCoverAsset, type ReleaseCoverSource } from "@/lib/release-cover";
import { resolveTrackAudioAsset } from "@/lib/release-media-asset";
import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import { buildReleaseDetailHref } from "@/lib/release-route";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";
import { isReleaseVisibleOnScene, normalizeSceneGenre } from "@/lib/scene-policy";
import {
  isLikelyLegalPersonName,
  resolveSceneArtistNames,
  resolveScenePreviewAudioUrl
} from "@/lib/scene-service";
import { getSceneShowcaseState, type SceneShowcaseState } from "@/lib/scene-showcase-state";
import {
  collaborationRoleLabel,
  collaborationProfileSchema,
  type CollaborationProfile,
  type CollaborationRole
} from "@/lib/collaboration";

const LEGACY_ARTIST_PROFILE_ROLE_KEY = "artistPublicProfile";
const ARTIST_PROFILES_ROLE_KEY = "artistPublicProfiles";
const DEFAULT_HIDDEN_ARTIST_SLUGS = new Set([
  "1-7a34f51fea1e43ed86e23a8bac736b50"
]);

export const FEATURED_ARTIST_USER_IDS = [
  "52fa9ac7-2403-4c8c-87f6-00da6dfe5320",
  "4bcc66de-05de-4f4f-aaef-acff7dac8268",
  "41497f8b-2e62-4f8d-8613-abadc15d9d5a",
  "f806af63-03ec-4d49-ac9d-0b62e551022d",
  "0593d21b-8de8-41c9-81c9-856e723dc371"
] as const;

const CURATED_PROFILE_TYPES = new Map<string, ArtistProfileSettings["profileType"]>([
  ["4bcc66de-05de-4f4f-aaef-acff7dac8268", "label"],
  ["41497f8b-2e62-4f8d-8613-abadc15d9d5a", "group"],
  ["f806af63-03ec-4d49-ac9d-0b62e551022d", "label"]
]);

function isMissingCanonicalReleaseTable(error: unknown): boolean {
  return isPrismaTableMissingError(error, "icecream.release") || isPrismaTableMissingError(error, "release");
}

function normalizeEmptyPublicUrl(value: unknown): unknown {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return /^(null|undefined)$/iu.test(normalized) ? "" : normalized;
}

function normalizeStoredPublicUrl(value: unknown): string {
  const normalized = normalizeEmptyPublicUrl(value);
  return typeof normalized === "string" && /^https:\/\//iu.test(normalized) ? normalized : "";
}

const optionalPublicUrl = z.preprocess(
  normalizeEmptyPublicUrl,
  z
    .string()
    .trim()
    .max(300)
    .refine((value) => !value || /^https:\/\//iu.test(value), "Ссылка должна начинаться с https://")
);

export const artistProfileInputSchema = z.object({
  enabled: z.boolean(),
  profileType: z.enum(["artist", "producer", "group", "label"]),
  displayName: z.string().trim().min(1, "Укажите имя артиста").max(100),
  slug: z.string().trim().max(80).regex(/^[a-z0-9-]*$/u, "Публичная ссылка может содержать только латинские буквы, цифры и дефисы").optional().default(""),
  bio: z.string().trim().max(800),
  city: z.string().trim().max(80),
  avatarKey: z.string().trim().max(500),
  backgroundKey: z.string().trim().max(500).optional().default(""),
  catalogReleaseIds: z.array(z.string().trim().min(1)),
  hideAllCommunityReleases: z.boolean().optional().default(false),
  hiddenCommunityReleaseIds: z.array(z.string().trim().min(1)).optional().default([]),
  autoPublishApprovedReleases: z.boolean().optional().default(false),
  websiteUrl: optionalPublicUrl,
  vkUrl: optionalPublicUrl,
  telegramUrl: optionalPublicUrl,
  collaboration: collaborationProfileSchema.default({
    open: false,
    role: "artist",
    genres: [],
    intents: [],
    preference: "hybrid",
    bio: ""
  })
});

export const artistProfileUpdateSchema = z.object({
  artistKey: z.string().trim().min(1),
  settings: artistProfileInputSchema
});

export type ArtistProfileSettings = z.infer<typeof artistProfileInputSchema>;

export interface UserArtistProfileSettings {
  artistKey: string;
  sourceName: string;
  releaseCount: number;
  profileType: "user" | "artist" | "producer" | "group" | "label";
  settings: ArtistProfileSettings;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  slug: string;
  adminHidden: boolean;
}

export interface UserArtistProfileReleaseOption {
  id: string;
  title: string;
  artistNames: string[];
  releaseDate: string;
}

export interface ArtistProfileReference {
  profileUserId: string;
  artistKey: string;
  slug: string;
}

export interface PublicArtistRelease {
  id: string;
  title: string;
  artistNames: string[];
  releaseDate: string;
  genre: string;
  coverUrl: string | null;
  coverUrlCandidates: string[];
  audioUrl: string | null;
  audioUrlCandidates: string[];
  audioSource: "preview" | "track" | null;
  playCount: number;
  isTopRelease: boolean;
  sceneHref: string | null;
}

export interface PublicArtistProfile {
  slug: string;
  artistKey: string;
  displayName: string;
  isVerified: boolean;
  profileType: ArtistProfileSettings["profileType"] | "user" | "producer";
  joinedAt: string | null;
  bio: string;
  city: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  websiteUrl: string;
  vkUrl: string;
  telegramUrl: string;
  collaboration: CollaborationProfile;
  releases: PublicArtistRelease[];
}

export interface PublicArtistProfileCard {
  userId: string;
  slug: string;
  displayName: string;
  profileType: ArtistProfileSettings["profileType"] | "producer";
  city: string;
  bio: string;
  genres: string[];
  avatarUrl: string | null;
  releaseCount: number;
  releaseTitles: string[];
  collaborationOpen: boolean;
  collaborationRole: CollaborationRole | null;
  displayRole: string | null;
  portfolio: Array<{
    id: string;
    title: string;
    releaseDate: string;
  }>;
  featuredRank: number | null;
}

type PublicArtistProfileDependencies = {
  resolveCoverUrl?: (source: ReleaseCoverSource) => Promise<string | null>;
  listReleaseAnalytics?: typeof listAnalyticsReleases;
  resolveTrackAudio?: typeof resolveTrackAudioAsset;
  resolvePreviewAudioUrl?: (state: SceneShowcaseState) => Promise<string | null>;
  includeReleaseAnalytics?: boolean;
};

function readUserVerifiedFlag(user: unknown): boolean {
  return Boolean(
    user
    && typeof user === "object"
    && "isVerifiedAuthor" in user
    && typeof (user as { isVerifiedAuthor?: unknown }).isVerifiedAuthor === "boolean"
    && (user as { isVerifiedAuthor: boolean }).isVerifiedAuthor
  );
}

export function resolvePublicArtistReleaseNames(params: {
  profileType: ArtistProfileSettings["profileType"];
  profileDisplayName: string;
  performer: string | null;
  roles: unknown;
  trackRoles?: unknown[];
  fallbackArtistName?: string | null;
}): string[] {
  const resolved = resolveSceneArtistNames(params);
  const profileName = params.profileDisplayName.trim();

  if (
    params.profileType === "artist"
    && profileName
    && !isLikelyLegalPersonName(profileName)
    && resolved.every(isLikelyLegalPersonName)
  ) {
    return [profileName];
  }

  return resolved;
}

type ArtistReleaseIdentity = {
  id: string;
  title: string;
  performer: string | null;
  roles: unknown;
};

type ArtistReleaseOption = ArtistReleaseIdentity & {
  title: string;
  date: Date;
};

type ArtistReleaseGroup<T extends ArtistReleaseIdentity> = {
  sourceName: string;
  releases: T[];
  profileType?: ArtistProfileSettings["profileType"];
};

const artistProfileUserReleaseSelect = {
  orderBy: [{ date: "desc" as const }, { startDate: "desc" as const }],
  select: {
    id: true,
    title: true,
    date: true,
    performer: true,
    status: true,
    confirmed: true,
    upc: true,
    roles: true
  }
};

const artistProfileUserSelect = {
  id: true,
  name: true,
  avatar: true,
  emailVerified: true,
  isVerifiedAuthor: true,
  personalSiteUrl: true,
  vk: true,
  telegram: true,
  artistProfileType: true,
  release: artistProfileUserReleaseSelect
} satisfies Prisma.userSelect;

const legacyArtistProfileUserSelect = {
  id: true,
  name: true,
  avatar: true,
  emailVerified: true,
  isVerifiedAuthor: true,
  personalSiteUrl: true,
  vk: true,
  telegram: true,
  release: artistProfileUserReleaseSelect
} satisfies Prisma.userSelect;

type ArtistProfileUserRecord = Prisma.userGetPayload<{ select: typeof artistProfileUserSelect }>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function defaultsForArtist(params: {
  sourceName: string;
  releaseIds: string[];
  profileType?: ArtistProfileSettings["profileType"];
  personalSiteUrl: string | null;
  vk: string | null;
  telegram: string | null;
}): ArtistProfileSettings {
  return {
    enabled: true,
    profileType: params.profileType ?? "artist",
    displayName: params.sourceName,
    slug: sanitizeArtistProfileSlugSegment(params.sourceName),
    bio: "",
    city: "",
    avatarKey: "",
    backgroundKey: "",
    catalogReleaseIds: params.releaseIds,
    hideAllCommunityReleases: false,
    hiddenCommunityReleaseIds: [],
    autoPublishApprovedReleases: false,
    websiteUrl: normalizeStoredPublicUrl(params.personalSiteUrl),
    vkUrl: normalizeStoredPublicUrl(params.vk),
    telegramUrl: normalizeStoredPublicUrl(params.telegram),
    collaboration: {
      open: false,
      role: params.profileType === "label" ? "label" : "artist",
      genres: [],
      intents: [],
      preference: "hybrid",
      bio: ""
    }
  };
}

function resolveArtistProfileSlugForUser(slugSegment: string | null | undefined, displayName: string, userId: string) {
  const base = sanitizeArtistProfileSlugSegment(slugSegment?.trim() || displayName);
  return buildArtistProfileSlug(base, userId);
}

function matchesArtistProfileSlug(
  slug: string,
  slugSegment: string | null | undefined,
  displayName: string,
  userId: string
) {
  const currentSlug = resolveArtistProfileSlugForUser(slugSegment, displayName, userId);
  const legacySlug = buildArtistProfileSlug(displayName, userId);
  return slug === currentSlug || slug === legacySlug;
}

function getStoredProfile(roles: unknown, artistKey: string): Record<string, unknown> | null {
  const root = asRecord(roles);
  const profiles = asRecord(root?.[ARTIST_PROFILES_ROLE_KEY]);
  const keyedProfile = asRecord(profiles?.[artistKey]);
  if (keyedProfile) return keyedProfile;

  const legacyProfile = asRecord(root?.[LEGACY_ARTIST_PROFILE_ROLE_KEY]);
  const legacyName = asString(legacyProfile?.displayName);
  return legacyName && normalizeArtistProfileKey(legacyName) === artistKey
    ? legacyProfile
    : null;
}

export function readArtistProfileSettings(
  roles: unknown,
  defaults: ArtistProfileSettings,
  artistKey = normalizeArtistProfileKey(defaults.displayName)
): ArtistProfileSettings {
  const stored = getStoredProfile(roles, artistKey);
  if (!stored) return defaults;
  const parsed = artistProfileInputSchema.safeParse({
    enabled: stored.enabled !== false,
    profileType: asString(stored.profileType) || defaults.profileType,
    displayName: asString(stored.displayName) || defaults.displayName,
    slug: sanitizeArtistProfileSlugSegment(asString(stored.slug) || defaults.slug),
    bio: asString(stored.bio),
    city: asString(stored.city),
    avatarKey: asString(stored.avatarKey),
    backgroundKey: asString(stored.backgroundKey),
    catalogReleaseIds: Array.isArray(stored.catalogReleaseIds)
      ? stored.catalogReleaseIds.filter((value): value is string => typeof value === "string")
      : defaults.catalogReleaseIds,
    hideAllCommunityReleases:
      typeof stored.hideAllCommunityReleases === "boolean"
        ? stored.hideAllCommunityReleases
        : defaults.hideAllCommunityReleases,
    hiddenCommunityReleaseIds: Array.isArray(stored.hiddenCommunityReleaseIds)
      ? stored.hiddenCommunityReleaseIds.filter((value): value is string => typeof value === "string")
      : defaults.hiddenCommunityReleaseIds,
    autoPublishApprovedReleases:
      typeof stored.autoPublishApprovedReleases === "boolean"
        ? stored.autoPublishApprovedReleases
        : defaults.autoPublishApprovedReleases,
    websiteUrl: normalizeStoredPublicUrl(stored.websiteUrl),
    vkUrl: normalizeStoredPublicUrl(stored.vkUrl),
    telegramUrl: normalizeStoredPublicUrl(stored.telegramUrl),
    collaboration: stored.collaboration
  });
  return parsed.success ? parsed.data : defaults;
}

export function withArtistProfileSettings(
  roles: unknown,
  artistKey: string,
  settings: ArtistProfileSettings
): Prisma.InputJsonValue {
  const root = asRecord(roles) ? structuredClone(roles as Record<string, unknown>) : {};
  const profiles = asRecord(root[ARTIST_PROFILES_ROLE_KEY])
    ? structuredClone(root[ARTIST_PROFILES_ROLE_KEY] as Record<string, unknown>)
    : {};
  const existing = asRecord(profiles[artistKey]);
  profiles[artistKey] = {
    ...settings,
    ...(typeof existing?.adminHidden === "boolean"
      ? { adminHidden: existing.adminHidden }
      : {})
  };
  root[ARTIST_PROFILES_ROLE_KEY] = profiles;
  return root as Prisma.InputJsonValue;
}

export function isCommunityReleaseVisible(
  settings: Pick<ArtistProfileSettings, "catalogReleaseIds" | "hideAllCommunityReleases" | "hiddenCommunityReleaseIds">,
  releaseId: string
): boolean {
  if (!settings.catalogReleaseIds.includes(releaseId)) return false;
  if (settings.hideAllCommunityReleases) return false;
  return !settings.hiddenCommunityReleaseIds.includes(releaseId);
}

function isArtistProfileAdminHidden(roles: unknown, artistKey: string, slug: string): boolean {
  const stored = getStoredProfile(roles, artistKey);
  if (typeof stored?.adminHidden === "boolean") return stored.adminHidden;
  return DEFAULT_HIDDEN_ARTIST_SLUGS.has(slug);
}

function withArtistProfileAdminVisibility(
  roles: unknown,
  artistKey: string,
  hidden: boolean
): Prisma.InputJsonValue {
  const root = asRecord(roles) ? structuredClone(roles as Record<string, unknown>) : {};
  const profiles = asRecord(root[ARTIST_PROFILES_ROLE_KEY])
    ? structuredClone(root[ARTIST_PROFILES_ROLE_KEY] as Record<string, unknown>)
    : {};
  const existing = asRecord(profiles[artistKey]) ?? getStoredProfile(roles, artistKey) ?? {};
  profiles[artistKey] = { ...existing, adminHidden: hidden };
  root[ARTIST_PROFILES_ROLE_KEY] = profiles;
  return root as Prisma.InputJsonValue;
}

function groupReleasesByArtist<T extends ArtistReleaseIdentity>(
  releases: T[],
  fallbackArtistName?: string | null
): Map<string, ArtistReleaseGroup<T>> {
  const groups = new Map<string, ArtistReleaseGroup<T>>();
  for (const release of releases) {
    for (const sourceName of resolveSceneArtistNames({
      ...release,
      fallbackArtistName
    })) {
      const artistKey = normalizeArtistProfileKey(sourceName);
      const existing = groups.get(artistKey);
      if (existing) {
        existing.releases.push(release);
      } else {
        groups.set(artistKey, { sourceName, releases: [release] });
      }
    }
  }
  return groups;
}

function buildUserArtistGroups<T extends ArtistReleaseIdentity>(params: {
  userId: string;
  userName: string;
  artistProfileType?: unknown;
  releases: T[];
}): Map<string, ArtistReleaseGroup<T>> {
  const profileType = CURATED_PROFILE_TYPES.get(params.userId)
    ?? normalizeArtistProfileType(params.artistProfileType);
  if (profileType === "artist" || profileType === "producer") {
    return groupReleasesByArtist(params.releases, params.userName);
  }

  const sourceName = params.userName.trim()
    || resolveSceneArtistNames({
      ...params.releases[0]!,
      fallbackArtistName: params.userName
    })[0]
    || "ICECREAMMUSIC";
  return new Map<string, ArtistReleaseGroup<T>>([[normalizeArtistProfileKey(sourceName), {
    sourceName,
    releases: params.releases,
    profileType
  }]]);
}

async function getReleasePlayCounts(prisma: PrismaClient, releaseIds: string[]) {
  const delegate = (prisma as PrismaClient & {
    scene_release_plays?: PrismaClient["scene_release_plays"];
  }).scene_release_plays;
  if (!delegate || releaseIds.length === 0) return new Map<string, number>();

  try {
    const rows = await delegate.groupBy({
      by: ["release_id"],
      where: { release_id: { in: releaseIds } },
      _count: { _all: true }
    });
    return new Map(rows.map((row) => [row.release_id, row._count._all]));
  } catch (error) {
    console.warn("[artist-profile] Play counter is unavailable", error);
    return new Map<string, number>();
  }
}

function resolveAvatarUrl(userId: string, avatar: string | null): string | null {
  const value = avatar?.trim();
  if (!value) return null;
  if (/^https?:\/\//iu.test(value)) return value;
  if (/^[a-z0-9]{2,8}$/iu.test(value.replace(/^\./u, ""))) {
    return buildStoredFileRouteUrl(`avatars/${userId}.${value.replace(/^\./u, "")}`);
  }
  return buildStoredFileRouteUrl(value);
}

function resolveProfileAvatarUrl(
  userId: string,
  profileAvatar: string | null,
  userAvatar: string | null
): string | null {
  return resolveAvatarUrl(userId, profileAvatar) ?? resolveAvatarUrl(userId, userAvatar);
}

async function loadArtistProfileUser(prisma: PrismaClient, userId: string): Promise<ArtistProfileUserRecord | null> {
  try {
    return await prisma.user.findUnique({ where: { id: userId }, select: artistProfileUserSelect });
  } catch (error) {
    if (isMissingCanonicalUserTable(error)) {
      const legacyUser = await findLegacyUserById(prisma, userId);
      const legacyReleases = await prisma.release.findMany({
        where: { userId },
        ...artistProfileUserReleaseSelect
      }).catch(() => []);
      return legacyUser
        ? ({
            id: legacyUser.id,
            name: legacyUser.name,
            avatar: legacyUser.avatar,
            emailVerified: null,
            isVerifiedAuthor: false,
            personalSiteUrl: legacyUser.personalSiteUrl,
            vk: legacyUser.vk,
            telegram: legacyUser.telegram,
            artistProfileType: legacyUser.artistProfileType,
            release: legacyReleases
          } as ArtistProfileUserRecord)
        : null;
    }
    if (!/artistProfileType|column .* does not exist/iu.test(String(error))) throw error;
    const legacyUser = await prisma.user.findUnique({
      where: { id: userId },
      select: legacyArtistProfileUserSelect
    });
    return legacyUser ? ({ ...legacyUser, artistProfileType: null } as unknown as ArtistProfileUserRecord) : null;
  }
}

function resolvePersonalFeedProfileType(value: unknown): "user" | "producer" {
  return normalizeArtistProfileType(value) === "producer" ? "producer" : "user";
}

export async function getUserArtistProfileSettings(prisma: PrismaClient, userId: string) {
  const user = await loadArtistProfileUser(prisma, userId);
  if (!user) return null;
  return buildUserArtistProfileSettingsPayload(user);
}

function buildUserArtistProfileSettingsPayload(
  user: ArtistProfileUserRecord,
  artistKeys?: Set<string> | null
) {
  const approvedReleases = user.release
    .filter((release) => shouldTreatReleaseAsApproved(release))
    .sort((left, right) => right.date.getTime() - left.date.getTime());

  const groups = buildUserArtistGroups({
    userId: user.id,
    userName: user.name,
    artistProfileType: user.artistProfileType,
    releases: user.release
  });

  const profiles = Array.from(groups.entries())
    .filter(([artistKey]) => !artistKeys || artistKeys.has(artistKey))
    .map(
    ([artistKey, group]) => {
      const defaults = defaultsForArtist({
        ...user,
        sourceName: group.sourceName,
        releaseIds: group.releases.map((release) => release.id),
        profileType: group.profileType
      });
      const sourceRelease = group.releases.find((release) => getStoredProfile(release.roles, artistKey))
        ?? group.releases[0]!;
      const settings = readArtistProfileSettings(sourceRelease.roles, defaults, artistKey);
      const slug = resolveArtistProfileSlugForUser(settings.slug, group.sourceName, user.id);
      return {
        artistKey,
        sourceName: group.sourceName,
        releaseCount: settings.catalogReleaseIds.length,
        settings,
        avatarUrl: resolveProfileAvatarUrl(user.id, settings.avatarKey, user.avatar),
        backgroundUrl: resolveAvatarUrl(user.id, settings.backgroundKey),
        slug,
        adminHidden: isArtistProfileAdminHidden(sourceRelease.roles, artistKey, slug),
        profileType: settings.profileType
      } satisfies UserArtistProfileSettings & { profileType: "artist" | "producer" | "group" | "label" };
    }
  );

  const releases = Array.from(
    new Map(
      approvedReleases.map((release) => [release.id, {
        id: release.id,
        title: release.title,
        artistNames: resolveSceneArtistNames({ ...release, fallbackArtistName: user.name }),
        releaseDate: release.date.toISOString()
      } satisfies UserArtistProfileReleaseOption])
    ).values()
  );

  return { profiles, releases, canSave: profiles.length > 0 };
}

export async function getSingleUserArtistProfileSettings(
  prisma: PrismaClient,
  userId: string,
  artistKey: string
): Promise<UserArtistProfileSettings | null> {
  const user = await loadArtistProfileUser(prisma, userId);
  if (!user) return null;
  return buildUserArtistProfileSettingsPayload(user, new Set([artistKey])).profiles[0] ?? null;
}

export async function getUserArtistProfilesForRelease(
  prisma: PrismaClient,
  userId: string,
  releaseId: string
) {
  const user = await loadArtistProfileUser(prisma, userId);
  if (!user) return null;
  const groups = buildUserArtistGroups({
    userId: user.id,
    userName: user.name,
    artistProfileType: user.artistProfileType,
    releases: user.release
  });
  const matchedArtistKeys = new Set(
    Array.from(groups.entries())
      .filter(([, group]) => group.releases.some((release) => release.id === releaseId))
      .map(([artistKey]) => artistKey)
  );
  return buildUserArtistProfileSettingsPayload(user, matchedArtistKeys);
}

export async function resolveArtistProfileReferenceBySlug(
  prisma: PrismaClient,
  slug: string
): Promise<ArtistProfileReference | null> {
  const profileUserId = parseArtistProfileUserId(slug);
  if (!profileUserId) return null;

  const user = await prisma.user.findUnique({
    where: { id: profileUserId },
    select: { id: true, name: true }
  }).catch(async (error) => {
    if (!isMissingCanonicalUserTable(error)) throw error;
    const legacyUser = await findLegacyUserById(prisma, profileUserId);
    return legacyUser ? { id: legacyUser.id, name: legacyUser.name } : null;
  });
  if (!user) return null;

  const personalSlug = buildPersonalProfileSlug(user.name, user.id);
  if (slug === personalSlug) {
    return {
      profileUserId: user.id,
      artistKey: PERSONAL_ARTIST_PROFILE_KEY,
      slug: personalSlug
    };
  }

  const settings = await getUserArtistProfileSettings(prisma, user.id);
  const profile = settings?.profiles.find(
    (candidate) => matchesArtistProfileSlug(slug, candidate.settings.slug, candidate.sourceName, user.id)
      && candidate.settings.enabled
      && !candidate.adminHidden
  );
  if (!profile) return null;

  return {
    profileUserId: user.id,
    artistKey: profile.artistKey,
    slug: profile.slug
  };
}

function validateProfileCatalog(
  profileType: ArtistProfileSettings["profileType"],
  artistKey: string,
  selectedReleases: ArtistReleaseOption[],
  fallbackArtistName: string
) {
  const artistKeys = new Set(
    selectedReleases.flatMap((release) => resolveSceneArtistNames({ ...release, fallbackArtistName }))
      .map(normalizeArtistProfileKey)
  );
  if (
    profileType === "artist" &&
    selectedReleases.some((release) => !resolveSceneArtistNames({ ...release, fallbackArtistName })
      .some((name) => normalizeArtistProfileKey(name) === artistKey))
  ) {
    throw new Error("ARTIST_PROFILE_OWN_RELEASES_ONLY");
  }
  if (profileType === "group" && artistKeys.size > 10) {
    throw new Error("ARTIST_PROFILE_GROUP_LIMIT");
  }
}

export async function saveUserArtistProfileSettings(
  prisma: PrismaClient,
  userId: string,
  artistKey: string,
  settings: ArtistProfileSettings
) {
  const normalizedKey = normalizeArtistProfileKey(artistKey);
  let owner: { name: string; artistProfileType: unknown } | null;
  try {
    owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, artistProfileType: true }
    });
  } catch (error) {
    if (!/artistProfileType|column .* does not exist/iu.test(String(error))) throw error;
    const legacyOwner = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    owner = legacyOwner ? { ...legacyOwner, artistProfileType: null } : null;
  }
  if (!owner) throw new Error("ARTIST_PROFILE_RELEASE_REQUIRED");
  const releases = await prisma.release.findMany({
    where: { userId },
    select: { id: true, title: true, date: true, performer: true, roles: true }
  });
  const matchingReleases = buildUserArtistGroups({
    userId,
    userName: owner.name,
    artistProfileType: owner.artistProfileType,
    releases
  }).get(normalizedKey)?.releases ?? [];
  if (matchingReleases.length === 0) throw new Error("ARTIST_PROFILE_RELEASE_REQUIRED");

  const selectedIds = new Set(settings.catalogReleaseIds);
  const selectedReleases = releases.filter((release) => selectedIds.has(release.id));
  if (selectedReleases.length !== selectedIds.size) {
    throw new Error("ARTIST_PROFILE_RELEASE_NOT_OWNED");
  }
  validateProfileCatalog(settings.profileType, normalizedKey, selectedReleases, owner.name);
  if (settings.avatarKey && !settings.avatarKey.startsWith(`artist-profiles/${userId}/`)) {
    throw new Error("ARTIST_PROFILE_INVALID_AVATAR");
  }
  if (settings.backgroundKey && !settings.backgroundKey.startsWith(`artist-profiles/${userId}/`)) {
    throw new Error("ARTIST_PROFILE_INVALID_BACKGROUND");
  }
  const normalizedSettings = {
    ...settings,
    slug: sanitizeArtistProfileSlugSegment(settings.slug),
    catalogReleaseIds: Array.from(selectedIds),
    hiddenCommunityReleaseIds: Array.from(
      new Set(settings.hiddenCommunityReleaseIds.filter((releaseId) => selectedIds.has(releaseId)))
    )
  };

  await prisma.$transaction(
    matchingReleases.map((release) => prisma.release.update({
      where: { id: release.id },
      data: { roles: withArtistProfileSettings(release.roles, normalizedKey, normalizedSettings) }
    }))
  );

  const sourceName = resolveSceneArtistNames({ ...matchingReleases[0]!, fallbackArtistName: owner.name })
    .find((name) => normalizeArtistProfileKey(name) === normalizedKey)
    ?? owner.name;
  return {
    artistKey: normalizedKey,
    sourceName,
    releaseCount: normalizedSettings.catalogReleaseIds.length,
    profileType: normalizedSettings.profileType,
    settings: normalizedSettings,
    avatarUrl: resolveAvatarUrl(userId, normalizedSettings.avatarKey),
    slug: resolveArtistProfileSlugForUser(normalizedSettings.slug, sourceName, userId),
    adminHidden: isArtistProfileAdminHidden(
      matchingReleases[0]!.roles,
      normalizedKey,
      resolveArtistProfileSlugForUser(normalizedSettings.slug, sourceName, userId)
    ),
    backgroundUrl: resolveAvatarUrl(userId, normalizedSettings.backgroundKey)
  } satisfies UserArtistProfileSettings;
}

export async function setAdminArtistProfileVisibility(
  prisma: PrismaClient,
  userId: string,
  artistKey: string,
  hidden: boolean
) {
  const normalizedKey = normalizeArtistProfileKey(artistKey);
  let owner: { name: string; artistProfileType: unknown } | null;
  try {
    owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, artistProfileType: true }
    });
  } catch (error) {
    if (!/artistProfileType|column .* does not exist/iu.test(String(error))) throw error;
    const legacyOwner = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    owner = legacyOwner ? { ...legacyOwner, artistProfileType: null } : null;
  }
  if (!owner) throw new Error("ARTIST_PROFILE_RELEASE_REQUIRED");
  const releases = await prisma.release.findMany({
    where: { userId },
    select: { id: true, title: true, performer: true, roles: true }
  });
  const matchingReleases = buildUserArtistGroups({
    userId,
    userName: owner.name,
    artistProfileType: owner.artistProfileType,
    releases
  }).get(normalizedKey)?.releases ?? [];
  if (matchingReleases.length === 0) throw new Error("ARTIST_PROFILE_RELEASE_REQUIRED");

  await prisma.$transaction(
    matchingReleases.map((release) => prisma.release.update({
      where: { id: release.id },
      data: { roles: withArtistProfileAdminVisibility(release.roles, normalizedKey, hidden) }
    }))
  );
  return { artistKey: normalizedKey, adminHidden: hidden };
}

export async function getPublicArtistProfile(
  prisma: PrismaClient,
  slug: string,
  now = new Date(),
  dependencies: PublicArtistProfileDependencies = {}
): Promise<PublicArtistProfile | null> {
  const userId = parseArtistProfileUserId(slug);
  if (!userId) return null;
  const userSelect = {
    id: true,
    name: true,
    avatar: true,
    emailVerified: true,
    personalSiteUrl: true,
    vk: true,
    telegram: true,
    artistProfileType: true,
    release: {
      orderBy: [{ date: "desc" }, { startDate: "desc" }],
      select: {
        id: true,
        title: true,
        date: true,
        startDate: true,
        preview: true,
        performer: true,
        genre: true,
        status: true,
        confirmed: true,
        upc: true,
        roles: true,
        track: {
          select: { id: true, title: true, index: true, track: true, roles: true }
        }
      }
    }
  } satisfies Prisma.userSelect;
  const legacyUserSelect = {
    id: true,
    name: true,
    avatar: true,
    emailVerified: true,
    personalSiteUrl: true,
    vk: true,
    telegram: true,
    release: userSelect.release
  } satisfies Prisma.userSelect;
  const minimalUserSelect = {
    id: true,
    name: true,
    avatar: true,
    emailVerified: true,
    personalSiteUrl: true,
    vk: true,
    telegram: true,
    artistProfileType: true
  } satisfies Prisma.userSelect;
  let user: Prisma.userGetPayload<{ select: typeof userSelect }> | null;
  try {
    user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  } catch (error) {
    if (isMissingCanonicalUserTable(error)) {
      const legacyUser = await findLegacyUserById(prisma, userId);
      user = legacyUser ? ({
        id: legacyUser.id,
        name: legacyUser.name,
        avatar: legacyUser.avatar,
        emailVerified: null,
        personalSiteUrl: legacyUser.personalSiteUrl,
        vk: legacyUser.vk,
        telegram: legacyUser.telegram,
        artistProfileType: legacyUser.artistProfileType,
        release: []
      } as unknown as typeof user) : null;
    } else if (isMissingCanonicalReleaseTable(error)) {
      const minimalUser = await prisma.user.findUnique({
        where: { id: userId },
        select: minimalUserSelect
      }).catch(async (fallbackError) => {
        if (isMissingCanonicalUserTable(fallbackError)) {
          const legacyUser = await findLegacyUserById(prisma, userId);
          return legacyUser ? {
            id: legacyUser.id,
            name: legacyUser.name,
            avatar: legacyUser.avatar,
            emailVerified: null,
            personalSiteUrl: legacyUser.personalSiteUrl,
            vk: legacyUser.vk,
            telegram: legacyUser.telegram,
            artistProfileType: legacyUser.artistProfileType
          } : null;
        }
        if (!/artistProfileType|column .* does not exist/iu.test(String(fallbackError))) throw fallbackError;
        return await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            avatar: true,
            emailVerified: true,
            personalSiteUrl: true,
            vk: true,
            telegram: true
          }
        });
      });
      user = minimalUser
        ? ({ ...minimalUser, release: [], artistProfileType: "artistProfileType" in minimalUser ? minimalUser.artistProfileType ?? null : null } as unknown as typeof user)
        : null;
    } else {
      if (!/artistProfileType|column .* does not exist/iu.test(String(error))) throw error;
      const legacyUser = await prisma.user.findUnique({
        where: { id: userId },
        select: legacyUserSelect
      }).catch(async (fallbackError) => {
        if (isMissingCanonicalUserTable(fallbackError)) {
          const legacyUserRow = await findLegacyUserById(prisma, userId);
          return legacyUserRow ? ({
            id: legacyUserRow.id,
            name: legacyUserRow.name,
            avatar: legacyUserRow.avatar,
            emailVerified: null,
            personalSiteUrl: legacyUserRow.personalSiteUrl,
            vk: legacyUserRow.vk,
            telegram: legacyUserRow.telegram,
            release: []
          } as Prisma.userGetPayload<{ select: typeof legacyUserSelect }>) : null;
        }
        throw fallbackError;
      });
      user = legacyUser ? ({ ...legacyUser, artistProfileType: null } as unknown as typeof user) : null;
    }
  }
  if (!user) return null;

  const personalSlug = buildPersonalProfileSlug(user.name, user.id);
  if (slug === personalSlug) {
    return {
      slug: personalSlug,
      artistKey: PERSONAL_ARTIST_PROFILE_KEY,
      displayName: user.name,
      isVerified: readUserVerifiedFlag(user),
      profileType: resolvePersonalFeedProfileType(user.artistProfileType),
      joinedAt: user.emailVerified?.toISOString() ?? null,
      bio: "",
      city: "",
      avatarUrl: resolveProfileAvatarUrl(user.id, null, user.avatar),
      backgroundUrl: null,
      websiteUrl: normalizeStoredPublicUrl(user.personalSiteUrl),
      vkUrl: normalizeStoredPublicUrl(user.vk),
      telegramUrl: normalizeStoredPublicUrl(user.telegram),
      collaboration: {
        open: false,
        role: resolvePersonalFeedProfileType(user.artistProfileType) === "producer" ? "producer" : "artist",
        genres: [],
        intents: [],
        preference: "hybrid",
        bio: ""
      },
      releases: []
    };
  }

  if (user.release.length === 0) return null;

  const profileEntry = Array.from(buildUserArtistGroups({
    userId: user.id,
    userName: user.name,
    artistProfileType: user.artistProfileType,
    releases: user.release
  }).entries()).find(([artistKey, group]) => {
    const defaults = defaultsForArtist({
      ...user,
      sourceName: group.sourceName,
      releaseIds: group.releases.map((release) => release.id),
      profileType: group.profileType
    });
    const sourceRelease = group.releases.find((release) => getStoredProfile(release.roles, artistKey))
      ?? group.releases[0];
    if (!sourceRelease) return false;
    const settings = readArtistProfileSettings(sourceRelease.roles, defaults, artistKey);
    return matchesArtistProfileSlug(slug, settings.slug, group.sourceName, user.id);
  });
  if (!profileEntry) return null;
  const [artistKey, group] = profileEntry;
  const defaults = defaultsForArtist({
    ...user,
    sourceName: group.sourceName,
    releaseIds: group.releases.map((release) => release.id),
    profileType: group.profileType
  });
  const sourceRelease = group.releases.find((release) => getStoredProfile(release.roles, artistKey))
    ?? group.releases[0]!;
  if (isArtistProfileAdminHidden(sourceRelease.roles, artistKey, slug)) return null;
  const settings = readArtistProfileSettings(sourceRelease.roles, defaults, artistKey);
  if (!settings.enabled) return null;

  const catalogIds = new Set(settings.catalogReleaseIds);
  const catalogReleases = user.release
    .filter((release) => catalogIds.has(release.id))
    .filter((release) => release.date <= now && shouldTreatReleaseAsApproved(release));
  const releaseIds = catalogReleases.map((release) => release.id);
  const playCounts = await getReleasePlayCounts(prisma, releaseIds);
  const analyticsCounts = new Map<string, number>();
  const shouldUseReleaseAnalytics = dependencies.includeReleaseAnalytics !== false;
  if (shouldUseReleaseAnalytics) {
    try {
      const analyticsRows = await (dependencies.listReleaseAnalytics ?? listAnalyticsReleases)(prisma, {
        user_id: user.id,
        days: 365
      });
      for (const row of analyticsRows) {
        if (releaseIds.includes(row.release_id)) analyticsCounts.set(row.release_id, row.streams);
      }
    } catch (error) {
      console.warn("[artist-profile] Analytics counter is unavailable", error);
    }
  }

  const mappedReleases = await Promise.all(catalogReleases.map(async (release) => {
    const coverSource = {
      id: release.id,
      preview: release.preview,
      roles: release.roles,
      userId: user.id,
      title: release.title
    } satisfies ReleaseCoverSource;
    const coverAsset = dependencies.resolveCoverUrl
      ? await dependencies.resolveCoverUrl(coverSource).then((url) => ({
          url,
          candidateUrls: url ? [url] : []
        }))
      : await getReleaseCoverAsset(coverSource);
    const coverUrlCandidates = Array.from(new Set(
      [coverAsset.url, ...coverAsset.candidateUrls]
        .filter((url): url is string => Boolean(url))
    ));
    const previewAudioUrl = await (dependencies.resolvePreviewAudioUrl ?? resolveScenePreviewAudioUrl)(getSceneShowcaseState(release.roles));
    const releaseTracks = release.track ?? [];
    const firstTrack = releaseTracks.slice().sort((left, right) => left.index - right.index)[0] ?? null;
    const firstTrackRoles = firstTrack?.roles && typeof firstTrack.roles === "object" && !Array.isArray(firstTrack.roles)
      ? firstTrack.roles as Record<string, unknown>
      : {};
    const releaseRoles = asRecord(release.roles);
    const submissionData = asRecord(releaseRoles?.submissionData);
    const submissionTracks = Array.isArray(submissionData?.tracks)
      ? submissionData.tracks.map(asRecord).filter((track): track is Record<string, unknown> => Boolean(track))
      : [];
    const submissionTrack = firstTrack
      ? submissionTracks.find((track) => asString(track.id) === firstTrack.id)
        ?? submissionTracks[Math.max(0, firstTrack.index - 1)]
        ?? null
      : null;
    const trackAudio = firstTrack
      ? await (dependencies.resolveTrackAudio ?? resolveTrackAudioAsset)({
          releaseId: release.id,
          releaseTitle: release.title,
          trackId: firstTrack.id,
          trackTitle: firstTrack.title,
          audioFile: firstTrackRoles.audioFile ?? submissionTrack?.audioFile,
          audioUpload: firstTrackRoles.audioUpload ?? submissionTrack?.audioUpload,
          audioUrl: firstTrackRoles.audioUrl ?? submissionTrack?.audioUrl,
          audio: firstTrackRoles.audio ?? submissionTrack?.audio,
          track: firstTrack.track ?? submissionTrack?.track,
          preferImmediateUrl: true
        })
      : null;
    const audioUrlCandidates = Array.from(new Set(
      [previewAudioUrl, trackAudio?.url, ...(trackAudio?.candidateUrls ?? [])]
        .filter((url): url is string => Boolean(url))
    ));
    const audioUrl = audioUrlCandidates[0] ?? null;

    return {
      id: release.id,
      title: release.title,
      artistNames: resolvePublicArtistReleaseNames({
        profileType: settings.profileType,
        profileDisplayName: settings.displayName,
        performer: release.performer,
        roles: release.roles,
        trackRoles: (release.track ?? []).map((track) => track.roles),
        fallbackArtistName: user.name
      }),
      releaseDate: release.date.toISOString(),
      genre: normalizeSceneGenre(release.genre),
      coverUrl: coverUrlCandidates[0] ?? null,
      coverUrlCandidates,
      audioUrl,
      audioUrlCandidates,
      audioSource: (previewAudioUrl ? "preview" : audioUrl ? "track" : null) as PublicArtistRelease["audioSource"],
      playCount: analyticsCounts.get(release.id) ?? playCounts.get(release.id) ?? 0,
      isTopRelease: false,
      sceneHref: isReleaseVisibleOnScene({
        status: release.status,
        confirmed: release.confirmed,
        upc: release.upc,
        roles: release.roles,
        releaseDate: release.date
      }, now) ? buildReleaseDetailHref(release.id) : null
    };
  }));
  const topPlayCount = Math.max(0, ...mappedReleases.map((release) => release.playCount));
  const releases = mappedReleases.map((release) => ({
    ...release,
    isTopRelease: topPlayCount > 0 && release.playCount === topPlayCount
  }));

  return {
    slug,
    artistKey,
    displayName: settings.displayName,
    isVerified: readUserVerifiedFlag(user),
    profileType: settings.profileType,
    joinedAt: user.emailVerified?.toISOString() ?? null,
    bio: settings.bio,
    city: settings.city,
    avatarUrl: resolveProfileAvatarUrl(user.id, settings.avatarKey, user.avatar),
    backgroundUrl: resolveAvatarUrl(user.id, settings.backgroundKey),
    websiteUrl: settings.websiteUrl,
    vkUrl: settings.vkUrl,
    telegramUrl: settings.telegramUrl,
    collaboration: settings.collaboration,
    releases
  };
}

function artistSearchScore(card: PublicArtistProfileCard, query: string): number {
  if (!query) return card.releaseCount * 10;
  const normalize = (value: string | null | undefined) => value?.toLocaleLowerCase("ru-RU") ?? "";
  const name = normalize(card.displayName);
  const slug = normalize(card.slug);
  const city = normalize(card.city);
  const bio = normalize(card.bio);
  const type = normalize(card.profileType);
  const role = normalize(card.collaborationRole);
  const displayRole = normalize(card.displayRole);
  const genres = card.genres.map((genre) => normalize(genre));
  const releaseTitles = card.releaseTitles.map((title) => normalize(title));

  if (name === query) return 1_000;
  if (slug === query) return 960;
  if (name.startsWith(query)) return 820;
  if (slug.startsWith(query)) return 780;
  if (name.includes(query)) return 680;
  if (slug.includes(query)) return 640;
  if (releaseTitles.some((title) => title.startsWith(query))) return 520;
  if (releaseTitles.some((title) => title.includes(query))) return 420;
  if (genres.some((genre) => genre === query)) return 360;
  if (genres.some((genre) => genre.includes(query))) return 280;
  if (role === query || displayRole === query) return 260;
  if (role.includes(query) || displayRole.includes(query)) return 250;
  if (type.startsWith(query) || type.includes(query)) return 240;
  if (city.startsWith(query) || city.includes(query)) return 220;
  if (bio.includes(query)) return 140;
  return 0;
}

export function rankPublicArtistProfiles(
  cards: PublicArtistProfileCard[],
  rawQuery: string,
  limit = 15
): PublicArtistProfileCard[] {
  const query = rawQuery.trim().toLocaleLowerCase("ru-RU");
  return cards
    .map((card) => ({ card, score: artistSearchScore(card, query) }))
    .filter((item) => !query || item.score > 0)
    .sort((left, right) => (!query
      ? (left.card.featuredRank ?? Number.MAX_SAFE_INTEGER)
        - (right.card.featuredRank ?? Number.MAX_SAFE_INTEGER)
      : 0)
      || right.score - left.score
      || right.card.releaseCount - left.card.releaseCount
      || left.card.displayName.localeCompare(right.card.displayName, "ru"))
    .slice(0, Math.min(Math.max(limit, 1), 30))
    .map((item) => item.card);
}

export async function listPublicArtistProfiles(
  prisma: PrismaClient,
  options: {
    query?: string;
    limit?: number;
    now?: Date;
    featuredOnly?: boolean;
    profileType?: ArtistProfileSettings["profileType"] | null;
    collaborationRole?: CollaborationRole | null;
  } = {}
): Promise<PublicArtistProfileCard[]> {
  const now = options.now ?? new Date();
  const where = {
    ...(options.featuredOnly ? { id: { in: [...FEATURED_ARTIST_USER_IDS] } } : {}),
    release: { some: { date: { lte: now } } }
  };
  const releaseSelect: Prisma.releaseSelect = {
    id: true,
    title: true,
    date: true,
    performer: true,
    status: true,
    confirmed: true,
    roles: true
  };
  const userSelect: Prisma.userSelect = {
    id: true,
    name: true,
    avatar: true,
    personalSiteUrl: true,
    vk: true,
    telegram: true,
    artistProfileType: true,
    release: {
      where: { date: { lte: now } },
      orderBy: [{ date: "desc" }, { startDate: "desc" }],
      select: releaseSelect
    }
  };
  type PublicArtistUser = Prisma.userGetPayload<{ select: typeof userSelect }>;

  let users: PublicArtistUser[];
  try {
    users = await prisma.user.findMany({
      where,
      select: userSelect
    });
  } catch (error) {
    if (isMissingCanonicalUserTable(error) || isMissingCanonicalReleaseTable(error)) {
      return [];
    }
    // Keep artist search usable while a local database is on the pre-profile schema.
    console.warn("[artist-profile-service] artistProfileType is unavailable; using legacy artist profiles", error);
    const legacyUsers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        avatar: true,
        personalSiteUrl: true,
        vk: true,
        telegram: true,
        release: {
          where: { date: { lte: now } },
          orderBy: [{ date: "desc" }, { startDate: "desc" }],
          select: releaseSelect
        }
      }
    }).catch((fallbackError) => {
      if (isMissingCanonicalUserTable(fallbackError) || isMissingCanonicalReleaseTable(fallbackError)) {
        return [];
      }
      throw fallbackError;
    });
    users = legacyUsers.map((user) => ({ ...user, artistProfileType: null })) as unknown as PublicArtistUser[];
  }

  const cards: PublicArtistProfileCard[] = [];
  for (const user of users) {
    const approvedReleases = user.release.filter(shouldTreatReleaseAsApproved);
    for (const [artistKey, group] of buildUserArtistGroups({
      userId: user.id,
      userName: user.name,
      artistProfileType: user.artistProfileType,
      releases: approvedReleases
    })) {
      const defaults = defaultsForArtist({
        ...user,
        sourceName: group.sourceName,
        releaseIds: group.releases.map((release) => release.id),
        profileType: group.profileType
      });
      const sourceRelease = group.releases.find((release) => getStoredProfile(release.roles, artistKey))
        ?? group.releases[0];
      if (!sourceRelease) continue;
      const settings = readArtistProfileSettings(sourceRelease.roles, defaults, artistKey);
      const slug = resolveArtistProfileSlugForUser(settings.slug, group.sourceName, user.id);
      if (isArtistProfileAdminHidden(sourceRelease.roles, artistKey, slug)) continue;
      if (!settings.enabled) continue;
      const catalogIds = new Set(settings.catalogReleaseIds);
      const catalog = approvedReleases.filter((release) => catalogIds.has(release.id));
      if (catalog.length === 0) continue;
      const fallbackRole = settings.profileType === "producer"
        ? "producer"
        : settings.profileType === "label"
          ? "label"
          : settings.profileType === "artist"
            ? "artist"
            : null;
      const hasExplicitDiscoveryProfile = settings.collaboration.open
        || settings.collaboration.bio.trim().length > 0
        || settings.collaboration.genres.length > 0
        || settings.collaboration.intents.length > 0
        || settings.collaboration.role !== (fallbackRole ?? "artist");
      const collaborationRole = hasExplicitDiscoveryProfile ? settings.collaboration.role : fallbackRole;
      cards.push({
        userId: user.id,
        slug,
        displayName: settings.displayName,
        profileType: settings.profileType,
        city: settings.city,
        bio: settings.bio,
        genres: Array.from(new Set(catalog.map((release) => normalizeSceneGenre(release.genre)).filter(Boolean))),
        avatarUrl: resolveProfileAvatarUrl(user.id, settings.avatarKey, user.avatar),
        releaseCount: catalog.length,
        releaseTitles: catalog.slice(0, 4).map((release) => release.title),
        collaborationOpen: settings.collaboration.open,
        collaborationRole,
        displayRole: collaborationRole ? collaborationRoleLabel(collaborationRole) : null,
        portfolio: catalog.slice(0, 3).map((release) => ({
          id: release.id,
          title: release.title,
          releaseDate: release.date.toISOString()
        })),
        featuredRank: FEATURED_ARTIST_USER_IDS.indexOf(user.id as typeof FEATURED_ARTIST_USER_IDS[number]) >= 0
          ? FEATURED_ARTIST_USER_IDS.indexOf(user.id as typeof FEATURED_ARTIST_USER_IDS[number])
          : null
      });
    }
  }

  const filtered = cards.filter((card) => (!options.profileType || card.profileType === options.profileType)
    && (!options.collaborationRole || card.collaborationRole === options.collaborationRole));
  const ranked = rankPublicArtistProfiles(filtered, options.query ?? "", options.limit ?? 15);
  return options.featuredOnly
    ? ranked.sort((left, right) => (left.featuredRank ?? Number.MAX_SAFE_INTEGER)
      - (right.featuredRank ?? Number.MAX_SAFE_INTEGER))
    : ranked;
}
