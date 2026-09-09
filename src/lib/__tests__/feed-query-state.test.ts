import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeedQueryString,
  createDashboardCommunityDefaultFeedQueryState,
  normalizeFeedQueryState,
  parseFeedQueryParams,
  resolveDashboardCommunityFeedQueryState
} from "@/lib/feed-query-state";

test("feed query parsing restores collaboration filters from url params", () => {
  const parsed = parseFeedQueryParams(new URLSearchParams("view=releases&scope=following&type=releases&collab=only&intent=find_producer&role=producer&search= trap "));

  assert.deepEqual(parsed, {
    view: "releases",
    scope: "following",
    type: "releases",
    search: "trap",
    collaborationFilter: "only",
    collaborationIntent: "find_producer",
    collaborationRole: "producer",
    collaborationWorkflow: null,
    collaborationPreference: null,
    collaborationCity: null,
    collaborationStatus: null,
    sort: "newest",
    profileType: null
  });
});

test("feed query parsing drops invalid collaboration params", () => {
  const parsed = parseFeedQueryParams(new URLSearchParams("view=broken&scope=nope&type=invalid&collab=bad&intent=wrong&role=fake"));

  assert.deepEqual(parsed, {
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
  });
});

test("dashboard community defaults to collaboration-first when url is empty", () => {
  assert.deepEqual(createDashboardCommunityDefaultFeedQueryState(), {
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
  });
  assert.deepEqual(resolveDashboardCommunityFeedQueryState(new URLSearchParams("")), createDashboardCommunityDefaultFeedQueryState());
});

test("dashboard community maps legacy links into collab-first views", () => {
  assert.deepEqual(resolveDashboardCommunityFeedQueryState(new URLSearchParams("type=news&scope=following")), {
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
  });

  assert.deepEqual(resolveDashboardCommunityFeedQueryState(new URLSearchParams("type=releases&search=night")), {
    view: "releases",
    scope: "all",
    type: "releases",
    search: "night",
    collaborationFilter: "all",
    collaborationIntent: null,
    collaborationRole: null,
    collaborationWorkflow: null,
    collaborationPreference: null,
    collaborationCity: null,
    collaborationStatus: null,
    sort: "newest",
    profileType: null
  });

  assert.deepEqual(resolveDashboardCommunityFeedQueryState(new URLSearchParams("profileType=producer&role=vocalist")), {
    view: "people",
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
    profileType: "producer"
  });
});

test("feed query serializer omits default values and keeps active filters", () => {
  assert.equal(buildFeedQueryString({
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
  }), "");

  assert.equal(buildFeedQueryString({
    view: "collaborations",
    scope: "following",
    type: "posts",
    search: "melodic trap",
    collaborationFilter: "only",
    collaborationIntent: "find_producer",
    collaborationRole: "artist",
    collaborationWorkflow: "seeking",
    collaborationPreference: "remote",
    collaborationCity: null,
    collaborationStatus: "open",
    sort: "responses_desc",
    profileType: null
  }), "view=collaborations&scope=following&intent=find_producer&role=artist&workflow=seeking&format=remote&status=open&sort=responses_desc&search=melodic+trap");

  assert.equal(buildFeedQueryString({
    view: "releases",
    scope: "following",
    type: "releases",
    search: "melodic trap",
    collaborationFilter: "all",
    collaborationIntent: null,
    collaborationRole: null,
    collaborationWorkflow: null,
    collaborationPreference: null,
    collaborationCity: null,
    collaborationStatus: null,
    sort: "newest",
    profileType: null
  }), "view=releases&scope=following&search=melodic+trap");

  assert.equal(buildFeedQueryString({
    view: "people",
    scope: "all",
    type: "all",
    search: "vocal",
    collaborationFilter: "all",
    collaborationIntent: null,
    collaborationRole: null,
    collaborationWorkflow: null,
    collaborationPreference: null,
    collaborationCity: null,
    collaborationStatus: null,
    sort: "newest",
    profileType: "producer"
  }), "view=people&profileType=producer&search=vocal");
});

test("feed query state preserves local city only for local collaboration format", () => {
  const parsed = parseFeedQueryParams(new URLSearchParams("view=collaborations&format=local&city=%20%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0%20%20"));

  assert.equal(parsed.collaborationPreference, "local");
  assert.equal(parsed.collaborationCity, "Москва");
  assert.equal(buildFeedQueryString(parsed), "view=collaborations&format=local&city=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0");
  assert.deepEqual(normalizeFeedQueryState({
    ...parsed,
    collaborationPreference: "remote"
  }).collaborationCity, null);
});
