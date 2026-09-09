import assert from "node:assert/strict";
import test from "node:test";

import { shouldIncludePlatformNewsForScope } from "@/lib/public-feed-service";
import {
  buildFeedApiRequestQuery,
  buildFeedStateKey,
  doesFeedPostMatchState,
  isCurrentFeedStateLoaded,
  normalizeLockedAuthorFeedQueryState,
  resolveFeedPrimaryView,
  resolveFeedViewMode,
  shouldAcceptFeedResponse
} from "@/lib/feed-client-state";
import type { FeedQueryState } from "@/lib/feed-query-state";

const baseState: FeedQueryState = {
  view: null,
  scope: "all",
  type: "all",
  search: "",
  collaborationFilter: "all",
  collaborationIntent: null,
  collaborationRole: null,
  collaborationWorkflow: null,
  collaborationPreference: null,
  collaborationCity: null,
  collaborationStatus: null,
  sort: "newest",
  profileType: null
};

test("feed client state serializes collaboration filters for runtime api requests", () => {
  assert.equal(
    buildFeedApiRequestQuery({
      ...baseState,
      view: "collaborations",
      collaborationFilter: "only",
      collaborationIntent: "find_producer",
      collaborationRole: "producer",
      collaborationWorkflow: "seeking",
      collaborationPreference: "local",
      collaborationCity: "Москва",
      collaborationStatus: "open",
      sort: "responses_desc",
      search: " trap "
    }),
    "view=collaborations&scope=all&type=posts&search=trap&collab=only&intent=find_producer&role=producer&workflow=seeking&format=local&city=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0&status=open&sort=responses_desc"
  );

  assert.equal(
    buildFeedApiRequestQuery({
      ...baseState,
      view: "people",
      collaborationRole: "producer",
      profileType: "artist",
      search: "lead"
    }),
    "view=people&scope=all&type=all&search=lead&profileType=artist"
  );
});

test("feed client state uses cursor only for append requests and resets it on filter change", () => {
  const filtered = {
    ...baseState,
    collaborationFilter: "only" as const,
    collaborationIntent: "find_producer" as const,
    collaborationWorkflow: "seeking" as const
  };

  assert.equal(
    buildFeedApiRequestQuery(filtered, "cursor-1"),
    "scope=all&type=all&collab=only&intent=find_producer&workflow=seeking&cursor=cursor-1"
  );
  assert.equal(
    buildFeedStateKey(filtered),
    "scope=all&type=all&collab=only&intent=find_producer&workflow=seeking"
  );
});

test("feed client state preserves a locked author during runtime reload and pagination", () => {
  assert.equal(
    buildFeedApiRequestQuery(baseState, "cursor-2", "artist-slug"),
    "scope=all&type=all&author=artist-slug&cursor=cursor-2"
  );
});

test("feed client state infers primary view from legacy release filters", () => {
  assert.equal(resolveFeedPrimaryView({ ...baseState, type: "releases" }), "releases");
  assert.equal(resolveFeedPrimaryView({ ...baseState, view: "people" }), "people");
  assert.equal(resolveFeedPrimaryView(baseState), "collaborations");
});

test("feed client state canonicalizes locked author queries to all scope", () => {
  assert.deepEqual(
    normalizeLockedAuthorFeedQueryState({
      ...baseState,
      scope: "following"
    }, "artist-slug"),
    baseState
  );
  assert.deepEqual(
    normalizeLockedAuthorFeedQueryState({
      ...baseState,
      scope: "following"
    }, null),
    {
      ...baseState,
      scope: "following"
    }
  );
});

test("feed client state marks unfiltered payload as stale after switching to collaboration only", () => {
  const initialKey = buildFeedStateKey(baseState);
  const nextKey = buildFeedStateKey({
    ...baseState,
    collaborationFilter: "only",
    collaborationIntent: "find_producer",
    collaborationWorkflow: "seeking"
  });

  assert.equal(isCurrentFeedStateLoaded({ loadedStateKey: initialKey, currentStateKey: nextKey }), false);
  assert.equal(resolveFeedViewMode({
    loading: false,
    error: null,
    scopeAccess: "granted",
    itemsCount: 0,
    loadedStateKey: initialKey,
    currentStateKey: nextKey
  }), "refreshing");
});

test("feed client state rejects stale request responses", () => {
  assert.equal(shouldAcceptFeedResponse({ requestId: 4, activeRequestId: 5, aborted: false }), false);
  assert.equal(shouldAcceptFeedResponse({ requestId: 5, activeRequestId: 5, aborted: true }), false);
  assert.equal(shouldAcceptFeedResponse({ requestId: 5, activeRequestId: 5, aborted: false }), true);
});

test("feed client state distinguishes loading, empty and refreshing states", () => {
  const stateKey = buildFeedStateKey(baseState);

  assert.equal(resolveFeedViewMode({
    loading: true,
    error: null,
    scopeAccess: "granted",
    itemsCount: 0,
    loadedStateKey: stateKey,
    currentStateKey: stateKey
  }), "loading");

  assert.equal(resolveFeedViewMode({
    loading: false,
    error: null,
    scopeAccess: "granted",
    itemsCount: 0,
    loadedStateKey: stateKey,
    currentStateKey: stateKey
  }), "empty");

  assert.equal(resolveFeedViewMode({
    loading: true,
    error: null,
    scopeAccess: "granted",
    itemsCount: 3,
    loadedStateKey: stateKey,
    currentStateKey: stateKey
  }), "refreshing");
});

test("collaboration-only feed never mixes platform news back into all scope", () => {
  assert.equal(shouldIncludePlatformNewsForScope("all", "all", "only"), false);
});

test("feed client state only keeps collaboration posts inside collaboration view", () => {
  assert.equal(
    doesFeedPostMatchState({
      postType: "standard",
      collaboration: null
    }, {
      ...baseState,
      view: "collaborations",
      type: "posts",
      collaborationFilter: "only"
    }),
    false
  );

  assert.equal(
    doesFeedPostMatchState({
      postType: "collaboration",
      collaboration: {
        intent: "find_producer",
        role: "artist",
        workflow: "seeking"
      } as never
    }, {
      ...baseState,
      view: "collaborations",
      type: "posts",
      collaborationFilter: "only"
    }),
    true
  );

  assert.equal(
    doesFeedPostMatchState({
      postType: "collaboration",
      collaboration: {
        intent: "find_producer",
        role: "artist",
        workflow: "seeking"
      } as never
    }, {
      ...baseState,
      view: "collaborations",
      type: "posts",
      collaborationFilter: "only",
      collaborationIntent: "find_artist"
    }),
    false
  );

  assert.equal(
    doesFeedPostMatchState({
      postType: "collaboration",
      collaboration: {
        intent: "find_producer",
        role: "artist",
        workflow: "offering"
      } as never
    }, {
      ...baseState,
      view: "collaborations",
      type: "posts",
      collaborationFilter: "only",
      collaborationWorkflow: "seeking"
    }),
    false
  );

  assert.equal(
    doesFeedPostMatchState({
      postType: "collaboration",
      collaboration: {
        intent: "find_producer",
        role: "artist",
        workflow: "seeking",
        preference: "local",
        city: "Москва",
        status: "open"
      } as never
    }, {
      ...baseState,
      view: "collaborations",
      type: "posts",
      collaborationFilter: "only",
      collaborationPreference: "local",
      collaborationCity: "москва"
    }),
    true
  );

  assert.equal(
    doesFeedPostMatchState({
      postType: "collaboration",
      collaboration: {
        intent: "find_producer",
        role: "artist",
        workflow: "seeking",
        preference: "local",
        city: "Санкт-Петербург",
        status: "open"
      } as never
    }, {
      ...baseState,
      view: "collaborations",
      type: "posts",
      collaborationFilter: "only",
      collaborationPreference: "local",
      collaborationCity: "Москва"
    }),
    false
  );
});
