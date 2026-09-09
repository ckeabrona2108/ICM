import type {
  CollaborationIntent,
  CollaborationIntentCategory,
  CollaborationPostMetadata,
  CollaborationProfile,
  CollaborationPreference,
  CollaborationStatus,
  CollaborationRole,
  CollaborationWorkflow
} from "@/lib/collaboration";

export type FeedScope = "all" | "following";
export type FeedType = "all" | "posts" | "releases" | "news" | "video" | "media";
export type FeedCollaborationFilter = "all" | "only";
export type FeedPrimaryView = "collaborations" | "people" | "releases";
export type FeedSort = "newest" | "oldest" | "responses_desc" | "responses_asc";

export type FeedAuthor = {
  id: string;
  slug: string | null;
  displayName: string;
  avatarUrl: string | null;
  profileType: "user" | "artist" | "producer" | "group" | "label" | "platform";
  verified: boolean;
  followingByViewer: boolean;
  ownedByViewer: boolean;
};

export type FeedReaction = "heart" | "fire" | "laugh" | "wow" | "sad" | "thumbs" | "party" | "diamond";

export type FeedReactionCounts = Record<FeedReaction, number>;

export type FeedReactionSummary = {
  total: number;
  counts: FeedReactionCounts;
  viewerReaction: FeedReaction | null;
};

export type FeedPostMediaRole = "standard" | "demo";

export type FeedPostMediaItem = {
  id: string;
  mediaType: "image" | "audio" | "video";
  mediaUrl: string;
  mediaName: string | null;
  role: FeedPostMediaRole;
  width: number | null;
  height: number | null;
  posterUrl: string | null;
};

export type FeedCommentAuthor = {
  id: string;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
};

export type PublicFeedComment = {
  id: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  updatedAt?: string;
  editedAt?: string | null;
  deletedAt: string | null;
  ownedByViewer: boolean;
  reactionSummary: FeedReactionSummary;
  viewerReaction: FeedReaction | null;
  author: FeedCommentAuthor;
  mediaUrl?: string | null;
  mediaName?: string | null;
  replies: PublicFeedComment[];
  repliesCount: number;
};

export type LinkedRelease = {
  id: string;
  title: string;
  releaseDate: string;
  href: string;
  artistName?: string | null;
  coverUrl?: string | null;
  audioPreviewUrl?: string | null;
  platformLinks?: Array<{
    code: string;
    label: string;
    href: string;
  }>;
};

export type FeedCollaborationProfile = CollaborationProfile;

export type FeedCollaborationPost = CollaborationPostMetadata & {
  label: string;
  rawIntent: CollaborationIntent;
  intentCategory: CollaborationIntentCategory;
  displayIntent: string;
  rawRole: CollaborationRole;
  displayRole: string;
  status: CollaborationStatus;
};

export type FeedBase = {
  id: string;
  sourceId: string;
  kind: "post" | "release" | "news";
  publishedAt: string;
  permalink: string;
  author: FeedAuthor;
  likesCount: number;
  commentsCount: number;
  likedByViewer: boolean;
  viewerReaction: FeedReaction | null;
  reactionSummary: FeedReactionSummary;
};

export type FeedPostItem = FeedBase & {
  kind: "post";
  postType: "standard" | "collaboration";
  content: string;
  updatedAt: string;
  editedAt: string | null;
  mediaType: "image" | "audio" | "video" | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaItems: FeedPostMediaItem[];
  comments: PublicFeedComment[];
  responsesCount: number;
  linkedRelease: LinkedRelease | null;
  collaboration: FeedCollaborationPost | null;
};

export type FeedReleaseItem = FeedBase & {
  kind: "release";
  releaseId: string;
  title: string;
  coverUrl: string | null;
  audioUrl: string | null;
  playCount: number;
  comments: PublicFeedComment[];
  sceneHref: string | null;
};

export type FeedNewsItem = FeedBase & {
  kind: "news";
  newsId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  coverUrl: string | null;
};

export type PublicFeedItem = FeedPostItem | FeedReleaseItem | FeedNewsItem;

export type FeedComposerProfile = {
  artistKey: string;
  sourceName: string;
  slug: string;
  profileType: "user" | "artist" | "producer" | "group" | "label";
  avatarUrl: string | null;
  settings: {
    displayName: string;
    autoPublishApprovedReleases: boolean;
    collaboration: FeedCollaborationProfile;
  };
};

export type FeedReleaseOption = {
  id: string;
  title: string;
  artistNames: string[];
  releaseDate: string;
};

export type FeedPersonProfileType = "artist" | "producer" | "group" | "label";

export type FeedPersonPortfolioRelease = {
  id: string;
  title: string;
  releaseDate: string;
};

export type FeedPersonCard = {
  userId: string;
  slug: string;
  displayName: string;
  profileType: FeedPersonProfileType;
  city: string;
  bio: string;
  genres: string[];
  avatarUrl: string | null;
  releaseCount: number;
  collaborationOpen: boolean;
  collaborationRole: CollaborationRole | null;
  displayRole: string | null;
  portfolio: FeedPersonPortfolioRelease[];
};

export type FeedSuggestion = {
  slug: string;
  displayName: string;
  profileType: "artist" | "producer" | "group" | "label";
  avatarUrl: string | null;
};

export type FeedCommunitySignalAudit = {
  signal: string;
  exists: boolean;
  reliable: boolean;
  canRank: boolean;
  notes: string;
};

export type FeedCommunityMetrics = {
  uniqueReactions: number | null;
  rootComments: number | null;
  replies: number | null;
  uniqueParticipants: number | null;
  qualifiedPlays: number | null;
  latestInteractionAt: string | null;
  score: number | null;
  velocity: number | null;
  recencyBoost: number | null;
};

export type FeedCommunityPostEntry = {
  item: FeedPostItem;
  metrics: FeedCommunityMetrics;
};

export type FeedCommunityReleaseEntry = {
  item: FeedReleaseItem;
  metrics: FeedCommunityMetrics;
};

export type FeedCommunityDiagnosticsEntry = {
  itemId: string;
  sourceId: string;
  kind: "post" | "release";
  category: "live" | "trending" | "popular" | "post_of_week" | "new_release" | "collaboration";
  window: string;
  score: number;
  metrics: FeedCommunityMetrics;
  exclusionReason?: string | null;
};

export type FeedCommunitySummary = {
  publicPostsToday: number | null;
  releasesToday: number | null;
  collaborationsToday: number | null;
};

export type FeedCommunityDiscovery = {
  status: "ready" | "unavailable";
  releaseWindow: "today" | "recent";
  signalAudit: FeedCommunitySignalAudit[];
  live: FeedCommunityPostEntry[];
  trending: FeedCommunityPostEntry[];
  popular: FeedCommunityPostEntry[];
  releases: FeedCommunityReleaseEntry[];
  collaborations: FeedCommunityPostEntry[];
  postOfWeek: FeedCommunityPostEntry | null;
  summary: FeedCommunitySummary;
  diagnostics?: {
    ranked: FeedCommunityDiagnosticsEntry[];
    excluded: FeedCommunityDiagnosticsEntry[];
  } | null;
};

export type PublicFeedPayload = {
  view: FeedPrimaryView | null;
  scope: FeedScope;
  scopeAccess: "granted" | "auth_required";
  type: FeedType;
  collaborationFilter: FeedCollaborationFilter;
  collaborationIntent: CollaborationIntent | null;
  collaborationRole: CollaborationRole | null;
  collaborationWorkflow: CollaborationWorkflow | null;
  collaborationPreference: CollaborationPreference | null;
  collaborationCity: string | null;
  collaborationStatus: CollaborationStatus | null;
  sort: FeedSort;
  profileType: FeedPersonProfileType | null;
  search: string;
  author: string | null;
  items: PublicFeedItem[];
  people: FeedPersonCard[];
  nextCursor: string | null;
  hasMore: boolean;
  viewer: {
    authenticated: boolean;
    id?: string | null;
  };
  ownedProfiles: FeedComposerProfile[];
  releaseOptions: FeedReleaseOption[];
  collaborationCities: string[];
  suggestions: FeedSuggestion[];
  newReleases: FeedReleaseItem[];
  popularPosts: FeedPostItem[];
  releaseOfWeek: FeedReleaseItem | null;
  community: FeedCommunityDiscovery;
};
