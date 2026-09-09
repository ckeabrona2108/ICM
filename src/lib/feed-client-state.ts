import type { FeedCollaborationFilter, FeedPersonProfileType, FeedPostItem, FeedPrimaryView, FeedScope, FeedType } from "@/lib/feed-contract";
import type { CollaborationIntent, CollaborationPreference, CollaborationRole, CollaborationStatus, CollaborationWorkflow } from "@/lib/collaboration";
import {
  normalizeFeedQueryState,
  resolveFeedPrimaryView,
  type FeedSort,
  type FeedQueryState
} from "@/lib/feed-query-state";

export type FeedViewMode = "ready" | "loading" | "refreshing" | "empty" | "error";

export function buildFeedApiRequestQuery(
  state: FeedQueryState,
  cursor?: string | null,
  authorSlug?: string | null
) {
  const normalized = normalizeFeedQueryState(state);
  const query = new URLSearchParams();
  if (normalized.view) query.set("view", normalized.view);
  query.set("scope", normalized.scope);
  query.set("type", normalized.type);
  const search = normalized.search.trim();
  if (search) query.set("search", search);
  if (normalized.collaborationFilter !== "all") query.set("collab", normalized.collaborationFilter);
  if (normalized.collaborationIntent) query.set("intent", normalized.collaborationIntent);
  if (normalized.collaborationRole) query.set("role", normalized.collaborationRole);
  if (normalized.collaborationWorkflow) query.set("workflow", normalized.collaborationWorkflow);
  if (normalized.collaborationPreference) query.set("format", normalized.collaborationPreference);
  if (normalized.collaborationCity) query.set("city", normalized.collaborationCity);
  if (normalized.collaborationStatus) query.set("status", normalized.collaborationStatus);
  if (normalized.sort !== "newest") query.set("sort", normalized.sort);
  if (normalized.profileType) query.set("profileType", normalized.profileType);
  if (authorSlug) query.set("author", authorSlug);
  if (cursor) query.set("cursor", cursor);
  return query.toString();
}

export function buildFeedStateKey(state: FeedQueryState) {
  return buildFeedApiRequestQuery(state);
}

export function getFeedQueryStateFromPayload(input: {
  view: FeedPrimaryView | null;
  scope: FeedScope;
  type: FeedType;
  search: string;
  collaborationFilter: FeedCollaborationFilter;
  collaborationIntent: CollaborationIntent | null;
  collaborationRole: CollaborationRole | null;
  collaborationWorkflow: CollaborationWorkflow | null;
  collaborationPreference: CollaborationPreference | null;
  collaborationCity: string | null;
  collaborationStatus: CollaborationStatus | null;
  sort: FeedSort;
  profileType: FeedPersonProfileType | null;
}): FeedQueryState {
  return {
    view: input.view,
    scope: input.scope,
    type: input.type,
    search: input.search,
    collaborationFilter: input.collaborationFilter,
    collaborationIntent: input.collaborationIntent,
    collaborationRole: input.collaborationRole,
    collaborationWorkflow: input.collaborationWorkflow,
    collaborationPreference: input.collaborationPreference,
    collaborationCity: input.collaborationCity,
    collaborationStatus: input.collaborationStatus,
    sort: input.sort,
    profileType: input.profileType
  };
}

export function normalizeLockedAuthorFeedQueryState(state: FeedQueryState, lockedAuthorSlug?: string | null): FeedQueryState {
  if (!lockedAuthorSlug || state.scope === "all") return state;
  return { ...state, scope: "all" };
}

export { resolveFeedPrimaryView };

export function isCurrentFeedStateLoaded(params: {
  loadedStateKey: string;
  currentStateKey: string;
}) {
  return params.loadedStateKey === params.currentStateKey;
}

export function shouldAcceptFeedResponse(params: {
  requestId: number;
  activeRequestId: number;
  aborted: boolean;
}) {
  return !params.aborted && params.requestId === params.activeRequestId;
}

export function doesFeedPostMatchState(
  post: Pick<FeedPostItem, "postType" | "collaboration">,
  state: FeedQueryState
) {
  const normalized = normalizeFeedQueryState(state);
  const primaryView = resolveFeedPrimaryView(normalized);
  if (primaryView === "people" || primaryView === "releases") return false;
  if (normalized.type !== "all" && normalized.type !== "posts") return false;
  if (normalized.collaborationFilter !== "only") return true;
  if (post.postType !== "collaboration" || !post.collaboration) return false;
  if (normalized.collaborationIntent && post.collaboration.intent !== normalized.collaborationIntent) return false;
  if (normalized.collaborationRole && post.collaboration.role !== normalized.collaborationRole) return false;
  if (normalized.collaborationWorkflow && post.collaboration.workflow !== normalized.collaborationWorkflow) return false;
  if (normalized.collaborationPreference && post.collaboration.preference !== normalized.collaborationPreference) return false;
  if (normalized.collaborationCity && post.collaboration.city.trim().toLocaleLowerCase("ru-RU") !== normalized.collaborationCity.toLocaleLowerCase("ru-RU")) return false;
  if (normalized.collaborationStatus && post.collaboration.status !== normalized.collaborationStatus) return false;
  return true;
}

export function resolveFeedViewMode(params: {
  loading: boolean;
  error: string | null;
  scopeAccess: "granted" | "auth_required";
  itemsCount: number;
  loadedStateKey: string;
  currentStateKey: string;
}): FeedViewMode {
  if (params.error) return "error";
  if (!isCurrentFeedStateLoaded({ loadedStateKey: params.loadedStateKey, currentStateKey: params.currentStateKey })) {
    return "refreshing";
  }
  if (params.loading && params.itemsCount === 0) return "loading";
  if (params.loading) return "refreshing";
  if (params.scopeAccess !== "granted") return "ready";
  if (params.itemsCount === 0) return "empty";
  return "ready";
}
