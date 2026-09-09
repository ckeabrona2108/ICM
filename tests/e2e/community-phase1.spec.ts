import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "./fixtures/community";

type FeedComment = {
  id: string;
  parentId: string | null;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  ownedByViewer: boolean;
  replies: FeedComment[];
};

type FeedItem = {
  id: string;
  sourceId: string;
  kind: "post" | "release" | "news";
  permalink: string;
  content?: string;
  audience?: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
  likesCount: number;
  commentsCount: number;
  likedByViewer: boolean;
  viewerReaction: string | null;
  comments?: FeedComment[];
  author: {
    id: string;
    slug: string | null;
  };
};

type FeedPayload = {
  items: FeedItem[];
};

type NotificationItem = {
  id: string;
  kind: string;
  href: string;
  isUnread: boolean;
};

type NotificationPayload = {
  unreadCount: number;
  items: NotificationItem[];
};

type ArtistSocialPayload = {
  posts: Array<{ id: string; content: string }>;
};

type SearchPayload = {
  publications: FeedItem[];
};

type CreatedPost = {
  id: string;
  content: string;
};

type CreatedComment = {
  id: string;
  parentId: string | null;
  content: string;
};

const POST_CONTENT = "Phase 1 deterministic A/B/C social loop post";
const EDITED_POST_CONTENT = "Phase 1 deterministic A/B/C social loop post — edited";
const COMMENT_CONTENT = "Phase 1 deterministic comment from B";
const EDITED_COMMENT_CONTENT = "Phase 1 deterministic comment from B — edited";
const REPLY_CONTENT = "Phase 1 deterministic reply from A";

const IDEMPOTENCY = {
  primaryPost: "10000000-0000-4000-8000-000000000001",
  primaryComment: "10000000-0000-4000-8000-000000000002",
  primaryReply: "10000000-0000-4000-8000-000000000003",
  lostPost: "10000000-0000-4000-8000-000000000004",
  lostComment: "10000000-0000-4000-8000-000000000005",
  privatePost: "10000000-0000-4000-8000-000000000006",
  followersPost: "10000000-0000-4000-8000-000000000007",
  deletePost: "10000000-0000-4000-8000-000000000008",
  deleteComment: "10000000-0000-4000-8000-000000000009"
} as const;

function idempotencyHeaders(key: string) {
  return { "Idempotency-Key": key };
}

function canonicalPostId(postId: string) {
  return `post_${postId}`;
}

function canonicalPostHref(postId: string, anchorId?: string) {
  return `/feed/${canonicalPostId(postId)}${anchorId ? `#comment-${anchorId}` : ""}`;
}

function flattenComments(comments: FeedComment[]): FeedComment[] {
  return comments.flatMap((comment) => [comment, ...flattenComments(comment.replies)]);
}

async function readJson<T>(response: { json(): Promise<unknown> }): Promise<T> {
  return await response.json() as T;
}

async function getFeedItem(request: APIRequestContext, postId: string): Promise<FeedItem | null> {
  const response = await request.get(`/api/feed/${canonicalPostId(postId)}`);
  if (response.status() === 404) return null;
  expect(response.status()).toBe(200);
  return (await readJson<{ item: FeedItem }>(response)).item;
}

async function getNotifications(request: APIRequestContext): Promise<NotificationPayload> {
  const response = await request.get("/api/dashboard/notifications");
  expect(response.status()).toBe(200);
  return readJson<NotificationPayload>(response);
}

async function waitForNotification(
  request: APIRequestContext,
  predicate: (item: NotificationItem) => boolean
): Promise<NotificationItem> {
  let match: NotificationItem | undefined;
  await expect.poll(async () => {
    match = (await getNotifications(request)).items.find(predicate);
    return Boolean(match);
  }, { timeout: 20_000 }).toBe(true);
  return match!;
}

async function expectSingleNotification(
  request: APIRequestContext,
  predicate: (item: NotificationItem) => boolean
): Promise<NotificationItem> {
  const match = await waitForNotification(request, predicate);
  expect((await getNotifications(request)).items.filter(predicate)).toHaveLength(1);
  return match;
}

test.describe.serial("Community Phase 1 A/B/C social loop", () => {
  let postId = "";
  let authorSlug = "";
  let commentId = "";
  let replyId = "";

  test("Scenario 1: A creates a public post and B/C see the same persisted permalink", async ({ userA, userB, userC }) => {
    const invalid = await userA.context.request.post("/api/user/artist-profile/posts", {
      data: { content: "", audience: "PUBLIC" },
      headers: idempotencyHeaders("10000000-0000-4000-8000-000000000000")
    });
    expect(invalid.status()).toBe(400);

    const createdResponse = await userA.context.request.post("/api/user/artist-profile/posts", {
      data: { content: POST_CONTENT, audience: "PUBLIC" },
      headers: idempotencyHeaders(IDEMPOTENCY.primaryPost)
    });
    expect(createdResponse.status()).toBe(201);
    const created = await readJson<CreatedPost>(createdResponse);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(created.content).toContain(POST_CONTENT);
    postId = created.id;

    for (const actor of [userA, userB, userC]) {
      const item = await getFeedItem(actor.context.request, postId);
      expect(item?.sourceId).toBe(postId);
      expect(item?.content).toBe(POST_CONTENT);
      expect(item?.permalink).toBe(canonicalPostHref(postId));
    }
    await Promise.all([userB.page.goto(canonicalPostHref(postId)), userC.page.goto(canonicalPostHref(postId))]);
    await Promise.all([
      expect(userB.page.getByText(POST_CONTENT, { exact: true })).toBeVisible(),
      expect(userC.page.getByText(POST_CONTENT, { exact: true })).toBeVisible()
    ]);
    authorSlug = (await getFeedItem(userB.context.request, postId))?.author.slug ?? "";
    expect(authorSlug).toBeTruthy();
  });

  test("Scenario 2: B reacts, A receives one exact notification, C sees count without viewer state", async ({ userA, userB, userC }) => {
    const response = await userB.context.request.post(`/api/artists/posts/${postId}/like`, {
      data: { reaction: "heart" }
    });
    expect(response.status()).toBe(200);
    const result = await readJson<{ liked: boolean; likes: number; viewerReaction: string | null }>(response);
    expect(result).toMatchObject({ liked: true, likes: 1, viewerReaction: "heart" });

    const notification = await expectSingleNotification(
      userA.context.request,
      (item) => item.kind === "artist_post_liked" && item.href === canonicalPostHref(postId)
    );
    expect(notification.isUnread).toBe(true);
    await userA.page.goto(notification.href);
    await expect(userA.page.getByText(POST_CONTENT, { exact: true })).toBeVisible();

    const [asB, asC] = await Promise.all([
      getFeedItem(userB.context.request, postId),
      getFeedItem(userC.context.request, postId)
    ]);
    expect(asB).toMatchObject({ likesCount: 1, likedByViewer: true, viewerReaction: "heart" });
    expect(asC).toMatchObject({ likesCount: 1, likedByViewer: false, viewerReaction: null });
  });

  test("Scenario 3: B comments, A notification opens the exact visible comment and read ownership holds", async ({ userA, userB }) => {
    const response = await userB.context.request.post(`/api/artists/posts/${postId}/comments`, {
      data: { content: COMMENT_CONTENT },
      headers: idempotencyHeaders(IDEMPOTENCY.primaryComment)
    });
    expect(response.status()).toBe(201);
    const comment = await readJson<CreatedComment>(response);
    expect(comment.content).toBe(COMMENT_CONTENT);
    commentId = comment.id;

    const expectedHref = canonicalPostHref(postId, commentId);
    const notification = await expectSingleNotification(
      userA.context.request,
      (item) => item.kind === "artist_post_commented" && item.href === expectedHref
    );
    expect(notification.isUnread).toBe(true);

    const foreignRead = await userB.context.request.patch(`/api/dashboard/notifications/${notification.id}`);
    expect(foreignRead.status()).toBe(200);
    expect(await readJson<{ updated: boolean }>(foreignRead)).toEqual({ ok: true, updated: false });

    await userA.page.goto(notification.href);
    await expect(userA.page).toHaveURL(new RegExp(`#comment-${commentId}$`, "u"));
    await expect(userA.page.locator(`#comment-${commentId}`)).toContainText(COMMENT_CONTENT);

    const ownerRead = await userA.context.request.patch(`/api/dashboard/notifications/${notification.id}`);
    expect(ownerRead.status()).toBe(200);
    expect(await readJson<{ ok: boolean; updated: boolean }>(ownerRead)).toEqual({ ok: true, updated: true });
  });

  test("Scenario 4: A replies and B receives an exact reply destination", async ({ userA, userB }) => {
    const response = await userA.context.request.post(`/api/artists/posts/${postId}/comments`, {
      data: { content: REPLY_CONTENT, parentId: commentId },
      headers: idempotencyHeaders(IDEMPOTENCY.primaryReply)
    });
    expect(response.status()).toBe(201);
    const reply = await readJson<CreatedComment>(response);
    expect(reply.parentId).toBe(commentId);
    replyId = reply.id;

    const expectedHref = canonicalPostHref(postId, replyId);
    const notification = await expectSingleNotification(
      userB.context.request,
      (item) => item.kind === "artist_post_commented" && item.href === expectedHref
    );
    expect(notification.isUnread).toBe(true);
    await userB.page.goto(notification.href);
    await expect(userB.page.locator(`#comment-${replyId}`)).toContainText(REPLY_CONTENT);
  });

  test("Scenario 5: A reacts to B's comment and B receives one exact comment-reaction notification", async ({ userA, userB }) => {
    const response = await userA.context.request.post(
      `/api/artists/posts/${postId}/comments/${commentId}/like`,
      { data: { reaction: "fire" } }
    );
    expect(response.status()).toBe(200);
    expect(await readJson<{ liked: boolean; viewerReaction: string | null }>(response)).toMatchObject({
      liked: true,
      viewerReaction: "fire"
    });

    const notification = await expectSingleNotification(
      userB.context.request,
      (item) => item.kind === "artist_post_comment_reacted" && item.href === canonicalPostHref(postId, commentId)
    );
    expect(notification.isUnread).toBe(true);
    await userB.page.goto(notification.href);
    await expect(userB.page.locator(`#comment-${commentId}`)).toContainText(COMMENT_CONTENT);
  });

  test("Scenario 6: B follows A, A is notified and B's Following feed contains A content", async ({ userA, userB }) => {
    const response = await userB.context.request.post(`/api/artists/${encodeURIComponent(authorSlug)}/follow`);
    expect(response.status()).toBe(200);
    expect(await readJson<{ following: boolean }>(response)).toMatchObject({ following: true });

    const notification = await waitForNotification(
      userA.context.request,
      (item) => item.kind === "artist_profile_followed" && item.href === `/artists/${encodeURIComponent(authorSlug)}`
    );
    expect(notification.isUnread).toBe(true);

    const followingResponse = await userB.context.request.get("/api/feed?scope=following&type=posts&limit=50");
    expect(followingResponse.status()).toBe(200);
    const following = await readJson<FeedPayload>(followingResponse);
    expect(following.items.some((item) => item.sourceId === postId)).toBe(true);
  });

  test("Scenario 7: B unfollows A and Following feed removes A content", async ({ userB }) => {
    const response = await userB.context.request.post(`/api/artists/${encodeURIComponent(authorSlug)}/follow`);
    expect(response.status()).toBe(200);
    expect(await readJson<{ following: boolean }>(response)).toMatchObject({ following: false });

    const followingResponse = await userB.context.request.get("/api/feed?scope=following&type=posts&limit=50");
    expect(followingResponse.status()).toBe(200);
    const following = await readJson<FeedPayload>(followingResponse);
    expect(following.items.some((item) => item.sourceId === postId)).toBe(false);
  });

  test("Scenario 8: only A can edit A's post; failed edits leave the persisted value unchanged", async ({ userA, userB }) => {
    const foreignEdit = await userB.context.request.patch(`/api/user/artist-profile/posts/${postId}`, {
      data: { content: "foreign overwrite", audience: "PUBLIC" }
    });
    expect(foreignEdit.status()).toBe(403);

    const editEndpoint = `/api/user/artist-profile/posts/${postId}`;
    await userA.page.goto(canonicalPostHref(postId));
    await userA.page.route(`**${editEndpoint}`, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced E2E edit failure" })
      });
    });
    try {
      await userA.page.evaluate(() => {
        window.prompt = () => "optimistic value that must roll back";
      });
      await userA.page.getByRole("button", { name: "Изменить публикацию" }).click();
      await expect(userA.page.getByText("forced E2E edit failure", { exact: true })).toBeVisible();
      await expect(userA.page.getByText(POST_CONTENT, { exact: true })).toBeVisible();
      await expect(userA.page.getByText("optimistic value that must roll back", { exact: true })).toHaveCount(0);
    } finally {
      await userA.page.unroute(`**${editEndpoint}`);
    }

    const edit = await userA.context.request.patch(editEndpoint, {
      data: { content: EDITED_POST_CONTENT, audience: "PUBLIC" }
    });
    expect(edit.status()).toBe(200);
    expect(await readJson<{ id: string; content: string; editedAt: string | null }>(edit)).toMatchObject({
      id: postId,
      content: EDITED_POST_CONTENT
    });

    const rejected = await userA.context.request.patch(`/api/user/artist-profile/posts/${postId}`, {
      data: { content: "", audience: "PUBLIC" }
    });
    expect(rejected.status()).toBe(400);
    expect((await getFeedItem(userB.context.request, postId))?.content).toBe(EDITED_POST_CONTENT);
    await userB.page.goto(canonicalPostHref(postId));
    await userB.page.reload();
    await expect(userB.page.getByText(EDITED_POST_CONTENT, { exact: true })).toBeVisible();
  });

  test("Scenario 9: only B can edit B's comment and A sees the stable edited comment", async ({ userA, userB }) => {
    const path = `/api/artists/posts/${postId}/comments`;
    const foreignEdit = await userA.context.request.patch(path, {
      data: { commentId, content: "foreign comment overwrite" }
    });
    expect(foreignEdit.status()).toBe(403);

    const edit = await userB.context.request.patch(path, { data: { commentId, content: EDITED_COMMENT_CONTENT } });
    expect(edit.status()).toBe(200);
    expect(await readJson<{ id: string; content: string; editedAt: string | null }>(edit)).toMatchObject({
      id: commentId,
      content: EDITED_COMMENT_CONTENT
    });

    const rejected = await userB.context.request.patch(path, { data: { commentId, content: "" } });
    expect(rejected.status()).toBe(400);
    const item = await getFeedItem(userA.context.request, postId);
    const persisted = flattenComments(item?.comments ?? []).find((comment) => comment.id === commentId);
    expect(persisted).toMatchObject({ content: EDITED_COMMENT_CONTENT });
    expect(persisted?.editedAt).toBeTruthy();
    await userA.page.goto(canonicalPostHref(postId, commentId));
    await userA.page.reload();
    await expect(userA.page.locator(`#comment-${commentId}`)).toContainText(EDITED_COMMENT_CONTENT);
  });

  test("Scenario 10: B blocks A and policy is enforced in feed, detail and mutations in both directions", async ({ userA, userB, userC }) => {
    const blockPath = `/api/social/blocks/${userA.userId}`;
    const block = await userB.context.request.post(blockPath);
    expect(block.status()).toBe(200);
    expect(await readJson<{ blocked: boolean }>(block)).toEqual({ blocked: true });
    try {
      const bFeed = await userB.context.request.get("/api/feed?scope=all&limit=50");
      expect(bFeed.status()).toBe(200);
      expect((await readJson<FeedPayload>(bFeed)).items.some((item) => item.sourceId === postId)).toBe(false);
      expect(await getFeedItem(userB.context.request, postId)).toBeNull();
      expect((await userB.context.request.post(`/api/artists/posts/${postId}/like`, { data: { reaction: "fire" } })).status()).toBe(403);
      expect((await userA.context.request.post(`/api/scene/releases/b1000000-0000-4000-8000-000000000012/like`, { data: { reaction: "fire" } })).status()).toBe(403);
      expect((await getFeedItem(userC.context.request, postId))?.sourceId).toBe(postId);
    } finally {
      const unblock = await userB.context.request.delete(blockPath);
      expect(unblock.status()).toBe(200);
      expect(await readJson<{ blocked: boolean }>(unblock)).toEqual({ blocked: false });
    }
  });

  test("Scenario 11: two independent B contexts produce one deterministic reaction state", async ({ userB, userBSecond, userC }) => {
    const current = await getFeedItem(userB.context.request, postId);
    if (current?.likedByViewer) {
      const reset = await userB.context.request.post(`/api/artists/posts/${postId}/like`, { data: { reaction: current.viewerReaction ?? "heart" } });
      expect(reset.status()).toBe(200);
      expect(await readJson<{ liked: boolean }>(reset)).toMatchObject({ liked: false });
    }

    const results = await Promise.all([
      userB.context.request.post(`/api/artists/posts/${postId}/like`, { data: { reaction: "heart" } }),
      userBSecond.context.request.post(`/api/artists/posts/${postId}/like`, { data: { reaction: "heart" } })
    ]);
    expect(results.map((response) => response.status())).toEqual([200, 200]);

    const [asB, asBSecond, asC] = await Promise.all([
      getFeedItem(userB.context.request, postId),
      getFeedItem(userBSecond.context.request, postId),
      getFeedItem(userC.context.request, postId)
    ]);
    expect(asB?.viewerReaction).toBeNull();
    expect(asBSecond?.viewerReaction).toBeNull();
    expect(asB?.likesCount).toBe(asC?.likesCount);
    expect(asBSecond?.likesCount).toBe(asC?.likesCount);
  });

  test("Scenario 12: lost create responses retried with one idempotency key do not duplicate posts or comments", async ({ userA, userB, userC }) => {
    const lostPostContent = "Phase 1 lost-response post";
    let committedPostId = "";
    await userA.page.route("**/api/user/artist-profile/posts", async (route) => {
      const response = await route.fetch();
      committedPostId = (await response.json() as CreatedPost).id;
      await route.abort("failed");
    });
    const firstPostDelivered = await userA.page.evaluate(async ({ content, key }) => {
      try {
        await fetch("/api/user/artist-profile/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({ content, audience: "PUBLIC" })
        });
        return true;
      } catch {
        return false;
      }
    }, { content: lostPostContent, key: IDEMPOTENCY.lostPost });
    expect(firstPostDelivered).toBe(false);
    await userA.page.unroute("**/api/user/artist-profile/posts");
    expect(committedPostId).toBeTruthy();

    const retriedPostResponse = await userA.context.request.post("/api/user/artist-profile/posts", {
      data: { content: lostPostContent, audience: "PUBLIC" },
      headers: idempotencyHeaders(IDEMPOTENCY.lostPost)
    });
    expect(retriedPostResponse.status()).toBe(201);
    const retriedPost = await readJson<CreatedPost>(retriedPostResponse);
    expect(retriedPost.id).toBe(committedPostId);

    const cFeed = await userC.context.request.get("/api/feed?scope=all&type=posts&limit=100");
    expect(cFeed.status()).toBe(200);
    expect((await readJson<FeedPayload>(cFeed)).items.filter((item) => item.content === lostPostContent)).toHaveLength(1);

    const lostCommentContent = "Phase 1 lost-response comment";
    let committedCommentId = "";
    const commentUrl = `/api/artists/posts/${postId}/comments`;
    await userB.page.route(`**${commentUrl}`, async (route) => {
      const response = await route.fetch();
      committedCommentId = (await response.json() as CreatedComment).id;
      await route.abort("failed");
    });
    const firstCommentDelivered = await userB.page.evaluate(async ({ url, content, key }) => {
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({ content })
        });
        return true;
      } catch {
        return false;
      }
    }, { url: commentUrl, content: lostCommentContent, key: IDEMPOTENCY.lostComment });
    expect(firstCommentDelivered).toBe(false);
    await userB.page.unroute(`**${commentUrl}`);
    expect(committedCommentId).toBeTruthy();

    const retriedCommentResponse = await userB.context.request.post(commentUrl, {
      data: { content: lostCommentContent },
      headers: idempotencyHeaders(IDEMPOTENCY.lostComment)
    });
    expect(retriedCommentResponse.status()).toBe(201);
    const retriedComment = await readJson<CreatedComment>(retriedCommentResponse);
    expect(retriedComment.id).toBe(committedCommentId);
    const comments = flattenComments((await getFeedItem(userA.context.request, postId))?.comments ?? []);
    expect(comments.filter((comment) => comment.content === lostCommentContent)).toHaveLength(1);
  });

  test("failed reaction UI converges to unchanged server viewer state", async ({ userC }) => {
    const before = await getFeedItem(userC.context.request, postId);
    expect(before).not.toBeNull();
    const reactionEndpoint = `/api/artists/posts/${postId}/like`;
    await userC.page.goto(canonicalPostHref(postId));
    await userC.page.route(`**${reactionEndpoint}`, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced E2E reaction failure" })
      });
    });
    try {
      await userC.page.getByRole("button", { name: "Открыть реакции" }).click();
      await userC.page.getByRole("menuitemradio", { name: "🔥" }).click();
      await expect(userC.page.getByText("forced E2E reaction failure", { exact: true })).toBeVisible();

      const after = await getFeedItem(userC.context.request, postId);
      expect(after).toMatchObject({
        likesCount: before!.likesCount,
        viewerReaction: before!.viewerReaction,
        likedByViewer: before!.likedByViewer
      });
      await userC.page.getByRole("button", { name: "Открыть реакции" }).click();
      await expect(userC.page.getByRole("menuitemradio", { name: "🔥" })).toHaveAttribute(
        "aria-checked",
        String(before!.viewerReaction === "fire")
      );
    } finally {
      await userC.page.unroute(`**${reactionEndpoint}`);
    }
  });

  test("failed comment UI preserves its draft and retry idempotency key without fake success", async ({ userB }) => {
    const draft = "Phase 1 failed comment draft preserved for retry";
    const commentEndpoint = `/api/artists/posts/${postId}/comments`;
    const keys: string[] = [];
    let postAttempts = 0;
    await userB.page.goto(canonicalPostHref(postId));
    await userB.page.route(`**${commentEndpoint}`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      postAttempts += 1;
      keys.push(route.request().headers()["idempotency-key"] ?? "");
      if (postAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "forced E2E comment failure" })
        });
        return;
      }
      await route.continue();
    });
    try {
      const composer = userB.page.getByPlaceholder("Напишите комментарий");
      await composer.fill(draft);
      await composer.press("Enter");
      await expect(userB.page.getByText("forced E2E comment failure", { exact: true })).toBeVisible();
      await expect(composer).toHaveValue(draft);
      expect(flattenComments((await getFeedItem(userB.context.request, postId))?.comments ?? []).filter((comment) => comment.content === draft)).toHaveLength(0);

      const retryResponse = userB.page.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === commentEndpoint
      );
      await composer.press("Enter");
      expect((await retryResponse).status()).toBe(201);
      await expect(composer).toHaveValue("");
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBeTruthy();
      expect(keys[1]).toBe(keys[0]);
      await expect.poll(async () =>
        flattenComments((await getFeedItem(userB.context.request, postId))?.comments ?? []).filter((comment) => comment.content === draft).length
      ).toBe(1);
    } finally {
      await userB.page.unroute(`**${commentEndpoint}`);
    }
  });

  test("failed post composer preserves its draft and creates no optimistic publication", async ({ userA, userC }) => {
    const draft = "Phase 1 failed post composer draft preserved locally";
    const createEndpoint = "/api/user/artist-profile/posts";
    let capturedKey = "";
    await userA.page.goto("/feed");
    await userA.page.route(`**${createEndpoint}`, async (route) => {
      capturedKey = route.request().headers()["idempotency-key"] ?? "";
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced E2E composer failure" })
      });
    });
    try {
      const composer = userA.page.getByPlaceholder("Напишите историю релиза, новость или запрос на коллаборацию");
      await composer.fill(draft);
      await userA.page.getByRole("button", { name: "Опубликовать" }).click();
      await expect(userA.page.getByText("forced E2E composer failure", { exact: true })).toBeVisible();
      await expect(composer).toHaveValue(draft);
      expect(capturedKey).toBeTruthy();
      await expect(userA.page.getByText(draft, { exact: true })).toHaveCount(0);
      const feed = await userC.context.request.get("/api/feed?scope=all&type=posts&limit=100");
      expect(feed.status()).toBe(200);
      expect((await readJson<FeedPayload>(feed)).items.filter((item) => item.content === draft)).toHaveLength(0);
    } finally {
      await userA.page.unroute(`**${createEndpoint}`);
    }
  });

  test("audience bypasses are denied by feed, detail and interaction APIs", async ({ userA, userB, userC }) => {
    const follow = await userB.context.request.post(`/api/artists/${encodeURIComponent(authorSlug)}/follow`);
    expect(follow.status()).toBe(200);
    expect(await readJson<{ following: boolean }>(follow)).toMatchObject({ following: true });
    try {
      const followersResponse = await userA.context.request.post("/api/user/artist-profile/posts", {
        data: { content: "Phase 1 followers-only post", audience: "FOLLOWERS" },
        headers: idempotencyHeaders(IDEMPOTENCY.followersPost)
      });
      expect(followersResponse.status()).toBe(201);
      const followersPost = await readJson<CreatedPost>(followersResponse);
      expect((await getFeedItem(userB.context.request, followersPost.id))?.sourceId).toBe(followersPost.id);
      expect(await getFeedItem(userC.context.request, followersPost.id)).toBeNull();
      expect((await userC.context.request.post(`/api/artists/posts/${followersPost.id}/like`, { data: { reaction: "heart" } })).status()).toBe(404);
      expect((await userC.context.request.post(`/api/artists/posts/${followersPost.id}/comments`, { data: { content: "bypass" } })).status()).toBe(404);
      const [followersProfileB, followersProfileC, followersSearchB, followersSearchC] = await Promise.all([
        userB.context.request.get(`/api/artists/${encodeURIComponent(authorSlug)}/social`),
        userC.context.request.get(`/api/artists/${encodeURIComponent(authorSlug)}/social`),
        userB.context.request.get("/api/search?q=followers-only&limit=12"),
        userC.context.request.get("/api/search?q=followers-only&limit=12")
      ]);
      for (const response of [followersProfileB, followersProfileC, followersSearchB, followersSearchC]) {
        expect(response.status()).toBe(200);
      }
      expect((await readJson<ArtistSocialPayload>(followersProfileB)).posts.some((item) => item.id === followersPost.id)).toBe(true);
      expect((await readJson<ArtistSocialPayload>(followersProfileC)).posts.some((item) => item.id === followersPost.id)).toBe(false);
      expect((await readJson<SearchPayload>(followersSearchB)).publications.some((item) => item.sourceId === followersPost.id)).toBe(true);
      expect((await readJson<SearchPayload>(followersSearchC)).publications.some((item) => item.sourceId === followersPost.id)).toBe(false);

      const privateResponse = await userA.context.request.post("/api/user/artist-profile/posts", {
        data: { content: "Phase 1 private post", audience: "PRIVATE" },
        headers: idempotencyHeaders(IDEMPOTENCY.privatePost)
      });
      expect(privateResponse.status()).toBe(201);
      const privatePost = await readJson<CreatedPost>(privateResponse);
      expect((await getFeedItem(userA.context.request, privatePost.id))?.sourceId).toBe(privatePost.id);
      expect(await getFeedItem(userB.context.request, privatePost.id)).toBeNull();
      expect(await getFeedItem(userC.context.request, privatePost.id)).toBeNull();
      expect((await userB.context.request.post(`/api/artists/posts/${privatePost.id}/like`, { data: { reaction: "heart" } })).status()).toBe(404);
      const [privateProfileA, privateProfileB, privateSearchA, privateSearchB] = await Promise.all([
        userA.context.request.get(`/api/artists/${encodeURIComponent(authorSlug)}/social`),
        userB.context.request.get(`/api/artists/${encodeURIComponent(authorSlug)}/social`),
        userA.context.request.get("/api/search?q=private-post&limit=12"),
        userB.context.request.get("/api/search?q=private-post&limit=12")
      ]);
      for (const response of [privateProfileA, privateProfileB, privateSearchA, privateSearchB]) {
        expect(response.status()).toBe(200);
      }
      expect((await readJson<ArtistSocialPayload>(privateProfileA)).posts.some((item) => item.id === privatePost.id)).toBe(true);
      expect((await readJson<ArtistSocialPayload>(privateProfileB)).posts.some((item) => item.id === privatePost.id)).toBe(false);
      expect((await readJson<SearchPayload>(privateSearchA)).publications.some((item) => item.sourceId === privatePost.id)).toBe(true);
      expect((await readJson<SearchPayload>(privateSearchB)).publications.some((item) => item.sourceId === privatePost.id)).toBe(false);
    } finally {
      const unfollow = await userB.context.request.post(`/api/artists/${encodeURIComponent(authorSlug)}/follow`);
      expect(unfollow.status()).toBe(200);
      expect(await readJson<{ following: boolean }>(unfollow)).toMatchObject({ following: false });
    }
  });

  test("post and comment deletion are owner-only and remove direct visibility", async ({ userA, userB }) => {
    const postResponse = await userA.context.request.post("/api/user/artist-profile/posts", {
      data: { content: "Phase 1 delete authorization post", audience: "PUBLIC" },
      headers: idempotencyHeaders(IDEMPOTENCY.deletePost)
    });
    expect(postResponse.status()).toBe(201);
    const disposablePost = await readJson<CreatedPost>(postResponse);
    expect((await userB.context.request.delete(`/api/user/artist-profile/posts/${disposablePost.id}`)).status()).toBe(403);
    expect((await userA.context.request.delete(`/api/user/artist-profile/posts/${disposablePost.id}`)).status()).toBe(200);
    expect(await getFeedItem(userB.context.request, disposablePost.id)).toBeNull();

    const commentResponse = await userB.context.request.post(`/api/artists/posts/${postId}/comments`, {
      data: { content: "Phase 1 delete authorization comment" },
      headers: idempotencyHeaders(IDEMPOTENCY.deleteComment)
    });
    expect(commentResponse.status()).toBe(201);
    const disposableComment = await readJson<CreatedComment>(commentResponse);
    const deletePath = `/api/artists/posts/${postId}/comments?commentId=${encodeURIComponent(disposableComment.id)}`;
    expect((await userA.context.request.delete(deletePath)).status()).toBe(403);
    expect((await userB.context.request.delete(deletePath)).status()).toBe(200);
    const comments = flattenComments((await getFeedItem(userA.context.request, postId))?.comments ?? []);
    expect(comments.some((comment) => comment.id === disposableComment.id && !comment.deletedAt)).toBe(false);
  });
});
