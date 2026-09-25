"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import {
  Bookmark,
  Check,
  ChevronDown,
  ExternalLink,
  Heart,
  Headphones,
  ImagePlus,
  MapPin,
  MessageCircle,
  Music2,
  Pause,
  Pencil,
  Play,
  Reply,
  Search,
  Send,
  Share2,
  Trash2,
  Video,
  X
} from "lucide-react";

import { FeedAudioPlayer, FeedStickyReleasePlayer, type FeedAudioPlaybackCommand } from "@/components/feed/feed-audio-player";
import {
  CollaborationResponseDialog,
  EditPostDialog,
  hasPostEditWindowExpired
} from "@/components/feed/feed-shared-dialogs";
import {
  FeedSafetyMenu,
  type FeedSafetyAppliedAction,
  type FeedSafetyTargetType
} from "@/components/feed/feed-safety-menu";
import { TripledIdentity } from "@/components/ui/tripled-social";
import { Textarea } from "@/components/ui/textarea";
import { uploadBrowserBlobToStorage } from "@/lib/browser-storage-upload";
import { PERSONAL_ARTIST_PROFILE_KEY } from "@/lib/artist-profile-shared";
import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import {
  COLLABORATION_ROLES,
  buildCollaborationPresentation,
  buildCollaborationSearchText,
  collaborationIntentIconFromUnknown,
  collaborationIntentLabel,
  collaborationIntentLabelFromUnknown,
  normalizeCollaborationCity,
  collaborationPreferenceLabel,
  collaborationRoleIconFromUnknown,
  collaborationRoleLabel,
  type CollaborationIntent,
  type CollaborationPreference,
  type CollaborationRole,
  type CollaborationStatus,
  type CollaborationWorkflow
} from "@/lib/collaboration";
import { PersonCard } from "@/components/feed/person-card";
import { readJsonResponse } from "@/lib/client-json-response";
import {
  buildAuthRouteHref,
  buildFeedAuthCallbackUrl,
  FEED_AUTH_RETURN_KEY,
  getFeedAuthPromptCopy,
  parseFeedAuthContext,
  serializeFeedAuthContext,
  type FeedAuthContext,
  type FeedAuthReason,
  type FeedIntendedAction
} from "@/lib/feed-auth-prompt";
import {
  buildFeedApiRequestQuery,
  buildFeedStateKey,
  doesFeedPostMatchState,
  getFeedQueryStateFromPayload,
  isCurrentFeedStateLoaded,
  normalizeLockedAuthorFeedQueryState,
  resolveFeedPrimaryView,
  resolveFeedViewMode,
  shouldAcceptFeedResponse
} from "@/lib/feed-client-state";
import {
  buildFeedQueryString,
  createDashboardCommunityDefaultFeedQueryState,
  normalizeFeedQueryState,
  parseFeedQueryParams,
  resolveDashboardCommunityFeedQueryState,
  type FeedSort,
  type FeedQueryState
} from "@/lib/feed-query-state";
import type { GlobalSearchPayload } from "@/lib/global-search-service";
import type {
  ArtistProfileSettings,
  UserArtistProfileReleaseOption,
  UserArtistProfileSettings
} from "@/lib/artist-profile-service";
import { ClientMutationKeyStore, socialCommentFingerprint, socialCommentMutationSlot } from "@/lib/social-client-idempotency";
import type {
  FeedCollaborationFilter,
  FeedPersonProfileType,
  FeedNewsItem,
  FeedPostItem,
  FeedPrimaryView,
  FeedReactionSummary,
  FeedReleaseItem,
  FeedScope,
  FeedType,
  PublicFeedComment,
  PublicFeedItem,
  PublicFeedPayload
} from "@/lib/feed-contract";

type ErrorPayload = { error?: string };
type CreatedPostPayload = {
  id: string;
  content: string;
  media_type: ComposerMediaKind | null;
  media_key: string | null;
  media_name: string | null;
  created_at: string;
  release?: { id: string; title: string; date: string } | null;
};
type FeedReaction = "heart" | "fire" | "laugh" | "wow" | "sad" | "thumbs" | "party" | "diamond";
type ComposerMediaKind = "image" | "audio" | "video";
type ComposerMediaRole = "standard" | "demo";
type CommunityVisibilityMode = "all" | "none" | "selected";
type ComposerMediaItem = {
  localId: string;
  mediaType: ComposerMediaKind;
  role: ComposerMediaRole;
  mediaKey: string | null;
  mediaName: string;
  mediaUrl: string;
  status: "uploading" | "uploaded" | "error";
  progress: number;
  error: string | null;
  file: File;
  previewUrl: string;
  width: number | null;
  height: number | null;
  posterUrl: string | null;
  durationSec: number | null;
};
type ArtistProfileSettingsPayload = {
  profiles: UserArtistProfileSettings[];
  releases: UserArtistProfileReleaseOption[];
  canSave: boolean;
  error?: string;
};
type ComposerIntentCategoryKey = "LOOKING_FOR_PERSON" | "LOOKING_FOR_COLLABORATION" | "OFFERING_COLLABORATION" | "OTHER";

type FeedSurface = "public" | "dashboard";
const COLLABORATION_COMPOSER_GROUPS: Array<{
  key: ComposerIntentCategoryKey;
  label: string;
  emoji: string;
  enabled: boolean;
}> = [
  { key: "LOOKING_FOR_PERSON", label: "Ищу специалиста", emoji: "🧩", enabled: true },
  { key: "LOOKING_FOR_COLLABORATION", label: "Ищу коллаборацию", emoji: "🤝", enabled: true },
  { key: "OFFERING_COLLABORATION", label: "Предлагаю участие", emoji: "✨", enabled: true },
  { key: "OTHER", label: "Другое", emoji: "📝", enabled: true }
] as const;

const COLLABORATION_COMPOSER_GROUP_HINTS: Record<ComposerIntentCategoryKey, string> = {
  LOOKING_FOR_PERSON: "Выберите, кто нужен для этого проекта.",
  LOOKING_FOR_COLLABORATION: "Выберите формат совместной работы.",
  OFFERING_COLLABORATION: "Опишите, что именно вы готовы предложить проекту или другому артисту.",
  OTHER: "Используйте для нестандартного запроса, который не подходит под готовые варианты."
};

const COLLABORATION_COMPOSER_SUBSTEP_OPTIONS: Record<Exclude<ComposerIntentCategoryKey, "OFFERING_COLLABORATION">, Array<{
  value: CollaborationIntent;
  label: string;
  hint?: string;
}>> = {
  LOOKING_FOR_PERSON: [
    { value: "find_producer", label: "Продюсер" },
    { value: "find_beatmaker", label: "Битмейкер" },
    { value: "find_artist", label: "Артист / вокалист" },
    { value: "find_songwriter", label: "Сонграйтер / автор текста" },
    { value: "find_engineer", label: "Сведение / мастеринг" },
    { value: "find_manager", label: "Менеджер" },
    { value: "find_videographer", label: "Видеограф" }
  ],
  LOOKING_FOR_COLLABORATION: [
    { value: "feature", label: "Фит / совместный трек" },
    { value: "remix", label: "Remix" }
  ],
  OTHER: [
    { value: "other", label: "Другое сотрудничество" }
  ]
};

type PostEditDialogState = {
  item: FeedPostItem;
  draft: string;
};

type CollaborationResponseRecord = {
  id: string;
  message: string;
  createdAt: string;
  linkedRelease: FeedPostItem["linkedRelease"];
  sender: {
    id: string;
    slug: string | null;
    displayName: string;
    avatarUrl: string | null;
    profileType: "user" | "artist" | "producer" | "group" | "label";
    verified: boolean;
  };
};

type CollaborationResponseDialogState = {
  item: FeedPostItem;
  message: string;
  linkedReleaseId: string;
};
type ActiveReleasePlayerItem = Pick<FeedReleaseItem, "releaseId" | "title" | "audioUrl" | "coverUrl" | "permalink" | "sceneHref" | "author" | "playCount" | "publishedAt">;

function buildComposerObjectReadUrl(key: string) {
  return `/api/uploads/object/${key.split("/").filter(Boolean).map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function buildCommunitySetupStorageKey(artistKey: string) {
  return `community-onboarding-v1:${artistKey}`;
}

const COLLAB_FAVORITES_STORAGE_KEY = "icm:collab-market:favorites:v1";

type CollabFeedTab = "all" | "mine" | "favorites";

const COLLAB_FEED_TABS: Array<{ key: CollabFeedTab; label: string }> = [
  { key: "all", label: "Все объявления" },
  { key: "mine", label: "Мои объявления" },
  { key: "favorites", label: "Избранное" }
];

function readCollabFavoriteIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAB_FAVORITES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0));
  } catch {
    return new Set();
  }
}

function writeCollabFavoriteIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAB_FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Local favorites are a browser-level convenience until account-level saved posts exist.
  }
}

function normalizeCollabFeedTab(value: string | null | undefined): CollabFeedTab {
  return value === "mine" || value === "favorites" ? value : "all";
}

function readCollabFeedTabFromLocation(): CollabFeedTab {
  if (typeof window === "undefined") return "all";
  return normalizeCollabFeedTab(new URLSearchParams(window.location.search).get("tab"));
}

function buildComposerReleaseChoices(releases: PublicFeedPayload["releaseOptions"]) {
  const deduped = new Map<string, PublicFeedPayload["releaseOptions"][number]>();
  for (const release of releases) {
    if (!release.id || !release.title.trim()) continue;
    if (!deduped.has(release.id)) deduped.set(release.id, release);
  }
  return Array.from(deduped.values())
    .sort((left, right) => right.releaseDate.localeCompare(left.releaseDate))
    .slice(0, 6);
}

function formatMarketplaceIntentHeadline(input: {
  displayIntent?: string | null;
  rawIntent?: string | null;
  workflow?: "seeking" | "offering" | null;
}) {
  const label = (input.displayIntent?.trim() || collaborationIntentLabelFromUnknown(input.rawIntent)).toUpperCase();
  const icon = input.workflow === "offering" ? "✨" : collaborationIntentIconFromUnknown(input.rawIntent);
  return `${icon} ${label}`;
}

function formatMarketplaceRoleLabel(value: string | null | undefined) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed || parsed === "other") return "Роль не указана";
  return `${collaborationRoleIconFromUnknown(value)} ${collaborationRoleLabel(value as CollaborationRole)}`;
}

function formatMarketplacePreferenceLabel(value: CollaborationPreference) {
  if (value === "remote") return "🌐 Remote";
  if (value === "local") return "📍 Local";
  return "🌐 Remote / 📍 Local";
}

function sortRenderableFeedItems(items: PublicFeedItem[], state: FeedQueryState) {
  if (state.sort === "newest") return items;
  return [...items].sort((left, right) => {
    if (state.sort === "oldest") {
      return Date.parse(left.publishedAt) - Date.parse(right.publishedAt);
    }
    const leftResponses = left.kind === "post" ? left.responsesCount : state.sort === "responses_desc" ? -1 : Number.MAX_SAFE_INTEGER;
    const rightResponses = right.kind === "post" ? right.responsesCount : state.sort === "responses_desc" ? -1 : Number.MAX_SAFE_INTEGER;
    if (leftResponses !== rightResponses) {
      return state.sort === "responses_desc"
        ? rightResponses - leftResponses
        : leftResponses - rightResponses;
    }
    return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  });
}

function shouldSuppressCommunitySetup(mode: CommunityVisibilityMode) {
  return mode === "none";
}

function normalizeCommunityProfileType(
  value: ArtistProfileSettings["profileType"] | PublicFeedPayload["ownedProfiles"][number]["profileType"] | null | undefined
): "artist" | "group" | "label" {
  if (value === "group" || value === "label") return value;
  return "artist";
}

function deriveCommunityVisibilityMode(
  settings: ArtistProfileSettings,
  releases: UserArtistProfileReleaseOption[]
): CommunityVisibilityMode {
  if (settings.hideAllCommunityReleases) return "none";
  if (releases.length === 0) return "all";
  const selected = new Set(settings.catalogReleaseIds);
  const selectedCount = releases.filter((release) => selected.has(release.id)).length;
  if (selectedCount === 0) return "none";
  if (selectedCount === releases.length) return "all";
  return "selected";
}

function getDefaultComposerRole(
  profileType: PublicFeedPayload["ownedProfiles"][number]["profileType"] | null | undefined,
  collaborationProfile: PublicFeedPayload["ownedProfiles"][number]["settings"]["collaboration"] | null
): CollaborationRole {
  if (collaborationProfile?.role) return collaborationProfile.role;
  if (profileType === "producer") return "producer";
  return "artist";
}

function inferComposerContentType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "mp3":
      return "audio/mpeg";
    case "mp4":
      return "video/mp4";
    default:
      return "application/octet-stream";
  }
}

const COMMUNITY_IMAGE_CONTENT_TYPES = new Set(["image/png"]);
const COMMUNITY_AUDIO_CONTENT_TYPES = new Set(["audio/mpeg"]);
const COMMUNITY_VIDEO_CONTENT_TYPES = new Set(["video/mp4"]);
const COMMUNITY_VIDEO_MAX_DURATION_SEC = 20;

function getComposerFileCategory(file: File): ComposerMediaKind | null {
  const contentType = (file.type || inferComposerContentType(file.name)).toLowerCase();
  if (COMMUNITY_IMAGE_CONTENT_TYPES.has(contentType)) return "image";
  if (COMMUNITY_AUDIO_CONTENT_TYPES.has(contentType)) return "audio";
  if (COMMUNITY_VIDEO_CONTENT_TYPES.has(contentType)) return "video";
  return null;
}

function getComposerFileValidationError(file: File): string | null {
  const category = getComposerFileCategory(file);
  if (category === "image") return null;
  if (category === "audio") return null;
  if (category === "video") return null;
  return "Для публикации доступны только PNG, MP4 до 20 секунд и demo audio в формате MP3";
}

export function buildPublicFeedAuthorHref(slug: string | null | undefined) {
  return slug ? `/artists/${encodeURIComponent(slug)}` : null;
}

export function buildPublicFeedItemHref(permalink: string) {
  return permalink;
}

const FILTERS: Array<{ key: FeedType; label: string }> = [
  { key: "all", label: "Все публикации" },
  { key: "posts", label: "Публикации" },
  { key: "releases", label: "Релизы" },
  { key: "news", label: "Новости" }
];

const COLLABORATION_WORKFLOW_FILTERS: Array<{ key: CollaborationWorkflow | null; label: string }> = [
  { key: null, label: "Все" },
  { key: "seeking", label: "Сотрудничество" },
  { key: "offering", label: "Предложения" }
];

const COLLABORATION_ROLE_FILTER_OPTIONS = [
  { value: "", label: "Все роли" },
  { value: "artist", label: "Артист / вокалист" },
  { value: "beatmaker", label: "Битмейкер" },
  { value: "producer", label: "Продюсер" },
  { value: "songwriter", label: "Сонграйтер" },
  { value: "engineer", label: "Сведение / мастеринг" },
  { value: "manager", label: "Менеджер" },
  { value: "videographer", label: "Видеограф" },
  ...COLLABORATION_ROLES
    .filter((role) => !["artist", "beatmaker", "producer", "songwriter", "engineer", "manager", "videographer"].includes(role))
    .map((role) => ({ value: role, label: collaborationRoleLabel(role) }))
];

const COLLABORATION_PREFERENCE_FILTER_OPTIONS = [
  { value: "", label: "Любой формат" },
  { value: "remote", label: "🌐 Remote" },
  { value: "local", label: "📍 Local" },
  { value: "hybrid", label: "🌐📍 Remote / Local" }
] as const;

const COLLABORATION_STATUS_FILTER_OPTIONS = [
  { value: "", label: "Любой статус" },
  { value: "open", label: "🟢 Открытые" },
  { value: "closed", label: "🔴 Закрытые" }
] as const;

const COLLABORATION_SORT_OPTIONS: Array<{ value: FeedSort; label: string }> = [
  { value: "newest", label: "Сначала новые" },
  { value: "oldest", label: "Сначала старые" },
  { value: "responses_desc", label: "Больше откликов" },
  { value: "responses_asc", label: "Меньше откликов" }
];

type AuthPromptRequest = {
  reason: FeedAuthReason;
  intendedAction: FeedIntendedAction;
  targetId?: string | null;
  targetSlug?: string | null;
  anchorId?: string | null;
  focusTargetId?: string | null;
  drafts?: Record<string, string>;
  callbackUrl?: string | null;
  path?: string | null;
  scrollY?: number;
};

function defaultReaction(item: { likedByViewer: boolean; viewerReaction?: FeedReaction | null }): FeedReaction | null {
  return item.viewerReaction ?? (item.likedByViewer ? "heart" : null);
}

function buildOptimisticReactionSummary(
  summary: FeedReactionSummary,
  currentReaction: FeedReaction | null,
  nextRequestedReaction: FeedReaction
): FeedReactionSummary {
  const nextCounts = { ...summary.counts };
  let nextViewerReaction: FeedReaction | null = nextRequestedReaction;
  let nextTotal = summary.total;

  if (currentReaction === nextRequestedReaction) {
    nextViewerReaction = null;
    nextCounts[nextRequestedReaction] = Math.max(0, (nextCounts[nextRequestedReaction] ?? 0) - 1);
    nextTotal = Math.max(0, nextTotal - 1);
  } else {
    if (currentReaction) {
      nextCounts[currentReaction] = Math.max(0, (nextCounts[currentReaction] ?? 0) - 1);
    } else {
      nextTotal += 1;
    }
    nextCounts[nextRequestedReaction] = (nextCounts[nextRequestedReaction] ?? 0) + 1;
  }

  return {
    total: nextTotal,
    counts: nextCounts,
    viewerReaction: nextViewerReaction
  };
}

function buildNextFeedQueryState(state: FeedQueryState, patch: Partial<FeedQueryState>): FeedQueryState {
  return { ...state, ...patch };
}

function buildFeedPostSearchText(item: FeedPostItem): string {
  return buildCollaborationSearchText({
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
  }).toLowerCase();
}

function mergeOptimisticFeedPosts(params: {
  items: PublicFeedItem[];
  optimisticPostsById: Record<string, FeedPostItem>;
  state: FeedQueryState;
}): PublicFeedItem[] {
  const optimisticPosts = Object.values(params.optimisticPostsById);
  if (optimisticPosts.length === 0) return params.items;
  const search = params.state.search.trim().toLowerCase();
  const existingPostIds = new Set(
    params.items
      .filter((item): item is FeedPostItem => item.kind === "post")
      .map((item) => item.sourceId)
  );
  const additions = optimisticPosts
    .filter((item) => !existingPostIds.has(item.sourceId))
    .filter((item) => doesFeedPostMatchState(item, params.state))
    .filter((item) => search.length === 0 || buildFeedPostSearchText(item).includes(search))
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
  return additions.length ? sortRenderableFeedItems([...additions, ...params.items], params.state) : sortRenderableFeedItems(params.items, params.state);
}

function applyFeedQueryState(setters: {
  setView: React.Dispatch<React.SetStateAction<FeedPrimaryView | null>>;
  setScope: React.Dispatch<React.SetStateAction<FeedScope>>;
  setType: React.Dispatch<React.SetStateAction<FeedType>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  setCollaborationFilter: React.Dispatch<React.SetStateAction<FeedCollaborationFilter>>;
  setCollaborationIntent: React.Dispatch<React.SetStateAction<CollaborationIntent | null>>;
  setCollaborationRole: React.Dispatch<React.SetStateAction<CollaborationRole | null>>;
  setCollaborationWorkflow: React.Dispatch<React.SetStateAction<CollaborationWorkflow | null>>;
  setCollaborationPreference: React.Dispatch<React.SetStateAction<CollaborationPreference | null>>;
  setCollaborationCity: React.Dispatch<React.SetStateAction<string | null>>;
  setCollaborationStatus: React.Dispatch<React.SetStateAction<CollaborationStatus | null>>;
  setSort: React.Dispatch<React.SetStateAction<FeedSort>>;
  setProfileType: React.Dispatch<React.SetStateAction<FeedPersonProfileType | null>>;
}, next: FeedQueryState) {
  setters.setView(next.view);
  setters.setScope(next.scope);
  setters.setType(next.type);
  setters.setSearch(next.search);
  setters.setCollaborationFilter(next.collaborationFilter);
  setters.setCollaborationIntent(next.collaborationIntent);
  setters.setCollaborationRole(next.collaborationRole);
  setters.setCollaborationWorkflow(next.collaborationWorkflow);
  setters.setCollaborationPreference(next.collaborationPreference);
  setters.setCollaborationCity(next.collaborationCity);
  setters.setCollaborationStatus(next.collaborationStatus);
  setters.setSort(next.sort);
  setters.setProfileType(next.profileType);
}

export function PublicFeedPage({
  initialPayload,
  surface = "dashboard",
  detailMode = false,
  disableLiveLoading = false,
  lockedAuthorSlug = null
}: {
  initialPayload: PublicFeedPayload;
  surface?: FeedSurface;
  detailMode?: boolean;
  disableLiveLoading?: boolean;
  lockedAuthorSlug?: string | null;
}) {
  const { status: sessionStatus } = useSession();
  const searchParams = useSearchParams();
  const sessionAuthenticated = sessionStatus === "authenticated";
  const isPublicShowcase = surface === "public" && !detailMode;
  const currentPathname = typeof window !== "undefined"
    ? window.location.pathname
    : surface === "dashboard"
      ? "/dashboard/community"
      : "/feed";
  const guestScopeBlocked = !detailMode && !initialPayload.viewer.authenticated && initialPayload.scopeAccess === "auth_required";
  const initialQueryState = React.useMemo(
    () => normalizeLockedAuthorFeedQueryState(
      guestScopeBlocked
        ? buildNextFeedQueryState(getFeedQueryStateFromPayload(initialPayload), { scope: "all" })
        : getFeedQueryStateFromPayload(initialPayload),
      lockedAuthorSlug
    ),
    [guestScopeBlocked, initialPayload, lockedAuthorSlug]
  );
  const [view, setView] = React.useState<FeedPrimaryView | null>(initialQueryState.view);
  const [payload, setPayload] = React.useState<PublicFeedPayload>(() => guestScopeBlocked
    ? {
        ...initialPayload,
        view: initialQueryState.view,
        scope: "all",
        scopeAccess: "granted",
        items: [],
        nextCursor: null,
        hasMore: false
      }
    : initialPayload);
  const [scope, setScope] = React.useState<"all" | "following">(initialQueryState.scope);
  const [type, setType] = React.useState<FeedType>(initialQueryState.type);
  const [collaborationFilter, setCollaborationFilter] = React.useState<FeedCollaborationFilter>(initialQueryState.collaborationFilter);
  const [collaborationIntent, setCollaborationIntent] = React.useState<CollaborationIntent | null>(initialQueryState.collaborationIntent);
  const [collaborationRole, setCollaborationRole] = React.useState<CollaborationRole | null>(initialQueryState.collaborationRole);
  const [collaborationWorkflow, setCollaborationWorkflow] = React.useState<CollaborationWorkflow | null>(initialQueryState.collaborationWorkflow);
  const [collaborationPreference, setCollaborationPreference] = React.useState<CollaborationPreference | null>(initialQueryState.collaborationPreference);
  const [collaborationCity, setCollaborationCity] = React.useState<string | null>(initialQueryState.collaborationCity);
  const [collaborationStatus, setCollaborationStatus] = React.useState<CollaborationStatus | null>(initialQueryState.collaborationStatus);
  const [sort, setSort] = React.useState<FeedSort>(initialQueryState.sort);
  const [profileType, setProfileType] = React.useState<FeedPersonProfileType | null>(initialQueryState.profileType);
  const [collabFeedTab, setCollabFeedTab] = React.useState<CollabFeedTab>(() => readCollabFeedTabFromLocation());
  const [favoritePostIds, setFavoritePostIds] = React.useState<Set<string>>(() => new Set());
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [search, setSearch] = React.useState(initialQueryState.search);
  const deferredSearch = React.useDeferredValue(search);
  const [draftSearch, setDraftSearch] = React.useState(initialQueryState.search);
  const deferredDraftSearch = React.useDeferredValue(draftSearch);
  const [draftCollaborationWorkflow, setDraftCollaborationWorkflow] = React.useState<CollaborationWorkflow | null>(initialQueryState.collaborationWorkflow);
  const [draftCollaborationRole, setDraftCollaborationRole] = React.useState<CollaborationRole | null>(initialQueryState.collaborationRole);
  const [draftCollaborationPreference, setDraftCollaborationPreference] = React.useState<CollaborationPreference | null>(initialQueryState.collaborationPreference);
  const [draftCollaborationCity, setDraftCollaborationCity] = React.useState<string | null>(initialQueryState.collaborationCity);
  const [draftCollaborationStatus, setDraftCollaborationStatus] = React.useState<CollaborationStatus | null>(initialQueryState.collaborationStatus);
  const [draftSort, setDraftSort] = React.useState<FeedSort>(initialQueryState.sort);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [authPromptOpen, setAuthPromptOpen] = React.useState(false);
  const [authPromptContext, setAuthPromptContext] = React.useState<FeedAuthContext | null>(null);
  const [pendingDeletePostId, setPendingDeletePostId] = React.useState<string | null>(null);
  const [deletePostBusy, setDeletePostBusy] = React.useState(false);
  const [postEditDialog, setPostEditDialog] = React.useState<PostEditDialogState | null>(null);
  const [postEditBusy, setPostEditBusy] = React.useState(false);
  const [responseDialog, setResponseDialog] = React.useState<CollaborationResponseDialogState | null>(null);
  const [responseBusy, setResponseBusy] = React.useState(false);
  const [responseError, setResponseError] = React.useState<string | null>(null);
  const [responsesOpenByPostId, setResponsesOpenByPostId] = React.useState<Record<string, boolean>>({});
  const [responsesLoadingByPostId, setResponsesLoadingByPostId] = React.useState<Record<string, boolean>>({});
  const [responsesByPostId, setResponsesByPostId] = React.useState<Record<string, CollaborationResponseRecord[]>>({});
  const [respondedByPostId, setRespondedByPostId] = React.useState<Record<string, boolean>>({});
  const [closeBusyByPostId, setCloseBusyByPostId] = React.useState<Record<string, boolean>>({});
  const [communitySetupOpen, setCommunitySetupOpen] = React.useState(false);
  const [communitySetupBusy, setCommunitySetupBusy] = React.useState(false);
  const [communitySetupLoading, setCommunitySetupLoading] = React.useState(false);
  const [communitySetupError, setCommunitySetupError] = React.useState<string | null>(null);
  const [communitySetupSettings, setCommunitySetupSettings] = React.useState<ArtistProfileSettings | null>(null);
  const [communitySetupReleases, setCommunitySetupReleases] = React.useState<UserArtistProfileReleaseOption[]>([]);
  const [communitySetupProfileType, setCommunitySetupProfileType] = React.useState<"artist" | "group" | "label">("artist");
  const [communitySetupMode, setCommunitySetupMode] = React.useState<CommunityVisibilityMode>("all");
  const [communitySetupSelectedReleaseIds, setCommunitySetupSelectedReleaseIds] = React.useState<string[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [commentPendingById, setCommentPendingById] = React.useState<Record<string, boolean>>({});
  const [searchResults, setSearchResults] = React.useState<GlobalSearchPayload | null>(null);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [sharedHref, setSharedHref] = React.useState<string | null>(null);
  const [safetyNotice, setSafetyNotice] = React.useState<string | null>(null);
  const [publishNotice, setPublishNotice] = React.useState<{ message: string; href: string | null } | null>(null);
  const [optimisticPostsById, setOptimisticPostsById] = React.useState<Record<string, FeedPostItem>>({});
  const [selectedReactions, setSelectedReactions] = React.useState<Record<string, FeedReaction | null>>(() => Object.fromEntries(initialPayload.items.filter((item) => item.kind !== "news").map((item) => [item.sourceId, defaultReaction(item)])));
  const [expandedComments, setExpandedComments] = React.useState<Record<string, boolean>>({});
  const [replyDraftsByItem, setReplyDraftsByItem] = React.useState<Record<string, Record<string, string>>>({});
  const [replyTargetByItem, setReplyTargetByItem] = React.useState<Record<string, string | null>>({});
  const [followBusyBySlug, setFollowBusyBySlug] = React.useState<Record<string, boolean>>({});
  const artistKey = PERSONAL_ARTIST_PROFILE_KEY;
  const [content, setContent] = React.useState("");
  const [releaseId, setReleaseId] = React.useState("");
  const [mediaItems, setMediaItems] = React.useState<ComposerMediaItem[]>([]);
  const [composerIntent, setComposerIntent] = React.useState<CollaborationIntent | "">("");
  const [composerRole, setComposerRole] = React.useState<CollaborationRole | "">("");
  const [composerGenres, setComposerGenres] = React.useState<string[]>([]);
  const [composerWorkflow, setComposerWorkflow] = React.useState<"seeking" | "offering">("seeking");
  const [composerCustomIntentLabel, setComposerCustomIntentLabel] = React.useState("");
  const [composerPreference, setComposerPreference] = React.useState<CollaborationPreference>("hybrid");
  const [composerCity, setComposerCity] = React.useState("");
  const [composerResetToken, setComposerResetToken] = React.useState(0);
  const postDraftFingerprint = React.useMemo(() => JSON.stringify({
    content: content.trim(),
    releaseId,
    composerIntent,
    composerWorkflow,
    composerCustomIntentLabel: composerCustomIntentLabel.trim(),
    composerRole,
    composerPreference,
    composerCity: normalizeCollaborationCity(composerCity),
    media: mediaItems.map((item) => ({ key: item.mediaKey, name: item.mediaName, role: item.role, status: item.status }))
  }), [composerCity, composerCustomIntentLabel, composerIntent, composerPreference, composerRole, composerWorkflow, content, mediaItems, releaseId]);
  const [activeRelease, setActiveRelease] = React.useState<ActiveReleasePlayerItem | null>(null);
  const [activeReleaseCommand, setActiveReleaseCommand] = React.useState<FeedAudioPlaybackCommand | null>(null);
  const [activeReleasePlaying, setActiveReleasePlaying] = React.useState(false);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const videoInputRef = React.useRef<HTMLInputElement>(null);
  const audioInputRef = React.useRef<HTMLInputElement>(null);
  const didMountRef = React.useRef(false);
  const loadRequestRef = React.useRef(0);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const pendingScrollRestoreRef = React.useRef<{ stateKey: string; scrollY: number } | null>(null);
  const commentsLoadingRef = React.useRef(new Set<string>());
  const reactionQueueRef = React.useRef(new Map<string, Promise<void>>());
  const mutationKeysRef = React.useRef(new ClientMutationKeyStore());
  const authTriggerRef = React.useRef<HTMLElement | null>(null);
  const communitySetupBootstrappedRef = React.useRef<string | null>(null);
  const [loadedStateKey, setLoadedStateKey] = React.useState(() => buildFeedStateKey(initialQueryState));

  React.useEffect(() => {
    mutationKeysRef.current.invalidateIfChanged("post-composer", postDraftFingerprint);
  }, [postDraftFingerprint]);

  const syncFeedUrl = React.useCallback((nextState: FeedQueryState, mode: "push" | "replace" = "push") => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(buildFeedQueryString(nextState));
    if (lockedAuthorSlug) params.set("author", lockedAuthorSlug);
    const query = params.toString();
    const nextUrl = query ? `${currentPathname}?${query}` : currentPathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl === currentUrl) return;
    window.history[mode === "push" ? "pushState" : "replaceState"](window.history.state, "", nextUrl);
  }, [currentPathname, lockedAuthorSlug]);

  const currentQueryState = React.useMemo<FeedQueryState>(() => ({
    view,
    scope,
    type,
    search,
    collaborationFilter,
    collaborationIntent,
    collaborationRole,
    collaborationWorkflow,
    collaborationPreference,
    collaborationCity,
    collaborationStatus,
    sort,
    profileType
  }), [collaborationCity, collaborationFilter, collaborationIntent, collaborationPreference, collaborationRole, collaborationStatus, collaborationWorkflow, profileType, scope, search, sort, type, view]);
  const normalizedCurrentQueryState = React.useMemo(
    () => normalizeLockedAuthorFeedQueryState(normalizeFeedQueryState(currentQueryState), lockedAuthorSlug),
    [currentQueryState, lockedAuthorSlug]
  );
  const primaryView = React.useMemo(() => resolveFeedPrimaryView(normalizedCurrentQueryState), [normalizedCurrentQueryState]);
  const searchSuggestionQuery = primaryView === "collaborations" && surface === "dashboard" ? deferredDraftSearch : deferredSearch;
  const currentQueryStateRef = React.useRef<FeedQueryState>(normalizedCurrentQueryState);

  React.useEffect(() => {
    currentQueryStateRef.current = normalizedCurrentQueryState;
  }, [normalizedCurrentQueryState]);

  React.useEffect(() => {
    setDraftSearch(normalizedCurrentQueryState.search);
    setDraftCollaborationWorkflow(normalizedCurrentQueryState.collaborationWorkflow);
    setDraftCollaborationRole(normalizedCurrentQueryState.collaborationRole);
    setDraftCollaborationPreference(normalizedCurrentQueryState.collaborationPreference);
    setDraftCollaborationCity(normalizedCurrentQueryState.collaborationCity);
    setDraftCollaborationStatus(normalizedCurrentQueryState.collaborationStatus);
    setDraftSort(normalizedCurrentQueryState.sort);
  }, [normalizedCurrentQueryState]);

  const resolvedQueryState = React.useMemo<FeedQueryState>(() => ({
    ...normalizedCurrentQueryState,
    search: deferredSearch
  }), [deferredSearch, normalizedCurrentQueryState]);
  const resolvedQueryStateKey = React.useMemo(() => buildFeedStateKey(resolvedQueryState), [resolvedQueryState]);
  const collaborationCityOptions = React.useMemo(() => {
    const cities = new Set(payload.collaborationCities.map(normalizeCollaborationCity).filter(Boolean));
    if (collaborationCity) cities.add(normalizeCollaborationCity(collaborationCity));
    if (draftCollaborationCity) cities.add(normalizeCollaborationCity(draftCollaborationCity));
    return [
      { value: "", label: "Любой город" },
      ...Array.from(cities)
        .sort((left, right) => left.localeCompare(right, "ru-RU"))
        .map((city) => ({ value: city, label: city }))
    ];
  }, [collaborationCity, draftCollaborationCity, payload.collaborationCities]);

  const viewerAuthenticated = sessionAuthenticated || payload.viewer.authenticated;

  const handleSafetyApplied = React.useCallback((action: FeedSafetyAppliedAction) => {
    if (action.kind === "report") {
      setSafetyNotice("Жалоба отправлена на модерацию.");
      return;
    }
    const suppressedAuthorId = action.kind === "mute" || action.kind === "block" ? action.authorId : null;
    const keepItem = (item: PublicFeedItem) => {
      if (suppressedAuthorId && item.author.id === suppressedAuthorId) return false;
      if (action.kind === "hide" && action.targetType === "post" && item.kind === "post") return item.sourceId !== action.targetId;
      if (action.kind === "hide" && action.targetType === "release" && item.kind === "release") return item.releaseId !== action.targetId;
      return true;
    };
    const filterComments = (comments: PublicFeedComment[]): PublicFeedComment[] => comments
      .filter((comment) => !suppressedAuthorId || comment.author.id !== suppressedAuthorId)
      .map((comment) => ({ ...comment, replies: filterComments(comment.replies) }));
    const sanitize = <T extends PublicFeedItem>(item: T): T => item.kind === "news" ? item : {
      ...item,
      comments: filterComments(item.comments)
    } as T;
    setPayload((current) => ({
      ...current,
      items: current.items.filter(keepItem).map(sanitize),
      popularPosts: current.popularPosts.filter(keepItem).map(sanitize),
      newReleases: current.newReleases.filter(keepItem).map(sanitize),
      releaseOfWeek: current.releaseOfWeek && keepItem(current.releaseOfWeek) ? sanitize(current.releaseOfWeek) : null
    }));
    setSafetyNotice(action.kind === "hide" ? "Публикация скрыта." : action.kind === "mute" ? "Автор скрыт из вашей ленты." : "Автор заблокирован.");
  }, []);
  const activeProfile = payload.ownedProfiles.find((profile) => profile.artistKey === artistKey) ?? null;
  const canPublish = !detailMode && !isPublicShowcase && viewerAuthenticated && Boolean(activeProfile);
  const uploadingComposerMedia = mediaItems.some((item) => item.status === "uploading");
  const hasComposerMediaErrors = mediaItems.some((item) => item.status === "error");
  const profileCollaboration = activeProfile?.settings.collaboration ?? null;
  const composerCollaborationAvailable = activeProfile?.artistKey === PERSONAL_ARTIST_PROFILE_KEY || Boolean(profileCollaboration?.open);
  const scopedReleases = payload.releaseOptions;
  const authPromptCopy = authPromptContext ? getFeedAuthPromptCopy(authPromptContext.reason) : null;
  const loginHref = React.useMemo(() => buildAuthRouteHref("/login", authPromptContext?.callbackUrl ?? currentPathname), [authPromptContext?.callbackUrl, currentPathname]);
  const registerHref = React.useMemo(() => buildAuthRouteHref("/register", authPromptContext?.callbackUrl ?? currentPathname), [authPromptContext?.callbackUrl, currentPathname]);

  React.useEffect(() => {
    setFavoritePostIds(readCollabFavoriteIds());
  }, []);

  React.useEffect(() => {
    if (!canPublish || primaryView !== "collaborations") {
      setComposerOpen(false);
    }
  }, [canPublish, primaryView]);

  React.useEffect(() => {
    setCollabFeedTab(normalizeCollabFeedTab(searchParams.get("tab")));
  }, [searchParams]);

  const handleCollabFeedTabChange = React.useCallback((nextTab: CollabFeedTab) => {
    setCollabFeedTab(nextTab);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (nextTab === "all") params.delete("tab");
    else params.set("tab", nextTab);
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);

  const toggleFavoritePost = React.useCallback((postId: string) => {
    setFavoritePostIds((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      writeCollabFavoriteIds(next);
      return next;
    });
  }, []);

  const applyCommunitySetupPayload = React.useCallback((profile: UserArtistProfileSettings, releases: UserArtistProfileReleaseOption[]) => {
    const releaseIds = new Set(releases.map((release) => release.id));
    const selectedReleaseIds = profile.settings.catalogReleaseIds.filter((releaseId) => releaseIds.has(releaseId));
    setCommunitySetupSettings(profile.settings);
    setCommunitySetupReleases(releases);
    setCommunitySetupProfileType(normalizeCommunityProfileType(profile.settings.profileType));
    setCommunitySetupMode(deriveCommunityVisibilityMode(profile.settings, releases));
    setCommunitySetupSelectedReleaseIds(selectedReleaseIds);
    setCommunitySetupError(null);
  }, []);

  const loadCommunitySetup = React.useCallback(async (artistKeyValue: string) => {
    setCommunitySetupLoading(true);
    setCommunitySetupError(null);
    try {
      const response = await fetch("/api/user/artist-profile");
      const next = await readJsonResponse<ArtistProfileSettingsPayload>(response, "Не удалось загрузить настройки сообщества");
      if (!response.ok) throw new Error(next.error ?? "Не удалось загрузить настройки сообщества");
      const profile = next.profiles.find((item) => item.artistKey === artistKeyValue);
      if (!profile) throw new Error("Не удалось найти активный профиль сообщества");
      applyCommunitySetupPayload(profile, next.releases);
      return { profile, releases: next.releases };
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Не удалось загрузить настройки сообщества";
      setCommunitySetupError(message);
      return null;
    } finally {
      setCommunitySetupLoading(false);
    }
  }, [applyCommunitySetupPayload]);

  const buildDashboardCommunityHref = React.useCallback((anchorId?: string | null, authorSlug?: string | null) => {
    const params = new URLSearchParams(buildFeedQueryString(currentQueryStateRef.current));
    const resolvedAuthorSlug = authorSlug ?? lockedAuthorSlug;
    if (resolvedAuthorSlug) params.set("author", resolvedAuthorSlug);
    const hash = anchorId ? `#${encodeURIComponent(anchorId)}` : "";
    const query = params.toString();
    return `/dashboard/community${query ? `?${query}` : ""}${hash}`;
  }, [lockedAuthorSlug]);

  const closeAuthPrompt = React.useCallback(() => {
    setAuthPromptOpen(false);
    window.requestAnimationFrame(() => {
      authTriggerRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const requestAuthenticatedAction = React.useCallback((request: AuthPromptRequest) => {
    if (typeof window === "undefined") return;
    authTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const currentPath = `${window.location.pathname}${window.location.search}` || currentPathname;
    const targetPath = request.path ?? currentPath;
    const context: FeedAuthContext = {
      reason: request.reason,
      intendedAction: request.intendedAction,
      callbackUrl: request.callbackUrl ?? buildFeedAuthCallbackUrl(targetPath, request.anchorId),
      path: targetPath,
      scrollY: request.scrollY ?? window.scrollY,
      scope: currentQueryStateRef.current.scope,
      type: currentQueryStateRef.current.type,
      collaborationFilter: currentQueryStateRef.current.collaborationFilter,
      collaborationIntent: currentQueryStateRef.current.collaborationIntent,
      collaborationRole: currentQueryStateRef.current.collaborationRole,
      collaborationWorkflow: currentQueryStateRef.current.collaborationWorkflow,
      collaborationPreference: currentQueryStateRef.current.collaborationPreference,
      collaborationCity: currentQueryStateRef.current.collaborationCity,
      collaborationStatus: currentQueryStateRef.current.collaborationStatus,
      sort: currentQueryStateRef.current.sort,
      profileType: currentQueryStateRef.current.profileType,
      search: currentQueryStateRef.current.search,
      targetId: request.targetId ?? null,
      targetSlug: request.targetSlug ?? null,
      anchorId: request.anchorId ?? null,
      focusTargetId: request.focusTargetId ?? null,
      drafts: request.drafts ?? {},
      at: Date.now()
    };
    window.sessionStorage.setItem(FEED_AUTH_RETURN_KEY, serializeFeedAuthContext(context));
    setAuthPromptContext(context);
    setAuthPromptOpen(true);
  }, [currentPathname]);

  const openDashboardCommunityTarget = React.useCallback((anchorId?: string | null) => {
    if (typeof window === "undefined") return;
    window.location.assign(buildDashboardCommunityHref(anchorId));
  }, [buildDashboardCommunityHref]);

  const requestDashboardSocialRedirect = React.useCallback((request: AuthPromptRequest) => {
    const anchorId = request.anchorId ?? (request.targetId ? `feed-item-${request.targetId}` : null);
    const dashboardTarget = buildDashboardCommunityHref(anchorId);
    if (viewerAuthenticated) {
      openDashboardCommunityTarget(anchorId);
      return;
    }
    requestAuthenticatedAction({
      ...request,
      anchorId,
      path: dashboardTarget,
      callbackUrl: dashboardTarget,
      scrollY: 0
    });
  }, [buildDashboardCommunityHref, openDashboardCommunityTarget, requestAuthenticatedAction, viewerAuthenticated]);

  React.useEffect(() => {
    if (!composerCollaborationAvailable && composerIntent) {
      setComposerIntent("");
    }
  }, [composerCollaborationAvailable, composerIntent]);

  React.useEffect(() => {
    setComposerGenres(profileCollaboration?.genres ?? []);
  }, [activeProfile?.artistKey, profileCollaboration?.genres]);

  React.useEffect(() => {
    setComposerPreference(profileCollaboration?.preference ?? "hybrid");
  }, [activeProfile?.artistKey, profileCollaboration?.preference]);

  React.useEffect(() => {
    if (composerRole) return;
    setComposerRole(getDefaultComposerRole(activeProfile?.profileType, profileCollaboration));
  }, [activeProfile?.profileType, composerRole, profileCollaboration]);

  const visibleItems = React.useMemo(() => payload.items, [payload.items]);
  const visiblePeople = React.useMemo(() => payload.people, [payload.people]);
  const isFilterRefreshPending = React.useMemo(() => !isCurrentFeedStateLoaded({
    loadedStateKey,
    currentStateKey: resolvedQueryStateKey
  }), [loadedStateKey, resolvedQueryStateKey]);
  const renderedItems = React.useMemo(
    () => primaryView === "people"
      ? visibleItems
      : mergeOptimisticFeedPosts({
          items: visibleItems,
          optimisticPostsById,
          state: normalizedCurrentQueryState
    }),
    [normalizedCurrentQueryState, optimisticPostsById, primaryView, visibleItems]
  );
  const displayedItems = React.useMemo(() => {
    if (primaryView !== "collaborations") return renderedItems;
    if (collabFeedTab === "mine") {
      return renderedItems.filter((item) => item.kind === "post" && item.postType === "collaboration" && item.author.ownedByViewer);
    }
    if (collabFeedTab === "favorites") {
      return renderedItems.filter((item) => item.kind === "post" && item.postType === "collaboration" && favoritePostIds.has(item.sourceId));
    }
    return renderedItems;
  }, [collabFeedTab, favoritePostIds, primaryView, renderedItems]);
  const communityUnavailable = payload.community.status === "unavailable";
  const discoveryRelease = payload.releaseOfWeek
    ?? payload.community.releases[0]?.item
    ?? payload.newReleases[0]
    ?? null;
  const discoveryPosts = React.useMemo(() => {
    const candidates = [
      ...payload.community.trending.map((entry) => entry.item),
      ...payload.community.popular.map((entry) => entry.item),
      ...payload.popularPosts
    ];
    const unique = new Map<string, FeedPostItem>();
    for (const item of candidates) {
      if (!unique.has(item.sourceId)) unique.set(item.sourceId, item);
      if (unique.size >= 4) break;
    }
    return Array.from(unique.values());
  }, [payload.community.popular, payload.community.trending, payload.popularPosts]);
  const feedViewMode = React.useMemo(() => resolveFeedViewMode({
    loading,
    error,
    scopeAccess: payload.scopeAccess,
    itemsCount: primaryView === "people" ? visiblePeople.length : displayedItems.length,
    loadedStateKey,
    currentStateKey: resolvedQueryStateKey
  }), [displayedItems.length, error, loadedStateKey, loading, payload.scopeAccess, primaryView, visiblePeople.length, resolvedQueryStateKey]);

  const updateFollowState = React.useCallback((slug: string, following: boolean) => {
    setPayload((current) => ({
      ...current,
      items: current.items
        .map((item) => item.author.slug === slug ? { ...item, author: { ...item.author, followingByViewer: following } } : item)
        .filter((item) => !(scope === "following" && !following && item.author.slug === slug)),
      newReleases: current.newReleases
        .map((item) => item.author.slug === slug ? { ...item, author: { ...item.author, followingByViewer: following } } : item)
        .filter((item) => !(scope === "following" && !following && item.author.slug === slug)),
      popularPosts: current.popularPosts
        .map((item) => item.author.slug === slug ? { ...item, author: { ...item.author, followingByViewer: following } } : item)
        .filter((item) => !(scope === "following" && !following && item.author.slug === slug))
    }));
  }, [scope]);

  const updateReleasePlayCount = React.useCallback((releaseIdValue: string, playCount: number) => {
    setPayload((current) => ({
      ...current,
      items: current.items.map((item) => item.kind === "release" && item.releaseId === releaseIdValue ? { ...item, playCount } : item),
      newReleases: current.newReleases.map((item) => item.releaseId === releaseIdValue ? { ...item, playCount } : item)
    }));
  }, []);

  const applyCollaborationStatus = React.useCallback((postId: string, status: "open" | "closed") => {
    setPayload((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.kind !== "post" || item.sourceId !== postId || !item.collaboration) return item;
        return { ...item, collaboration: { ...item.collaboration, status } };
      }),
      popularPosts: current.popularPosts.map((item) => {
        if (item.sourceId !== postId || !item.collaboration) return item;
        return { ...item, collaboration: { ...item.collaboration, status } };
      })
    }));
  }, []);

  const queueReleaseCommand = React.useCallback((releaseIdValue: string, action: FeedAudioPlaybackCommand["action"]) => {
    setActiveReleaseCommand({ releaseId: releaseIdValue, action, nonce: Date.now() + Math.random() });
  }, []);

  const openReleasePlayer = React.useCallback((item: FeedReleaseItem) => {
    if (!item.audioUrl) return;
    setActiveRelease({
      releaseId: item.releaseId,
      title: item.title,
      audioUrl: item.audioUrl,
      coverUrl: item.coverUrl,
      permalink: item.permalink,
      sceneHref: item.sceneHref,
      author: item.author,
      playCount: item.playCount,
      publishedAt: item.publishedAt
    });
    queueReleaseCommand(item.releaseId, activeRelease?.releaseId === item.releaseId ? "toggle" : "play");
  }, [activeRelease?.releaseId, queueReleaseCommand]);

  React.useEffect(() => {
    if (!activeRelease?.releaseId) return;
    const nextRelease = [...payload.items, ...payload.newReleases]
      .find((item): item is FeedReleaseItem => item.kind === "release" && item.releaseId === activeRelease.releaseId);
    if (!nextRelease) return;
    setActiveRelease((current) => {
      if (!current || current.releaseId !== nextRelease.releaseId) {
        return {
          releaseId: nextRelease.releaseId,
          title: nextRelease.title,
          audioUrl: nextRelease.audioUrl,
          coverUrl: nextRelease.coverUrl,
          permalink: nextRelease.permalink,
          sceneHref: nextRelease.sceneHref,
          author: nextRelease.author,
          playCount: nextRelease.playCount,
          publishedAt: nextRelease.publishedAt
        };
      }
      if (
        current.title === nextRelease.title &&
        current.audioUrl === nextRelease.audioUrl &&
        current.coverUrl === nextRelease.coverUrl &&
        current.permalink === nextRelease.permalink &&
        current.sceneHref === nextRelease.sceneHref &&
        current.playCount === nextRelease.playCount &&
        current.publishedAt === nextRelease.publishedAt &&
        current.author.id === nextRelease.author.id &&
        current.author.slug === nextRelease.author.slug &&
        current.author.displayName === nextRelease.author.displayName &&
        current.author.avatarUrl === nextRelease.author.avatarUrl &&
        current.author.profileType === nextRelease.author.profileType &&
        current.author.verified === nextRelease.author.verified &&
        current.author.followingByViewer === nextRelease.author.followingByViewer &&
        current.author.ownedByViewer === nextRelease.author.ownedByViewer
      ) {
        return current;
      }
      return {
        releaseId: nextRelease.releaseId,
        title: nextRelease.title,
        audioUrl: nextRelease.audioUrl,
        coverUrl: nextRelease.coverUrl,
        permalink: nextRelease.permalink,
        sceneHref: nextRelease.sceneHref,
        author: nextRelease.author,
        playCount: nextRelease.playCount,
        publishedAt: nextRelease.publishedAt
      };
    });
  }, [activeRelease?.releaseId, payload.items, payload.newReleases]);

  const restorePendingScroll = React.useCallback((stateKey: string) => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending || pending.stateKey !== stateKey || typeof window === "undefined") return;
    pendingScrollRestoreRef.current = null;
    const maxScrollTop = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: Math.min(pending.scrollY, maxScrollTop),
        behavior: "auto"
      });
    });
  }, []);

  const load = React.useCallback(async (options: { state: FeedQueryState; append?: boolean; cursor?: string | null }) => {
    const requestId = ++loadRequestRef.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/feed?${buildFeedApiRequestQuery(
        options.state,
        options.append ? options.cursor : null,
        lockedAuthorSlug
      )}`, { cache: "no-store", signal: controller.signal });
      const next = await readJsonResponse<PublicFeedPayload & ErrorPayload>(response, "Не удалось загрузить ленту");
      if (!shouldAcceptFeedResponse({ requestId, activeRequestId: loadRequestRef.current, aborted: controller.signal.aborted })) return;
      if (response.status === 401) {
        if (options.state.scope === "following") {
          requestAuthenticatedAction({
            reason: "following_tab",
            intendedAction: "open_following",
            focusTargetId: "feed-scope-following"
          });
        }
        return;
      }
      if (!response.ok) throw new Error(next.error ?? "Не удалось загрузить ленту");
      const data = next as PublicFeedPayload;
      if (!shouldAcceptFeedResponse({ requestId, activeRequestId: loadRequestRef.current, aborted: controller.signal.aborted })) return;
      const nextStateKey = buildFeedStateKey(options.state);
      setPayload((current) => {
        if (options.append) return { ...data, items: [...current.items, ...data.items] };
        if (options.state.view === "people") {
          return {
            ...data,
            items: current.items,
            popularPosts: current.popularPosts,
            newReleases: current.newReleases,
            releaseOfWeek: current.releaseOfWeek
          };
        }
        return {
          ...data,
          people: current.people
        };
      });
      setLoadedStateKey(nextStateKey);
      setSelectedReactions((current) => {
        const incoming = Object.fromEntries(data.items.filter((item) => item.kind !== "news").map((item) => [item.sourceId, current[item.sourceId] ?? defaultReaction(item)]));
        return options.append ? { ...current, ...incoming } : incoming;
      });
      if (!options.append) restorePendingScroll(nextStateKey);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      if (shouldAcceptFeedResponse({ requestId, activeRequestId: loadRequestRef.current, aborted: controller.signal.aborted })) {
        setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить ленту");
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (shouldAcceptFeedResponse({ requestId, activeRequestId: loadRequestRef.current, aborted: controller.signal.aborted })) {
        setLoading(false);
      }
    }
  }, [lockedAuthorSlug, requestAuthenticatedAction, restorePendingScroll]);

  React.useEffect(() => {
    if (detailMode || isPublicShowcase || !viewerAuthenticated || !activeProfile) return;
    if (communitySetupBootstrappedRef.current === activeProfile.artistKey) return;
    communitySetupBootstrappedRef.current = activeProfile.artistKey;
    if (typeof window === "undefined") return;
    const storageKey = buildCommunitySetupStorageKey(activeProfile.artistKey);
    if (window.localStorage.getItem(storageKey) === "done") return;
    void loadCommunitySetup(activeProfile.artistKey).then((result) => {
      if (!result) return;
      setCommunitySetupOpen(true);
    });
  }, [activeProfile, detailMode, isPublicShowcase, loadCommunitySetup, viewerAuthenticated]);

  React.useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      if (detailMode || disableLiveLoading) return;
      if (guestScopeBlocked) {
        requestAuthenticatedAction({
          reason: "following_tab",
          intendedAction: "open_following",
          focusTargetId: "feed-scope-following"
        });
      }
      void load({ state: initialQueryState });
      return;
    }
    if (detailMode || disableLiveLoading) return;
    void load({ state: resolvedQueryState });
  }, [detailMode, disableLiveLoading, guestScopeBlocked, initialQueryState, load, requestAuthenticatedAction, resolvedQueryState, resolvedQueryStateKey]);

  React.useEffect(() => {
    if (detailMode || disableLiveLoading) return;
    if (!sessionAuthenticated || payload.viewer.authenticated) return;
    void load({ state: resolvedQueryState });
  }, [detailMode, disableLiveLoading, load, payload.viewer.authenticated, resolvedQueryState, sessionAuthenticated]);

  React.useEffect(() => () => {
    abortControllerRef.current?.abort();
  }, []);

  React.useEffect(() => {
    if (detailMode || disableLiveLoading) return;
    syncFeedUrl(resolvedQueryState, "replace");
  }, [detailMode, disableLiveLoading, resolvedQueryState, syncFeedUrl]);

  React.useEffect(() => {
    if (detailMode || disableLiveLoading) return;
    const query = searchSuggestionQuery.trim();
    if (query.length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=5`, { signal: controller.signal });
        const payload = await readJsonResponse<GlobalSearchPayload & ErrorPayload>(response, "Не удалось выполнить поиск");
        if (!response.ok) throw new Error(payload.error ?? "Не удалось выполнить поиск");
        setSearchResults(payload as GlobalSearchPayload);
      } catch (searchError) {
        if (!controller.signal.aborted) setError(searchError instanceof Error ? searchError.message : "Не удалось выполнить поиск");
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 280);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [detailMode, disableLiveLoading, searchSuggestionQuery]);

  React.useEffect(() => {
    if (detailMode || disableLiveLoading || typeof window === "undefined") return;
    const handlePopState = () => {
      const nextState = normalizeLockedAuthorFeedQueryState(
        surface === "dashboard"
          ? resolveDashboardCommunityFeedQueryState(new URLSearchParams(window.location.search))
          : normalizeFeedQueryState(parseFeedQueryParams(new URLSearchParams(window.location.search))),
        lockedAuthorSlug
      );
      currentQueryStateRef.current = nextState;
      applyFeedQueryState({
        setView,
        setScope,
        setType,
        setSearch,
        setCollaborationFilter,
        setCollaborationIntent,
        setCollaborationRole,
        setCollaborationWorkflow,
        setCollaborationPreference,
        setCollaborationCity,
        setCollaborationStatus,
        setSort,
        setProfileType
      }, nextState);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [detailMode, disableLiveLoading, lockedAuthorSlug, surface]);

  React.useEffect(() => {
    if (!sharedHref) return;
    const timeout = window.setTimeout(() => setSharedHref(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [sharedHref]);

  React.useEffect(() => {
    const persistedPostIds = new Set(
      payload.items
        .filter((item): item is FeedPostItem => item.kind === "post")
        .map((item) => item.sourceId)
    );
    if (persistedPostIds.size === 0) return;
    setOptimisticPostsById((current) => {
      let changed = false;
      const next: Record<string, FeedPostItem> = {};
      for (const [postId, item] of Object.entries(current)) {
        if (persistedPostIds.has(postId)) {
          changed = true;
          continue;
        }
        next[postId] = item;
      }
      return changed ? next : current;
    });
  }, [payload.items]);

  React.useEffect(() => {
    if (detailMode || disableLiveLoading || !viewerAuthenticated || typeof window === "undefined") return;
    const saved = parseFeedAuthContext(window.sessionStorage.getItem(FEED_AUTH_RETURN_KEY));
    if (!saved) return;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const savedPath = saved.callbackUrl.split("#")[0] || saved.path;
    if (savedPath !== currentPath && saved.path !== currentPath) return;
    if (saved.drafts && Object.keys(saved.drafts).length) {
      setDrafts((current) => ({ ...saved.drafts, ...current }));
    }
    if (saved.targetId) {
      setExpandedComments((current) => ({ ...current, [saved.targetId!]: true }));
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (saved.anchorId) {
          document.getElementById(saved.anchorId)?.scrollIntoView({ block: "center" });
        }
        if (typeof saved.scrollY === "number") {
          window.scrollTo({ top: saved.scrollY, behavior: "auto" });
        }
        if (saved.focusTargetId) {
          const focusTarget = document.getElementById(saved.focusTargetId);
          if (focusTarget instanceof HTMLElement) {
            focusTarget.focus({ preventScroll: true });
          }
        }
      });
    });
    window.sessionStorage.removeItem(FEED_AUTH_RETURN_KEY);
  }, [detailMode, disableLiveLoading, viewerAuthenticated, loadedStateKey]);

  const resetComposerPickers = React.useCallback(() => {
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
    if (audioInputRef.current) audioInputRef.current.value = "";
  }, []);

  const mediaItemsRef = React.useRef<ComposerMediaItem[]>([]);

  React.useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  React.useEffect(() => () => {
    for (const item of mediaItemsRef.current) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }, []);

  async function resolveLocalMediaMetrics(file: File, mediaType: ComposerMediaKind, previewUrl: string): Promise<Pick<ComposerMediaItem, "width" | "height" | "posterUrl" | "durationSec">> {
    if (mediaType === "image") {
      return await new Promise((resolve) => {
        const image = new window.Image();
        image.onload = () => resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null, posterUrl: null, durationSec: null });
        image.onerror = () => resolve({ width: null, height: null, posterUrl: null, durationSec: null });
        image.src = previewUrl;
      });
    }
    if (mediaType === "video") {
      return await new Promise((resolve) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => resolve({
          width: video.videoWidth || null,
          height: video.videoHeight || null,
          posterUrl: null,
          durationSec: Number.isFinite(video.duration) ? video.duration : null
        });
        video.onerror = () => resolve({ width: null, height: null, posterUrl: null, durationSec: null });
        video.src = previewUrl;
      });
    }
    if (mediaType === "audio") {
      return await new Promise((resolve) => {
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        audio.onloadedmetadata = () => resolve({
          width: null,
          height: null,
          posterUrl: null,
          durationSec: Number.isFinite(audio.duration) ? audio.duration : null
        });
        audio.onerror = () => resolve({ width: null, height: null, posterUrl: null, durationSec: null });
        audio.src = previewUrl;
      });
    }
    return { width: null, height: null, posterUrl: null, durationSec: null };
  }

  function updateComposerMedia(localId: string, patch: Partial<ComposerMediaItem>) {
    setMediaItems((current) => current.map((item) => item.localId === localId ? { ...item, ...patch } : item));
  }

  async function uploadComposerMedia(localId: string, file: File) {
    try {
      const uploaded = await uploadBrowserBlobToStorage({
        fileName: file.name,
        contentType: file.type || inferComposerContentType(file.name),
        kind: "social",
        blob: file,
        onProgress: (loaded, total) => {
          if (!total) return;
          updateComposerMedia(localId, { progress: Math.max(6, Math.min(96, Math.round((loaded / total) * 100))) });
        }
      });
      updateComposerMedia(localId, {
        mediaKey: uploaded.key,
        mediaName: file.name,
        mediaUrl: buildComposerObjectReadUrl(uploaded.key),
        status: "uploaded",
        progress: 100,
        error: null
      });
    } catch (error) {
      updateComposerMedia(localId, {
        status: "error",
        progress: 0,
        error: error instanceof Error ? error.message : "Не удалось загрузить файл"
      });
    }
  }

  async function enqueueComposerFiles(files: FileList | File[], role: ComposerMediaRole) {
    if (!viewerAuthenticated) {
      requestAuthenticatedAction({ reason: "publish", intendedAction: "publish", focusTargetId: "feed-composer-submit" });
      return;
    }
    const acceptedFiles = Array.from(files);
    if (!acceptedFiles.length) return;
    const unsupportedFile = acceptedFiles.find((file) => getComposerFileValidationError(file));
    if (unsupportedFile) {
      setError(getComposerFileValidationError(unsupportedFile) ?? "Неподдерживаемый тип файла");
      resetComposerPickers();
      return;
    }
    const currentImages = mediaItems.filter((item) => item.mediaType === "image").length;
    const currentVideos = mediaItems.filter((item) => item.mediaType === "video").length;
    const currentAudios = mediaItems.filter((item) => item.mediaType === "audio").length;
    const nextImages = acceptedFiles.filter((file) => getComposerFileCategory(file) === "image").length;
    const nextVideos = acceptedFiles.filter((file) => getComposerFileCategory(file) === "video").length;
    const nextAudios = acceptedFiles.filter((file) => getComposerFileCategory(file) === "audio").length;
    if (mediaItems.length + acceptedFiles.length > 8) {
      setError("К одной публикации можно прикрепить до 8 файлов");
      resetComposerPickers();
      return;
    }
    if (currentImages + nextImages > 8) {
      setError("Можно прикрепить до 8 фотографий");
      resetComposerPickers();
      return;
    }
    if (currentVideos + nextVideos > 1) {
      setError("К публикации можно прикрепить только одно видео");
      resetComposerPickers();
      return;
    }
    if (currentAudios + nextAudios > 1) {
      setError("К публикации можно прикрепить только один demo audio");
      resetComposerPickers();
      return;
    }

    setError(null);
    let prepared: ComposerMediaItem[];
    try {
      prepared = await Promise.all(acceptedFiles.map(async (file) => {
        const previewUrl = URL.createObjectURL(file);
        const mediaType = getComposerFileCategory(file);
        if (!mediaType) {
          URL.revokeObjectURL(previewUrl);
          throw new Error("Для публикации доступны только PNG, MP4 до 20 секунд и demo audio в формате MP3");
        }
        const metrics = await resolveLocalMediaMetrics(file, mediaType, previewUrl);
        if (mediaType === "video" && (metrics.durationSec ?? 0) > COMMUNITY_VIDEO_MAX_DURATION_SEC) {
          URL.revokeObjectURL(previewUrl);
          throw new Error("Видео для публикации должно быть не длиннее 20 секунд");
        }
        return {
          localId: globalThis.crypto.randomUUID(),
          mediaType,
          role,
          mediaKey: null,
          mediaName: file.name,
          mediaUrl: previewUrl,
          status: "uploading" as const,
          progress: 2,
          error: null,
          file,
          previewUrl,
          width: metrics.width,
          height: metrics.height,
          posterUrl: metrics.posterUrl,
          durationSec: metrics.durationSec
        } satisfies ComposerMediaItem;
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось подготовить файл к загрузке");
      resetComposerPickers();
      return;
    }
    setMediaItems((current) => [...current, ...prepared].slice(0, 8));
    await Promise.all(prepared.map((item) => uploadComposerMedia(item.localId, item.file)));
    resetComposerPickers();
  }

  async function removeComposerMedia(localId: string) {
    const uploaded = mediaItems.find((item) => item.localId === localId && item.mediaKey);
    setMediaItems((current) => {
      const target = current.find((item) => item.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.localId !== localId);
    });
    if (!uploaded?.mediaKey) return;
    const response = await fetch("/api/user/artist-profile/media", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaKey: uploaded.mediaKey })
    });
    if (!response.ok && response.status !== 409) {
      const payload = await readJsonResponse<ErrorPayload>(response, "Не удалось удалить загруженный файл");
      setError(payload.error ?? "Не удалось удалить загруженный файл");
    }
  }

  async function retryComposerMedia(localId: string) {
    const target = mediaItems.find((item) => item.localId === localId);
    if (!target) return;
    updateComposerMedia(localId, { status: "uploading", progress: 2, error: null });
    await uploadComposerMedia(localId, target.file);
  }

  async function publish() {
    if (!viewerAuthenticated) {
      requestAuthenticatedAction({ reason: "publish", intendedAction: "publish", focusTargetId: "feed-composer-submit" });
      return;
    }
    const uploadedMediaItems = mediaItems
      .filter((item) => item.status === "uploaded" && item.mediaKey)
      .map((item) => ({
        mediaType: item.mediaType,
        mediaKey: item.mediaKey!,
        mediaName: item.mediaName,
        role: item.role,
        width: item.width ?? undefined,
        height: item.height ?? undefined,
        posterUrl: item.posterUrl ?? undefined
      }));
    if (!artistKey || (!content.trim() && uploadedMediaItems.length === 0 && !releaseId)) return;
    if (uploadingComposerMedia) {
      setError("Дождитесь завершения загрузки медиа");
      return;
    }
    if (hasComposerMediaErrors) {
      setError("Исправьте или удалите медиа с ошибкой загрузки");
      return;
    }
    if (composerIntent && !composerCollaborationAvailable) {
      setError("Этот тип публикации недоступен для текущего профиля");
      return;
    }
    if ((composerWorkflow === "offering" || composerIntent === "other") && !composerCustomIntentLabel.trim()) {
      setError("Добавьте короткое уточнение для объявления");
      return;
    }
    const normalizedComposerCity = normalizeCollaborationCity(composerCity);
    if (composerIntent && composerPreference === "local" && !normalizedComposerCity) {
      setError("Укажите город для local-объявления");
      return;
    }
    const collaborationPayload = composerIntent && composerCollaborationAvailable
      ? {
          intent: composerIntent,
          role: (composerRole || getDefaultComposerRole(activeProfile?.profileType, profileCollaboration)) as CollaborationRole,
          workflow: composerWorkflow,
          customIntentLabel: composerCustomIntentLabel.trim(),
          genres: composerGenres,
          preference: composerPreference,
          city: composerPreference === "local" ? normalizedComposerCity : "",
          bio: profileCollaboration?.bio ?? ""
        }
      : undefined;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    loadRequestRef.current += 1;
    setLoading(false);
    setBusy(true);
    setError(null);
    setPublishNotice(null);
    const idempotencyKey = mutationKeysRef.current.acquire("post-composer", postDraftFingerprint);
    try {
      const response = await fetch("/api/user/artist-profile/posts", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          artistKey,
          content,
          releaseId,
          mediaItems: uploadedMediaItems,
          mediaType: uploadedMediaItems[0]?.mediaType,
          mediaKey: uploadedMediaItems[0]?.mediaKey,
          mediaName: uploadedMediaItems[0]?.mediaName,
          collaboration: collaborationPayload
        })
      });
      const next = await readJsonResponse<CreatedPostPayload & ErrorPayload>(response, "Не удалось опубликовать запись");
      if (!response.ok) throw new Error(next.error ?? "Не удалось опубликовать запись");
      mutationKeysRef.current.complete("post-composer", idempotencyKey);
      if (activeProfile) {
        const optimisticSearchText = buildCollaborationSearchText({
          content,
          author: {
            displayName: activeProfile.settings.displayName,
            slug: activeProfile.slug
          },
          collaboration: collaborationPayload,
          linkedRelease: next.release ? {
            title: next.release.title,
            artistName: activeProfile.settings.displayName,
            platformLinks: []
          } : null
        }).toLowerCase();
        const currentSearch = currentQueryStateRef.current.search.trim().toLowerCase();
        const optimisticPresentation = buildCollaborationPresentation(collaborationPayload ?? {});
        const optimisticPost: FeedPostItem = {
          id: `post_${next.id}`,
          sourceId: next.id,
          kind: "post",
          publishedAt: next.created_at,
          permalink: `/feed/post_${next.id}`,
          author: {
            id: activeProfile.slug,
            slug: activeProfile.slug,
            displayName: activeProfile.settings.displayName,
            avatarUrl: activeProfile.avatarUrl,
            profileType: activeProfile.profileType,
            verified: true,
            followingByViewer: false,
            ownedByViewer: true
          },
          likesCount: 0,
          commentsCount: 0,
          likedByViewer: false,
          viewerReaction: null,
          reactionSummary: {
            total: 0,
            counts: { heart: 0, fire: 0, laugh: 0, wow: 0, sad: 0, thumbs: 0, party: 0, diamond: 0 },
            viewerReaction: null
          },
          postType: collaborationPayload ? "collaboration" : "standard",
          content,
          updatedAt: next.created_at,
          editedAt: null,
          mediaType: uploadedMediaItems[0]?.mediaType ?? next.media_type ?? null,
          mediaUrl: uploadedMediaItems[0]?.mediaKey ? uploadedMediaItems[0].posterUrl ?? mediaItems.find((item) => item.mediaKey === uploadedMediaItems[0]?.mediaKey)?.mediaUrl ?? null : null,
          mediaName: uploadedMediaItems[0]?.mediaName ?? next.media_name ?? null,
          mediaItems: uploadedMediaItems.map((item) => {
            const localMatch = mediaItems.find((candidate) => candidate.mediaKey === item.mediaKey);
            return {
              id: item.mediaKey,
              mediaType: item.mediaType,
              mediaUrl: localMatch?.mediaUrl ?? "",
              mediaName: item.mediaName ?? null,
              role: item.role,
              width: item.width ?? null,
              height: item.height ?? null,
              posterUrl: item.posterUrl ?? null
            };
          }).filter((item) => item.mediaUrl),
          comments: [],
          responsesCount: 0,
          linkedRelease: next.release ? {
            id: next.release.id,
            title: next.release.title,
            releaseDate: next.release.date,
            href: `/dashboard/releases/${next.release.id}`
          } : null,
          collaboration: collaborationPayload ? {
            ...collaborationPayload,
            status: "open",
            label: collaborationIntentLabel(collaborationPayload.intent),
            rawIntent: collaborationPayload.intent,
            intentCategory: optimisticPresentation.intentCategory,
            displayIntent: optimisticPresentation.displayIntent,
            rawRole: collaborationPayload.role,
            displayRole: optimisticPresentation.displayRole
          } : null
        };
        const matchesCurrentFeedState = doesFeedPostMatchState(optimisticPost, currentQueryStateRef.current)
          && (currentSearch.length === 0 || optimisticSearchText.includes(currentSearch));
        setOptimisticPostsById((current) => ({
          ...current,
          [optimisticPost.sourceId]: optimisticPost
        }));
        if (matchesCurrentFeedState) {
          setPayload((current) => ({
            ...current,
            items: [optimisticPost, ...current.items],
            collaborationCities: collaborationPayload?.preference === "local" && collaborationPayload.city
              ? Array.from(new Set([...current.collaborationCities, collaborationPayload.city])).sort((left, right) => left.localeCompare(right, "ru-RU"))
              : current.collaborationCities,
            popularPosts: [optimisticPost, ...current.popularPosts].slice(0, 3)
          }));
        } else if (!collaborationPayload && resolveFeedPrimaryView(currentQueryStateRef.current) === "collaborations") {
          setPublishNotice({
            message: "Обычный пост опубликован, но вкладка «Коллаборации» показывает только объявления.",
            href: optimisticPost.permalink
          });
        }
      }
      setContent("");
      setReleaseId("");
      setComposerIntent("");
      setComposerWorkflow("seeking");
      setComposerCustomIntentLabel("");
      setComposerRole(getDefaultComposerRole(activeProfile?.profileType, profileCollaboration));
      setComposerGenres(profileCollaboration?.genres ?? []);
      setComposerPreference(profileCollaboration?.preference ?? "hybrid");
      setComposerCity("");
      setComposerResetToken((current) => current + 1);
      setComposerOpen(false);
      for (const item of mediaItems) {
        URL.revokeObjectURL(item.previewUrl);
      }
      setMediaItems([]);
      if (collaborationPayload) {
        const nextSearchText = buildCollaborationSearchText({
          content,
          collaboration: collaborationPayload
        }).toLowerCase();
        const currentSearch = currentQueryStateRef.current.search.trim().toLowerCase();
        const currentView = resolveFeedPrimaryView(currentQueryStateRef.current);
        const hiddenByCurrentFilters = currentView !== "collaborations"
          || (currentQueryStateRef.current.collaborationIntent && currentQueryStateRef.current.collaborationIntent !== collaborationPayload.intent)
          || (currentQueryStateRef.current.collaborationRole && currentQueryStateRef.current.collaborationRole !== collaborationPayload.role)
          || (currentQueryStateRef.current.collaborationWorkflow && currentQueryStateRef.current.collaborationWorkflow !== collaborationPayload.workflow)
          || (currentQueryStateRef.current.collaborationPreference && currentQueryStateRef.current.collaborationPreference !== collaborationPayload.preference)
          || (currentQueryStateRef.current.collaborationCity && currentQueryStateRef.current.collaborationCity.toLocaleLowerCase("ru-RU") !== collaborationPayload.city.toLocaleLowerCase("ru-RU"))
          || (currentQueryStateRef.current.collaborationStatus && currentQueryStateRef.current.collaborationStatus !== "open")
          || (currentSearch.length > 0 && !nextSearchText.includes(currentSearch));
        if (hiddenByCurrentFilters) {
          applyFilterState({
            ...createDashboardCommunityDefaultFeedQueryState(),
            view: "collaborations"
          }, "replace");
        }
      }
      window.requestAnimationFrame(() => {
        document.getElementById(`feed-item-${next.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Не удалось опубликовать запись");
    } finally {
      setBusy(false);
    }
  }

  async function likePost(postId: string, reaction: FeedReaction = "heart", authRequest?: AuthPromptRequest) {
    if (!viewerAuthenticated) {
      requestAuthenticatedAction(authRequest ?? { reason: "reaction", intendedAction: "react", targetId: postId });
      return;
    }
    const queueKey = `post:${postId}`;
    const previous = reactionQueueRef.current.get(queueKey) ?? Promise.resolve();
    const request = previous.catch(() => undefined).then(async () => {
      let rollbackItem:
        | Pick<FeedPostItem, "likedByViewer" | "likesCount" | "viewerReaction" | "reactionSummary">
        | null = null;
      let rollbackPopular:
        | Pick<FeedPostItem, "likedByViewer" | "likesCount" | "viewerReaction" | "reactionSummary">
        | null = null;
      let rollbackSelectedReaction: FeedReaction | null | undefined;
      setPayload((current) => ({
        ...current,
        items: current.items.map((item) => {
          if (item.kind !== "post" || item.sourceId !== postId) return item;
          rollbackItem = {
            likedByViewer: item.likedByViewer,
            likesCount: item.likesCount,
            viewerReaction: item.viewerReaction,
            reactionSummary: item.reactionSummary
          };
          const optimisticSummary = buildOptimisticReactionSummary(item.reactionSummary, item.viewerReaction, reaction);
          return {
            ...item,
            likedByViewer: optimisticSummary.viewerReaction !== null,
            likesCount: optimisticSummary.total,
            viewerReaction: optimisticSummary.viewerReaction,
            reactionSummary: optimisticSummary
          };
        }),
        popularPosts: current.popularPosts.map((item) => {
          if (item.sourceId !== postId) return item;
          rollbackPopular = {
            likedByViewer: item.likedByViewer,
            likesCount: item.likesCount,
            viewerReaction: item.viewerReaction,
            reactionSummary: item.reactionSummary
          };
          const optimisticSummary = buildOptimisticReactionSummary(item.reactionSummary, item.viewerReaction, reaction);
          return {
            ...item,
            likedByViewer: optimisticSummary.viewerReaction !== null,
            likesCount: optimisticSummary.total,
            viewerReaction: optimisticSummary.viewerReaction,
            reactionSummary: optimisticSummary
          };
        })
      }));
      setSelectedReactions((current) => {
        rollbackSelectedReaction = current[postId];
        const currentReaction = current[postId] ?? null;
        return {
          ...current,
          [postId]: currentReaction === reaction ? null : reaction
        };
      });
      const response = await fetch(`/api/artists/posts/${postId}/like`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reaction })
      });
      const next = await readJsonResponse<{ liked: boolean; likes: number; viewerReaction: FeedReaction | null; reactionSummary: FeedReactionSummary } & ErrorPayload>(response, "Не удалось поставить реакцию");
      if (!response.ok) {
        setPayload((current) => ({
          ...current,
          items: current.items.map((item) => item.kind === "post" && item.sourceId === postId && rollbackItem ? { ...item, ...rollbackItem } : item),
          popularPosts: current.popularPosts.map((item) => item.sourceId === postId && rollbackPopular ? { ...item, ...rollbackPopular } : item)
        }));
        setSelectedReactions((current) => ({ ...current, [postId]: rollbackSelectedReaction ?? null }));
        throw new Error(next.error ?? "Не удалось поставить реакцию");
      }
      setPayload((current) => ({
        ...current,
        items: current.items.map((item) => item.kind === "post" && item.sourceId === postId ? { ...item, likedByViewer: next.liked, likesCount: next.likes, viewerReaction: next.viewerReaction, reactionSummary: next.reactionSummary } : item),
        popularPosts: current.popularPosts.map((item) => item.sourceId === postId ? { ...item, likedByViewer: next.liked, likesCount: next.likes, viewerReaction: next.viewerReaction, reactionSummary: next.reactionSummary } : item)
      }));
      setSelectedReactions((current) => ({ ...current, [postId]: next.viewerReaction }));
    });
    reactionQueueRef.current.set(queueKey, request);
    try {
      await request;
    } catch (reactionError) {
      setError(reactionError instanceof Error ? reactionError.message : "Не удалось поставить реакцию");
    } finally {
      if (reactionQueueRef.current.get(queueKey) === request) reactionQueueRef.current.delete(queueKey);
    }
  }

  async function deletePost(postId: string) {
    if (!viewerAuthenticated) return;
    setError(null);
    setPendingDeletePostId(postId);
  }

  async function confirmDeletePost() {
    if (!viewerAuthenticated || !pendingDeletePostId || deletePostBusy) return;
    setError(null);
    setDeletePostBusy(true);
    const response = await fetch(`/api/user/artist-profile/posts/${pendingDeletePostId}`, { method: "DELETE" });
    const result = await readJsonResponse<ErrorPayload>(response, "Не удалось удалить публикацию");
    if (!response.ok) {
      setDeletePostBusy(false);
      setError(result.error ?? "Не удалось удалить публикацию");
      return;
    }
    setPayload((current) => ({
      ...current,
      items: current.items.filter((item) => item.kind !== "post" || item.sourceId !== pendingDeletePostId),
      popularPosts: current.popularPosts.filter((item) => item.sourceId !== pendingDeletePostId),
      community: {
        ...current.community,
        live: current.community.live.filter((entry) => entry.item.sourceId !== pendingDeletePostId),
        trending: current.community.trending.filter((entry) => entry.item.sourceId !== pendingDeletePostId),
        popular: current.community.popular.filter((entry) => entry.item.sourceId !== pendingDeletePostId),
        collaborations: current.community.collaborations.filter((entry) => entry.item.sourceId !== pendingDeletePostId),
        postOfWeek: current.community.postOfWeek?.item.sourceId === pendingDeletePostId ? null : current.community.postOfWeek
      }
    }));
    setOptimisticPostsById((current) => {
      if (!current[pendingDeletePostId]) return current;
      const next = { ...current };
      delete next[pendingDeletePostId];
      return next;
    });
    setDeletePostBusy(false);
    setPendingDeletePostId(null);
  }

  async function saveCommunitySetup() {
    if (!activeProfile || !communitySetupSettings || communitySetupBusy) return;
    if (communitySetupMode === "selected" && communitySetupSelectedReleaseIds.length === 0) {
      setCommunitySetupError("Выберите хотя бы один релиз или переключитесь на другой режим показа.");
      return;
    }
    const allReleaseIds = communitySetupReleases.map((release) => release.id);
    const selectedReleaseIds = communitySetupMode === "all"
      ? allReleaseIds
      : communitySetupMode === "none"
        ? allReleaseIds
        : communitySetupSelectedReleaseIds;
    setCommunitySetupBusy(true);
    setCommunitySetupError(null);
    try {
      const response = await fetch("/api/user/artist-profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artistKey: activeProfile.artistKey,
          settings: {
            ...communitySetupSettings,
            profileType: communitySetupProfileType,
            catalogReleaseIds: selectedReleaseIds,
            hideAllCommunityReleases: communitySetupMode === "none",
            hiddenCommunityReleaseIds: []
          } satisfies ArtistProfileSettings
        })
      });
      const next = await readJsonResponse<UserArtistProfileSettings & { error?: string }>(response, "Не удалось сохранить настройки сообщества");
      if (!response.ok) throw new Error(next.error ?? "Не удалось сохранить настройки сообщества");
      const updated = next as UserArtistProfileSettings;
      applyCommunitySetupPayload(updated, communitySetupReleases);
      setPayload((current) => ({
        ...current,
        ownedProfiles: current.ownedProfiles.map((profile) => (
          profile.artistKey === updated.artistKey
            ? {
                ...profile,
                profileType: updated.profileType,
                sourceName: updated.sourceName,
                slug: updated.slug,
                avatarUrl: updated.avatarUrl,
                settings: {
                  ...profile.settings,
                  displayName: updated.settings.displayName,
                  autoPublishApprovedReleases: updated.settings.autoPublishApprovedReleases,
                  collaboration: updated.settings.collaboration
                }
              }
            : profile
        ))
      }));
      if (typeof window !== "undefined") {
        const storageKey = buildCommunitySetupStorageKey(activeProfile.artistKey);
        if (shouldSuppressCommunitySetup(communitySetupMode)) {
          window.localStorage.setItem(storageKey, "done");
        } else {
          window.localStorage.removeItem(storageKey);
          communitySetupBootstrappedRef.current = null;
        }
      }
      setCommunitySetupOpen(false);
      await load({ state: resolvedQueryState });
    } catch (saveError) {
      setCommunitySetupError(saveError instanceof Error ? saveError.message : "Не удалось сохранить настройки сообщества");
    } finally {
      setCommunitySetupBusy(false);
    }
  }

  async function editPost(item: FeedPostItem) {
    if (!viewerAuthenticated) return;
    setError(null);
    setPostEditDialog({
      item,
      draft: item.content
    });
  }

  async function confirmEditPost() {
    if (!viewerAuthenticated || !postEditDialog || postEditBusy) return;
    const { item, draft } = postEditDialog;
    const nextContent = draft.trim();
    if (hasPostEditWindowExpired(item.publishedAt)) {
      setError("Прошло 24 часа, и, к сожалению, отредактировать данную публикацию нельзя.");
      return;
    }
    if (nextContent === item.content.trim()) {
      setPostEditDialog(null);
      return;
    }
    setPostEditBusy(true);
    try {
      const response = await fetch(`/api/user/artist-profile/posts/${item.sourceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: nextContent })
      });
      const result = await readJsonResponse<{ content?: string; updatedAt?: string; editedAt?: string } & ErrorPayload>(response, "Не удалось изменить публикацию");
      if (!response.ok) {
        setError(result.error ?? "Не удалось изменить публикацию");
        return;
      }
      setPayload((current) => ({
        ...current,
        items: current.items.map((candidate) => candidate.kind === "post" && candidate.sourceId === item.sourceId ? { ...candidate, content: result.content ?? nextContent, updatedAt: result.updatedAt ?? candidate.updatedAt, editedAt: result.editedAt ?? candidate.editedAt } : candidate),
        popularPosts: current.popularPosts.map((candidate) => candidate.sourceId === item.sourceId ? { ...candidate, content: result.content ?? nextContent, updatedAt: result.updatedAt ?? candidate.updatedAt, editedAt: result.editedAt ?? candidate.editedAt } : candidate)
      }));
      setPostEditDialog(null);
    } finally {
      setPostEditBusy(false);
    }
  }

  async function loadCollaborationResponses(item: FeedPostItem) {
    setResponsesLoadingByPostId((current) => ({ ...current, [item.sourceId]: true }));
    setError(null);
    try {
      const response = await fetch(`/api/artists/posts/${item.sourceId}/responses`);
      const next = await readJsonResponse<CollaborationResponseRecord[] & ErrorPayload>(response, "Не удалось загрузить отклики");
      if (!response.ok) throw new Error(next.error ?? "Не удалось загрузить отклики");
      setResponsesByPostId((current) => ({ ...current, [item.sourceId]: Array.isArray(next) ? next : [] }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить отклики");
    } finally {
      setResponsesLoadingByPostId((current) => ({ ...current, [item.sourceId]: false }));
    }
  }

  async function toggleCollaborationResponses(item: FeedPostItem) {
    const currentlyOpen = responsesOpenByPostId[item.sourceId] === true;
    setResponsesOpenByPostId((current) => ({ ...current, [item.sourceId]: !currentlyOpen }));
    if (!currentlyOpen && !responsesByPostId[item.sourceId]) {
      await loadCollaborationResponses(item);
    }
  }

  function openCollaborationResponseDialog(item: FeedPostItem) {
    if (!viewerAuthenticated) {
      requestAuthenticatedAction({
        reason: "publish",
        intendedAction: "publish",
        targetId: item.sourceId,
        targetSlug: item.author.slug,
        anchorId: `feed-item-${item.sourceId}`,
        focusTargetId: `collaboration-respond-${item.sourceId}`
      });
      return;
    }
    setResponseError(null);
    setResponseDialog({
      item,
      message: "",
      linkedReleaseId: ""
    });
  }

  async function submitCollaborationResponse() {
    if (!responseDialog || responseBusy) return;
    setResponseBusy(true);
    setResponseError(null);
    try {
      const response = await fetch(`/api/artists/posts/${responseDialog.item.sourceId}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artistKey: activeProfile?.artistKey ?? PERSONAL_ARTIST_PROFILE_KEY,
          message: responseDialog.message,
          linkedReleaseId: responseDialog.linkedReleaseId || null
        })
      });
      const next = await readJsonResponse<CollaborationResponseRecord & ErrorPayload>(response, "Не удалось отправить отклик");
      if (!response.ok) throw new Error(next.error ?? "Не удалось отправить отклик");
      setRespondedByPostId((current) => ({ ...current, [responseDialog.item.sourceId]: true }));
      setPayload((current) => ({
        ...current,
        items: current.items.map((item) => item.kind === "post" && item.sourceId === responseDialog.item.sourceId
          ? { ...item, responsesCount: item.responsesCount + 1 }
          : item),
        popularPosts: current.popularPosts.map((item) => item.sourceId === responseDialog.item.sourceId
          ? { ...item, responsesCount: item.responsesCount + 1 }
          : item)
      }));
      setResponseDialog(null);
      setResponseError(null);
      if (responseDialog.item.author.ownedByViewer) {
        setResponsesByPostId((current) => ({
          ...current,
          [responseDialog.item.sourceId]: [next as CollaborationResponseRecord, ...(current[responseDialog.item.sourceId] ?? [])]
        }));
      }
    } catch (submitError) {
      setResponseError(submitError instanceof Error ? submitError.message : "Не удалось отправить отклик");
    } finally {
      setResponseBusy(false);
    }
  }

  async function updateCollaborationAnnouncementStatus(item: FeedPostItem, status: "open" | "closed") {
    if (closeBusyByPostId[item.sourceId]) return;
    setCloseBusyByPostId((current) => ({ ...current, [item.sourceId]: true }));
    setError(null);
    try {
      const response = await fetch(`/api/user/artist-profile/posts/${item.sourceId}/collaboration-status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      const next = await readJsonResponse<{ id: string; status: "open" | "closed" } & ErrorPayload>(
        response,
        status === "closed" ? "Не удалось закрыть объявление" : "Не удалось открыть объявление"
      );
      if (!response.ok) {
        throw new Error(next.error ?? (status === "closed" ? "Не удалось закрыть объявление" : "Не удалось открыть объявление"));
      }
      applyCollaborationStatus(item.sourceId, next.status);
    } catch (closeError) {
      setError(
        closeError instanceof Error
          ? closeError.message
          : status === "closed"
            ? "Не удалось закрыть объявление"
            : "Не удалось открыть объявление"
      );
    } finally {
      setCloseBusyByPostId((current) => ({ ...current, [item.sourceId]: false }));
    }
  }

  async function mutateComment(item: FeedPostItem | FeedReleaseItem, comment: PublicFeedComment, action: "edit" | "delete") {
    if (!viewerAuthenticated || !comment.ownedByViewer || comment.deletedAt) return;
    const itemId = item.kind === "post" ? item.sourceId : item.releaseId;
    const endpoint = item.kind === "post" ? `/api/artists/posts/${itemId}/comments` : `/api/scene/releases/${itemId}/comments`;
    const content = action === "edit" ? window.prompt("Изменить комментарий", comment.content) : null;
    if (action === "edit" && (content === null || content.trim() === comment.content.trim())) return;
    if (action === "delete" && !window.confirm("Удалить комментарий?")) return;
    const response = await fetch(action === "delete" ? `${endpoint}?commentId=${encodeURIComponent(comment.id)}` : endpoint, {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: action === "edit" ? { "content-type": "application/json" } : undefined,
      body: action === "edit" ? JSON.stringify({ commentId: comment.id, content }) : undefined
    });
    const result = await readJsonResponse<ErrorPayload>(response, action === "edit" ? "Не удалось изменить комментарий" : "Не удалось удалить комментарий");
    if (!response.ok) return setError(result.error ?? "Не удалось обновить комментарий");
    await loadAllComments(item);
  }

  async function reactToComment(item: FeedPostItem | FeedReleaseItem, comment: PublicFeedComment) {
    if (!viewerAuthenticated) {
      requestAuthenticatedAction({ reason: "reaction", intendedAction: "react", targetId: comment.id, focusTargetId: `comment-${comment.id}` });
      return;
    }
    if (comment.deletedAt) return;
    const itemId = item.kind === "post" ? item.sourceId : item.releaseId;
    const endpoint = item.kind === "post"
      ? `/api/artists/posts/${itemId}/comments/${comment.id}/like`
      : `/api/scene/releases/${itemId}/comments/${comment.id}/like`;
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reaction: "heart" }) });
    const result = await readJsonResponse<ErrorPayload>(response, "Не удалось поставить реакцию");
    if (!response.ok) return setError(result.error ?? "Не удалось поставить реакцию");
    await loadAllComments(item);
  }

  async function likeRelease(releaseIdValue: string, reaction: FeedReaction = "heart", authRequest?: AuthPromptRequest) {
    if (!viewerAuthenticated) {
      requestAuthenticatedAction(authRequest ?? { reason: "reaction", intendedAction: "react", targetId: releaseIdValue });
      return;
    }
    const queueKey = `release:${releaseIdValue}`;
    const previous = reactionQueueRef.current.get(queueKey) ?? Promise.resolve();
    const request = previous.catch(() => undefined).then(async () => {
      let rollbackItem:
        | Pick<FeedReleaseItem, "likedByViewer" | "likesCount" | "viewerReaction" | "reactionSummary">
        | null = null;
      let rollbackNewRelease:
        | Pick<FeedReleaseItem, "likedByViewer" | "likesCount" | "viewerReaction" | "reactionSummary">
        | null = null;
      let rollbackSelectedReaction: FeedReaction | null | undefined;
      setPayload((current) => ({
        ...current,
        items: current.items.map((item) => {
          if (item.kind !== "release" || item.releaseId !== releaseIdValue) return item;
          rollbackItem = {
            likedByViewer: item.likedByViewer,
            likesCount: item.likesCount,
            viewerReaction: item.viewerReaction,
            reactionSummary: item.reactionSummary
          };
          const optimisticSummary = buildOptimisticReactionSummary(item.reactionSummary, item.viewerReaction, reaction);
          return {
            ...item,
            likedByViewer: optimisticSummary.viewerReaction !== null,
            likesCount: optimisticSummary.total,
            viewerReaction: optimisticSummary.viewerReaction,
            reactionSummary: optimisticSummary
          };
        }),
        newReleases: current.newReleases.map((item) => {
          if (item.releaseId !== releaseIdValue) return item;
          rollbackNewRelease = {
            likedByViewer: item.likedByViewer,
            likesCount: item.likesCount,
            viewerReaction: item.viewerReaction,
            reactionSummary: item.reactionSummary
          };
          const optimisticSummary = buildOptimisticReactionSummary(item.reactionSummary, item.viewerReaction, reaction);
          return {
            ...item,
            likedByViewer: optimisticSummary.viewerReaction !== null,
            likesCount: optimisticSummary.total,
            viewerReaction: optimisticSummary.viewerReaction,
            reactionSummary: optimisticSummary
          };
        }),
        popularPosts: current.popularPosts
      }));
      setSelectedReactions((current) => {
        rollbackSelectedReaction = current[releaseIdValue];
        const currentReaction = current[releaseIdValue] ?? null;
        return {
          ...current,
          [releaseIdValue]: currentReaction === reaction ? null : reaction
        };
      });
      const response = await fetch(`/api/scene/releases/${releaseIdValue}/like`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reaction })
      });
      const next = await readJsonResponse<{ liked: boolean; likes: number; viewerReaction: FeedReaction | null; reactionSummary: FeedReactionSummary } & ErrorPayload>(response, "Не удалось поставить реакцию");
      if (!response.ok) {
        setPayload((current) => ({
          ...current,
          items: current.items.map((item) => item.kind === "release" && item.releaseId === releaseIdValue && rollbackItem ? { ...item, ...rollbackItem } : item),
          newReleases: current.newReleases.map((item) => item.releaseId === releaseIdValue && rollbackNewRelease ? { ...item, ...rollbackNewRelease } : item),
          popularPosts: current.popularPosts
        }));
        setSelectedReactions((current) => ({ ...current, [releaseIdValue]: rollbackSelectedReaction ?? null }));
        throw new Error(next.error ?? "Не удалось поставить реакцию");
      }
      setPayload((current) => ({
        ...current,
        items: current.items.map((item) => item.kind === "release" && item.releaseId === releaseIdValue ? { ...item, likedByViewer: next.liked, likesCount: next.likes, viewerReaction: next.viewerReaction, reactionSummary: next.reactionSummary } : item),
        newReleases: current.newReleases.map((item) => item.releaseId === releaseIdValue ? { ...item, likedByViewer: next.liked, likesCount: next.likes, viewerReaction: next.viewerReaction, reactionSummary: next.reactionSummary } : item),
        popularPosts: current.popularPosts
      }));
      setSelectedReactions((current) => ({ ...current, [releaseIdValue]: next.viewerReaction }));
    });
    reactionQueueRef.current.set(queueKey, request);
    try {
      await request;
    } catch (reactionError) {
      setError(reactionError instanceof Error ? reactionError.message : "Не удалось поставить реакцию");
    } finally {
      if (reactionQueueRef.current.get(queueKey) === request) reactionQueueRef.current.delete(queueKey);
    }
  }

  async function commentPost(postId: string, authRequest?: AuthPromptRequest, parentId?: string | null) {
    if (!viewerAuthenticated) {
      requestAuthenticatedAction(authRequest ?? {
        reason: parentId ? "reply" : "comment",
        intendedAction: parentId ? "reply" : "comment",
        targetId: postId,
        focusTargetId: parentId ? `reply-${parentId}` : `comment-input-${postId}`,
        drafts: parentId
          ? (replyDraftsByItem[postId]?.[parentId] ? { [parentId]: replyDraftsByItem[postId][parentId] } : {})
          : (drafts[postId] ? { [postId]: drafts[postId] } : {})
      });
      return;
    }
    const pendingKey = parentId ? `${postId}:${parentId}` : postId;
    if (commentPendingById[pendingKey]) return;
    const value = parentId ? (replyDraftsByItem[postId]?.[parentId]?.trim() ?? "") : (drafts[postId]?.trim() ?? "");
    if (!value) return;
    const mutationSlot = socialCommentMutationSlot("post", postId, parentId);
    const idempotencyKey = mutationKeysRef.current.acquire(mutationSlot, socialCommentFingerprint(value));
    setCommentPendingById((current) => ({ ...current, [pendingKey]: true }));
    try {
      const response = await fetch(`/api/artists/posts/${postId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ content: value, parentId: parentId ?? null })
      });
      const next = await readJsonResponse<PublicFeedComment & ErrorPayload>(response, "Не удалось добавить комментарий");
      if (!response.ok) return setError(next.error ?? "Не удалось добавить комментарий");
      mutationKeysRef.current.complete(mutationSlot, idempotencyKey);
      if (parentId) {
        setReplyDraftsByItem((current) => ({ ...current, [postId]: { ...(current[postId] ?? {}), [parentId]: "" } }));
        setReplyTargetByItem((current) => ({ ...current, [postId]: null }));
      } else setDrafts((current) => ({ ...current, [postId]: "" }));
      setExpandedComments((current) => ({ ...current, [postId]: true }));
      setPayload((current) => ({
        ...current,
        items: current.items.map((item) => item.kind === "post" && item.sourceId === postId ? { ...item, comments: parentId ? insertReply(item.comments, parentId, next as PublicFeedComment) : [next as PublicFeedComment, ...item.comments], commentsCount: item.commentsCount + 1 } : item),
        popularPosts: current.popularPosts.map((item) => item.sourceId === postId ? { ...item, comments: parentId ? insertReply(item.comments, parentId, next as PublicFeedComment) : [next as PublicFeedComment, ...item.comments], commentsCount: item.commentsCount + 1 } : item)
      }));
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : "Не удалось добавить комментарий");
    } finally {
      setCommentPendingById((current) => ({ ...current, [pendingKey]: false }));
    }
  }

  async function commentRelease(releaseIdValue: string, authRequest?: AuthPromptRequest, parentId?: string | null) {
    if (!viewerAuthenticated) {
      requestAuthenticatedAction(authRequest ?? {
        reason: parentId ? "reply" : "comment",
        intendedAction: parentId ? "reply" : "comment",
        targetId: releaseIdValue,
        focusTargetId: parentId ? `reply-${parentId}` : `comment-input-${releaseIdValue}`,
        drafts: parentId
          ? (replyDraftsByItem[releaseIdValue]?.[parentId] ? { [parentId]: replyDraftsByItem[releaseIdValue][parentId] } : {})
          : (drafts[releaseIdValue] ? { [releaseIdValue]: drafts[releaseIdValue] } : {})
      });
      return;
    }
    const pendingKey = parentId ? `${releaseIdValue}:${parentId}` : releaseIdValue;
    if (commentPendingById[pendingKey]) return;
    const value = parentId ? (replyDraftsByItem[releaseIdValue]?.[parentId]?.trim() ?? "") : (drafts[releaseIdValue]?.trim() ?? "");
    if (!value) return;
    const mutationSlot = socialCommentMutationSlot("release", releaseIdValue, parentId);
    const idempotencyKey = mutationKeysRef.current.acquire(mutationSlot, socialCommentFingerprint(value));
    setCommentPendingById((current) => ({ ...current, [pendingKey]: true }));
    try {
      const response = await fetch(`/api/scene/releases/${releaseIdValue}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ content: value, parentId: parentId ?? null })
      });
      const next = await readJsonResponse<PublicFeedComment & ErrorPayload>(response, "Не удалось добавить комментарий");
      if (!response.ok) return setError(next.error ?? "Не удалось добавить комментарий");
      mutationKeysRef.current.complete(mutationSlot, idempotencyKey);
      if (parentId) {
        setReplyDraftsByItem((current) => ({ ...current, [releaseIdValue]: { ...(current[releaseIdValue] ?? {}), [parentId]: "" } }));
        setReplyTargetByItem((current) => ({ ...current, [releaseIdValue]: null }));
      } else setDrafts((current) => ({ ...current, [releaseIdValue]: "" }));
      setExpandedComments((current) => ({ ...current, [releaseIdValue]: true }));
      setPayload((current) => ({
        ...current,
        items: current.items.map((item) => item.kind === "release" && item.releaseId === releaseIdValue ? { ...item, comments: parentId ? insertReply(item.comments, parentId, next as PublicFeedComment) : [next as PublicFeedComment, ...item.comments], commentsCount: item.commentsCount + 1 } : item),
        newReleases: current.newReleases.map((item) => item.releaseId === releaseIdValue ? { ...item, comments: parentId ? insertReply(item.comments, parentId, next as PublicFeedComment) : [next as PublicFeedComment, ...item.comments], commentsCount: item.commentsCount + 1 } : item),
        popularPosts: current.popularPosts
      }));
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : "Не удалось добавить комментарий");
    } finally {
      setCommentPendingById((current) => ({ ...current, [pendingKey]: false }));
    }
  }

  async function loadAllComments(item: FeedPostItem | FeedReleaseItem) {
    const itemId = item.kind === "post" ? item.sourceId : item.releaseId;
    if (commentsLoadingRef.current.has(itemId)) return;
    commentsLoadingRef.current.add(itemId);
    setExpandedComments((current) => ({ ...current, [itemId]: true }));
    try {
      const endpoint = item.kind === "post"
        ? `/api/artists/posts/${encodeURIComponent(itemId)}/comments?limit=100`
        : `/api/scene/releases/${encodeURIComponent(itemId)}/comments?limit=100`;
      const response = await fetch(endpoint);
      const result = await readJsonResponse<{
        comments: PublicFeedComment[];
        total: number;
        error?: string;
      }>(response, "Не удалось загрузить комментарии");
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить комментарии");
      setPayload((current) => ({
        ...current,
        items: current.items.map((candidate) => candidate.kind === item.kind && candidate.sourceId === itemId
          ? { ...candidate, comments: result.comments, commentsCount: result.total }
          : candidate),
        newReleases: current.newReleases.map((candidate) => item.kind === "release" && candidate.releaseId === itemId
          ? { ...candidate, comments: result.comments, commentsCount: result.total }
          : candidate),
        popularPosts: current.popularPosts.map((candidate) => candidate.kind === item.kind && candidate.sourceId === itemId
          ? { ...candidate, comments: result.comments, commentsCount: result.total }
          : candidate)
      }));
    } catch (commentsError) {
      setError(commentsError instanceof Error ? commentsError.message : "Не удалось загрузить комментарии");
    } finally {
      commentsLoadingRef.current.delete(itemId);
    }
  }

  async function toggleFollow(slug: string, currentlyFollowing: boolean, authRequest?: AuthPromptRequest) {
    if (!viewerAuthenticated) {
      requestAuthenticatedAction(authRequest ?? {
        reason: "follow",
        intendedAction: "follow_author",
        targetSlug: slug,
        focusTargetId: `follow-${slug}`
      });
      return;
    }
    setFollowBusyBySlug((current) => ({ ...current, [slug]: true }));
    updateFollowState(slug, !currentlyFollowing);
    try {
      const response = await fetch(`/api/artists/${encodeURIComponent(slug)}/follow`, { method: "POST" });
      const next = await readJsonResponse<{ following?: boolean; error?: string }>(response, "Не удалось обновить подписку");
      if (!response.ok || typeof next.following !== "boolean") {
        updateFollowState(slug, currentlyFollowing);
        setError(next.error ?? "Не удалось обновить подписку");
        return;
      }
      updateFollowState(slug, next.following);
    } catch (followError) {
      updateFollowState(slug, currentlyFollowing);
      setError(followError instanceof Error ? followError.message : "Не удалось обновить подписку");
    } finally {
      setFollowBusyBySlug((current) => ({ ...current, [slug]: false }));
    }
  }

  function applyFilterState(nextState: FeedQueryState, mode: "push" | "replace" = "push") {
    const normalizedNextState = normalizeLockedAuthorFeedQueryState(normalizeFeedQueryState(nextState), lockedAuthorSlug);
    if (typeof window !== "undefined" && !detailMode && !disableLiveLoading) {
      pendingScrollRestoreRef.current = {
        stateKey: buildFeedStateKey(normalizedNextState),
        scrollY: window.scrollY
      };
    }
    currentQueryStateRef.current = normalizedNextState;
    applyFeedQueryState({
      setView,
      setScope,
      setType,
      setSearch,
      setCollaborationFilter,
      setCollaborationIntent,
      setCollaborationRole,
      setCollaborationWorkflow,
      setCollaborationPreference,
      setCollaborationCity,
      setCollaborationStatus,
      setSort,
      setProfileType
    }, normalizedNextState);
    syncFeedUrl(normalizedNextState, mode);
  }

  function handleScopeChange(nextScope: "all" | "following") {
    if (lockedAuthorSlug) {
      applyFilterState(buildNextFeedQueryState(currentQueryStateRef.current, { scope: "all" }), "push");
      return;
    }
    if (nextScope === "following" && !viewerAuthenticated) {
      requestAuthenticatedAction({
        reason: "following_tab",
        intendedAction: "open_following",
        focusTargetId: "feed-scope-following"
      });
      return;
    }
    applyFilterState(buildNextFeedQueryState(currentQueryStateRef.current, { scope: nextScope }), "push");
  }

  function handleTypeChange(nextType: FeedType) {
    applyFilterState(buildNextFeedQueryState(currentQueryStateRef.current, { type: nextType }), "push");
  }

  function handleCollaborationFilterChange(nextWorkflow: CollaborationWorkflow | null) {
    setDraftCollaborationWorkflow(nextWorkflow);
  }

  function handleCollaborationRoleChange(nextRole: CollaborationRole | null) {
    setDraftCollaborationRole(nextRole);
  }

  function handleCollaborationPreferenceChange(nextPreference: CollaborationPreference | null) {
    setDraftCollaborationPreference(nextPreference);
    if (nextPreference !== "local") setDraftCollaborationCity(null);
  }

  function handleCollaborationCityChange(nextCity: string | null) {
    setDraftCollaborationPreference("local");
    setDraftCollaborationCity(normalizeCollaborationCity(nextCity));
  }

  function handleCollaborationStatusChange(nextStatus: CollaborationStatus | null) {
    setDraftCollaborationStatus(nextStatus);
  }

  function handleSortChange(nextSort: FeedSort) {
    setDraftSort(nextSort);
  }

  function handleSearchChange(nextSearch: string) {
    setSearch(nextSearch);
  }

  function handleCollaborationSearchChange(nextSearch: string) {
    setDraftSearch(nextSearch);
  }

  function applyCollaborationDraftFilters() {
    applyFilterState(buildNextFeedQueryState(currentQueryStateRef.current, {
      search: draftSearch,
      collaborationFilter: "only",
      collaborationWorkflow: draftCollaborationWorkflow,
      collaborationRole: draftCollaborationRole,
      collaborationPreference: draftCollaborationPreference,
      collaborationCity: draftCollaborationPreference === "local" ? normalizeCollaborationCity(draftCollaborationCity) : null,
      collaborationStatus: draftCollaborationStatus,
      sort: draftSort
    }), "push");
  }

  function resetCollaborationFilters() {
    const defaultState = createDashboardCommunityDefaultFeedQueryState();
    setDraftSearch(defaultState.search);
    setDraftCollaborationWorkflow(defaultState.collaborationWorkflow);
    setDraftCollaborationRole(defaultState.collaborationRole);
    setDraftCollaborationPreference(defaultState.collaborationPreference);
    setDraftCollaborationCity(defaultState.collaborationCity);
    setDraftCollaborationStatus(defaultState.collaborationStatus);
    setDraftSort(defaultState.sort);
    applyFilterState(defaultState, "push");
  }

  function openComposer() {
    setComposerOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById("feed-composer-root")?.scrollIntoView({ block: "start", behavior: "smooth" });
      window.requestAnimationFrame(() => {
        document.getElementById("feed-composer-submit")?.focus({ preventScroll: true });
      });
    });
  }

  async function handleShare(href: string) {
    const absolute = `${window.location.origin}${href}`;
    try {
      if (navigator.share) {
        await navigator.share({ url: absolute });
      } else {
        await navigator.clipboard.writeText(absolute);
        setSharedHref(href);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(absolute);
        setSharedHref(href);
      } catch {
        setError("Не удалось скопировать ссылку");
      }
    }
  }

  return (
    <div className={`${detailMode ? "feed-skin grid gap-5 pt-16 sm:pt-20" : primaryView === "collaborations" ? "feed-skin grid gap-5 pt-16 sm:pt-20" : "feed-skin grid gap-5 pt-16 sm:pt-20 xl:grid-cols-[minmax(0,820px)_300px] xl:items-start xl:justify-center xl:gap-6"} ${activeRelease ? "pb-[176px] sm:pb-[188px]" : ""}`}>
      <div className={`mx-auto grid w-full gap-4 ${primaryView === "collaborations" && !detailMode ? "max-w-[1180px]" : "max-w-[820px]"}`}>
        {(detailMode || primaryView !== "collaborations") ? (
          <FeedHeader
            detailMode={detailMode}
            communityUnavailable={communityUnavailable}
          />
        ) : null}

        {!detailMode ? (
          <div className="-mx-1 px-1 pb-2 pt-1">
            <div className="relative z-40 rounded-[26px] bg-[rgba(11,15,28,0.92)] shadow-[0_18px_48px_rgba(7,10,18,0.42)] backdrop-blur-2xl">
              {surface === "dashboard" ? (
                <div className="glass-card flex flex-col gap-4 rounded-[26px] p-4 sm:p-5">
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_252px] xl:items-end">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Collab Market</p>
	                      <div className="relative z-20 mt-3">
	                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_132px]">
	                          <label className="group flex h-[52px] items-center gap-3 rounded-[18px] border border-white/10 bg-[#111522]/88 px-4 text-white/74 transition focus-within:border-[#7b61ff]/55 focus-within:ring-0">
	                            <Search className="h-4 w-4 shrink-0 text-white/34" />
	                            <input
	                              value={draftSearch}
	                              onChange={(event) => handleCollaborationSearchChange(event.target.value)}
	                              onKeyDown={(event) => {
	                                if (event.key === "Enter") {
	                                  event.preventDefault();
	                                  applyCollaborationDraftFilters();
	                                }
	                              }}
	                              placeholder="Ищите роли, жанры, релизы, имена, remote/local, открытые и закрытые объявления..."
	                              className="feed-search-input min-w-0 flex-1 appearance-none border-0 bg-transparent px-0 text-sm leading-none text-white outline-none shadow-none placeholder:text-white/34 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
	                              aria-label="Поиск по Collab Market"
	                            />
	                            {searchLoading ? <span className="h-2 w-2 rounded-full bg-[#7b61ff]" /> : null}
	                          </label>
	                          <button
	                            type="button"
	                            onClick={applyCollaborationDraftFilters}
	                            disabled={loading}
	                            className="inline-flex h-[52px] items-center justify-center rounded-[16px] border border-[#7b61ff]/34 bg-[#7b61ff]/16 px-5 text-sm font-semibold text-white shadow-[0_18px_40px_-28px_rgba(123,97,255,0.8)] transition hover:bg-[#7b61ff]/22 disabled:cursor-not-allowed disabled:opacity-60"
	                          >
	                            {loading ? "Ищем..." : "Искать"}
	                          </button>
	                        </div>
	                        <SearchResultsDropdown query={deferredDraftSearch} results={searchResults} loading={searchLoading} />
	                      </div>
                    </div>
                    {canPublish ? (
                      <div className="xl:shrink-0">
                        <button
                          type="button"
                          onClick={openComposer}
                          className="inline-flex h-[52px] w-full items-center justify-center rounded-[16px] border border-[#7b61ff]/30 bg-[linear-gradient(135deg,#7b61ff,#9a85ff)] px-6 text-sm font-semibold text-white shadow-[0_20px_48px_-24px_rgba(123,97,255,0.85)] transition hover:brightness-110 xl:min-w-[252px]"
                        >
                          + Создать объявление
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-3 border-t border-white/7 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {COLLABORATION_WORKFLOW_FILTERS.map((item) => (
                        <FilterButton
                          key={item.key ?? "all-workflows"}
	                          active={draftCollaborationWorkflow === item.key}
                          onClick={() => handleCollaborationFilterChange(item.key)}
                        >
                          {item.label}
                        </FilterButton>
                      ))}
                      <div className="w-full min-w-0 sm:w-[calc(50%-4px)] xl:w-[260px]">
                        <ComposerSelect
                          icon={<Reply className="h-4 w-4 text-[#9d8dff]" />}
                          label="Роль"
	                          value={draftCollaborationRole ?? ""}
                          options={COLLABORATION_ROLE_FILTER_OPTIONS}
                          onChange={(value) => handleCollaborationRoleChange((value || null) as CollaborationRole | null)}
                          minWidthClass="min-w-0"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-full min-w-0 sm:w-[calc(50%-4px)] xl:w-[270px]">
                        <ComposerSelect
                          icon={<Search className="h-4 w-4 text-cyan-300" />}
                          label="Формат"
	                          value={draftCollaborationPreference ?? ""}
                          options={COLLABORATION_PREFERENCE_FILTER_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                          onChange={(value) => handleCollaborationPreferenceChange((value || null) as CollaborationPreference | null)}
                          minWidthClass="min-w-0"
                        />
                      </div>
	                      {draftCollaborationPreference === "local" ? (
                        <div className="w-full min-w-0 sm:w-[calc(50%-4px)] xl:w-[270px]">
                          <ComposerSelect
                            icon={<MapPin className="h-4 w-4 text-cyan-300" />}
                            label="Город"
	                            value={draftCollaborationCity ?? ""}
                            options={collaborationCityOptions}
                            onChange={(value) => handleCollaborationCityChange(value || null)}
                            minWidthClass="min-w-0"
                          />
                        </div>
                      ) : null}
                      <div className="w-full min-w-0 sm:w-[calc(50%-4px)] xl:w-[270px]">
                        <ComposerSelect
                          icon={<Check className="h-4 w-4 text-emerald-300" />}
                          label="Статус"
	                          value={draftCollaborationStatus ?? ""}
                          options={COLLABORATION_STATUS_FILTER_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                          onChange={(value) => handleCollaborationStatusChange((value || null) as CollaborationStatus | null)}
                          minWidthClass="min-w-0"
                        />
                      </div>
                      <div className="w-full min-w-0 sm:w-[calc(50%-4px)] xl:w-[330px]">
                        <ComposerSelect
                          icon={<span className="text-base leading-none text-[#9b7cff]">≡</span>}
                          label="Сортировка"
	                          value={draftSort}
                          options={COLLABORATION_SORT_OPTIONS}
                          onChange={(value) => handleSortChange(value as FeedSort)}
                          minWidthClass="min-w-0"
                        />
                      </div>
	                    {(draftCollaborationWorkflow || draftCollaborationRole || draftCollaborationPreference || draftCollaborationCity || draftCollaborationStatus || draftSort !== "newest" || draftSearch.trim()) ? (
	                      <button
	                        type="button"
	                        onClick={resetCollaborationFilters}
                        className="inline-flex h-12 items-center rounded-[16px] border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white/68 transition hover:border-white/18 hover:text-white"
                      >
                        Сбросить
                      </button>
                    ) : null}
                    </div>
                  </div>
                  {communityUnavailable ? <CommunityUnavailableNotice /> : null}
                </div>
              ) : (
                <>
                  <nav className="glass-card flex flex-col gap-3 rounded-xl border-b border-white/5 p-2.5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <ScopeButton active={scope === "all"} onClick={() => handleScopeChange("all")}>Все</ScopeButton>
                      <ScopeButton id="feed-scope-following" active={scope === "following"} onClick={() => handleScopeChange("following")}>Подписки</ScopeButton>
                    </div>
                    <div className="relative z-20 flex-1 lg:mx-4 lg:max-w-md">
                      <label className="group flex h-12 items-center gap-3 rounded-[14px] border border-white/10 bg-[#111522]/88 px-4 text-white/74 transition focus-within:border-[#7b61ff]/55 focus-within:ring-0">
                        <Search className="h-4 w-4 shrink-0 text-white/34" />
                        <input
                          value={search}
                          onChange={(event) => handleSearchChange(event.target.value)}
                          placeholder="Поиск в ленте..."
                          className="feed-search-input min-w-0 flex-1 appearance-none border-0 bg-transparent px-0 text-sm leading-none text-white outline-none shadow-none placeholder:text-white/34 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                          aria-label="Глобальный поиск"
                        />
                        {searchLoading ? <span className="h-2 w-2 rounded-full bg-[#7b61ff]" /> : null}
                      </label>
                      <SearchResultsDropdown query={deferredSearch} results={searchResults} loading={searchLoading} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {FILTERS.map((item) => <FilterButton key={item.key} active={type === item.key} onClick={() => handleTypeChange(item.key)}>{item.label}</FilterButton>)}
                      <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-white/54 transition hover:border-[#7b61ff]/50 hover:bg-white/[0.05] hover:text-white">
                        <Reply className="h-4 w-4 rotate-90" />
                      </button>
                    </div>
                    <div className="w-full border-t border-white/7 pt-3 lg:hidden">
                      {communityUnavailable ? <CommunityUnavailableNotice /> : null}
                      <div className="flex flex-wrap items-center gap-2">
                        {COLLABORATION_WORKFLOW_FILTERS.map((item) => <FilterButton key={item.key ?? "all-workflows-mobile"} active={collaborationWorkflow === item.key} onClick={() => handleCollaborationFilterChange(item.key)}>{item.label}</FilterButton>)}
                      </div>
                    </div>
                  </nav>
                  <div className="hidden border-t border-white/7 px-2.5 pb-2.5 pt-3 lg:block">
                    {communityUnavailable ? <CommunityUnavailableNotice /> : null}
                    <div className="flex flex-wrap items-center gap-2">
                      {COLLABORATION_WORKFLOW_FILTERS.map((item) => <FilterButton key={item.key ?? "all-workflows-desktop"} active={collaborationWorkflow === item.key} onClick={() => handleCollaborationFilterChange(item.key)}>{item.label}</FilterButton>)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {canPublish && primaryView === "collaborations" && composerOpen ? (
          <ComposerCard
            busy={busy}
            uploading={uploadingComposerMedia}
            hasErrors={hasComposerMediaErrors}
            content={content}
            releaseId={releaseId}
            mediaItems={mediaItems}
            profile={activeProfile}
            scopedReleases={scopedReleases}
            autoPublishEnabled={Boolean(activeProfile?.settings.autoPublishApprovedReleases)}
            collaborationProfile={profileCollaboration}
            collaborationIntent={composerIntent}
            collaborationWorkflow={composerWorkflow}
            collaborationCustomIntentLabel={composerCustomIntentLabel}
            collaborationRole={composerRole}
            collaborationPreference={composerPreference}
            collaborationCity={composerCity}
            collaborationGenres={composerGenres}
            onContentChange={setContent}
            onReleaseChange={setReleaseId}
            onCollaborationIntentChange={setComposerIntent}
            onCollaborationWorkflowChange={setComposerWorkflow}
            onCollaborationCustomIntentLabelChange={setComposerCustomIntentLabel}
            onCollaborationRoleChange={setComposerRole}
            onCollaborationPreferenceChange={(value) => {
              setComposerPreference(value);
              if (value !== "local") setComposerCity("");
            }}
            onCollaborationCityChange={setComposerCity}
            onCollaborationGenresChange={setComposerGenres}
            onPickImages={() => imageInputRef.current?.click()}
            onPickVideo={() => videoInputRef.current?.click()}
            onPickDemo={() => audioInputRef.current?.click()}
            onRemoveMedia={removeComposerMedia}
            onRetryMedia={(localId) => void retryComposerMedia(localId)}
            onPublish={() => void publish()}
            resetToken={composerResetToken}
          />
        ) : null}

        <CommunitySetupDialog
          open={communitySetupOpen}
          loading={communitySetupLoading}
          busy={communitySetupBusy}
          error={communitySetupError}
          profileType={communitySetupProfileType}
          visibilityMode={communitySetupMode}
          releases={communitySetupReleases}
          selectedReleaseIds={communitySetupSelectedReleaseIds}
          onClose={() => {
            if (communitySetupBusy) return;
            setCommunitySetupOpen(false);
          }}
          onProfileTypeChange={setCommunitySetupProfileType}
          onVisibilityModeChange={setCommunitySetupMode}
          onToggleRelease={(releaseId) => {
            setCommunitySetupSelectedReleaseIds((current) => current.includes(releaseId)
              ? current.filter((id) => id !== releaseId)
              : [...current, releaseId]
            );
          }}
          onConfirm={() => void saveCommunitySetup()}
        />
        <AuthPromptDialog open={authPromptOpen} copy={authPromptCopy} loginHref={loginHref} registerHref={registerHref} onClose={closeAuthPrompt} />
        <DeletePostConfirmDialog
          open={Boolean(pendingDeletePostId)}
          busy={deletePostBusy}
          onClose={() => {
            if (deletePostBusy) return;
            setPendingDeletePostId(null);
          }}
          onConfirm={() => void confirmDeletePost()}
        />
        <EditPostDialog
          open={Boolean(postEditDialog)}
          busy={postEditBusy}
          expired={postEditDialog ? hasPostEditWindowExpired(postEditDialog.item.publishedAt) : false}
          value={postEditDialog?.draft ?? ""}
          onChange={(value) => setPostEditDialog((current) => (current ? { ...current, draft: value } : current))}
          onClose={() => {
            if (postEditBusy) return;
            setPostEditDialog(null);
          }}
          onConfirm={() => void confirmEditPost()}
        />
        <CollaborationResponseDialog
          open={Boolean(responseDialog)}
          busy={responseBusy}
          error={responseError}
          releases={scopedReleases}
          summary={responseDialog?.item.collaboration ? {
            intent: collaborationIntentLabel(responseDialog.item.collaboration.rawIntent),
            role: formatMarketplaceRoleLabel(responseDialog.item.collaboration.rawRole),
            format: responseDialog.item.collaboration.preference === "local" && responseDialog.item.collaboration.city
              ? `${formatMarketplacePreferenceLabel(responseDialog.item.collaboration.preference)} · ${responseDialog.item.collaboration.city}`
              : formatMarketplacePreferenceLabel(responseDialog.item.collaboration.preference)
          } : null}
          linkedReleaseId={responseDialog?.linkedReleaseId ?? ""}
          message={responseDialog?.message ?? ""}
          onReleaseChange={(value) => setResponseDialog((current) => (current ? { ...current, linkedReleaseId: value } : current))}
          onMessageChange={(value) => setResponseDialog((current) => (current ? { ...current, message: value } : current))}
          onClose={() => {
            if (responseBusy) return;
            setResponseDialog(null);
            setResponseError(null);
          }}
          onConfirm={() => void submitCollaborationResponse()}
        />

        {error ? <ErrorBanner message={error} onRetry={detailMode ? undefined : () => void load({ state: resolvedQueryState })} /> : null}
        {sharedHref ? <p className="text-xs text-white/45">Ссылка на публикацию скопирована.</p> : null}
        {publishNotice ? (
          <p className="text-xs text-white/58">
            {publishNotice.message}{" "}
            {publishNotice.href ? <Link href={publishNotice.href} className="text-[#9b8cff] hover:text-white">Открыть запись</Link> : null}
          </p>
        ) : null}
        {safetyNotice ? <p className="text-xs text-emerald-200/72">{safetyNotice}</p> : null}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,.png"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void enqueueComposerFiles(event.target.files, "standard");
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,.mp4"
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void enqueueComposerFiles(event.target.files, "standard");
          }}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/mpeg,.mp3"
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void enqueueComposerFiles(event.target.files, "demo");
          }}
        />

        {primaryView === "collaborations" && !detailMode ? (
          <div className="flex flex-wrap items-center gap-7 border-b border-white/8 px-2 pt-1">
            {COLLAB_FEED_TABS.map((tab) => {
              const active = collabFeedTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleCollabFeedTabChange(tab.key)}
                  className={`relative pb-3 text-sm font-semibold transition ${
                    active ? "text-white" : "text-white/58 hover:text-white/82"
                  }`}
                >
                  {tab.label}
                  {active ? <span className="absolute inset-x-0 bottom-[-1px] h-px rounded-full bg-[#8f7cff]" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <section className="grid gap-4">
          {(feedViewMode === "loading" || feedViewMode === "refreshing") && !(primaryView === "people" ? visiblePeople.length : displayedItems.length) ? <FeedSkeleton /> : null}
          {feedViewMode === "empty" ? <EmptyState scope={scope} collaborationFilter={collaborationFilter} collaborationIntent={collaborationIntent} collaborationRole={collaborationRole} primaryView={primaryView} /> : null}
          {primaryView === "people" ? (
            <div className="grid gap-4 md:grid-cols-2">
              {visiblePeople.map((person) => <PersonCard key={person.slug} person={person} />)}
            </div>
          ) : displayedItems.map((item) => {
            if (item.kind === "post") {
              const anchorId = `feed-item-${item.sourceId}`;
              const commentInputId = `comment-input-${item.sourceId}`;
              const collaboration = item.collaboration;
              const postCardProps = {
                anchorId,
                item,
                canInteract: !isPublicShowcase && viewerAuthenticated,
                draft: drafts[item.sourceId] ?? "",
                commentInputId,
                commentPending: Boolean(commentPendingById[item.sourceId]),
                selectedReaction: selectedReactions[item.sourceId] ?? defaultReaction(item),
                commentsOpen: detailMode || expandedComments[item.sourceId] === true,
                replyTargetId: replyTargetByItem[item.sourceId] ?? null,
                replyDrafts: replyDraftsByItem[item.sourceId] ?? {},
                showcaseOnly: isPublicShowcase,
                onDraftChange: (value: string) => {
                  mutationKeysRef.current.invalidateIfChanged(socialCommentMutationSlot("post", item.sourceId), socialCommentFingerprint(value));
                  setDrafts((current) => ({ ...current, [item.sourceId]: value }));
                },
                onLike: (reaction: FeedReaction, reactionKey?: FeedReaction) => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "reaction",
                      intendedAction: "react",
                      targetId: item.sourceId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reactionKey ? `reaction-chip-${item.sourceId}-${reactionKey}` : `reaction-picker-${item.sourceId}`
                    })
                  : void likePost(item.sourceId, reaction, {
                      reason: "reaction",
                      intendedAction: "react",
                      targetId: item.sourceId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reactionKey ? `reaction-chip-${item.sourceId}-${reactionKey}` : `reaction-picker-${item.sourceId}`
                    }),
                onComment: () => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "comment",
                      intendedAction: "comment",
                      targetId: item.sourceId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: commentInputId,
                      drafts: drafts[item.sourceId] ? { [item.sourceId]: drafts[item.sourceId] } : {}
                    })
                  : void commentPost(item.sourceId, {
                      reason: "comment",
                      intendedAction: "comment",
                      targetId: item.sourceId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: commentInputId,
                      drafts: drafts[item.sourceId] ? { [item.sourceId]: drafts[item.sourceId] } : {}
                    }, null),
                onReplyDraftChange: (commentId: string, value: string) => {
                  mutationKeysRef.current.invalidateIfChanged(socialCommentMutationSlot("post", item.sourceId, commentId), socialCommentFingerprint(value));
                  setReplyDraftsByItem((current) => ({ ...current, [item.sourceId]: { ...(current[item.sourceId] ?? {}), [commentId]: value } }));
                },
                onReplyToggle: (commentId: string) => setReplyTargetByItem((current) => ({
                  ...current,
                  [item.sourceId]: current[item.sourceId] === commentId ? null : commentId
                })),
                onReplySubmit: (commentId: string) => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "reply",
                      intendedAction: "reply",
                      targetId: item.sourceId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: `reply-${commentId}`
                    })
                  : void commentPost(item.sourceId, {
                      reason: "reply",
                      intendedAction: "reply",
                      targetId: item.sourceId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: `reply-${commentId}`
                    }, commentId),
                onToggleComments: () => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "comment",
                      intendedAction: "comment",
                      targetId: item.sourceId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: commentInputId,
                      drafts: drafts[item.sourceId] ? { [item.sourceId]: drafts[item.sourceId] } : {}
                    })
                  : setExpandedComments((current) => ({ ...current, [item.sourceId]: !current[item.sourceId] })),
                onShowAllComments: () => void loadAllComments(item),
                onShare: () => void handleShare(item.permalink),
                safetyAuthenticated: viewerAuthenticated,
                onSafetyApplied: handleSafetyApplied,
                onDelete: item.author.ownedByViewer ? () => void deletePost(item.sourceId) : undefined,
                onEdit: item.author.ownedByViewer ? () => void editPost(item) : undefined,
                onEditComment: (comment: PublicFeedComment) => void mutateComment(item, comment, "edit"),
                onDeleteComment: (comment: PublicFeedComment) => void mutateComment(item, comment, "delete"),
                onReactComment: (comment: PublicFeedComment) => void reactToComment(item, comment),
                onRequireReactionAuth: (reactionKey?: FeedReaction) => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "reaction",
                      intendedAction: "react",
                      targetId: item.sourceId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reactionKey ? `reaction-chip-${item.sourceId}-${reactionKey}` : `reaction-picker-${item.sourceId}`
                    })
                  : requestAuthenticatedAction({
                      reason: "reaction",
                      intendedAction: "react",
                      targetId: item.sourceId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reactionKey ? `reaction-chip-${item.sourceId}-${reactionKey}` : `reaction-picker-${item.sourceId}`
                    }),
                onRequireCommentAuth: (reason: "comment" | "reply" = "comment", commentId?: string) => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason,
                      intendedAction: reason === "reply" ? "reply" : "comment",
                      targetId: item.sourceId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reason === "reply" && commentId ? `reply-${commentId}` : commentInputId,
                      drafts: drafts[item.sourceId] ? { [item.sourceId]: drafts[item.sourceId] } : {}
                    })
                  : requestAuthenticatedAction({
                      reason,
                      intendedAction: reason === "reply" ? "reply" : "comment",
                      targetId: item.sourceId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reason === "reply" && commentId ? `reply-${commentId}` : commentInputId,
                      drafts: drafts[item.sourceId] ? { [item.sourceId]: drafts[item.sourceId] } : {}
                    }),
                onToggleFollow: (slug: string, currentlyFollowing: boolean) => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "follow",
                      intendedAction: "follow_author",
                      targetId: item.sourceId,
                      targetSlug: slug,
                      anchorId,
                      focusTargetId: `follow-${slug}`
                    })
                  : void toggleFollow(slug, currentlyFollowing, {
                      reason: "follow",
                      intendedAction: "follow_author",
                      targetId: item.sourceId,
                      targetSlug: slug,
                      anchorId,
                      focusTargetId: `follow-${slug}`
                    }),
                followBusy: item.author.slug ? Boolean(followBusyBySlug[item.author.slug]) : false,
                onRespond: !item.author.ownedByViewer ? () => openCollaborationResponseDialog(item) : undefined,
                onToggleResponses: item.author.ownedByViewer ? () => void toggleCollaborationResponses(item) : undefined,
                responsesOpen: responsesOpenByPostId[item.sourceId] === true,
                responsesLoading: responsesLoadingByPostId[item.sourceId] === true,
                responses: responsesByPostId[item.sourceId] ?? [],
                responded: respondedByPostId[item.sourceId] === true,
                onToggleAnnouncementStatus: item.author.ownedByViewer && collaboration
                  ? () => void updateCollaborationAnnouncementStatus(
                    item,
                    collaboration.status === "open" ? "closed" : "open"
                  )
                  : undefined,
                announcementStatusBusy: closeBusyByPostId[item.sourceId] === true,
                savedByViewer: favoritePostIds.has(item.sourceId),
                onToggleSaved: () => toggleFavoritePost(item.sourceId),
                detailMode
              } satisfies FeedPostCardProps;

              return item.postType === "collaboration"
                ? <CollaborationCard key={item.id} {...postCardProps} />
                : <PostCard key={item.id} {...postCardProps} />;
            }
            if (item.kind === "release") {
              const anchorId = `feed-item-${item.releaseId}`;
              const commentInputId = `comment-input-${item.releaseId}`;
              return <ReleaseCard
                key={item.id}
                anchorId={anchorId}
                item={item}
                canInteract={!isPublicShowcase && viewerAuthenticated}
                draft={drafts[item.releaseId] ?? ""}
                commentInputId={commentInputId}
                commentPending={Boolean(commentPendingById[item.releaseId])}
                selectedReaction={selectedReactions[item.releaseId] ?? defaultReaction(item)}
                commentsOpen={detailMode || expandedComments[item.releaseId] === true}
                replyTargetId={replyTargetByItem[item.releaseId] ?? null}
                replyDrafts={replyDraftsByItem[item.releaseId] ?? {}}
                detailMode={detailMode}
                showcaseOnly={isPublicShowcase}
                onDraftChange={(value) => {
                  mutationKeysRef.current.invalidateIfChanged(socialCommentMutationSlot("release", item.releaseId), socialCommentFingerprint(value));
                  setDrafts((current) => ({ ...current, [item.releaseId]: value }));
                }}
                onLike={(reaction, reactionKey) => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "reaction",
                      intendedAction: "react",
                      targetId: item.releaseId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reactionKey ? `reaction-chip-${item.releaseId}-${reactionKey}` : `reaction-picker-${item.releaseId}`
                    })
                  : void likeRelease(item.releaseId, reaction, {
                      reason: "reaction",
                      intendedAction: "react",
                      targetId: item.releaseId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reactionKey ? `reaction-chip-${item.releaseId}-${reactionKey}` : `reaction-picker-${item.releaseId}`
                    })}
                onComment={() => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "comment",
                      intendedAction: "comment",
                      targetId: item.releaseId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: commentInputId,
                      drafts: drafts[item.releaseId] ? { [item.releaseId]: drafts[item.releaseId] } : {}
                    })
                  : void commentRelease(item.releaseId, {
                      reason: "comment",
                      intendedAction: "comment",
                      targetId: item.releaseId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: commentInputId,
                      drafts: drafts[item.releaseId] ? { [item.releaseId]: drafts[item.releaseId] } : {}
                    }, null)}
                onReplyDraftChange={(commentId, value) => {
                  mutationKeysRef.current.invalidateIfChanged(socialCommentMutationSlot("release", item.releaseId, commentId), socialCommentFingerprint(value));
                  setReplyDraftsByItem((current) => ({ ...current, [item.releaseId]: { ...(current[item.releaseId] ?? {}), [commentId]: value } }));
                }}
                onReplyToggle={(commentId) => setReplyTargetByItem((current) => ({
                  ...current,
                  [item.releaseId]: current[item.releaseId] === commentId ? null : commentId
                }))}
                onReplySubmit={(commentId) => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "reply",
                      intendedAction: "reply",
                      targetId: item.releaseId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: `reply-${commentId}`
                    })
                  : void commentRelease(item.releaseId, {
                      reason: "reply",
                      intendedAction: "reply",
                      targetId: item.releaseId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: `reply-${commentId}`
                    }, commentId)}
                onToggleComments={() => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "comment",
                      intendedAction: "comment",
                      targetId: item.releaseId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: commentInputId,
                      drafts: drafts[item.releaseId] ? { [item.releaseId]: drafts[item.releaseId] } : {}
                    })
                  : setExpandedComments((current) => ({ ...current, [item.releaseId]: !current[item.releaseId] }))}
                onShowAllComments={() => void loadAllComments(item)}
                onShare={() => void handleShare(item.permalink)}
                safetyAuthenticated={viewerAuthenticated}
                onSafetyApplied={handleSafetyApplied}
                onEditComment={(comment) => void mutateComment(item, comment, "edit")}
                onDeleteComment={(comment) => void mutateComment(item, comment, "delete")}
                onReactComment={(comment) => void reactToComment(item, comment)}
                onRequireReactionAuth={(reactionKey) => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "reaction",
                      intendedAction: "react",
                      targetId: item.releaseId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reactionKey ? `reaction-chip-${item.releaseId}-${reactionKey}` : `reaction-picker-${item.releaseId}`
                    })
                  : requestAuthenticatedAction({
                      reason: "reaction",
                      intendedAction: "react",
                      targetId: item.releaseId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reactionKey ? `reaction-chip-${item.releaseId}-${reactionKey}` : `reaction-picker-${item.releaseId}`
                    })}
                onRequireCommentAuth={(reason = "comment", commentId) => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason,
                      intendedAction: reason === "reply" ? "reply" : "comment",
                      targetId: item.releaseId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reason === "reply" && commentId ? `reply-${commentId}` : commentInputId,
                      drafts: drafts[item.releaseId] ? { [item.releaseId]: drafts[item.releaseId] } : {}
                    })
                  : requestAuthenticatedAction({
                      reason,
                      intendedAction: reason === "reply" ? "reply" : "comment",
                      targetId: item.releaseId,
                      targetSlug: item.author.slug,
                      anchorId,
                      focusTargetId: reason === "reply" && commentId ? `reply-${commentId}` : commentInputId,
                      drafts: drafts[item.releaseId] ? { [item.releaseId]: drafts[item.releaseId] } : {}
                    })}
                onToggleFollow={(slug, currentlyFollowing) => isPublicShowcase
                  ? requestDashboardSocialRedirect({
                      reason: "follow",
                      intendedAction: "follow_author",
                      targetId: item.releaseId,
                      targetSlug: slug,
                      anchorId,
                      focusTargetId: `follow-${slug}`
                    })
                  : void toggleFollow(slug, currentlyFollowing, {
                      reason: "follow",
                      intendedAction: "follow_author",
                      targetId: item.releaseId,
                      targetSlug: slug,
                      anchorId,
                      focusTargetId: `follow-${slug}`
                    })}
                followBusy={item.author.slug ? Boolean(followBusyBySlug[item.author.slug]) : false}
                onPlayRelease={() => openReleasePlayer(item)}
                isPlayerActive={activeRelease?.releaseId === item.releaseId}
                isPlayerPlaying={activeRelease?.releaseId === item.releaseId && activeReleasePlaying}
              />;
            }
            return <NewsCard key={item.id} item={item} onShare={() => void handleShare(item.permalink)} />;
          })}
        </section>

        {!detailMode && primaryView !== "people" && !(primaryView === "collaborations" && collabFeedTab === "favorites") && payload.hasMore && !isFilterRefreshPending ? (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              className="h-12 rounded-full border-white/10 bg-white/[0.03] px-6 text-white hover:bg-white/[0.06]"
              disabled={loading}
              onClick={() => void load({ state: resolvedQueryState, append: true, cursor: payload.nextCursor })}
            >
              {loading ? "Загрузка..." : "Показать ещё"}
            </button>
          </div>
        ) : null}
      </div>

        {!detailMode && primaryView !== "collaborations" ? (
          <CommunitySidebar
            suggestions={payload.suggestions}
            posts={discoveryPosts}
            release={discoveryRelease}
            onOpenRelease={discoveryRelease ? () => openReleasePlayer(discoveryRelease) : undefined}
          />
        ) : null}

      {activeRelease?.audioUrl ? (
        <FeedStickyReleasePlayer
          src={activeRelease.audioUrl}
          title={activeRelease.title}
          artist={activeRelease.author.displayName}
          coverUrl={activeRelease.coverUrl}
          releaseId={activeRelease.releaseId}
          playbackCommand={activeReleaseCommand}
          onPlayingChange={setActiveReleasePlaying}
          onPlayCountChange={(count) => updateReleasePlayCount(activeRelease.releaseId, count)}
          onLoadError={() => undefined}
          onOpenRelease={() => {
            if (typeof window === "undefined") return;
            window.location.assign(activeRelease.permalink);
          }}
          onOpenScene={activeRelease.sceneHref ? () => {
            if (typeof window === "undefined") return;
            window.location.assign(activeRelease.sceneHref!);
          } : undefined}
          onClose={() => {
            setActiveReleasePlaying(false);
            setActiveRelease(null);
            setActiveReleaseCommand(null);
          }}
        />
      ) : null}
    </div>
  );
}

function FeedHeader({
  detailMode,
  communityUnavailable
}: {
  detailMode: boolean;
  communityUnavailable: boolean;
}) {
  const title = detailMode
    ? "ICECREAMMUSIC Feed"
    : "Collab Market";
  const description = detailMode
    ? "Открытая публикация из музыкальной ленты: посты артистов, релизы, коллаборации и редакционные обновления."
    : "Найдите людей для следующего трека. Здесь объявления, демо, релизы и быстрый отклик на нужный проект.";

  return (
    <header className="glass-card relative flex items-center justify-between overflow-hidden rounded-2xl border border-[#7b61ff]/20 px-8 py-7 sm:px-10 sm:py-8">
      <div className="relative z-10 max-w-lg">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">Marketplace</p>
        <h1 className="mb-3 text-[38px] font-bold tracking-tight text-white sm:text-5xl">{title}</h1>
        <p className="text-sm leading-7 text-gray-400 sm:text-base">{description}</p>
        {communityUnavailable ? <p className="mt-4 text-sm text-amber-200/80">Ranking-сигналы временно недоступны, основная лента продолжает работать.</p> : null}
      </div>
      {!detailMode ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 top-0 w-1/2 opacity-60 mix-blend-screen">
          <div className="relative h-full w-full">
            <div className="absolute inset-0 bg-gradient-to-l from-[#7b61ff]/20 to-transparent" />
            <CommunityHeroShader />
          </div>
        </div>
      ) : null}
    </header>
  );
}

function CommunityHeroShader() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    if (prefersReducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let animationId = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };

    const draw = () => {
      frame += 0.016;
      const { width, height } = canvas;
      context.clearRect(0, 0, width, height);
      for (let i = 0; i < 4; i += 1) {
        context.beginPath();
        context.strokeStyle = i % 2 === 0 ? "rgba(123,97,255,0.5)" : "rgba(5,166,232,0.45)";
        context.lineWidth = 2;
        for (let x = 0; x <= width; x += 6) {
          const progress = x / width;
          const y = height * 0.5 + Math.sin(progress * (5 + i * 2) + frame * (0.9 + i * 0.2)) * (16 + i * 8) + Math.sin(frame * 0.6 + i) * 8;
          if (x === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
      animationId = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (observer && canvas.parentElement) observer.observe(canvas.parentElement);
    window.addEventListener("resize", resize);
    return () => {
      if (observer) observer.disconnect();
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, [prefersReducedMotion]);

  return (
    <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
  );
}

function CommunitySidebar(props: {
  suggestions: PublicFeedPayload["suggestions"];
  posts: FeedPostItem[];
  release: FeedReleaseItem | null;
  onOpenRelease?: () => void;
}) {
  void props;
  return null;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  return reduced;
}

function ComposerCard({
  busy,
  uploading,
  hasErrors,
  content,
  releaseId,
  mediaItems,
  profile,
  scopedReleases,
  autoPublishEnabled,
  collaborationProfile,
  collaborationIntent,
  collaborationWorkflow,
  collaborationCustomIntentLabel,
  collaborationRole,
  collaborationPreference,
  collaborationCity,
  collaborationGenres,
  onContentChange,
  onReleaseChange,
  onCollaborationIntentChange,
  onCollaborationWorkflowChange,
  onCollaborationCustomIntentLabelChange,
  onCollaborationRoleChange,
  onCollaborationPreferenceChange,
  onCollaborationCityChange,
  onCollaborationGenresChange,
  onPickImages,
  onPickVideo,
  onPickDemo,
  onRemoveMedia,
  onRetryMedia,
  onPublish,
  resetToken
}: {
  busy: boolean;
  uploading: boolean;
  hasErrors: boolean;
  content: string;
  releaseId: string;
  mediaItems: ComposerMediaItem[];
  profile: PublicFeedPayload["ownedProfiles"][number] | null;
  scopedReleases: PublicFeedPayload["releaseOptions"];
  autoPublishEnabled: boolean;
  collaborationProfile: PublicFeedPayload["ownedProfiles"][number]["settings"]["collaboration"] | null;
  collaborationIntent: CollaborationIntent | "";
  collaborationWorkflow: "seeking" | "offering";
  collaborationCustomIntentLabel: string;
  collaborationRole: CollaborationRole | "";
  collaborationPreference: CollaborationPreference;
  collaborationCity: string;
  collaborationGenres: string[];
  onContentChange: (value: string) => void;
  onReleaseChange: (value: string) => void;
  onCollaborationIntentChange: (value: CollaborationIntent | "") => void;
  onCollaborationWorkflowChange: (value: "seeking" | "offering") => void;
  onCollaborationCustomIntentLabelChange: (value: string) => void;
  onCollaborationRoleChange: (value: CollaborationRole | "") => void;
  onCollaborationPreferenceChange: (value: CollaborationPreference) => void;
  onCollaborationCityChange: (value: string) => void;
  onCollaborationGenresChange: (value: string[]) => void;
  onPickImages: () => void;
  onPickVideo: () => void;
  onPickDemo: () => void;
  onRemoveMedia: (localId: string) => void;
  onRetryMedia: (localId: string) => void;
  onPublish: () => void;
  resetToken: number;
}) {
  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1);
  const handledResetTokenRef = React.useRef(resetToken);
  const [selectedIntentCategory, setSelectedIntentCategory] = React.useState<ComposerIntentCategoryKey | null>(
    collaborationWorkflow === "offering"
      ? "OFFERING_COLLABORATION"
      : collaborationIntent
        ? buildCollaborationPresentation({ intent: collaborationIntent }).intentCategory
        : null
  );
  const uploadedCount = mediaItems.filter((item) => item.status === "uploaded").length;
  const uploadingCount = mediaItems.filter((item) => item.status === "uploading").length;
  const failedCount = mediaItems.filter((item) => item.status === "error").length;
  const releaseChoices = React.useMemo(
    () => buildComposerReleaseChoices(scopedReleases),
    [scopedReleases]
  );
  const collaborationIntentGroups = React.useMemo(
    () => COLLABORATION_COMPOSER_GROUPS,
    []
  );
  const selectedIntentCategoryOptions = React.useMemo(() => (
    selectedIntentCategory && selectedIntentCategory !== "OFFERING_COLLABORATION"
      ? COLLABORATION_COMPOSER_SUBSTEP_OPTIONS[selectedIntentCategory]
      : []
  ), [selectedIntentCategory]);
  const collaborationRoleOptions = React.useMemo(
    () => COLLABORATION_ROLES.map((role) => ({ value: role, label: collaborationRoleLabel(role) })),
    []
  );
  const collaborationGenreOptions = React.useMemo(
    () => Array.from(new Set((collaborationProfile?.genres ?? []).map((genre) => genre.trim()).filter(Boolean))),
    [collaborationProfile?.genres]
  );
  const requiresCustomIntentLabel = collaborationWorkflow === "offering" || collaborationIntent === "other";
  const selectedIntentPresentation = React.useMemo(
    () => buildCollaborationPresentation({
      intent: collaborationIntent || null,
      role: collaborationRole || collaborationProfile?.role || null,
      workflow: collaborationWorkflow,
      customIntentLabel: collaborationCustomIntentLabel
    }),
    [collaborationCustomIntentLabel, collaborationIntent, collaborationProfile?.role, collaborationRole, collaborationWorkflow]
  );
  const selectedIntentDisplayLabel = collaborationIntent || collaborationCustomIntentLabel.trim()
    ? formatMarketplaceIntentHeadline({
        displayIntent: selectedIntentPresentation.displayIntent,
        rawIntent: collaborationIntent || null,
        workflow: collaborationWorkflow
      })
    : null;
  const collaborationDisabled = !profile || (profile.artistKey !== PERSONAL_ARTIST_PROFILE_KEY && !collaborationProfile?.open);
  const collaborationProfileRoleLabel = collaborationRoleLabel(collaborationProfile?.role ?? "artist");
  const normalizedCollaborationCity = normalizeCollaborationCity(collaborationCity);
  const localCityMissing = collaborationPreference === "local" && !normalizedCollaborationCity;
  const submitDisabled = busy
    || uploading
    || hasErrors
    || collaborationDisabled
    || !collaborationIntent
    || !collaborationRole
    || !content.trim()
    || localCityMissing
    || (requiresCustomIntentLabel && !collaborationCustomIntentLabel.trim());
  const submitLabel = busy
    ? "Публикуем..."
    : uploading
      ? "Загружаем..."
      : "Опубликовать объявление";
  const stepComplete = {
    1: Boolean(collaborationIntent) && (!requiresCustomIntentLabel || Boolean(collaborationCustomIntentLabel.trim())),
    2: Boolean(collaborationRole && collaborationPreference && !localCityMissing),
    3: Boolean(content.trim()),
    4: !submitDisabled
  } as const;

  React.useEffect(() => {
    if (handledResetTokenRef.current === resetToken) return;
    handledResetTokenRef.current = resetToken;
    setStep(1);
    setSelectedIntentCategory(
      collaborationWorkflow === "offering"
        ? "OFFERING_COLLABORATION"
        : collaborationIntent
          ? buildCollaborationPresentation({ intent: collaborationIntent }).intentCategory
          : null
    );
  }, [collaborationIntent, collaborationWorkflow, resetToken]);

  const goNext = () => {
    if (step === 1 && !stepComplete[1]) return;
    if (step === 2 && !stepComplete[2]) return;
    if (step === 3 && !stepComplete[3]) return;
    setStep((current) => Math.min(4, current + 1) as 1 | 2 | 3 | 4);
  };

  const goBack = () => {
    setStep((current) => Math.max(1, current - 1) as 1 | 2 | 3 | 4);
  };

  return (
    <div id="feed-composer-root" className="glass-card rounded-2xl border-white/5 bg-[#111415]/60 p-6 transition-all duration-300">
      <div className="flex gap-5">
        <Avatar name={profile?.settings.displayName ?? "User"} avatarUrl={profile?.avatarUrl ?? null} />
        <div className="flex-1">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Collab Market</p>
              <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-white">Создать объявление</h2>
              <p className="mt-2 text-sm leading-6 text-white/56">
                Пошагово выберите тип запроса, формат сотрудничества и покажите примеры своей работы.
              </p>
            </div>
            <div className="flex min-w-[180px] flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
                <span>{`Шаг ${step} из 4`}</span>
                <span>{step === 1 ? "Запрос" : step === 2 ? "Формат" : step === 3 ? "Описание" : "Проверка"}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#7b61ff,#9a85ff)] transition-all duration-300" style={{ width: `${step * 25}%` }} />
              </div>
            </div>
          </div>

          <section className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4 sm:p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  {step > 1 ? (
                    <button
                      type="button"
                      onClick={goBack}
                      className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-white/72 transition hover:border-white/18 hover:text-white"
                    >
                      ← Назад
                    </button>
                  ) : null}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">{`Шаг ${step} из 4`}</p>
                    <h3 className="mt-1 text-base font-semibold text-white">
                      {step === 1
                        ? "Что вы ищете"
                        : step === 2
                          ? "Формат сотрудничества"
                          : step === 3
                            ? "Расскажите о задаче"
                            : "Проверьте объявление"}
                    </h3>
                  </div>
                </div>
                <p className="mt-3 max-w-[48rem] text-sm leading-6 text-white/48">
                  {step === 1
                    ? "Сначала выберите тип запроса. Для нестандартного варианта оставили только ручное описание сотрудничества."
                    : step === 2
                      ? "Укажите, в каком формате вы готовы работать и кем выступаете в этом объявлении."
                      : step === 3
                        ? "Добавьте описание, портфолио и дополнительные материалы. Достаточно только того, что реально помогает понять запрос."
                        : "Проверьте, как объявление будет выглядеть в ленте, и публикуйте."}
                </p>
              </div>
              {selectedIntentDisplayLabel ? (
                <span className="inline-flex min-h-10 items-center rounded-full border border-[#7b61ff]/32 bg-[linear-gradient(135deg,rgba(123,97,255,0.28),rgba(123,97,255,0.12))] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f1ebff]">
                  {selectedIntentDisplayLabel}
                </span>
              ) : null}
            </div>

            {step === 1 ? (
              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {collaborationIntentGroups.map((group) => {
                    const active = selectedIntentCategory === group.key;
                    return (
                      <button
                        key={group.key}
                        type="button"
                        disabled={!group.enabled}
                        onClick={() => {
                          if (!group.enabled) return;
                          setSelectedIntentCategory(group.key);
                          if (group.key === "OFFERING_COLLABORATION") {
                            onCollaborationWorkflowChange("offering");
                            onCollaborationIntentChange("other");
                            return;
                          }
                          onCollaborationWorkflowChange("seeking");
                          if (group.key === "OTHER") {
                            onCollaborationIntentChange("other");
                            return;
                          }
                          if (collaborationIntent && buildCollaborationPresentation({ intent: collaborationIntent }).intentCategory !== group.key) {
                            onCollaborationIntentChange("");
                          }
                          onCollaborationCustomIntentLabelChange("");
                        }}
                        className={`flex min-h-[96px] flex-col items-start justify-between rounded-[22px] border px-4 py-4 text-left text-sm font-semibold transition ${
                          active
                            ? "border-[#9b8cff] bg-[linear-gradient(135deg,rgba(123,97,255,0.32),rgba(123,97,255,0.16))] text-white shadow-[0_22px_42px_-22px_rgba(123,97,255,0.95)]"
                            : "border-white/8 bg-white/[0.03] text-white/68 hover:border-white/14 hover:text-white"
                        } ${!group.enabled ? "cursor-not-allowed opacity-45" : ""}`}
                      >
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg">
                          {group.emoji}
                        </span>
                        <span className="mt-3 block text-sm font-semibold">{group.label}</span>
                        <span className="mt-2 block text-xs font-medium leading-5 text-white/44">
                          {COLLABORATION_COMPOSER_GROUP_HINTS[group.key]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedIntentCategory ? (
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.02] p-4">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/32">
                      {selectedIntentCategory === "OFFERING_COLLABORATION" ? "Что вы предлагаете" : "Уточните запрос"}
                    </p>
                    {selectedIntentCategory === "OFFERING_COLLABORATION" ? (
                      <div className="grid gap-4">
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {[
                            "Участие артиста",
                            "Бит / инструментал",
                            "Продакшн",
                            "Авторство / songwriting",
                            "Сведение / мастеринг",
                            "Контент / видео",
                            "Другое"
                          ].map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => onCollaborationCustomIntentLabelChange(suggestion)}
                              className={`flex min-h-[64px] items-center rounded-[18px] border px-4 py-3 text-left text-sm font-medium transition ${
                                collaborationCustomIntentLabel.trim() === suggestion
                                  ? "border-[#9b8cff] bg-[linear-gradient(135deg,rgba(123,97,255,0.32),rgba(123,97,255,0.18))] text-white shadow-[0_22px_42px_-22px_rgba(123,97,255,0.95)]"
                                  : "border-white/8 bg-white/[0.03] text-white/64 hover:border-white/14 hover:text-white"
                              }`}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                        <label className="grid gap-2">
                          <span className="text-sm font-medium text-white">Что именно вы предлагаете</span>
                          <input
                            value={collaborationCustomIntentLabel}
                            onChange={(event) => onCollaborationCustomIntentLabelChange(event.target.value.slice(0, 80))}
                            placeholder="Например: готов записать вокал, написать текст или сделать сведение"
                            className="h-12 rounded-[16px] border border-white/10 bg-[#111522]/88 px-4 text-sm text-white outline-none transition placeholder:text-white/34 focus:border-[#7b61ff]/55"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {selectedIntentCategoryOptions.map((option) => (
                            <button
                              key={`${selectedIntentCategory}-${option.value}`}
                              type="button"
                              onClick={() => {
                                onCollaborationWorkflowChange("seeking");
                                onCollaborationIntentChange(option.value);
                                if (option.value !== "other") onCollaborationCustomIntentLabelChange("");
                              }}
                              className={`flex min-h-[72px] flex-col items-start justify-center rounded-[18px] border px-4 py-3 text-left text-sm font-medium transition ${
                                collaborationIntent === option.value && collaborationWorkflow !== "offering"
                                  ? "border-[#9b8cff] bg-[linear-gradient(135deg,rgba(123,97,255,0.32),rgba(123,97,255,0.18))] text-white shadow-[0_22px_42px_-22px_rgba(123,97,255,0.95)]"
                                  : "border-white/8 bg-white/[0.03] text-white/64 hover:border-white/14 hover:text-white"
                              }`}
                            >
                              <span className="inline-flex items-center gap-2">
                                {collaborationIntent === option.value && collaborationWorkflow !== "offering" ? <Check className="h-4 w-4 shrink-0" /> : <span className="text-base">{collaborationIntentIconFromUnknown(option.value)}</span>}
                                <span>{option.label}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                        {selectedIntentCategory === "OTHER" ? (
                          <label className="grid gap-2">
                            <span className="text-sm font-medium text-white">Какой вид сотрудничества?</span>
                            <input
                              value={collaborationCustomIntentLabel}
                              onChange={(event) => onCollaborationCustomIntentLabelChange(event.target.value.slice(0, 80))}
                              placeholder="Напишите, кого ищете или что именно предлагаете"
                              className="h-12 rounded-[16px] border border-white/10 bg-[#111522]/88 px-4 text-sm text-white outline-none transition placeholder:text-white/34 focus:border-[#7b61ff]/55"
                            />
                          </label>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-5">
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/32">Формат сотрудничества</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {([
                      { value: "remote", label: "🌐 Remote", hint: "Работа онлайн" },
                      { value: "local", label: "📍 Local", hint: "Нужна личная работа" },
                      { value: "hybrid", label: "🌐📍 Remote / Local", hint: "Подходит любой формат" }
                    ] as const).map((option) => {
                      const active = collaborationPreference === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onCollaborationPreferenceChange(option.value)}
                          className={`flex min-h-[88px] flex-col items-start justify-center rounded-[20px] border px-4 py-4 text-left transition ${
                            active
                              ? "border-[#9b8cff] bg-[linear-gradient(135deg,rgba(123,97,255,0.32),rgba(123,97,255,0.18))] text-white shadow-[0_22px_42px_-22px_rgba(123,97,255,0.95)]"
                              : "border-white/8 bg-white/[0.03] text-white/66 hover:border-white/14 hover:text-white"
                          }`}
                        >
                          <span className="text-sm font-semibold">{option.label}</span>
                          <span className="mt-2 text-xs text-white/46">{option.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                  {collaborationPreference === "local" ? (
                    <label className="mt-3 grid gap-2 rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                        <MapPin className="h-4 w-4 text-cyan-300" />
                        Город для local-работы
                      </span>
                      <input
                        value={collaborationCity}
                        onChange={(event) => onCollaborationCityChange(event.target.value.slice(0, 80))}
                        placeholder="Например: Москва или Санкт-Петербург"
                        className="h-12 rounded-[16px] border border-white/10 bg-[#111522]/88 px-4 text-sm text-white outline-none transition placeholder:text-white/34 focus:border-[#7b61ff]/55"
                      />
                      <span className="text-xs leading-5 text-white/42">
                        Город появится в фильтре после публикации объявления.
                      </span>
                    </label>
                  ) : null}
                </div>
                <div className="max-w-[340px]">
                  <ComposerSelect
                    icon={<Reply className="h-3.5 w-3.5 text-[#9d8dff]" />}
                    label="Роль"
                    value={collaborationRole}
                    options={collaborationRoleOptions}
                    onChange={(value) => onCollaborationRoleChange(value as CollaborationRole)}
                    disabled={collaborationDisabled}
                    minWidthClass="min-w-full"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedIntentDisplayLabel ? <Badge accent>{selectedIntentDisplayLabel}</Badge> : null}
                  {collaborationRole ? <Badge>{formatMarketplaceRoleLabel(collaborationRole)}</Badge> : null}
                  <Badge>{formatMarketplacePreferenceLabel(collaborationPreference)}</Badge>
                  {collaborationPreference === "local" && normalizedCollaborationCity ? <Badge>{normalizedCollaborationCity}</Badge> : null}
                </div>
                <p className="text-sm leading-6 text-white/46">
                  Текущая роль профиля: {collaborationProfileRoleLabel}. Если нужно, её можно переопределить только для этого объявления.
                </p>
                {collaborationGenreOptions.length ? (
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/32">Жанры</p>
                      <span className="text-xs text-white/38">Необязательно</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {collaborationGenreOptions.map((genre) => {
                        const active = collaborationGenres.includes(genre);
                        return (
                          <button
                            key={genre}
                            type="button"
                            onClick={() => onCollaborationGenresChange(
                              active
                                ? collaborationGenres.filter((item) => item !== genre)
                                : [...collaborationGenres, genre]
                            )}
                            className={`inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-sm font-medium transition ${
                              active
                                ? "border-[#9b8cff] bg-[linear-gradient(135deg,rgba(123,97,255,0.32),rgba(123,97,255,0.18))] text-white shadow-[0_22px_42px_-22px_rgba(123,97,255,0.95)]"
                                : "border-white/8 bg-white/[0.03] text-white/64 hover:border-white/14 hover:text-white"
                            }`}
                          >
                            {genre}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-5">
                <div>
                  <Textarea
                    value={content}
                    onChange={(event) => onContentChange(event.target.value)}
                    className="min-h-[148px] w-full resize-none rounded-[20px] border border-white/8 bg-white/[0.03] px-5 py-4 text-base leading-7 text-white placeholder:text-white/38 focus-visible:border-[#7b61ff]/55 focus-visible:ring-0"
                    maxLength={1500}
                    placeholder="Что уже готово, кого именно вы ищете и что хотите получить на выходе?"
                    rows={5}
                  />
                  <div className="mt-2 text-sm leading-6 text-white/46">
                    Расскажите о проекте простым языком: что есть сейчас, что нужно от второго человека и что будет итогом.
                  </div>
                </div>
                {releaseChoices.length ? (
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/32">Портфолио релиз</p>
                      <span className="text-xs text-white/38">Необязательно</span>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => onReleaseChange("")}
                        className={`rounded-[18px] border px-4 py-3 text-left transition ${
                          !releaseId
                            ? "border-[#9b8cff] bg-[linear-gradient(135deg,rgba(123,97,255,0.22),rgba(123,97,255,0.1))] shadow-[0_22px_42px_-22px_rgba(123,97,255,0.9)]"
                            : "border-white/8 bg-white/[0.03] hover:border-white/14"
                        }`}
                      >
                        <p className="text-sm font-semibold text-white">Без релиза</p>
                        <p className="mt-1 text-xs text-white/42">Только описание, демо и медиа.</p>
                      </button>
                      {releaseChoices.map((release) => {
                        const active = releaseId === release.id;
                        return (
                          <button
                            key={`composer-release-${release.id}`}
                            type="button"
                            onClick={() => onReleaseChange(release.id)}
                            className={`rounded-[18px] border px-4 py-3 text-left transition ${
                              active
                                ? "border-[#9b8cff] bg-[linear-gradient(135deg,rgba(123,97,255,0.24),rgba(123,97,255,0.1))] shadow-[0_22px_42px_-22px_rgba(123,97,255,0.9)]"
                                : "border-white/8 bg-white/[0.03] hover:border-white/14"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">{release.title}</p>
                                <p className="mt-1 truncate text-xs text-white/46">
                                  {release.artistNames.slice(0, 2).join(", ") || "Исполнитель не указан"}
                                </p>
                                <p className="mt-2 text-xs text-white/38">{formatReleaseDate(release.releaseDate)}</p>
                              </div>
                              {active ? (
                                <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-[#7b61ff]/30 bg-[#7b61ff]/12 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#efe9ff]">
                                  Выбран
                                </span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {step >= 3 && mediaItems.length ? (
              <div className="mb-5 mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {mediaItems.slice(0, 3).map((item) => (
                  <div key={item.localId} className="relative overflow-hidden rounded-[18px] border border-white/8 bg-[#181d28] p-3 shadow-md">
                    <div className="flex items-start gap-3">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-gray-700 bg-[#1a1f22]">
                        {item.mediaType === "image" ? (
                          <Image src={item.mediaUrl} alt={item.mediaName || "Draft image"} fill unoptimized className="h-full w-full object-cover opacity-75" />
                        ) : item.mediaType === "audio" ? (
                          <div className="flex h-full flex-col items-center justify-center">
                            <Headphones className="mb-1.5 h-4 w-4 text-[#05a6e8]" />
                            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-800">
                              <div className="h-full w-3/4 bg-[#05a6e8]" />
                            </div>
                          </div>
                        ) : (
                          <video className="h-full w-full object-cover opacity-75" poster={item.posterUrl ?? undefined} src={item.mediaUrl} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white/88">{item.mediaName || "Медиа"}</p>
                        <p className="mt-1 text-sm text-white/42">
                          {item.mediaType === "image" ? "Фото" : item.mediaType === "video" ? "Видео" : "Демо"}
                        </p>
                        <p className={`mt-2 text-sm font-medium ${item.status === "error" ? "text-[#c9c0ff]" : item.status === "uploaded" ? "text-emerald-200/80" : "text-white/52"}`}>
                          {item.status === "uploaded"
                            ? "Загружено"
                            : item.status === "error"
                              ? (item.error ?? "Ошибка загрузки")
                              : `Загрузка ${item.progress}%`}
                        </p>
                      </div>
                    </div>
                    <div className="absolute right-2 top-2 flex items-center gap-1">
                      {item.status === "error" ? <button type="button" onClick={() => onRetryMedia(item.localId)} className="rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">Retry</button> : null}
                      <button type="button" onClick={() => onRemoveMedia(item.localId)} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:scale-110">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {step >= 3 ? (
              <>
                {mediaItems.length === 0 ? (
                  <div className="mb-5 mt-5 rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-base leading-8 text-white/52">
                    Добавьте демо, релиз, фото или короткое видео, если хотите показать идею нагляднее. Всё это необязательно.
                  </div>
                ) : null}
                <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-white/52">
                  <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">Загружено: {uploadedCount}</span>
                  <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">В обработке: {uploadingCount}</span>
                  <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">Ошибок: {failedCount}</span>
                </div>
                <div className="grid gap-3 border-t border-gray-800/60 pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/32">Добавить материалы</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <ComposerAction onClick={onPickImages}><ImagePlus className="h-3.5 w-3.5 text-[#7b61ff]" /> Фото</ComposerAction>
                    <ComposerAction onClick={onPickVideo}><Video className="h-3.5 w-3.5 text-pink-400" /> Видео</ComposerAction>
                    <ComposerAction onClick={onPickDemo}><Headphones className="h-3.5 w-3.5 text-[#05a6e8]" /> Демо</ComposerAction>
                  </div>
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <div className="mt-5 rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,22,35,0.82),rgba(12,15,26,0.92))] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Превью объявления</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {selectedIntentDisplayLabel ? <Badge accent>{selectedIntentDisplayLabel}</Badge> : null}
                  {(collaborationRole || collaborationProfile?.role) ? <Badge>{formatMarketplaceRoleLabel(collaborationRole || collaborationProfile?.role || "other")}</Badge> : null}
                  <Badge>{formatMarketplacePreferenceLabel(collaborationPreference)}</Badge>
                  {collaborationPreference === "local" && normalizedCollaborationCity ? <Badge>{normalizedCollaborationCity}</Badge> : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/78">
                  {content.trim() || "Описание появится здесь после того, как вы заполните текст объявления."}
                </p>
                {releaseId ? <p className="mt-3 text-xs text-white/42">Релиз будет показан как proof-of-work внутри карточки.</p> : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
              <div className="flex flex-wrap gap-2 text-sm text-white/48">
                {step === 1 && !stepComplete[1] ? <span>Выберите тип объявления, чтобы продолжить.</span> : null}
                {step === 2 && !stepComplete[2] ? <span>{localCityMissing ? "Укажите город для local-объявления." : "Укажите роль и формат сотрудничества."}</span> : null}
                {step === 3 && !stepComplete[3] ? <span>Добавьте описание объявления.</span> : null}
                {step === 4 && requiresCustomIntentLabel && !collaborationCustomIntentLabel.trim() ? <span>Добавьте короткое уточнение для объявления.</span> : null}
                {collaborationDisabled ? <span>Режим объявлений для этого профиля пока закрыт.</span> : null}
                {autoPublishEnabled ? <span>Автопубликация одобренных релизов включена.</span> : null}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {step < 4 ? (
                  <button
                    id="feed-composer-submit"
                    type="button"
                    disabled={!stepComplete[step]}
                    onClick={goNext}
                    className="h-12 shrink-0 rounded-[18px] bg-[#7b61ff] px-6 text-sm font-semibold text-white shadow-glow transition hover:bg-[#7b61ff]/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Далее →
                  </button>
                ) : (
                  <button
                    id="feed-composer-submit"
                    type="button"
                    disabled={submitDisabled}
                    onClick={onPublish}
                    className="h-14 shrink-0 rounded-[18px] bg-[#7b61ff] px-8 text-sm font-semibold text-white shadow-glow transition hover:bg-[#7b61ff]/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitLabel}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ComposerAction({ onClick, children, disabled = false }: { onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex h-12 items-center gap-2 rounded-[16px] border border-white/8 bg-white/[0.04] px-4 text-sm font-semibold text-white/78 transition hover:bg-white/[0.07] hover:text-white ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>{children}</button>;
}

function ComposerSelect({
  icon,
  label,
  value,
  options,
  onChange,
  disabled = false,
  minWidthClass = "min-w-[196px]"
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  minWidthClass?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0] ?? null;
  const hasExplicitSelection = Boolean(value);

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative w-full ${minWidthClass}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((current) => !current)}
        className={`grid h-12 w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 whitespace-nowrap rounded-[16px] border px-4 text-left text-sm font-semibold leading-none transition ${
          disabled
            ? "cursor-not-allowed border-white/8 bg-white/[0.04] text-white/40 opacity-50"
            : hasExplicitSelection
              ? "border-[#7b61ff]/32 bg-[#7b61ff]/10 text-white hover:bg-[#7b61ff]/14"
              : "border-white/8 bg-white/[0.04] text-white/82 hover:bg-white/[0.07]"
        } ${open ? "border-[#7b61ff]/55" : ""}`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="shrink-0 text-white/92">{label}</span>
        <span className="min-w-0 flex-1 truncate pl-2 text-white/80">{selected?.label ?? ""}</span>
        <span className="ml-auto inline-flex shrink-0 items-center">
          <ChevronDown className={`h-4 w-4 text-white/56 transition ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[120] max-h-[280px] overflow-y-auto rounded-2xl border border-white/10 bg-[#1a1e2d] p-2 shadow-[0_22px_48px_-24px_rgba(5,8,18,0.82)]">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={`${label}-${option.value || "empty"}`}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 whitespace-nowrap rounded-[14px] px-3 py-3 text-left text-sm transition ${active ? "bg-[#7b61ff]/16 text-white" : "text-white/72 hover:bg-white/[0.06] hover:text-white"}`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {active ? <Check className="h-4 w-4 text-white" /> : null}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PostMediaStack({ mediaItems, fallbackTitle }: { mediaItems: FeedPostItem["mediaItems"]; fallbackTitle: string }) {
  const images = mediaItems.filter((item) => item.mediaType === "image");
  const videos = mediaItems.filter((item) => item.mediaType === "video");
  const audioItems = mediaItems.filter((item) => item.mediaType === "audio");
  return (
    <div className="grid gap-4">
      {images.length ? <FeedImageGallery items={images} fallbackTitle={fallbackTitle} /> : null}
      {videos.map((item) => <FeedInlineVideo key={item.id} item={item} />)}
      {audioItems.map((item) => (
        <MediaSurface key={item.id} label={item.role === "demo" ? "Demo audio" : "Аудио"} title={item.mediaName ?? fallbackTitle} badge={item.role === "demo" ? "Demo" : undefined} hideHeader>
          <FeedAudioPlayer src={item.mediaUrl} title={item.mediaName ?? fallbackTitle} variant="waveform" compact />
        </MediaSurface>
      ))}
    </div>
  );
}

function FeedInlineVideo({ item }: { item: FeedPostItem["mediaItems"][number] }) {
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : undefined;
  return (
    <MediaSurface label="Видео" title={item.mediaName ?? "Видео публикации"}>
      <div className="overflow-hidden rounded-[18px] border border-white/8 bg-black/80">
        <div className="relative mx-auto w-full max-w-[760px] bg-black" style={ratio ? { aspectRatio: ratio } : { aspectRatio: "16 / 9" }}>
          <video controls playsInline controlsList="nodownload" preload="metadata" poster={item.posterUrl ?? undefined} src={item.mediaUrl} className="absolute inset-0 h-full w-full object-cover" />
        </div>
      </div>
    </MediaSurface>
  );
}

function getFeedImageAspectRatio(item: FeedPostItem["mediaItems"][number], mode: "gallery" | "lightbox") {
  const rawRatio = item.width && item.height ? item.width / item.height : null;
  if (!rawRatio || !Number.isFinite(rawRatio)) {
    return mode === "gallery" ? 4 / 3 : 1;
  }

  if (mode === "lightbox") {
    return Math.min(1.85, Math.max(0.58, rawRatio));
  }

  return Math.min(1.32, Math.max(0.84, rawRatio));
}

function getFeedImageContainerClass(itemsLength: number, ratio: number) {
  if (itemsLength !== 1) return "";
  if (ratio < 0.92) return "mx-auto max-w-[460px]";
  if (ratio > 1.22) return "mx-auto max-w-[700px]";
  return "mx-auto max-w-[620px]";
}

function FeedImageGallery({ items, fallbackTitle }: { items: FeedPostItem["mediaItems"]; fallbackTitle: string }) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const columnClass = items.length === 1 ? "grid-cols-1" : items.length === 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3";
  return (
    <>
      <div className={`grid gap-2.5 ${columnClass}`}>
        {items.map((item, index) => {
          const ratio = getFeedImageAspectRatio(item, "gallery");
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`group relative overflow-hidden rounded-[20px] border border-white/8 bg-[#0f111a] text-left shadow-[0_12px_30px_-28px_rgba(8,12,24,0.62)] ${getFeedImageContainerClass(items.length, ratio)}`}
            >
              <div className="relative w-full overflow-hidden" style={{ aspectRatio: ratio }}>
                <SafeImage src={item.mediaUrl} alt={item.mediaName ?? fallbackTitle} fill className="object-cover transition duration-300 group-hover:scale-[1.02]" fallback={<div className="flex h-full items-center justify-center text-white/24"><ImagePlus className="h-8 w-8" /></div>} />
              </div>
            </button>
          );
        })}
      </div>
      {activeIndex !== null ? <FeedImageLightbox items={items} activeIndex={activeIndex} fallbackTitle={fallbackTitle} onClose={() => setActiveIndex(null)} onNavigate={setActiveIndex} /> : null}
    </>
  );
}

function MediaSurface({ label, title, badge, hideHeader = false, children }: { label: string; title: string; badge?: string; hideHeader?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3 sm:p-3.5">
      {!hideHeader ? (
        <div className="mb-2.5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-white/88">{title}</p>
          </div>
          {badge ? <Badge>{badge}</Badge> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function FeedImageLightbox({ items, activeIndex, fallbackTitle, onClose, onNavigate }: { items: FeedPostItem["mediaItems"]; activeIndex: number; fallbackTitle: string; onClose: () => void; onNavigate: (index: number) => void }) {
  const item = items[activeIndex];
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);
  const touchStartXRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onNavigate(activeIndex === 0 ? items.length - 1 : activeIndex - 1);
      if (event.key === "ArrowRight") onNavigate(activeIndex === items.length - 1 ? 0 : activeIndex + 1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [activeIndex, items.length, onClose, onNavigate]);

  if (!item) return null;

  const aspectRatio = getFeedImageAspectRatio(item, "lightbox");

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#05060c]/88 p-4 backdrop-blur-md" onClick={onClose} role="dialog" aria-modal="true" aria-label="Просмотр изображения">
      <button ref={closeButtonRef} type="button" onClick={onClose} className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/50 text-white/88"><X className="h-4 w-4" /></button>
      {items.length > 1 ? <button type="button" onClick={(event) => { event.stopPropagation(); onNavigate(activeIndex === 0 ? items.length - 1 : activeIndex - 1); }} className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-black/50 text-white/88">‹</button> : null}
      <div
        className="relative mx-auto flex max-h-[90vh] w-full max-w-[min(96vw,1100px)] items-center justify-center"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => {
          touchStartXRef.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const startX = touchStartXRef.current;
          const endX = event.changedTouches[0]?.clientX ?? null;
          touchStartXRef.current = null;
          if (startX == null || endX == null || items.length < 2) return;
          const delta = endX - startX;
          if (Math.abs(delta) < 40) return;
          onNavigate(delta > 0 ? (activeIndex === 0 ? items.length - 1 : activeIndex - 1) : (activeIndex === items.length - 1 ? 0 : activeIndex + 1));
        }}
      >
        <div className="relative w-full overflow-hidden rounded-[28px] border border-white/12 bg-[#0b0d16]" style={{ aspectRatio }}>
          <SafeImage src={item.mediaUrl} alt={item.mediaName ?? fallbackTitle} fill className="object-contain" fallback={<div className="flex h-full items-center justify-center text-white/24"><ImagePlus className="h-10 w-10" /></div>} />
        </div>
      </div>
      {items.length > 1 ? <button type="button" onClick={(event) => { event.stopPropagation(); onNavigate(activeIndex === items.length - 1 ? 0 : activeIndex + 1); }} className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-black/50 text-white/88">›</button> : null}
    </div>
  );
}

function AuthPromptDialog({
  open,
  copy,
  loginHref,
  registerHref,
  onClose
}: {
  open: boolean;
  copy: ReturnType<typeof getFeedAuthPromptCopy> | null;
  loginHref: string;
  registerHref: string;
  onClose: () => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusables?.[0];
    firstFocusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !focusables?.length) return;
      const activeElement = document.activeElement;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || !copy) return null;

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-[#060814]/72 p-4 backdrop-blur-md"
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feed-auth-prompt-title"
        aria-describedby="feed-auth-prompt-description"
        className="ux-floating w-full max-w-[420px] rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(23,26,42,0.96),rgba(11,14,26,0.94))] p-5 shadow-[0_32px_120px_-56px_rgba(9,11,24,0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/46">{copy.description}</p>
            <h2 id="feed-auth-prompt-title" className="mt-2 text-[24px] font-semibold leading-tight tracking-[-0.03em] text-white/94">
              {copy.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/62 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p id="feed-auth-prompt-description" className="mt-4 text-sm leading-6 text-white/60">
          {copy.body}
        </p>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          <Link href={loginHref} className="ux-button-primary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold">
            {copy.loginLabel}
          </Link>
          <Link href={registerHref} className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-5 text-sm font-semibold text-white/82 transition hover:bg-white/[0.05]">
            {copy.registerLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

function CommunitySetupDialog({
  open,
  loading,
  busy,
  error,
  profileType,
  visibilityMode,
  releases,
  selectedReleaseIds,
  onClose,
  onProfileTypeChange,
  onVisibilityModeChange,
  onToggleRelease,
  onConfirm
}: {
  open: boolean;
  loading: boolean;
  busy: boolean;
  error: string | null;
  profileType: "artist" | "group" | "label";
  visibilityMode: CommunityVisibilityMode;
  releases: UserArtistProfileReleaseOption[];
  selectedReleaseIds: string[];
  onClose: () => void;
  onProfileTypeChange: (value: "artist" | "group" | "label") => void;
  onVisibilityModeChange: (value: CommunityVisibilityMode) => void;
  onToggleRelease: (releaseId: string) => void;
  onConfirm: () => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, onClose, open]);

  if (!open) return null;

  const showSelectedControls = visibilityMode === "selected";

  return (
    <div className="fixed inset-0 z-[176] flex items-center justify-center bg-[#040610]/82 p-4 backdrop-blur-md" onClick={busy ? undefined : onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-setup-title"
        className="w-full max-w-[720px] rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(22,25,40,0.98),rgba(10,12,22,0.98))] p-6 shadow-[0_40px_120px_-48px_rgba(0,0,0,0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8f7cff]">Community Setup</p>
            <h2 id="community-setup-title" className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-white">
              Настройте отображение профиля и релизов
            </h2>
            <p className="mt-3 max-w-[560px] text-sm leading-6 text-white/64">
              Выберите тип профиля и решите, какие ваши релизы будут показываться в ленте сообщества.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/62 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-5">
          <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Тип профиля</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { value: "artist", label: "Артист" },
                { value: "group", label: "Группа" },
                { value: "label", label: "Лейбл" }
              ].map((option) => {
                const active = profileType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onProfileTypeChange(option.value as "artist" | "group" | "label")}
                    className={`inline-flex h-11 items-center justify-center rounded-full border px-5 text-sm font-medium transition ${
                      active
                        ? "border-[#7b61ff]/60 bg-[#7b61ff]/18 text-white shadow-[0_18px_40px_-24px_rgba(123,97,255,0.9)]"
                        : "border-white/10 bg-white/[0.03] text-white/76 hover:bg-white/[0.06]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Показывать релизы в ленте</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                { value: "all", label: "Да, все релизы", description: "Все выпущенные релизы будут показаны в Community." },
                { value: "none", label: "Нет, не показывать", description: "Релизы будут скрыты из Community." },
                { value: "selected", label: "Выборочные релизы", description: "Вы сами выберете, какие релизы публиковать в ленте." }
              ].map((option) => {
                const active = visibilityMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onVisibilityModeChange(option.value as CommunityVisibilityMode)}
                    className={`rounded-[20px] border px-4 py-4 text-left transition ${
                      active
                        ? "border-[#7b61ff]/55 bg-[#171428] text-white shadow-[0_24px_48px_-28px_rgba(123,97,255,0.85)]"
                        : "border-white/10 bg-[#0f1420] text-white/72 hover:bg-[#141928]"
                    }`}
                  >
                    <div className="text-sm font-semibold">{option.label}</div>
                    <div className="mt-2 text-xs leading-5 text-white/50">{option.description}</div>
                  </button>
                );
              })}
            </div>

            {showSelectedControls ? (
              <div className="mt-4 rounded-[20px] border border-white/10 bg-[#0d111b] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">Выбранные релизы</p>
                  <span className="text-xs text-white/42">Отмечено: {selectedReleaseIds.length}</span>
                </div>
                {loading ? (
                  <p className="mt-3 text-sm text-white/54">Загружаем список релизов...</p>
                ) : releases.length === 0 ? (
                  <p className="mt-3 text-sm text-white/54">У профиля пока нет релизов для выбора.</p>
                ) : (
                  <div className="mt-3 grid max-h-[260px] gap-2 overflow-y-auto pr-1">
                    {releases.map((release) => {
                      const checked = selectedReleaseIds.includes(release.id);
                      return (
                        <label
                          key={release.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-[16px] border px-3 py-3 transition ${
                            checked
                              ? "border-[#7b61ff]/45 bg-[#171428]"
                              : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleRelease(release.id)}
                            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent text-[#7b61ff] focus:ring-[#7b61ff]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-white">{release.title}</span>
                            <span className="mt-1 block text-xs leading-5 text-white/46">
                              {release.artistNames.join(", ")} · {formatReleaseDate(release.releaseDate)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>

        {error ? <p className="mt-4 text-sm text-[#c9c0ff]">{error}</p> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] px-5 text-sm font-medium text-white/82 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Позже
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || loading}
            className="inline-flex h-12 items-center justify-center rounded-full border border-[#7b61ff]/30 bg-[linear-gradient(135deg,#7b61ff,#9d8dff)] px-5 text-sm font-semibold text-white shadow-[0_20px_48px_-24px_rgba(123,97,255,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Сохраняем..." : "Сохранить настройки"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeletePostConfirmDialog({
  open,
  busy,
  onClose,
  onConfirm
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[175] flex items-center justify-center bg-[#040610]/78 p-4 backdrop-blur-md" onClick={busy ? undefined : onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-post-title"
        aria-describedby="delete-post-description"
        className="w-full max-w-[480px] rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(22,25,40,0.98),rgba(10,12,22,0.98))] p-6 shadow-[0_40px_120px_-48px_rgba(0,0,0,0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9d8dff]">Подтверждение удаления</p>
            <h2 id="delete-post-title" className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-white">
              Удалить публикацию?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/62 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 rounded-[24px] border border-[#7b61ff]/22 bg-[#15182a] px-4 py-4">
          <p id="delete-post-description" className="text-sm leading-6 text-white/78">
            Вы точно хотите удалить этот пост? Действие нельзя отменить.
          </p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] px-5 text-sm font-medium text-white/82 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-full border border-[#7b61ff]/35 bg-[linear-gradient(135deg,#6f55ff,#9d8dff)] px-5 text-sm font-semibold text-white shadow-[0_20px_48px_-24px_rgba(123,97,255,0.75)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Удаляем..." : "Удалить публикацию"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="ux-error flex flex-wrap items-center justify-between gap-3 rounded-[22px] px-4 py-3 text-sm text-[#e2dcff]">
      <span>{message}</span>
      {onRetry ? <button type="button" onClick={onRetry} className="rounded-full border border-[#7b61ff]/25 px-3 py-1.5 text-xs font-semibold text-[#efe9ff]">Повторить</button> : null}
    </div>
  );
}


function SearchResultsDropdown({ query, results, loading }: { query: string; results: GlobalSearchPayload | null; loading: boolean }) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;
  const hasResults = Boolean(results && (
    results.releases.length
    || results.publications.length
    || results.entities.artists.length
    || results.entities.producers.length
    || results.entities.groups.length
    || results.entities.labels.length
  ));

  return (
    <div data-search-dropdown="true" className="ux-floating pointer-events-auto absolute left-0 right-0 top-[calc(100%+10px)] z-[140] max-h-[min(70vh,520px)] overflow-y-auto rounded-[24px] p-2">
      {loading && !results ? <p className="px-3 py-3 text-sm text-white/46">Ищем...</p> : null}
      {!loading && !hasResults ? <p className="px-3 py-3 text-sm text-white/46">Ничего не найдено.</p> : null}
      {results ? (
        <div className="grid gap-2">
          <SearchGroup title="Артисты" items={results.entities.artists.map(entityToSearchRow)} />
          <SearchGroup title="Продюсеры" items={results.entities.producers.map(entityToSearchRow)} />
          <SearchGroup title="Группы" items={results.entities.groups.map(entityToSearchRow)} />
          <SearchGroup title="Лейблы" items={results.entities.labels.map(entityToSearchRow)} />
          <SearchPostGroup title="Релизы" items={results.releases} />
          <SearchPostGroup title="Публикации" items={results.publications} />
        </div>
      ) : null}
    </div>
  );
}

function entityToSearchRow(entity: GlobalSearchPayload["entities"]["artists"][number]) {
  return {
    key: entity.slug,
    href: entity.href,
    title: entity.displayName,
    subtitle: entity.secondary || profileTypeLabel(entity.profileType),
    avatarUrl: entity.avatarUrl
  };
}

function SearchPostGroup({ title, items }: { title: string; items: Array<GlobalSearchPayload["releases"][number] | GlobalSearchPayload["publications"][number]> }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-1">
      <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/34">{title}</p>
      {items.map((item) => (
        <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-[18px] px-3 py-2.5 transition hover:bg-white/[0.065]">
          <Avatar name={item.title} avatarUrl={item.avatarUrl} compact />
          <span className="min-w-0 flex-1">
            <Link href={item.href} className="block truncate text-sm font-semibold text-white/86 transition hover:text-white">
              {item.title}
            </Link>
            <span className="block truncate text-xs text-white/42">
              {item.authorHref ? <Link href={item.authorHref} className="text-white/56 transition hover:text-white">{item.author}</Link> : item.author}
              {item.excerpt ? <span>{` · ${item.excerpt}`}</span> : null}
            </span>
          </span>
          <Link href={item.href} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-white/28 transition hover:border-white/20 hover:text-white/68" aria-label={`Открыть ${item.title}`}>
            <ExternalLink className="h-4 w-4 shrink-0" />
          </Link>
        </div>
      ))}
    </div>
  );
}

function SearchGroup({ title, items }: { title: string; items: Array<{ key: string; href: string; title: string; subtitle: string; avatarUrl: string | null }> }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-1">
      <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/34">{title}</p>
      {items.map((item) => (
        <Link key={item.key} href={item.href} className="flex min-w-0 items-center gap-3 rounded-[18px] px-3 py-2.5 transition hover:bg-white/[0.065]">
          <Avatar name={item.title} avatarUrl={item.avatarUrl} compact />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white/86">{item.title}</span>
            <span className="block truncate text-xs text-white/42">{item.subtitle}</span>
          </span>
          <ExternalLink className="h-4 w-4 shrink-0 text-white/28" />
        </Link>
      ))}
    </div>
  );
}

function ScopeButton({ id, active, disabled = false, onClick, children }: { id?: string; active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button id={id} type="button" disabled={disabled} onClick={onClick} className={`ux-control-compact inline-flex h-12 items-center rounded-full border px-6 text-sm font-semibold ${active ? "border-[#7b61ff]/24 bg-[#7b61ff]/18 text-white shadow-[0_16px_30px_-24px_rgba(123,97,255,0.7)]" : "border-white/8 bg-white/[0.02] text-white/64 hover:bg-white/[0.05] hover:text-white"} ${disabled ? "cursor-not-allowed opacity-45" : ""}`}>{children}</button>;
}

function FilterButton({ active, disabled = false, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`ux-control-compact inline-flex h-12 items-center rounded-full border px-6 text-sm font-medium ${active ? "ux-pill-active border-[#7b61ff]/22 bg-[#7b61ff]/11 text-white shadow-[0_14px_34px_-28px_rgba(123,97,255,0.68)]" : "border-white/8 bg-white/[0.03] text-white/56 hover:bg-white/[0.05] hover:text-white"} ${disabled ? "cursor-not-allowed opacity-45 hover:bg-white/[0.03] hover:text-white/56" : ""}`}>{children}</button>;
}

function SavedCollaborationButton({ savedByViewer, onToggleSaved, compact = false }: { savedByViewer: boolean; onToggleSaved: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggleSaved}
      aria-pressed={savedByViewer}
      aria-label={savedByViewer ? "Убрать из избранного" : "Добавить в избранное"}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full border text-sm font-medium transition ${
        savedByViewer
          ? "border-amber-300/34 bg-amber-300/12 text-amber-100"
          : "border-white/10 bg-white/[0.03] text-white/62 hover:border-white/18 hover:text-white"
      } ${compact ? "w-10 px-0" : "px-4"}`}
    >
      <Bookmark className={`h-4 w-4 ${savedByViewer ? "fill-current" : ""}`} />
      {compact ? null : (savedByViewer ? "В избранном" : "В избранное")}
    </button>
  );
}

type FeedPostCardProps = {
  item: FeedPostItem;
  anchorId: string;
  commentInputId: string;
  canInteract: boolean;
  draft: string;
  commentPending: boolean;
  selectedReaction: FeedReaction | null;
  commentsOpen: boolean;
  replyTargetId: string | null;
  replyDrafts: Record<string, string>;
  onDraftChange: (value: string) => void;
  onReplyDraftChange: (commentId: string, value: string) => void;
  onLike: (reaction: FeedReaction, reactionKey?: FeedReaction) => void;
  onComment: () => void;
  onReplySubmit: (commentId: string) => void;
  onReplyToggle: (commentId: string) => void;
  onToggleComments: () => void;
  onShowAllComments: () => void;
  onShare: () => void;
  safetyAuthenticated: boolean;
  onSafetyApplied: (action: FeedSafetyAppliedAction) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onEditComment: (comment: PublicFeedComment) => void;
  onDeleteComment: (comment: PublicFeedComment) => void;
  onReactComment: (comment: PublicFeedComment) => void;
  onRequireReactionAuth: (reactionKey?: FeedReaction) => void;
  onRequireCommentAuth: (reason?: "comment" | "reply", commentId?: string) => void;
  onToggleFollow: (slug: string, currentlyFollowing: boolean) => void;
  followBusy: boolean;
  onRespond?: () => void;
  onToggleResponses?: () => void;
  responsesOpen?: boolean;
  responsesLoading?: boolean;
  responses?: CollaborationResponseRecord[];
  responded?: boolean;
  savedByViewer?: boolean;
  onToggleAnnouncementStatus?: () => void;
  onToggleSaved?: () => void;
  announcementStatusBusy?: boolean;
  detailMode?: boolean;
  showcaseOnly?: boolean;
};

function CollaborationCard({
  item,
  anchorId,
  commentInputId,
  canInteract,
  draft,
  selectedReaction,
  commentsOpen,
  commentPending,
  onDraftChange,
  onReplyDraftChange,
  onLike,
  onComment,
  onReplySubmit,
  onReplyToggle,
  onToggleComments,
  onShowAllComments,
  onShare,
  safetyAuthenticated,
  onSafetyApplied,
  onEdit,
  onDelete,
  onEditComment,
  onDeleteComment,
  onReactComment,
  onRequireReactionAuth,
  onRequireCommentAuth,
  onToggleFollow,
  followBusy,
  onRespond,
  onToggleResponses,
  responsesOpen = false,
  responsesLoading = false,
  responses = [],
  responded = false,
  savedByViewer = false,
  onToggleSaved,
  onToggleAnnouncementStatus,
  announcementStatusBusy = false,
  detailMode = false,
  showcaseOnly = false,
  replyTargetId,
  replyDrafts
}: FeedPostCardProps) {
  const [activeVisualIndex, setActiveVisualIndex] = React.useState<number | null>(null);

  if (!item.collaboration) {
    return <PostCard
      item={item}
      anchorId={anchorId}
      commentInputId={commentInputId}
      canInteract={canInteract}
      draft={draft}
      commentPending={commentPending}
      selectedReaction={selectedReaction}
      commentsOpen={commentsOpen}
      replyTargetId={replyTargetId}
      replyDrafts={replyDrafts}
      onDraftChange={onDraftChange}
      onReplyDraftChange={onReplyDraftChange}
      onLike={onLike}
      onComment={onComment}
      onReplySubmit={onReplySubmit}
      onReplyToggle={onReplyToggle}
      onToggleComments={onToggleComments}
      onShowAllComments={onShowAllComments}
      onShare={onShare}
      safetyAuthenticated={safetyAuthenticated}
      onSafetyApplied={onSafetyApplied}
      onEdit={onEdit}
      onDelete={onDelete}
      onEditComment={onEditComment}
      onDeleteComment={onDeleteComment}
      onReactComment={onReactComment}
      onRequireReactionAuth={onRequireReactionAuth}
      onRequireCommentAuth={onRequireCommentAuth}
      onToggleFollow={onToggleFollow}
      followBusy={followBusy}
      detailMode={detailMode}
      showcaseOnly={showcaseOnly}
    />;
  }

  void onShare;
  void onToggleFollow;
  void followBusy;
  const collaboration = item.collaboration;
  const shouldShowComments = detailMode || commentsOpen;
  const displayIntent = formatMarketplaceIntentHeadline({
    displayIntent: collaboration.displayIntent,
    rawIntent: collaboration.rawIntent,
    workflow: collaboration.workflow
  });
  const displayRole = formatMarketplaceRoleLabel(collaboration.rawRole);
  const description = item.content.trim() || "Автор ищет сотрудничество для музыкального проекта.";
  const demoAudio = item.mediaItems.find((media) => media.mediaType === "audio") ?? null;
  const visualMedia = item.mediaItems.filter((media) => media.mediaType !== "audio");
  const primaryVisualMedia = visualMedia.find((media) => media.mediaType === "image") ?? null;
  const secondaryVisualMedia = primaryVisualMedia ? visualMedia.filter((media) => media.id !== primaryVisualMedia.id) : visualMedia;
  const thumbnailSrc = primaryVisualMedia?.mediaUrl ?? item.linkedRelease?.coverUrl ?? null;
  const primaryVisualIndex = primaryVisualMedia ? visualMedia.findIndex((media) => media.id === primaryVisualMedia.id) : -1;
  const reactionMeta = `${item.reactionSummary.total}`;
  const commentMeta = `${item.commentsCount}`;
  const isClosed = collaboration.status === "closed";
  const formatLabel = formatMarketplacePreferenceLabel(collaboration.preference);
  const canRespond = Boolean(onRespond) && !isClosed && !responded;
  const responseMeta = `${item.responsesCount}`;
  const ownerActions: NonNullable<React.ComponentProps<typeof FeedSafetyMenu>["extraActions"]> = [];
  if (item.author.ownedByViewer) {
    if (onToggleAnnouncementStatus) {
      ownerActions.push({
        label: announcementStatusBusy
          ? (isClosed ? "Открываем объявление..." : "Закрываем объявление...")
          : (isClosed ? "Открыть объявление" : "Закрыть объявление"),
        icon: isClosed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />,
        danger: !isClosed,
        onClick: onToggleAnnouncementStatus
      });
    }
    if (onEdit) ownerActions.push({ label: "Изменить", icon: <Pencil className="h-4 w-4" />, onClick: onEdit });
    if (onDelete) ownerActions.push({ label: "Удалить", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: onDelete });
  }

  return (
    <>
      <article
        id={anchorId}
        className={`group glass-card rounded-[22px] border shadow-[0_30px_90px_-72px_rgba(123,97,255,0.75)] ${
          isClosed
            ? "border-[#7b61ff]/14 bg-[linear-gradient(180deg,rgba(18,22,35,0.78),rgba(12,15,26,0.88))] opacity-[0.72]"
            : "border-white/10 bg-[linear-gradient(180deg,rgba(18,23,38,0.9),rgba(12,16,28,0.94))]"
        }`}
      >
      <div className="flex flex-col">
        <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-[64px_minmax(0,1fr)_auto] md:items-center xl:grid-cols-[72px_minmax(0,1fr)_210px_88px]">
          {primaryVisualMedia ? (
            <button
              type="button"
              onClick={() => setActiveVisualIndex(primaryVisualIndex >= 0 ? primaryVisualIndex : 0)}
              className="group/image relative h-16 w-16 overflow-hidden rounded-[22px] border border-white/8 bg-transparent text-left transition hover:border-[#7b61ff]/42 focus:outline-none focus:ring-2 focus:ring-[#7b61ff]/45 xl:h-[72px] xl:w-[72px]"
              aria-label="Открыть изображение объявления"
            >
              <SafeImage
                src={primaryVisualMedia.mediaUrl}
                alt={primaryVisualMedia.mediaName ?? item.linkedRelease?.title ?? item.author.displayName}
                fill
                className="object-cover transition duration-200 group-hover/image:scale-[1.03]"
                fallback={<div className="flex h-full w-full items-center justify-center rounded-[22px] bg-white/[0.035] text-white/24"><ImagePlus className="h-6 w-6" /></div>}
              />
            </button>
          ) : (
            <FeedImage src={thumbnailSrc} alt={item.linkedRelease?.title ?? item.author.displayName} ratio="thumb" />
          )}

          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-semibold ${
                collaboration.workflow === "offering"
                  ? "border-cyan-300/18 bg-cyan-300/10 text-cyan-100"
                  : "border-[#8f7cff]/22 bg-[#7b61ff]/14 text-[#d7ceff]"
              }`}>
                {collaboration.workflow === "offering" ? "Предложение" : "Сотрудничество"}
              </span>
              <span className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold ${
                isClosed ? "border-[#7b61ff]/18 bg-[#7b61ff]/8 text-[#d8d0ff]" : "border-emerald-400/18 bg-emerald-400/8 text-emerald-100"
              }`}>
                {isClosed ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#9d8dff]" />
                ) : (
                  <span className="relative flex h-2 w-2">
                    <span className="collab-status-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400/35 animate-[collabStatusPulse_2.8s_ease-out_infinite]" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                )}
                {isClosed ? "Закрыто" : "Открыто"}
              </span>
            </div>
            <h3 className="truncate text-lg font-semibold leading-tight text-white sm:text-xl">
              {`${displayIntent.replace(/^[^\p{L}\p{N}]+/u, "").trim()} · ${displayRole.replace(/^[^\p{L}\p{N}]+/u, "").trim()}`}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-white/68 sm:max-w-[680px]">
              {description}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/46">
              <span>{formatLabel}</span>
              {collaboration.preference === "local" && collaboration.city ? <span>{collaboration.city}</span> : null}
              {collaboration.genres.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}
            </div>
          </div>

          <div className="min-w-0 md:col-start-3 xl:col-start-auto">
            <AuthorHeader author={item.author} date={item.publishedAt} compact />
          </div>

          <div className="flex items-center gap-2 md:col-span-3 md:justify-end xl:col-span-1 xl:col-start-auto xl:justify-center">
            {!detailMode && onToggleSaved ? <SavedCollaborationButton savedByViewer={savedByViewer} onToggleSaved={onToggleSaved} compact /> : null}
            <FeedSafetyMenu
              compact
              variant="collaboration"
              authenticated={safetyAuthenticated}
              ownedByViewer={item.author.ownedByViewer}
              authorId={item.author.id}
              targetType="post"
              targetId={item.sourceId}
              permalink={item.permalink}
              onApplied={onSafetyApplied}
              extraActions={ownerActions}
            />
          </div>
        </div>

        {(demoAudio || item.linkedRelease || secondaryVisualMedia.length) ? (
          <div className="grid gap-3 border-t border-white/7 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid min-w-0 gap-3">
              {demoAudio ? (
                <MediaSurface label="Demo" title={demoAudio.mediaName ?? "Demo audio"} badge={demoAudio.role === "demo" ? "Demo" : undefined} hideHeader>
                  <FeedAudioPlayer
                    src={demoAudio.mediaUrl}
                    title={demoAudio.mediaName ?? "Demo audio"}
                    artist={item.author.displayName}
                    variant="waveform"
                    compact
                  />
                </MediaSurface>
              ) : null}

              {item.linkedRelease ? <LinkedReleaseCard release={item.linkedRelease} /> : null}
            </div>
            {secondaryVisualMedia.length ? <PostMediaStack mediaItems={secondaryVisualMedia} fallbackTitle={item.mediaName ?? item.author.displayName} /> : null}
          </div>
        ) : null}

        <div className={`${showcaseOnly ? "border-t border-white/8 px-4 py-3.5 sm:px-5" : "border-t border-white/8 px-4 py-4 sm:px-5"}`}>
          {showcaseOnly ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/46">
                <span>{commentMeta}</span>
                <span>•</span>
                <span>{reactionMeta}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ShareButton onClick={onShare} compact />
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap items-center gap-4 text-sm text-white/42">
                  <button type="button" onClick={() => canInteract ? onLike("heart", "heart") : onRequireReactionAuth("heart")} className="inline-flex items-center gap-2 transition hover:text-white">
                    <Heart className={`h-[17px] w-[17px] ${selectedReaction === "heart" ? "fill-current text-[#7b61ff]" : ""}`} />
                    <span>{reactionMeta}</span>
                  </button>
                  <button type="button" onClick={onToggleComments} className="inline-flex items-center gap-2 transition hover:text-white">
                    <MessageCircle className="h-[17px] w-[17px]" />
                    <span>{commentMeta}</span>
                  </button>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {item.author.ownedByViewer ? (
                    <>
                      <button
                        type="button"
                        onClick={onToggleResponses}
                        className="inline-flex h-10 items-center rounded-full border border-[#7b61ff]/24 bg-[#7b61ff]/12 px-4 text-sm font-medium text-[#efe9ff] transition hover:border-[#7b61ff]/40 hover:bg-[#7b61ff]/18"
                      >
                        {`Отклики · ${item.responsesCount}`}
                      </button>
                    </>
                  ) : (
                    <button
                      id={`collaboration-respond-${item.sourceId}`}
                      type="button"
                      disabled={!canRespond}
                      onClick={canRespond ? onRespond : undefined}
                      className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition ${
                        canRespond
                          ? "border border-[#a995ff]/52 bg-[linear-gradient(180deg,rgba(153,128,255,0.92),rgba(123,61,245,0.72))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_18px_46px_-26px_rgba(123,97,255,0.95)] backdrop-blur-md hover:border-[#c7bcff]/72 hover:bg-[linear-gradient(180deg,rgba(178,160,255,0.98),rgba(139,92,246,0.78))]"
                        : "border border-white/8 bg-white/[0.03] text-white/38"
                      }`}
                    >
                      {isClosed ? "Объявление закрыто" : responded ? "Уже откликнулись" : "Откликнуться"}
                    </button>
                  )}
                  {!item.author.ownedByViewer ? (
                    <span className="text-xs text-white/34">{`Откликов: ${responseMeta}`}</span>
                  ) : null}
                </div>
              </div>

              {item.author.ownedByViewer && responsesOpen ? (
                <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.02] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">Отклики</p>
                    {responsesLoading ? <span className="text-xs text-white/38">Загрузка...</span> : null}
                  </div>
                  {responses.length ? (
                    <div className="grid gap-3">
                      {responses.map((response) => (
                        <div key={response.id} className="rounded-[18px] border border-white/8 bg-[#141826] px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold text-white">{response.sender.displayName}</span>
                                {response.sender.verified ? <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#05a6e8] text-[10px] text-white">✓</span> : null}
                              </div>
                              <p className="mt-1 text-xs text-white/42">{formatActivityTime(response.createdAt)}</p>
                            </div>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/78">{response.message}</p>
                          {response.linkedRelease ? (
                            <div className="mt-3">
                              <LinkedReleaseCard release={response.linkedRelease} />
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : !responsesLoading ? (
                    <p className="text-sm text-white/46">Откликов пока нет.</p>
                  ) : null}
                </div>
              ) : null}

              {shouldShowComments ? <div className="mt-5"><CommentsSection comments={item.comments} commentsCount={item.commentsCount} detailMode={detailMode} canInteract={canInteract} safetyAuthenticated={safetyAuthenticated} commentTargetType="post_comment" activeReplyId={replyTargetId} replyDrafts={replyDrafts} onReplyDraftChange={onReplyDraftChange} onReply={onReplyToggle} onReplySubmit={onReplySubmit} onRequireAuth={onRequireCommentAuth} onShowAll={onShowAllComments} onSafetyApplied={onSafetyApplied} onEditComment={onEditComment} onDeleteComment={onDeleteComment} onReactComment={onReactComment} /></div> : null}

              {shouldShowComments ? <CommentComposer inputId={commentInputId} className="mt-3" draft={draft} canInteract={canInteract} pending={commentPending} placeholder="Напишите комментарий" onDraftChange={onDraftChange} onRequireAuth={onRequireCommentAuth} onSubmit={onComment} /> : null}
            </>
          )}
        </div>
      </div>
      </article>
      {activeVisualIndex !== null && visualMedia.length ? (
        <FeedImageLightbox
          items={visualMedia}
          activeIndex={activeVisualIndex}
          fallbackTitle={item.mediaName ?? item.author.displayName}
          onClose={() => setActiveVisualIndex(null)}
          onNavigate={setActiveVisualIndex}
        />
      ) : null}
    </>
  );
}

function PostCard({
  item,
  anchorId,
  commentInputId,
  canInteract,
  draft,
  selectedReaction,
  commentsOpen,
  commentPending,
  onDraftChange,
  onReplyDraftChange,
  onLike,
  onComment,
  onReplySubmit,
  onReplyToggle,
  onToggleComments,
  onShowAllComments,
  onShare,
  safetyAuthenticated,
  onSafetyApplied,
  onEdit,
  onDelete,
  onEditComment,
  onDeleteComment,
  onReactComment,
  onRequireReactionAuth,
  onRequireCommentAuth,
  onToggleFollow,
  followBusy,
  detailMode = false,
  showcaseOnly = false,
  replyTargetId,
  replyDrafts
}: FeedPostCardProps) {
  const shouldShowComments = detailMode || commentsOpen;
  const primaryMedia = item.mediaItems[0] ?? null;
  const summary = item.content?.trim() || item.linkedRelease?.title || "Публикация сообщества";
  const previewMedia = primaryMedia ? item.mediaItems.slice(1) : item.mediaItems;
  const title = summary.length > 140 ? `${summary.slice(0, 137)}...` : summary;
  const reactionMeta = `${item.reactionSummary.total}`;
  const commentMeta = `${item.commentsCount}`;
  const isDemoDrop = primaryMedia?.mediaType === "audio";
  const showFollow = !showcaseOnly && item.author.slug && item.author.profileType !== "platform" && !item.author.ownedByViewer;

  return (
    <article
      id={anchorId}
      className="glass-card rounded-2xl border border-white/10 bg-[#111522]/80 p-7 transition-all duration-300"
    >
      <div className="flex flex-col gap-5">
        <div className={`flex ${isDemoDrop ? "items-center" : "items-start justify-between"} gap-4`}>
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Avatar name={item.author.displayName} avatarUrl={item.author.avatarUrl} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-semibold text-white">{item.author.displayName}</h3>
                {item.author.verified ? <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#05a6e8] text-[10px] text-white">✓</span> : null}
                {isDemoDrop ? <span className="rounded bg-[#05a6e8]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#05a6e8]">Demo Drop</span> : null}
              </div>
              <span className="text-xs text-gray-500">{formatActivityTime(item.publishedAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showFollow ? (
              <FollowButton
                id={`follow-${item.author.slug}`}
                following={item.author.followingByViewer}
                busy={followBusy}
                onClick={() => onToggleFollow(item.author.slug!, item.author.followingByViewer)}
              />
            ) : null}
            {onEdit ? <button type="button" onClick={onEdit} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/36 transition hover:bg-white/8 hover:text-white" aria-label="Изменить публикацию"><Pencil className="h-4 w-4" /></button> : null}
            {onDelete ? <button type="button" onClick={onDelete} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/36 transition hover:bg-[#7b61ff]/12 hover:text-[#d8d0ff]" aria-label="Удалить публикацию"><Trash2 className="h-4 w-4" /></button> : null}
            <FeedSafetyMenu
              authenticated={safetyAuthenticated}
              ownedByViewer={item.author.ownedByViewer}
              authorId={item.author.id}
              targetType="post"
              targetId={item.sourceId}
              onShare={onShare}
              permalink={item.permalink}
              onApplied={onSafetyApplied}
            />
          </div>
        </div>

        <p className="whitespace-pre-wrap text-base leading-relaxed text-gray-300">{isDemoDrop ? summary : title}</p>
        {!isDemoDrop && item.content && item.content.trim() !== title ? <p className="text-sm leading-7 text-white/60">{item.content}</p> : null}

        {item.collaboration ? <CollaborationPostMeta collaboration={item.collaboration} /> : null}

        {isDemoDrop && primaryMedia ? (
          <div className="mb-1 rounded-[22px] border border-white/8 bg-[#171b29]/90 p-4 shadow-inner">
            <FeedAudioPlayer
              src={primaryMedia.mediaUrl}
              title={primaryMedia.mediaName ?? "Demo"}
              artist={item.author.displayName}
              variant="waveform"
              compact
            />
          </div>
        ) : null}

        {!isDemoDrop && primaryMedia ? <PostPrimaryMedia item={primaryMedia} fallbackTitle={primaryMedia.mediaName ?? item.author.displayName} /> : null}

        {(previewMedia.length || item.linkedRelease) && !isDemoDrop ? (
          <div className="grid gap-3">
            {previewMedia.length ? <PostMediaStack mediaItems={previewMedia} fallbackTitle={item.mediaName ?? item.author.displayName} /> : null}
            {item.linkedRelease ? <LinkedReleaseCard release={item.linkedRelease} /> : null}
          </div>
        ) : null}

        <div className={`${isDemoDrop ? "" : "mt-1"} ${showcaseOnly ? "border-t border-white/8 pt-3.5" : ""}`}>
          {showcaseOnly ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/46">
                <span>{commentMeta}</span>
                <span>•</span>
                <span>{reactionMeta}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={buildPublicFeedItemHref(item.permalink)} className="ux-control-compact inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-white/78 transition hover:text-white">Открыть публикацию</Link>
                <ShareButton onClick={onShare} compact />
              </div>
            </div>
          ) : (
            <>
              <div className={`flex flex-wrap items-center gap-6 ${isDemoDrop ? "" : "border-t border-gray-800/60 pt-5"} text-sm font-medium text-gray-500`}>
                <button type="button" onClick={() => canInteract ? onLike("heart", "heart") : onRequireReactionAuth("heart")} className="flex items-center gap-2 transition hover:text-white">
                  <Heart className={`h-[18px] w-[18px] ${selectedReaction === "heart" ? "fill-current text-[#7b61ff]" : ""}`} />
                  <span>{reactionMeta}</span>
                </button>
                <button type="button" onClick={onToggleComments} className="flex items-center gap-2 transition hover:text-white">
                  <MessageCircle className="h-[18px] w-[18px]" />
                  <span>{commentMeta}</span>
                </button>
                <button type="button" onClick={onShare} className={`${isDemoDrop ? "" : "ml-auto"} flex items-center gap-2 transition hover:text-white`}>
                  <Share2 className="h-4 w-4" />
                  {!isDemoDrop ? <span>Поделиться</span> : null}
                </button>
              </div>

              {shouldShowComments ? <div className="mt-5"><CommentsSection comments={item.comments} commentsCount={item.commentsCount} detailMode={detailMode} canInteract={canInteract} safetyAuthenticated={safetyAuthenticated} commentTargetType="post_comment" activeReplyId={replyTargetId} replyDrafts={replyDrafts} onReplyDraftChange={onReplyDraftChange} onReply={onReplyToggle} onReplySubmit={onReplySubmit} onRequireAuth={onRequireCommentAuth} onShowAll={onShowAllComments} onSafetyApplied={onSafetyApplied} onEditComment={onEditComment} onDeleteComment={onDeleteComment} onReactComment={onReactComment} /></div> : null}

              {shouldShowComments ? <CommentComposer inputId={commentInputId} className="mt-3" draft={draft} canInteract={canInteract} pending={commentPending} placeholder="Напишите комментарий" onDraftChange={onDraftChange} onRequireAuth={onRequireCommentAuth} onSubmit={onComment} /> : null}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function PostPrimaryMedia({ item, fallbackTitle }: { item: FeedPostItem["mediaItems"][number]; fallbackTitle: string }) {
  const rawRatio = item.width && item.height ? item.width / item.height : 16 / 10;
  const ratio = Number.isFinite(rawRatio) ? Math.min(1.85, Math.max(0.72, rawRatio)) : 16 / 10;
  const maxWidthClass = ratio < 0.9 ? "max-w-[420px]" : ratio > 1.25 ? "max-w-[620px]" : "max-w-[540px]";

  if (item.mediaType === "video") {
    return (
      <div className={`w-full ${maxWidthClass}`}>
        <div className="overflow-hidden rounded-[20px] border border-white/8 bg-black/80 shadow-[0_14px_34px_-28px_rgba(8,12,24,0.72)]">
          <div className="relative w-full bg-black" style={{ aspectRatio: ratio }}>
            <video controls playsInline controlsList="nodownload" preload="metadata" poster={item.posterUrl ?? undefined} src={item.mediaUrl} className="absolute inset-0 h-full w-full object-cover" />
          </div>
        </div>
      </div>
    );
  }

  if (item.mediaType === "audio") {
    return (
      <div className="w-full max-w-[620px]">
        <MediaSurface label="Audio" title={item.mediaName ?? fallbackTitle} hideHeader>
          <FeedAudioPlayer src={item.mediaUrl} title={item.mediaName ?? fallbackTitle} variant="waveform" compact />
        </MediaSurface>
      </div>
    );
  }

  return (
    <div className={`w-full ${maxWidthClass}`}>
      <div className="relative overflow-hidden rounded-[20px] border border-white/8 bg-[#0b0d16] shadow-[0_14px_34px_-28px_rgba(8,12,24,0.72)]">
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top_left,rgba(201,171,255,0.14),transparent_28%),linear-gradient(180deg,transparent,rgba(11,14,22,0.18))]" />
        <div className="relative w-full bg-[#090b12]" style={{ aspectRatio: ratio }}>
          <SafeImage src={item.mediaUrl} alt={item.mediaName ?? fallbackTitle} fill className="object-contain" fallback={<div className="flex h-full items-center justify-center text-white/24"><ImagePlus className="h-8 w-8" /></div>} />
        </div>
      </div>
    </div>
  );
}

function ReleaseCard({
  item,
  anchorId,
  commentInputId,
  canInteract,
  draft,
  selectedReaction,
  commentsOpen,
  detailMode = false,
  commentPending,
  onDraftChange,
  onReplyDraftChange,
  onLike,
  onComment,
  onReplySubmit,
  onReplyToggle,
  onToggleComments,
  onShowAllComments,
  onShare,
  safetyAuthenticated,
  onSafetyApplied,
  onEditComment,
  onDeleteComment,
  onReactComment,
  onRequireReactionAuth,
  onRequireCommentAuth,
  onToggleFollow,
  followBusy,
  onPlayRelease,
  isPlayerActive = false,
  isPlayerPlaying = false,
  showcaseOnly = false,
  replyTargetId,
  replyDrafts
}: {
  item: FeedReleaseItem;
  anchorId: string;
  commentInputId: string;
  canInteract: boolean;
  draft: string;
  commentPending: boolean;
  selectedReaction: FeedReaction | null;
  commentsOpen: boolean;
  replyTargetId: string | null;
  replyDrafts: Record<string, string>;
  detailMode?: boolean;
  onDraftChange: (value: string) => void;
  onReplyDraftChange: (commentId: string, value: string) => void;
  onLike: (reaction: FeedReaction, reactionKey?: FeedReaction) => void;
  onComment: () => void;
  onReplySubmit: (commentId: string) => void;
  onReplyToggle: (commentId: string) => void;
  onToggleComments: () => void;
  onShowAllComments: () => void;
  onShare: () => void;
  safetyAuthenticated: boolean;
  onSafetyApplied: (action: FeedSafetyAppliedAction) => void;
  onEditComment: (comment: PublicFeedComment) => void;
  onDeleteComment: (comment: PublicFeedComment) => void;
  onReactComment: (comment: PublicFeedComment) => void;
  onRequireReactionAuth: (reactionKey?: FeedReaction) => void;
  onRequireCommentAuth: (reason?: "comment" | "reply", commentId?: string) => void;
  onToggleFollow: (slug: string, currentlyFollowing: boolean) => void;
  followBusy: boolean;
  onPlayRelease: () => void;
  isPlayerActive?: boolean;
  isPlayerPlaying?: boolean;
  showcaseOnly?: boolean;
}) {
  const shouldShowComments = detailMode || commentsOpen;
  const canShowFollow = !showcaseOnly && item.author.slug && item.author.profileType !== "platform" && !item.author.ownedByViewer;
  const heartCount = item.reactionSummary.counts.heart ?? item.reactionSummary.total;
  const metaLabel = profileTypeLabel(item.author.profileType);

  return (
    <article id={anchorId} className="glass-card relative overflow-hidden rounded-2xl border border-[#7b61ff]/40 shadow-lg shadow-[#7b61ff]/10">
      <div className="pointer-events-none absolute left-0 top-0 h-80 w-full -translate-y-1/2 rounded-full bg-[#7b61ff]/30 blur-[60px]" />
      <div className="relative h-72 w-full">
        <SafeImage src={item.coverUrl} alt={item.title} fill className="object-cover" fallback={<div className="flex h-full items-center justify-center bg-[#141827] text-white/24"><Music2 className="h-10 w-10" /></div>} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#111522] via-[#111522]/40 to-transparent" />
        <div className="absolute right-5 top-5 flex items-center gap-2 rounded-full border border-[#7b61ff]/40 bg-black/70 px-4 py-1.5 text-xs font-bold tracking-wider text-[#7b61ff] shadow-sm backdrop-blur-md">
          <span>★</span>
          <span>RELEASE STORY</span>
        </div>
      </div>
      <div className="relative -mt-16 flex flex-col gap-6 p-8 md:flex-row md:items-start">
        <button
          type="button"
          data-feed-release-cover="true"
          onClick={item.audioUrl ? onPlayRelease : undefined}
          className="group z-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.4)] transition hover:scale-105"
          aria-label={item.audioUrl ? `${isPlayerPlaying && isPlayerActive ? "Пауза" : "Слушать"} ${item.title}` : item.title}
        >
          {isPlayerPlaying && isPlayerActive ? <Pause className="h-8 w-8 text-[#7b61ff]" /> : <Play className="ml-1.5 h-8 w-8 text-[#7b61ff] transition-colors group-hover:text-black" />}
        </button>
        <div className="min-w-0 flex-1 pt-3">
          <div className="mb-2">
            <h2 className="text-3xl font-bold tracking-tight text-white">{item.title}</h2>
          </div>
          <p className="mb-4 text-base text-gray-400">
            by <span className="font-semibold text-white">{item.author.displayName}</span>
            {metaLabel ? <><span className="mx-2 opacity-50">•</span><span className={profileTypeAccentClass(item.author.profileType)}>{metaLabel}</span></> : null}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-800/60 px-8 py-5 text-sm font-medium text-gray-400">
        {showcaseOnly ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-5 text-sm text-white/48">
              <span>{item.reactionSummary.total} реакций</span>
              <span>{item.commentsCount} комментариев</span>
            </div>
            <Link href={buildPublicFeedItemHref(item.permalink)} className="ux-control-compact inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-white/78 transition hover:text-white">
              Открыть релиз
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-8">
              <button type="button" onClick={() => canInteract ? onLike("heart", "heart") : onRequireReactionAuth("heart")} className="flex items-center gap-2 transition hover:text-[#7b61ff]" aria-label="Лайк">
                <Heart className={`h-5 w-5 ${selectedReaction === "heart" ? "fill-current text-[#7b61ff]" : ""}`} />
                <span>{heartCount}</span>
              </button>
              <button type="button" onClick={onToggleComments} className="flex items-center gap-2 transition hover:text-white" aria-label="Комментарии">
                <MessageCircle className="h-5 w-5" />
                <span>{item.commentsCount}</span>
              </button>
              <button type="button" onClick={onShare} className="ml-auto flex items-center gap-2 transition hover:text-white" aria-label="Поделиться">
                <Share2 className="h-4 w-4" />
                <span>Поделиться</span>
              </button>
              {canShowFollow ? <FollowButton id={`follow-${item.author.slug}`} following={item.author.followingByViewer} busy={followBusy} onClick={() => onToggleFollow(item.author.slug!, item.author.followingByViewer)} /> : null}
              <FeedSafetyMenu authenticated={safetyAuthenticated} ownedByViewer={item.author.ownedByViewer} authorId={item.author.id} targetType="release" targetId={item.releaseId} onApplied={onSafetyApplied} />
              <Link href={buildPublicFeedItemHref(item.permalink)} className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-white/72 transition hover:text-white"><span>Открыть</span><ExternalLink className="h-4 w-4" /></Link>
            </div>
            {shouldShowComments ? (
              <>
                <div className="mt-4 border-t border-white/8 pt-4">
                  <CommentsSection comments={item.comments} commentsCount={item.commentsCount} detailMode={detailMode} canInteract={canInteract} safetyAuthenticated={safetyAuthenticated} commentTargetType="release_comment" activeReplyId={replyTargetId} replyDrafts={replyDrafts} onReplyDraftChange={onReplyDraftChange} onReply={onReplyToggle} onReplySubmit={onReplySubmit} onRequireAuth={onRequireCommentAuth} onShowAll={onShowAllComments} onSafetyApplied={onSafetyApplied} onEditComment={onEditComment} onDeleteComment={onDeleteComment} onReactComment={onReactComment} />
                </div>
                <CommentComposer inputId={commentInputId} className="mt-3" draft={draft} canInteract={canInteract} pending={commentPending} placeholder="Напишите комментарий" onDraftChange={onDraftChange} onRequireAuth={onRequireCommentAuth} onSubmit={onComment} />
              </>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

function NewsCard({ item, onShare }: { item: FeedNewsItem; onShare: () => void }) {
  return (
    <article className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(22,24,38,0.9),rgba(13,16,30,0.84))] shadow-[0_26px_100px_-70px_rgba(91,75,255,0.36)] backdrop-blur-xl ring-1 ring-white/10">
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Новости</Badge>
          <span className="text-sm text-white/38">{formatReleaseDate(item.publishedAt)}</span>
        </div>
        <div className="mt-4"><AuthorHeader author={item.author} date={item.publishedAt} /></div>
        <h2 className="mt-4 max-w-[42rem] text-[26px] font-bold leading-[1.18] tracking-[-0.02em] text-white/94">{item.title}</h2>
        {item.excerpt ? <p className="mt-4 max-w-[46rem] text-[15px] leading-8 text-white/66">{item.excerpt}</p> : null}
      </div>
      {item.coverUrl ? <FeedImage src={item.coverUrl} alt={item.title} ratio="wide" /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 px-5 py-4 sm:px-6">
        <Link href={item.permalink} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-[#11131b]">
          <ExternalLink className="h-4 w-4" /> Читать полностью
        </Link>
        <ShareButton onClick={onShare} />
      </div>
    </article>
  );
}

function CollaborationPostMeta({ collaboration }: { collaboration: FeedPostItem["collaboration"] }) {
  if (!collaboration) return null;
  return (
    <div className="mt-5 rounded-[26px] bg-[linear-gradient(135deg,rgba(123,97,255,0.18),rgba(255,255,255,0.045))] p-4 ring-1 ring-[#7b61ff]/24">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#d8d1ff]">Collaboration</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge accent>{collaboration.label}</Badge>
        <Badge>{collaborationRoleLabel(collaboration.role)}</Badge>
        <Badge>{collaborationPreferenceLabel(collaboration.preference)}</Badge>
        {collaboration.preference === "local" && collaboration.city ? <Badge>{collaboration.city}</Badge> : null}
        {collaboration.genres.map((genre) => (
          <Badge key={genre}>{genre}</Badge>
        ))}
      </div>
    </div>
  );
}

function LinkedReleaseCard({ release }: { release: FeedPostItem["linkedRelease"] }) {
  if (!release) return null;
  const musicPlatformLinks = (release.platformLinks ?? []).filter((platform) => {
    const label = platform.label.toLowerCase();
    const code = platform.code.toLowerCase();
    return label.includes("яндекс") || label.includes("yandex") || label.includes("vk") || label.includes("вк") || code.includes("yandex") || code.includes("vk");
  });
  const preview = release.coverUrl ? (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[16px] border border-white/10 bg-transparent">
      <Image src={release.coverUrl} alt={release.title} fill unoptimized className="object-cover" />
    </div>
  ) : (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.03] text-white/36">
      <Music2 className="h-5 w-5" />
    </div>
  );
  return (
    <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.045] px-4 py-4">
      <div className="flex items-start gap-3">
        {preview}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-white/42">Портфолио / релиз</p>
          <p className="mt-2 truncate text-sm font-semibold text-white">{release.title}</p>
          <p className="mt-1 text-xs text-white/52">
            {[release.artistName, formatReleaseDate(release.releaseDate)].filter(Boolean).join(" • ")}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {musicPlatformLinks.length ? (
          <>
            {musicPlatformLinks.slice(0, 3).map((platform) => (
              <a key={platform.code} href={platform.href} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-white/72 transition hover:border-white/18 hover:text-white">
                {platform.label}
              </a>
            ))}
          </>
        ) : (
          <span className="text-sm text-white/48">Площадочные ссылки пока не добавлены.</span>
        )}
      </div>
    </div>
  );
}

function AuthorHeader({ author, date, compact = false, releaseDateOnly = false, action }: { author: PublicFeedItem["author"]; date: string; compact?: boolean; releaseDateOnly?: boolean; action?: React.ReactNode }) {
  const identity = (
    <TripledIdentity
      name={author.displayName}
      avatarUrl={author.avatarUrl}
      verified={author.verified}
      compact={compact}
      meta={releaseDateOnly ? formatReleaseDate(date) : formatActivityTime(date)}
    />
  );
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        {identity}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {action}
      </div>
    </div>
  );
}

function CommentComposer({
  inputId,
  draft,
  canInteract,
  pending,
  placeholder,
  className,
  onDraftChange,
  onRequireAuth,
  onSubmit
}: {
  inputId: string;
  draft: string;
  canInteract: boolean;
  pending: boolean;
  placeholder: string;
  className?: string;
  onDraftChange: (value: string) => void;
  onRequireAuth: (reason?: "comment" | "reply", commentId?: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (canInteract) onSubmit();
      else onRequireAuth("comment");
    }} className={`flex items-center gap-3 ${className ?? ""}`}>
      <input id={inputId} value={draft} onChange={(event) => onDraftChange(event.target.value)} maxLength={800} placeholder={placeholder} className="min-h-11 min-w-0 flex-1 rounded-[18px] border border-white/8 bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[15px] leading-5 text-white outline-none transition placeholder:text-white/36 focus:border-[#7b61ff]/50 focus:bg-[rgba(255,255,255,0.06)]" />
      <button type="submit" disabled={pending} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[linear-gradient(180deg,#8c6dff,#6f4cff)] text-white shadow-[0_12px_24px_-18px_rgba(123,97,255,0.85)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50"><Send className="h-4 w-4" /></button>
    </form>
  );
}

function FollowButton({ id, following, busy, onClick }: { id?: string; following: boolean; busy: boolean; onClick: () => void }) {
  const className = `inline-flex h-11 items-center justify-center rounded-[18px] border px-5 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${following ? "border-[#7b61ff]/34 bg-[#7b61ff]/14 text-[#efe9ff] shadow-[0_18px_34px_-24px_rgba(123,97,255,0.7)] hover:border-[#9d8dff]/60 hover:bg-[#7b61ff]/20 hover:text-white" : "border-[#7b61ff]/44 bg-[linear-gradient(180deg,#8c6dff,#6f4cff)] text-white shadow-[0_18px_34px_-24px_rgba(123,97,255,0.88)] hover:border-[#8d74ff] hover:brightness-110 hover:shadow-[0_22px_40px_-26px_rgba(123,97,255,0.92)]"} ${busy ? "cursor-wait opacity-60" : ""}`;
  return (
    <button
      id={id}
      type="button"
      disabled={busy}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={className}
    >
      {busy ? "Обновление" : following ? "Отписаться" : "Подписаться"}
    </button>
  );
}

function profileTypeAccentClass(profileType: PublicFeedItem["author"]["profileType"]) {
  if (profileType === "label") return "text-[#ff8f9d]";
  if (profileType === "artist") return "text-[#8ff3ce]";
  if (profileType === "group") return "text-[#63d995]";
  return "text-gray-400";
}

function CommentsSection({
  comments,
  commentsCount,
  detailMode,
  canInteract,
  safetyAuthenticated,
  commentTargetType,
  activeReplyId,
  replyDrafts,
  onReplyDraftChange,
  onReply,
  onReplySubmit,
  onRequireAuth,
  onShowAll,
  onSafetyApplied,
  onEditComment,
  onDeleteComment,
  onReactComment
}: {
  comments: PublicFeedComment[];
  commentsCount: number;
  detailMode: boolean;
  canInteract: boolean;
  safetyAuthenticated: boolean;
  commentTargetType: Extract<FeedSafetyTargetType, "post_comment" | "release_comment">;
  activeReplyId: string | null;
  replyDrafts: Record<string, string>;
  onReplyDraftChange: (commentId: string, value: string) => void;
  onReply: (commentId: string) => void;
  onReplySubmit: (commentId: string) => void;
  onRequireAuth: (reason?: "comment" | "reply", commentId?: string) => void;
  onShowAll: () => void;
  onSafetyApplied: (action: FeedSafetyAppliedAction) => void;
  onEditComment: (comment: PublicFeedComment) => void;
  onDeleteComment: (comment: PublicFeedComment) => void;
  onReactComment: (comment: PublicFeedComment) => void;
}) {
  const previewComments = detailMode ? comments : comments.slice(0, 2);
  const hiddenCount = Math.max(commentsCount - comments.length, 0);

  return (
    <div className="pt-2">
      {previewComments.length ? (
        <div className="space-y-5">
          {previewComments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              canInteract={canInteract}
              safetyAuthenticated={safetyAuthenticated}
              commentTargetType={commentTargetType}
              activeReplyId={activeReplyId}
              replyDraft={replyDrafts[comment.id] ?? ""}
              replyDrafts={replyDrafts}
              onReplyDraftChange={onReplyDraftChange}
              onReply={onReply}
              onReplySubmit={onReplySubmit}
              onRequireAuth={onRequireAuth}
              onSafetyApplied={onSafetyApplied}
              onEditComment={onEditComment}
              onDeleteComment={onDeleteComment}
              onReactComment={onReactComment}
              showNestedPreview={!detailMode}
            />
          ))}
        </div>
      ) : (
        <div className="px-1 py-3 text-[15px] font-medium text-white/42">
          Комментариев пока нет.
        </div>
      )}
      {commentsCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-4 pl-20 text-xs font-medium text-white/36">
          <button
            type="button"
            onClick={canInteract
              ? () => {
                  const firstCommentId = comments[0]?.id;
                  if (firstCommentId) onReply(firstCommentId);
                }
              : () => onRequireAuth("reply", comments[0]?.id)}
            className="transition hover:text-white"
          >
            Ответить
          </button>
          {(detailMode || hiddenCount > 0 || comments.some((comment) => comment.repliesCount > comment.replies.length)) ? (
            <button
              type="button"
              onClick={onShowAll}
              className="transition hover:text-white"
            >
              {detailMode ? "Обновить комментарии" : `Показать все комментарии${hiddenCount ? ` (${hiddenCount})` : ""}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CommentRow({
  comment,
  canInteract,
  safetyAuthenticated,
  commentTargetType,
  activeReplyId,
  replyDraft,
  replyDrafts,
  onReplyDraftChange,
  onReply,
  onReplySubmit,
  onRequireAuth,
  onSafetyApplied,
  onEditComment,
  onDeleteComment,
  onReactComment,
  depth = 0,
  showNestedPreview = false
}: {
  comment: PublicFeedComment;
  canInteract: boolean;
  safetyAuthenticated: boolean;
  commentTargetType: Extract<FeedSafetyTargetType, "post_comment" | "release_comment">;
  activeReplyId: string | null;
  replyDraft: string;
  replyDrafts: Record<string, string>;
  onReplyDraftChange: (commentId: string, value: string) => void;
  onReply: (commentId: string) => void;
  onReplySubmit: (commentId: string) => void;
  onRequireAuth: (reason?: "comment" | "reply", commentId?: string) => void;
  onSafetyApplied: (action: FeedSafetyAppliedAction) => void;
  onEditComment: (comment: PublicFeedComment) => void;
  onDeleteComment: (comment: PublicFeedComment) => void;
  onReactComment: (comment: PublicFeedComment) => void;
  depth?: number;
  showNestedPreview?: boolean;
}) {
  const previewReplies = showNestedPreview ? comment.replies.slice(0, 1) : comment.replies;
  const isReply = depth > 0;

  return (
    <div className={`relative flex gap-4 ${isReply ? "ml-10 pt-1" : ""}`}>
      {!isReply && previewReplies.length ? <div className="absolute left-5 top-14 bottom-2 w-px -ml-px bg-white/10" /> : null}
      {isReply ? <div className="absolute -left-8 top-0 bottom-0 w-px bg-white/10" /> : null}
      <div className={`${isReply ? "pt-1" : ""}`}>
        <Avatar name={comment.author.name} avatarUrl={comment.author.avatarUrl} compact />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`rounded-[18px] border px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${isReply ? "border-white/55 bg-[#111417]" : "border-white/8 bg-[#0f141b]"}`}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="font-semibold text-white/88">{comment.author.name}</span>
            {comment.author.isVerified ? <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#05a6e8] text-[9px] text-white">✓</span> : null}
          </div>
          {comment.content ? <p className="text-[15px] leading-relaxed text-white/66">{comment.content}</p> : null}
          {comment.mediaUrl ? <div className="mt-3"><FeedImage src={comment.mediaUrl} alt={comment.mediaName ?? "Комментарий"} ratio="wide" /></div> : null}
        </div>
        <div className="ml-2 mt-2 flex flex-wrap items-center gap-5 text-xs font-medium text-white/30">
          <span>{formatActivityTime(comment.createdAt)}{comment.editedAt ? " · изменено" : ""}</span>
          {!comment.deletedAt ? <button type="button" onClick={canInteract ? () => onReply(comment.id) : () => onRequireAuth("reply", comment.id)} className="transition hover:text-white">Ответить</button> : null}
          {!comment.deletedAt ? <button type="button" onClick={() => onReactComment(comment)} className="flex items-center gap-1 transition hover:text-white/70"><Heart className={`h-3.5 w-3.5 ${comment.viewerReaction === "heart" ? "fill-current text-white/72" : ""}`} /> {comment.reactionSummary.total || 0}</button> : null}
          {comment.ownedByViewer && !comment.deletedAt ? (
            <>
              <button type="button" onClick={() => onEditComment(comment)} className="transition hover:text-white">Изменить</button>
              <button type="button" onClick={() => onDeleteComment(comment)} className="transition hover:text-[#d8d0ff]">Удалить</button>
            </>
          ) : (
            <FeedSafetyMenu compact authenticated={safetyAuthenticated} ownedByViewer={comment.ownedByViewer} authorId={comment.author.id} targetType={commentTargetType} targetId={comment.id} onApplied={onSafetyApplied} />
          )}
        </div>
        {activeReplyId === comment.id ? <div className="mt-3"><CommentComposer inputId={`reply-${comment.id}`} draft={replyDraft} canInteract={canInteract} pending={false} placeholder="Ответить на комментарий" onDraftChange={(value) => canInteract ? onReplyDraftChange(comment.id, value) : onRequireAuth("reply", comment.id)} onRequireAuth={() => onRequireAuth("reply", comment.id)} onSubmit={() => void onReplySubmit(comment.id)} /></div> : null}
        {previewReplies.length ? (
          <div className="mt-5 space-y-5">
            {previewReplies.map((reply) => (
              <CommentRow
                key={reply.id}
                comment={reply}
                canInteract={canInteract}
                safetyAuthenticated={safetyAuthenticated}
                commentTargetType={commentTargetType}
                activeReplyId={activeReplyId}
                replyDraft={replyDrafts[reply.id] ?? ""}
                replyDrafts={replyDrafts}
                onReplyDraftChange={onReplyDraftChange}
                onReply={onReply}
                onReplySubmit={onReplySubmit}
                onRequireAuth={onRequireAuth}
                onSafetyApplied={onSafetyApplied}
                onEditComment={onEditComment}
                onDeleteComment={onDeleteComment}
                onReactComment={onReactComment}
                depth={depth + 1}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ShareButton({ onClick, compact = false, block = false }: { onClick: () => void; compact?: boolean; block?: boolean }) {
  return <button type="button" onClick={onClick} className={`ux-control-compact ${compact ? "h-10 px-3 text-xs" : "h-10 px-4 text-sm"} ${block ? "w-full justify-center" : compact ? "ml-0" : "ml-auto"} inline-flex items-center gap-2 rounded-xl text-white/60 transition hover:bg-white/[0.04] hover:text-white`}><Share2 className="h-4 w-4" /> Поделиться</button>;
}

function CommunityUnavailableNotice() {
  return (
    <div className="mb-4 rounded-[18px] border border-amber-300/14 bg-amber-200/[0.06] px-3.5 py-3 text-sm text-amber-50/86">
      Discovery-блоки временно недоступны. Основная лента загружена, но ranking-сигналы сейчас не пересчитаны.
    </div>
  );
}

function EmptyState({ scope, collaborationFilter, collaborationIntent, collaborationRole, primaryView }: { scope: "all" | "following"; collaborationFilter: FeedCollaborationFilter; collaborationIntent: CollaborationIntent | null; collaborationRole: CollaborationRole | null; primaryView: FeedPrimaryView }) {
  if (scope === "following") return <div className="ux-empty rounded-[22px] border-dashed p-8 text-sm leading-6 text-white/45">Вы пока не подписаны ни на кого, чьи новости могли бы посмотреть.</div>;
  if (primaryView === "people") return <div className="ux-empty rounded-[22px] border-dashed p-8 text-sm leading-6 text-white/45">Профилей для текущего поиска и фильтров пока нет.</div>;
  if (primaryView === "releases") return <div className="ux-empty rounded-[22px] border-dashed p-8 text-sm leading-6 text-white/45">Релизов для текущего среза пока нет.</div>;
  if (collaborationFilter === "only") return <div className="ux-empty rounded-[22px] border-dashed p-8 text-sm leading-6 text-white/45">Постов с коллаб-запросами {collaborationIntent ? `«${collaborationIntentLabel(collaborationIntent)}» ` : ""}{collaborationRole ? `для роли «${collaborationRoleLabel(collaborationRole)}» ` : ""}пока не наблюдается.</div>;
  return <div className="ux-empty rounded-[22px] border-dashed p-8 text-sm leading-6 text-white/45">Пока нет материалов для выбранного фильтра.</div>;
}

function FeedSkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="ux-loading animate-pulse overflow-hidden rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-white/10" />
            <div className="grid flex-1 gap-2">
              <div className="h-4 w-40 rounded-full bg-white/10" />
              <div className="h-3 w-24 rounded-full bg-white/8" />
            </div>
          </div>
          <div className="mt-5 h-4 w-full rounded-full bg-white/8" />
          <div className="mt-2 h-4 w-5/6 rounded-full bg-white/8" />
          <div className="mt-5 aspect-[16/9] rounded-[22px] bg-white/6" />
        </div>
      ))}
    </div>
  );
}

function Avatar({ name, avatarUrl, compact = false }: { name: string; avatarUrl: string | null; compact?: boolean }) {
  const [failed, setFailed] = React.useState(!avatarUrl);
  React.useEffect(() => {
    setFailed(!avatarUrl);
  }, [avatarUrl]);
  const src = avatarUrl && !failed ? avatarUrl : DEFAULT_USER_AVATAR_URL;
  return (
    <span className={`relative block overflow-hidden rounded-full border border-white/10 bg-[#211a42] ${compact ? "h-10 w-10" : "h-12 w-12"}`}>
      <Image src={src} alt={name} fill unoptimized className="object-cover" onError={() => setFailed(true)} />
    </span>
  );
}

const BADGE_BASE_CLASS = "inline-flex h-10 items-center justify-center rounded-[18px] border px-3.5 text-[11px] font-semibold uppercase tracking-[0.18em]";

function Badge({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return <span className={`${BADGE_BASE_CLASS} ${accent ? "border-[#7b61ff]/24 bg-[#7b61ff]/12 text-[#e0d8ff]" : "border-white/8 bg-white/[0.028] text-white/56"}`}>{children}</span>;
}

function FeedImage({ src, alt, ratio }: { src: string | null; alt: string; ratio: "square" | "wide" | "video" | "thumb" }) {
  const ratioClass = ratio === "square" ? "aspect-square" : ratio === "wide" ? "aspect-[16/10]" : ratio === "thumb" ? "aspect-square h-[56px] w-[56px]" : "aspect-[4/3]";
  return <div className={`relative overflow-hidden rounded-[22px] border border-white/8 bg-transparent ${ratioClass}`}><SafeImage src={src} alt={alt} fill className="object-cover" fallback={<div className="flex h-full w-full items-center justify-center rounded-[22px] bg-white/[0.035] text-white/24"><Music2 className="h-9 w-9" /></div>} /></div>;
}

function SafeImage({ src, alt, fill = false, className, fallback }: { src: string | null; alt: string; fill?: boolean; className?: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = React.useState(!src);
  React.useEffect(() => setFailed(!src), [src]);
  if (!src || failed) return <>{fallback}</>;
  return <Image src={src} alt={alt} fill={fill} unoptimized className={className} onError={() => setFailed(true)} />;
}

function formatActivityTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function insertReply(comments: PublicFeedComment[], parentId: string, reply: PublicFeedComment): PublicFeedComment[] {
  return comments.map((comment) => {
    if (comment.id === parentId) {
      return {
        ...comment,
        replies: [reply, ...comment.replies],
        repliesCount: comment.repliesCount + 1
      };
    }
    if (!comment.replies.length) return comment;
    return {
      ...comment,
      replies: insertReply(comment.replies, parentId, reply)
    };
  });
}

function formatReleaseDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) {
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  }
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function profileTypeLabel(value: "user" | "artist" | "producer" | "group" | "label" | "platform") {
  return value === "platform" ? "Платформа" : value === "user" ? "Пользователь" : value === "producer" ? "Продюсер" : value === "label" ? "Лейбл" : value === "group" ? "Группа" : "Артист";
}
