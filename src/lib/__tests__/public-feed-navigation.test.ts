import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildPublicFeedAuthorHref,
  buildPublicFeedItemHref
} from "@/components/feed/public-feed-page";

test("public feed read links stay on public artist and permalink routes", () => {
  assert.equal(buildPublicFeedAuthorHref("neon valley/.live"), "/artists/neon%20valley%2F.live");
  assert.equal(buildPublicFeedAuthorHref(null), null);
  assert.equal(buildPublicFeedItemHref("/feed/post_123"), "/feed/post_123");
});

test("public feed detail renders for authenticated sessions instead of redirecting to dashboard", () => {
  const routePath = fileURLToPath(new URL("../../app/feed/[id]/page.tsx", import.meta.url));
  const routeSource = readFileSync(routePath, "utf8");

  assert.doesNotMatch(routeSource, /\bredirect\s*\(/u);
  assert.match(routeSource, /<FeedDetailPage\b/u);
  assert.match(routeSource, /viewerAuthenticated=\{Boolean\(session\?\.user\?\.id\)\}/u);
});

test("community feed keeps explicit scroll preservation logic for in-place query-state changes", () => {
  const componentPath = fileURLToPath(new URL("../../components/feed/public-feed-page.tsx", import.meta.url));
  const source = readFileSync(componentPath, "utf8");

  assert.match(source, /pendingScrollRestoreRef/u);
  assert.match(source, /scrollY:\s*window\.scrollY/u);
  assert.match(source, /restorePendingScroll\(nextStateKey\)/u);
});

test("community feed memoizes initial query state to avoid infinite reload loops", () => {
  const componentPath = fileURLToPath(new URL("../../components/feed/public-feed-page.tsx", import.meta.url));
  const source = readFileSync(componentPath, "utf8");

  assert.match(source, /const initialQueryState = React\.useMemo\(/u);
});

test("community feed performs an initial live load instead of staying on stale server payload", () => {
  const componentPath = fileURLToPath(new URL("../../components/feed/public-feed-page.tsx", import.meta.url));
  const source = readFileSync(componentPath, "utf8");

  assert.match(source, /if \(!didMountRef\.current\) \{/u);
  assert.match(source, /if \(detailMode \|\| disableLiveLoading\) return;/u);
  assert.match(source, /void load\(\{ state: initialQueryState \}\);/u);
});
