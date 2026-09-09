import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAuthRouteHref,
  buildFeedAuthCallbackUrl,
  getFeedAuthPromptCopy,
  parseFeedAuthContext,
  sanitizeInternalCallbackUrl,
  serializeFeedAuthContext,
  type FeedAuthContext
} from "@/lib/feed-auth-prompt";

const baseContext: FeedAuthContext = {
  reason: "comment",
  intendedAction: "comment",
  callbackUrl: "/feed?scope=all&type=releases#feed-item-release_1",
  path: "/feed?scope=all&type=releases",
  scrollY: 480,
  scope: "all",
  type: "releases",
  collaborationFilter: "only",
  collaborationIntent: "find_producer",
  collaborationRole: "producer",
  collaborationWorkflow: "seeking",
  collaborationPreference: "remote",
  collaborationCity: null,
  collaborationStatus: "open",
  sort: "responses_desc",
  profileType: null,
  search: "blue echo",
  targetId: "release_1",
  targetSlug: "ckeabrona",
  anchorId: "feed-item-release_1",
  focusTargetId: "comment-input-release_1",
  drafts: {
    release_1: "demo draft"
  },
  at: 1_234_567
};

test("feed auth prompt copy returns contextual titles", () => {
  assert.equal(getFeedAuthPromptCopy("following_tab").title, "Войдите, чтобы открыть ленту подписок");
  assert.equal(getFeedAuthPromptCopy("follow").title, "Войдите, чтобы подписаться");
  assert.equal(getFeedAuthPromptCopy("reaction").title, "Войдите, чтобы оставить реакцию");
  assert.equal(getFeedAuthPromptCopy("comment").title, "Войдите, чтобы написать комментарий");
  assert.equal(getFeedAuthPromptCopy("reply").title, "Войдите, чтобы ответить");
  assert.equal(getFeedAuthPromptCopy("publish").title, "Войдите, чтобы создать публикацию");
  assert.equal(getFeedAuthPromptCopy("contact").title, "Войдите, чтобы связаться");
  assert.equal(getFeedAuthPromptCopy("contact").description, "Публичная лента открыта для чтения");
});

test("feed auth prompt sanitizes callback urls and rejects external targets", () => {
  assert.equal(sanitizeInternalCallbackUrl("/feed?scope=all#feed-item-post_1"), "/feed?scope=all#feed-item-post_1");
  assert.equal(sanitizeInternalCallbackUrl("https://evil.example/feed"), "/feed");
  assert.equal(sanitizeInternalCallbackUrl("//evil.example/feed"), "/feed");
  assert.equal(sanitizeInternalCallbackUrl("javascript:alert(1)"), "/feed");
  assert.equal(buildAuthRouteHref("/login", "https://evil.example/feed"), "/login?callbackUrl=%2Ffeed");
});

test("feed auth prompt builds callback urls with stable anchors", () => {
  assert.equal(buildFeedAuthCallbackUrl("/feed?scope=all", "feed-item-post_42"), "/feed?scope=all#feed-item-post_42");
  assert.equal(buildFeedAuthCallbackUrl("/feed?scope=all#feed-item-post_42", "ignored"), "/feed?scope=all#feed-item-post_42");
});

test("feed auth prompt serializes and restores context for post-login recovery", () => {
  const raw = serializeFeedAuthContext(baseContext);
  const parsed = parseFeedAuthContext(raw);

  assert.deepEqual(parsed, {
    ...baseContext,
    drafts: {
      release_1: "demo draft"
    }
  });
});

test("feed auth prompt parser falls back safely on invalid payloads", () => {
  assert.equal(parseFeedAuthContext(null), null);
  assert.equal(parseFeedAuthContext("not-json"), null);

  const parsed = parseFeedAuthContext(JSON.stringify({
    ...baseContext,
    callbackUrl: "https://evil.example/feed",
    path: "https://evil.example/feed"
  }));

  assert.equal(parsed?.callbackUrl, "/feed");
  assert.equal(parsed?.path, "/feed");
});
