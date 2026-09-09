import type { FeedCollaborationFilter, FeedPersonProfileType, FeedPrimaryView, FeedScope, FeedType } from "@/lib/feed-contract";
import {
  COLLABORATION_INTENTS,
  COLLABORATION_PREFERENCES,
  COLLABORATION_ROLES,
  COLLABORATION_STATUSES,
  COLLABORATION_WORKFLOWS,
  type CollaborationIntent,
  type CollaborationPreference,
  type CollaborationRole,
  type CollaborationStatus,
  type CollaborationWorkflow
} from "@/lib/collaboration";

export type FeedSort = "newest" | "oldest" | "responses_desc" | "responses_asc";

export type FeedQueryState = {
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
};

type FeedQueryInput = URLSearchParams | {
  view?: string | null;
  scope?: string | null;
  type?: string | null;
  search?: string | null;
  collab?: string | null;
  intent?: string | null;
  role?: string | null;
  workflow?: string | null;
  format?: string | null;
  city?: string | null;
  status?: string | null;
  sort?: string | null;
  profileType?: string | null;
};

function getQueryValue(input: FeedQueryInput, key: string) {
  return input instanceof URLSearchParams ? input.get(key) : input[key as keyof typeof input] ?? null;
}

export function readFeedPrimaryView(value?: string | null): FeedPrimaryView | null {
  return value === "collaborations" || value === "people" || value === "releases" ? value : null;
}

export function readFeedScope(value?: string | null): FeedScope {
  return value === "following" ? "following" : "all";
}

export function readFeedType(value?: string | null): FeedType {
  return value === "posts" || value === "releases" || value === "news" || value === "video" || value === "media" ? value : "all";
}

export function readFeedCollaborationFilter(value?: string | null): FeedCollaborationFilter {
  return value === "only" ? "only" : "all";
}

export function readFeedCollaborationIntent(value?: string | null): CollaborationIntent | null {
  return value && (COLLABORATION_INTENTS as readonly string[]).includes(value) ? value as CollaborationIntent : null;
}

export function readFeedCollaborationRole(value?: string | null): CollaborationRole | null {
  return value && (COLLABORATION_ROLES as readonly string[]).includes(value) ? value as CollaborationRole : null;
}

export function readFeedCollaborationWorkflow(value?: string | null): CollaborationWorkflow | null {
  return value && (COLLABORATION_WORKFLOWS as readonly string[]).includes(value) ? value as CollaborationWorkflow : null;
}

export function readFeedCollaborationPreference(value?: string | null): CollaborationPreference | null {
  return value && (COLLABORATION_PREFERENCES as readonly string[]).includes(value) ? value as CollaborationPreference : null;
}

export function readFeedCollaborationStatus(value?: string | null): CollaborationStatus | null {
  return value && (COLLABORATION_STATUSES as readonly string[]).includes(value) ? value as CollaborationStatus : null;
}

export function readFeedCollaborationCity(value?: string | null): string | null {
  const city = (value ?? "").trim().replace(/\s+/gu, " ").slice(0, 80);
  return city || null;
}

export function readFeedSort(value?: string | null): FeedSort {
  return value === "oldest" || value === "responses_desc" || value === "responses_asc" ? value : "newest";
}

export function readFeedProfileType(value?: string | null): FeedPersonProfileType | null {
  return value === "artist" || value === "producer" || value === "group" || value === "label" ? value : null;
}

export function resolveFeedPrimaryView(state: Pick<FeedQueryState, "view" | "type">): FeedPrimaryView {
  if (state.view === "people") return "people";
  if (state.view === "releases" || state.type === "releases") return "releases";
  return "collaborations";
}

export function createFeedQueryStateForPrimaryView(view: FeedPrimaryView, state: FeedQueryState): FeedQueryState {
  if (view === "releases") {
    return {
      ...state,
      view,
      type: "releases",
      collaborationFilter: "all",
      collaborationIntent: null,
      collaborationRole: null,
      collaborationWorkflow: null,
      collaborationPreference: null,
      collaborationCity: null,
      collaborationStatus: null,
      sort: "newest"
    };
  }
  if (view === "collaborations") {
    return {
      ...state,
      view,
      type: "posts",
      collaborationFilter: "only",
      sort: state.sort,
      collaborationWorkflow: state.collaborationWorkflow,
      profileType: null
    };
  }
  if (view === "people") {
    return {
      ...state,
      view,
      scope: "all",
      type: "all",
      collaborationFilter: "all",
      collaborationIntent: null,
      collaborationRole: null,
      collaborationWorkflow: null,
      collaborationPreference: null,
      collaborationCity: null,
      collaborationStatus: null,
      sort: "newest"
    };
  }
  return { ...state, view, profileType: null };
}

export function normalizeFeedQueryState(state: FeedQueryState): FeedQueryState {
  const base = state.view ? createFeedQueryStateForPrimaryView(state.view, state) : state;
  const collaborationCity = base.collaborationPreference === "local" ? readFeedCollaborationCity(base.collaborationCity) : null;
  return { ...base, collaborationCity };
}

export function hasExplicitFeedQueryParams(input: FeedQueryInput): boolean {
  return ["view", "scope", "type", "search", "collab", "intent", "role", "workflow", "format", "city", "status", "sort", "profileType"].some((key) => {
    const value = getQueryValue(input, key);
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function createDashboardCommunityDefaultFeedQueryState(): FeedQueryState {
  return {
    view: "collaborations",
    scope: "all",
    type: "posts",
    search: "",
    collaborationFilter: "only",
    collaborationIntent: null,
    collaborationRole: null,
    collaborationWorkflow: null,
    collaborationPreference: null,
    collaborationCity: null,
    collaborationStatus: null,
    sort: "newest",
    profileType: null
  };
}

export function resolveDashboardCommunityFeedQueryState(input: FeedQueryInput): FeedQueryState {
  if (!hasExplicitFeedQueryParams(input)) return createDashboardCommunityDefaultFeedQueryState();
  const parsed = parseFeedQueryParams(input);
  if (parsed.view) return normalizeFeedQueryState(parsed);
  if (parsed.profileType) {
    return normalizeFeedQueryState({
      ...parsed,
      view: "people"
    });
  }
  if (parsed.type === "releases") {
    return normalizeFeedQueryState({
      ...parsed,
      view: "releases"
    });
  }
  return normalizeFeedQueryState({
    ...createDashboardCommunityDefaultFeedQueryState(),
    search: parsed.search,
    collaborationIntent: parsed.collaborationIntent,
    collaborationRole: parsed.collaborationRole,
    collaborationWorkflow: parsed.collaborationWorkflow,
    collaborationPreference: parsed.collaborationPreference,
    collaborationCity: parsed.collaborationCity,
    collaborationStatus: parsed.collaborationStatus,
    sort: parsed.sort
  });
}

export function parseFeedQueryParams(input: FeedQueryInput): FeedQueryState {
  return {
    view: readFeedPrimaryView(getQueryValue(input, "view")),
    scope: readFeedScope(getQueryValue(input, "scope")),
    type: readFeedType(getQueryValue(input, "type")),
    search: (getQueryValue(input, "search") ?? "").trim(),
    collaborationFilter: readFeedCollaborationFilter(getQueryValue(input, "collab")),
    collaborationIntent: readFeedCollaborationIntent(getQueryValue(input, "intent")),
    collaborationRole: readFeedCollaborationRole(getQueryValue(input, "role")),
    collaborationWorkflow: readFeedCollaborationWorkflow(getQueryValue(input, "workflow")),
    collaborationPreference: readFeedCollaborationPreference(getQueryValue(input, "format")),
    collaborationCity: readFeedCollaborationCity(getQueryValue(input, "city")),
    collaborationStatus: readFeedCollaborationStatus(getQueryValue(input, "status")),
    sort: readFeedSort(getQueryValue(input, "sort")),
    profileType: readFeedProfileType(getQueryValue(input, "profileType"))
  };
}

export function buildFeedQueryString(state: FeedQueryState): string {
  const normalized = normalizeFeedQueryState(state);
  const query = new URLSearchParams();
  if (normalized.view) query.set("view", normalized.view);
  if (normalized.scope !== "all") query.set("scope", normalized.scope);
  const typeImpliedByView = normalized.view === "collaborations"
    ? normalized.type === "posts"
    : normalized.view === "releases"
      ? normalized.type === "releases"
      : false;
  if (!typeImpliedByView && normalized.type !== "all") query.set("type", normalized.type);
  const collabImpliedByView = normalized.view === "collaborations" && normalized.collaborationFilter === "only";
  if (!collabImpliedByView && normalized.collaborationFilter !== "all") query.set("collab", normalized.collaborationFilter);
  if (normalized.collaborationIntent) query.set("intent", normalized.collaborationIntent);
  if (normalized.collaborationRole) query.set("role", normalized.collaborationRole);
  if (normalized.collaborationWorkflow) query.set("workflow", normalized.collaborationWorkflow);
  if (normalized.collaborationPreference) query.set("format", normalized.collaborationPreference);
  if (normalized.collaborationCity) query.set("city", normalized.collaborationCity);
  if (normalized.collaborationStatus) query.set("status", normalized.collaborationStatus);
  if (normalized.sort !== "newest") query.set("sort", normalized.sort);
  if (normalized.profileType) query.set("profileType", normalized.profileType);
  if (normalized.search.trim()) query.set("search", normalized.search.trim());
  return query.toString();
}
